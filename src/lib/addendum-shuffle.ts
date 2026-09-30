/**
 * Embaralhador de aditivo (função pura, sem banco).
 *
 * Recebe as Agendas do contrato vigente (linha de base) e sorteia, com uma
 * seed, um cenário de aditivo: pelo menos 60% das Agendas são alteradas ou
 * excluídas e cerca de 30% de Agendas novas são incluídas. As regras de data
 * do app são respeitadas por construção:
 *
 *  1. Agenda nova nunca repete Fluxo + mês + divisão + praça (nem de uma
 *     Agenda marcada como Excluir): o mesmo Fluxo não pode ter dois fretes no
 *     mesmo mês.
 *  2. Agenda nova nunca fica antes do início da vigência nem em mês que já
 *     passou. Depois do fim da vigência é permitido: o fim passa a ser o
 *     último dia do último mês novo e o motor gera a cláusula de prorrogação.
 *  3. Data Base Diesel sempre no formato DD/MM/AAAA com o dia de aplicação da
 *     Oportunidade (1, 10 ou 20), no mês da Agenda ou no mês anterior, igual
 *     em todas as linhas de serviço da mesma Agenda.
 *  4. Agendas novas herdam periodicidade, janela, divisão, praça, Base Diesel
 *     e tolerâncias do Fluxo; o rateio fecha 100% e a soma dos serviços fecha
 *     a tarifa.
 *  5. Períodos já decorridos só são alterados/excluídos se faltarem Agendas
 *     futuras para atingir os 60%.
 */
import { seededFaker } from "./generators/core";

export type ShuffleRow = {
  id: string;
  itemId: string;
  service: string;
  volume: number;
  tariff_cbs: number | null;
  tariff_net: number | null;
  accessory_cbs: number | null;
  accessory_cbs_pct: number | null;
  accessory_net: number | null;
  accessory_net_pct: number | null;
  diesel_base_id: string;
  diesel_base_date: string | null;
  frequency: string;
  period_window: string;
  division: string;
  plaza: string;
  tolerance_vli_volume: number | null;
  tolerance_client_volume: number | null;
  tolerance_vli_tariff: number | null;
  tolerance_client_tariff: number | null;
};

export type ShuffleGroup = {
  key: string;
  flowId: string;
  year: number;
  month: number;
  rows: ShuffleRow[];
};

export type ShuffleNewFlow = { flowId: string; dieselBaseId: string };

export type ShuffleInput = {
  seed: number;
  groups: ShuffleGroup[];
  /** "CBS" ou "Líquida". */
  tariffMode: string;
  /** Dia de aplicação da Oportunidade: 1, 10 ou 20. */
  applicationDay: number;
  /** Primeiro e último mês da vigência (AAAAMM). */
  startPeriod: number;
  endPeriod: number;
  /** Mês corrente (AAAAMM). */
  todayPeriod: number;
  /** Fluxos ferroviários FLOU da conta que ainda não estão na Cotação. */
  newFlows: ShuffleNewFlow[];
  /** Preço recomendado (Jetsons) por Fluxo, serviço e período. */
  recommended: (flowId: string, service: string, year: number, month: number) => number;
};

export type ShuffleRowPatch = {
  volume?: number;
  tariff_cbs?: number;
  tariff_net?: number;
  accessory_cbs?: number;
  accessory_net?: number;
  diesel_base_date?: string;
};

export type ShuffleNewGroup = {
  flowId: string;
  year: number;
  month: number;
  frequency: string;
  period_window: string;
  division: string;
  plaza: string;
  volume: number;
  diesel_base_id: string;
  diesel_base_date: string;
  rows: Array<{
    service: string;
    /** Item da Cotação que já guarda esse serviço no Fluxo; nulo = criar Item. */
    itemId: string | null;
    tariff_cbs: number | null;
    tariff_net: number;
    accessory_cbs: number | null;
    accessory_cbs_pct: number | null;
    accessory_net: number | null;
    accessory_net_pct: number | null;
    tolerance_vli_volume: number | null;
    tolerance_client_volume: number | null;
    tolerance_vli_tariff: number | null;
    tolerance_client_tariff: number | null;
  }>;
};

export type ShufflePlan = {
  baselineGroups: number;
  excludedKeys: string[];
  altered: Array<{ key: string; patches: Array<{ rowId: string; patch: ShuffleRowPatch }>; kinds: string[] }>;
  created: ShuffleNewGroup[];
  /** Último mês (AAAAMM) das Agendas depois do sorteio; maior que endPeriod = prorrogação. */
  lastPeriod: number;
};

const ACCESSORIES = ["CARGA", "DESCARGA", "BALDEAÇÃO", "MANOBRA ORIGEM", "MANOBRA DESTINO"];

const period = (year: number, month: number) => year * 100 + month;
const addMonths = (value: number, delta: number) => {
  const index = Math.floor(value / 100) * 12 + (value % 100) - 1 + delta;
  return Math.floor(index / 12) * 100 + (index % 12) + 1;
};
const pad = (value: number) => String(value).padStart(2, "0");
const dieselDate = (day: number, value: number) =>
  `${pad(day)}/${pad(value % 100)}/${Math.floor(value / 100)}`;
const dieselPeriod = (raw: string | null) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(raw ?? ""));
  return match ? Number(match[3]) * 100 + Number(match[2]) : null;
};

/** Divide a tarifa (em centavos) pelos percentuais; a última linha absorve o resto. */
function splitCents(cents: number, pcts: number[]) {
  const shares = pcts.map((pct) => Math.floor((cents * pct) / 100));
  shares[shares.length - 1] += cents - shares.reduce((sum, value) => sum + value, 0);
  return shares;
}

export function planAddendumShuffle(input: ShuffleInput): ShufflePlan {
  const f = seededFaker(input.seed);
  const useCbs = input.tariffMode === "CBS";
  const { groups } = input;
  const total = groups.length;
  const plan: ShufflePlan = {
    baselineGroups: total,
    excludedKeys: [],
    altered: [],
    created: [],
    lastPeriod: input.endPeriod,
  };
  if (!total) return plan;

  // ---- 1. Quais Agendas mudam: 60% a 75% (nunca menos que 60%) ----------
  const minModified = Math.ceil(total * 0.6);
  const modifiedCount = Math.min(
    total,
    Math.max(minModified, Math.ceil(total * f.number.float({ min: 0.6, max: 0.75 }))),
  );
  // Meses futuros primeiro; os já decorridos só entram se faltar Agenda.
  const ordered = [
    ...f.helpers.shuffle(groups.filter((g) => period(g.year, g.month) >= input.todayPeriod)),
    ...f.helpers.shuffle(groups.filter((g) => period(g.year, g.month) < input.todayPeriod)),
  ];
  const modified = ordered.slice(0, modifiedCount);
  const excludeCount =
    modifiedCount >= 3
      ? Math.max(1, Math.round(modifiedCount * f.number.float({ min: 0.25, max: 0.4 })))
      : modifiedCount >= 2
        ? 1
        : 0;
  const excluded = modified.slice(0, excludeCount);
  const altered = modified.slice(excludeCount);
  plan.excludedKeys = excluded.map((g) => g.key);
  const excludedKeys = new Set(plan.excludedKeys);

  // ---- 2. Como cada Agenda alterada muda ---------------------------------
  for (const group of altered) {
    const kinds: string[] = [];
    if (f.datatype.boolean({ probability: 0.65 })) kinds.push("volume");
    if (f.datatype.boolean({ probability: 0.55 })) kinds.push("tarifa");
    if (f.datatype.boolean({ probability: 0.2 })) kinds.push("diesel");
    if (!kinds.length) kinds.push("volume");
    const patches = group.rows.map((row) => ({ rowId: row.id, patch: {} as ShuffleRowPatch }));

    if (kinds.includes("volume")) {
      const factor = f.number.float({ min: 0.6, max: 1.5 });
      let volume = Math.max(1, Math.round((group.rows[0].volume * factor) / 10) * 10);
      if (volume === group.rows[0].volume) volume += 10;
      for (const item of patches) item.patch.volume = volume;
    }

    if (kinds.includes("tarifa")) {
      const current = Number(useCbs ? group.rows[0].tariff_cbs : group.rows[0].tariff_net);
      const sign = f.datatype.boolean() ? 1 : -1;
      const factor = 1 + sign * f.number.float({ min: 0.03, max: 0.1 });
      let cents = Math.round(current * 100 * factor);
      if (cents === Math.round(current * 100)) cents += 1;
      const pcts = group.rows.map((row) =>
        Number(useCbs ? row.accessory_cbs_pct : row.accessory_net_pct ?? 0),
      );
      const shares = splitCents(cents, pcts);
      patches.forEach((item, index) => {
        if (useCbs) {
          item.patch.tariff_cbs = cents / 100;
          item.patch.accessory_cbs = shares[index] / 100;
        } else {
          item.patch.tariff_net = cents / 100;
          item.patch.accessory_net = shares[index] / 100;
        }
      });
    }

    if (kinds.includes("diesel")) {
      const own = period(group.year, group.month);
      const currentPeriod = dieselPeriod(group.rows[0].diesel_base_date);
      // Regra da wiki: a data-base é a do mês da Agenda ou a do mês anterior.
      const target = currentPeriod === own ? addMonths(own, -1) : own;
      const date = dieselDate(input.applicationDay, target);
      if (date !== group.rows[0].diesel_base_date)
        for (const item of patches) item.patch.diesel_base_date = date;
      else kinds.splice(kinds.indexOf("diesel"), 1);
    }
    plan.altered.push({ key: group.key, patches, kinds });
  }

  // ---- 3. Agendas novas: cerca de 30% do total ---------------------------
  const target = Math.max(1, Math.round(total * f.number.float({ min: 0.25, max: 0.35 })));
  const byFlow = new Map<string, ShuffleGroup[]>();
  for (const group of groups) byFlow.set(group.flowId, [...(byFlow.get(group.flowId) ?? []), group]);
  for (const list of byFlow.values())
    list.sort((a, b) => period(a.year, a.month) - period(b.year, b.month));
  const usedKeys = new Set(groups.map((g) => g.key));

  const flowIds = [...byFlow.keys()];
  const active = flowIds.filter((id) => {
    const last = byFlow.get(id)!.at(-1)!;
    return !excludedKeys.has(last.key);
  });
  const tailFlows = f.helpers.shuffle(active.length ? active : flowIds);

  // Fluxo novo só quando há pelo menos 3 Agendas novas para distribuir.
  const newFlow = target >= 3 && input.newFlows.length ? f.helpers.arrayElement(input.newFlows) : null;
  const newFlowMonths = newFlow ? Math.min(4, Math.max(1, Math.round(target * 0.34))) : 0;
  const tailTarget = target - newFlowMonths;

  const nextMonth = new Map<string, number>();
  const validStart = Math.max(input.startPeriod, input.todayPeriod);
  const firstFree = (flowId: string, from: number) => {
    let candidate = Math.max(from, validStart);
    const list = byFlow.get(flowId) ?? [];
    while (list.some((g) => period(g.year, g.month) === candidate)) candidate = addMonths(candidate, 1);
    return candidate;
  };
  for (const flowId of tailFlows) {
    const last = byFlow.get(flowId)!.at(-1)!;
    nextMonth.set(flowId, firstFree(flowId, addMonths(period(last.year, last.month), 1)));
  }

  const dieselPattern = (flowId: string) => {
    const list = byFlow.get(flowId)!;
    const lastGroup = list.at(-1)!;
    const lastDate = lastGroup.rows[0].diesel_base_date;
    return {
      sameMonth: dieselPeriod(lastDate) === period(lastGroup.year, lastGroup.month),
      last: lastDate,
    };
  };

  let made = 0;
  let guard = 0;
  while (made < tailTarget && guard++ < 200) {
    for (const flowId of tailFlows) {
      if (made >= tailTarget) break;
      const template = byFlow.get(flowId)!.at(-1)!;
      const at = nextMonth.get(flowId)!;
      nextMonth.set(flowId, firstFree(flowId, addMonths(at, 1)));
      const year = Math.floor(at / 100),
        month = at % 100;
      const key = `${template.key.split("|")[0]}|${year}${pad(month)}|${template.rows[0].division}|${template.rows[0].plaza}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      const pattern = dieselPattern(flowId);
      const date = dieselDate(
        input.applicationDay,
        pattern.sameMonth || !pattern.last ? at : addMonths(at, -1),
      );
      const volume = Math.max(
        1,
        Math.round((template.rows[0].volume * f.number.float({ min: 0.85, max: 1.2 })) / 10) * 10,
      );
      plan.created.push(
        buildGroup(input, f, {
          flowId,
          year,
          month,
          frequency: template.rows[0].frequency,
          period_window: template.rows[0].period_window,
          division: template.rows[0].division,
          plaza: template.rows[0].plaza,
          volume,
          diesel_base_id: template.rows[0].diesel_base_id,
          diesel_base_date: date,
          services: template.rows.map((row) => ({
            service: row.service,
            itemId: row.itemId,
            tolerances: [
              row.tolerance_vli_volume,
              row.tolerance_client_volume,
              row.tolerance_vli_tariff,
              row.tolerance_client_tariff,
            ],
          })),
        }),
      );
      made++;
    }
  }

  if (newFlow && newFlowMonths) {
    const currentEnd = Math.max(
      input.endPeriod,
      ...plan.created.map((group) => period(group.year, group.month)),
    );
    const services = ["FRETE", ...f.helpers.arrayElements(ACCESSORIES, { min: 2, max: 3 })];
    const first = Math.max(validStart, addMonths(currentEnd, -(newFlowMonths - 1)));
    const volume = f.number.int({ min: 1000, max: 9000 });
    for (let at = first; at <= currentEnd; at = addMonths(at, 1)) {
      // Each Schedule needs a base in its own month or the prior month.
      const date = dieselDate(input.applicationDay, at);
      plan.created.push(
        buildGroup(input, f, {
          flowId: newFlow.flowId,
          year: Math.floor(at / 100),
          month: at % 100,
          frequency: "Mensal",
          period_window: "Mês",
          division: "Todas",
          plaza: "TODAS_PRACAS_NACIONAL",
          volume,
          diesel_base_id: newFlow.dieselBaseId,
          diesel_base_date: date,
          services: services.map((service) => ({ service, itemId: null, tolerances: [null, null, null, null] })),
        }),
      );
    }
  }

  plan.lastPeriod = Math.max(
    input.endPeriod,
    ...plan.created.map((group) => period(group.year, group.month)),
  );
  return plan;
}

function buildGroup(
  input: ShuffleInput,
  f: ReturnType<typeof seededFaker>,
  base: {
    flowId: string;
    year: number;
    month: number;
    frequency: string;
    period_window: string;
    division: string;
    plaza: string;
    volume: number;
    diesel_base_id: string;
    diesel_base_date: string;
    services: Array<{ service: string; itemId: string | null; tolerances: Array<number | null> }>;
  },
): ShuffleNewGroup {
  const useCbs = input.tariffMode === "CBS";
  // Preço praticado oscila em torno do Jetsons (−13% a +6%), como no gerador.
  const shares = base.services.map((entry) => {
    const recommended = input.recommended(base.flowId, entry.service, base.year, base.month);
    const practiced = Math.max(1, Math.round(recommended * (1 + f.number.float({ min: -0.13, max: 0.06 })) * 100));
    return practiced;
  });
  const totalCents = shares.reduce((sum, value) => sum + value, 0);
  const pcts = shares.map((share) => Number(((share / totalCents) * 100).toFixed(2)));
  pcts[pcts.length - 1] = Number(
    (100 - pcts.slice(0, -1).reduce((sum, value) => sum + value, 0)).toFixed(2),
  );
  return {
    flowId: base.flowId,
    year: base.year,
    month: base.month,
    frequency: base.frequency,
    period_window: base.period_window,
    division: base.division,
    plaza: base.plaza,
    volume: base.volume,
    diesel_base_id: base.diesel_base_id,
    diesel_base_date: base.diesel_base_date,
    rows: base.services.map((entry, index) => ({
      service: entry.service,
      itemId: entry.itemId,
      tariff_cbs: useCbs ? totalCents / 100 : null,
      tariff_net: useCbs ? 0 : totalCents / 100,
      accessory_cbs: useCbs ? shares[index] / 100 : null,
      accessory_cbs_pct: useCbs ? pcts[index] : null,
      accessory_net: useCbs ? null : shares[index] / 100,
      accessory_net_pct: useCbs ? null : pcts[index],
      tolerance_vli_volume: entry.tolerances[0],
      tolerance_client_volume: entry.tolerances[1],
      tolerance_vli_tariff: entry.tolerances[2],
      tolerance_client_tariff: entry.tolerances[3],
    })),
  };
}
