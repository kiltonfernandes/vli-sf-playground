/**
 * Motor de aditivo (funções puras, sem banco).
 *
 * Compara as Agendas do contrato vigente (linha de base) com a proposta da
 * Cotação aditiva e gera as mudanças e as cláusulas enviadas ao NetLex. O
 * NetLex recebe somente o que mudou, nunca o contrato inteiro.
 */

export const ADDENDUM_OPERATIONS = ["Manter", "Incluir", "Alterar", "Excluir"] as const;
export type AddendumOperation = (typeof ADDENDUM_OPERATIONS)[number];

/** Campos da Agenda que, quando mudam, transformam "Manter" em "Alterar". */
export const SNAPSHOT_FIELDS = [
  "volume",
  "tariff_cbs",
  "tariff_net",
  "accessory_cbs",
  "accessory_cbs_pct",
  "accessory_net",
  "accessory_net_pct",
  "diesel_base_date",
  "tolerance_vli_volume",
  "tolerance_client_volume",
  "tolerance_vli_tariff",
  "tolerance_client_tariff",
] as const;
export type ScheduleSnapshot = Partial<Record<(typeof SNAPSHOT_FIELDS)[number], number | string | null>>;

export const FIELD_LABELS: Record<string, string> = {
  volume: "Volume",
  tariff_cbs: "Tarifa CBS",
  tariff_net: "Tarifa líquida",
  accessory_cbs: "Tarifa do serviço (CBS)",
  accessory_cbs_pct: "Rateio CBS",
  accessory_net: "Tarifa do serviço",
  accessory_net_pct: "Rateio",
  diesel_base_date: "Data Base Diesel",
  tolerance_vli_volume: "Tolerância volume VLI",
  tolerance_client_volume: "Tolerância volume Cliente",
  tolerance_vli_tariff: "Tolerância tarifa VLI",
  tolerance_client_tariff: "Tolerância tarifa Cliente",
};

export function snapshotOf(row: Record<string, unknown>): ScheduleSnapshot {
  const snapshot: ScheduleSnapshot = {};
  for (const field of SNAPSHOT_FIELDS) {
    const value = row[field];
    snapshot[field] =
      value === undefined || value === null || value === ""
        ? null
        : field === "diesel_base_date"
          ? String(value)
          : Number(value);
  }
  return snapshot;
}

export function parseSnapshot(raw: unknown): ScheduleSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(String(raw)) as ScheduleSnapshot;
  } catch {
    return null;
  }
}

function sameValue(a: unknown, b: unknown) {
  const empty = (value: unknown) => value === null || value === undefined || value === "";
  if (empty(a) && empty(b)) return true;
  // Tolerâncias: nulo e zero significam "sem tolerância".
  if ((empty(a) && Number(b) === 0) || (empty(b) && Number(a) === 0)) return true;
  if (typeof a === "number" || typeof b === "number")
    return Math.abs(Number(a) - Number(b)) < 0.005;
  return String(a) === String(b);
}

/** Lista os campos alterados em relação à linha de base. */
export function changedFields(row: Record<string, unknown>, base: ScheduleSnapshot | null) {
  if (!base) return [];
  const current = snapshotOf(row);
  return SNAPSHOT_FIELDS.filter((field) => !sameValue(current[field], base[field]));
}

/** Operação efetiva de uma linha de Agenda da Cotação aditiva. */
export function effectiveOperation(row: {
  operation?: string | null;
  base_snapshot?: string | null;
  [key: string]: unknown;
}): AddendumOperation {
  if (row.operation === "Excluir") return "Excluir";
  const base = parseSnapshot(row.base_snapshot);
  if (!base) return "Incluir";
  return changedFields(row, base).length ? "Alterar" : "Manter";
}

export type AddendumChange = {
  operation: AddendumOperation;
  flowCode: string;
  route: string;
  origin: string;
  destination: string;
  merchandise: string;
  unit: string;
  service: string;
  year: number;
  month: number;
  periodWindow: string;
  plaza: string;
  division: string;
  before: ScheduleSnapshot | null;
  after: ScheduleSnapshot | null;
  fields: string[];
};

export type AddendumTerm = {
  start: string | null;
  end: string | null;
  applicationDay?: number | null;
};

export type AddendumClause = {
  number: number;
  kind: "Prazo" | "Inclusão" | "Alteração" | "Exclusão" | "Base Diesel" | "Take or Pay" | "Reajuste";
  title: string;
  text: string;
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function periodLabel(year: number, month: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function longMonth(year: number, month: number) {
  return `${MONTHS[month - 1] ?? month} de ${year}`;
}

function brDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** "DD/MM/AAAA" → { year, month } */
function dieselMonth(value: unknown) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ""));
  if (!match) return null;
  return { year: Number(match[3]), month: Number(match[2]) };
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function flowLabel(change: AddendumChange) {
  return `${change.origin} → ${change.destination}, ${change.merchandise}, praça ${change.plaza}`;
}

function periodRange(changes: AddendumChange[]) {
  const keys = changes.map((change) => change.year * 100 + change.month).sort((a, b) => a - b);
  const first = keys[0];
  const last = keys[keys.length - 1];
  const label = (key: number) => periodLabel(Math.floor(key / 100), key % 100);
  return first === last ? label(first) : `${label(first)} a ${label(last)}`;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
}

/**
 * Texto de Data Base Diesel conforme os critérios da wiki: data única gera uma
 * frase simples; datas múltiplas geram um bloco por data-base com os fluxos
 * vinculados; quando a data de um fluxo já negociado muda, indica "a partir de".
 */
export function dieselBaseClauseText(changes: AddendumChange[], applicationDay: number) {
  const relevant = changes.filter(
    (change) => change.operation === "Incluir" || change.operation === "Alterar",
  );
  if (!relevant.length) return null;
  const byFlow = groupBy(relevant, (change) => `${change.flowCode}|${change.plaza}`);
  const entries = [...byFlow.values()].map((rows) => {
    const sorted = [...rows].sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
    const dates = sorted
      .map((row) => dieselMonth(row.after?.diesel_base_date))
      .filter(Boolean) as Array<{ year: number; month: number }>;
    const base = dates[0] ?? { year: sorted[0].year, month: sorted[0].month };
    const dieselChanged = sorted.find(
      (row) => row.operation === "Alterar" && row.fields.includes("diesel_base_date"),
    );
    return {
      label: flowLabel(sorted[0]),
      base,
      from: dieselChanged ? { year: dieselChanged.year, month: dieselChanged.month } : null,
    };
  });
  const prefix = `O reajuste do diesel da(s) tarifa(s) ferroviária(s) ocorrerá todo dia ${applicationDay} de cada mês`;
  const distinct = groupBy(entries, (entry) => `${entry.base.year}-${entry.base.month}|${entry.from ? `${entry.from.year}-${entry.from.month}` : ""}`);
  if (distinct.size === 1 && !entries[0].from)
    return `${prefix}, iniciando-se em ${longMonth(entries[0].base.year, entries[0].base.month)}.`;
  const blocks = [...distinct.values()].map((group) => {
    const head = group[0];
    const flows = group.map((entry) => entry.label).join(" e ");
    const suffix = head.from ? `, a partir de ${longMonth(head.from.year, head.from.month)}` : "";
    return `• A data-base ${longMonth(head.base.year, head.base.month)} será aplicada para ${flows}${suffix}.`;
  });
  return `${prefix}, observando-se as seguintes datas-bases aplicáveis: ${blocks.join(" ")}`;
}

export type AddendumInput = {
  baseTerm: AddendumTerm;
  newTerm: AddendumTerm;
  baseReadjustment?: { dieselPct: number; igpmPct: number; ipcaPct: number } | null;
  newReadjustment?: { dieselPct: number; igpmPct: number; ipcaPct: number } | null;
  baseTakeOrPay?: boolean;
  newTakeOrPay?: boolean;
  baseTakeOrPayConfig?: unknown;
  newTakeOrPayConfig?: unknown;
  changes: AddendumChange[];
  tariffBasis: string;
  applicationDay: number;
};

/** Gera as cláusulas do aditivo. Funções puras: mesma entrada, mesmo texto. */
export function buildAddendumClauses(input: AddendumInput): AddendumClause[] {
  const clauses: Omit<AddendumClause, "number">[] = [];
  const useCbs = String(input.tariffBasis).toLowerCase() === "cbs";
  const tariffOf = (snapshot: ScheduleSnapshot | null) =>
    snapshot
      ? useCbs
        ? (snapshot.accessory_cbs ?? snapshot.tariff_cbs)
        : (snapshot.accessory_net ?? snapshot.tariff_net)
      : null;

  if (input.baseTerm.end && input.newTerm.end && input.baseTerm.end !== input.newTerm.end) {
    const extended = input.newTerm.end > input.baseTerm.end;
    clauses.push({
      kind: "Prazo",
      title: extended ? "Prorrogação da vigência" : "Redução da vigência",
      text: `As partes resolvem ${extended ? "prorrogar" : "reduzir"} o prazo de vigência do contrato, que passa a vigorar de ${brDate(input.newTerm.start ?? input.baseTerm.start)} até ${brDate(input.newTerm.end)}, em substituição ao término anterior de ${brDate(input.baseTerm.end)}.`,
    });
  }
  const br = input.baseReadjustment,
    nr = input.newReadjustment;
  if (
    br &&
    nr &&
    (Math.abs(br.dieselPct - nr.dieselPct) > 0.001 ||
      Math.abs(br.igpmPct - nr.igpmPct) > 0.001 ||
      Math.abs(br.ipcaPct - nr.ipcaPct) > 0.001)
  )
    clauses.push({
      kind: "Reajuste",
      title: "Composição do reajuste anual",
      text: `A composição do reajuste anual passa a ser Diesel ${nr.dieselPct.toFixed(2)}%, IGP-M ${nr.igpmPct.toFixed(2)}% e IPCA ${nr.ipcaPct.toFixed(2)}%.`,
    });

  const normalizedTop = (value: unknown) => {
    if (value == null) return null;
    const sort = (item: any): any => Array.isArray(item)
      ? item.map(sort)
      : item && typeof item === "object"
        ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]))
        : item;
    return JSON.stringify(sort(value));
  };
  if (
    (input.baseTakeOrPay ?? false) !== (input.newTakeOrPay ?? false) ||
    normalizedTop(input.baseTakeOrPayConfig) !== normalizedTop(input.newTakeOrPayConfig)
  ) {
    const config = input.newTakeOrPayConfig as {
      auditDate?: string; billingDate?: string; compensationMode?: string; calculationBasis?: string;
    } | null | undefined;
    const modes: Record<string, string> = {
      individual: "cada fluxo individualmente", "all-flows": "todos os fluxos em conjunto",
      "flow-pairs": "pares de fluxos compensados e compensadores", groups: "grupos de fluxos",
    };
    const bases: Record<string, string> = { volume: "volume", tariff: "tarifa", both: "volume e tarifa" };
    const text = config
      ? `O Take or Pay passa a ser apurado em ${brDate(config.auditDate ?? "")}, com faturamento em ${brDate(config.billingDate ?? "")}. A compensação será ${modes[config.compensationMode ?? ""] ?? "conforme configuração registrada"}, considerando ${bases[config.calculationBasis ?? ""] ?? "a base definida"}.`
      : "Fica removida a configuração de Take or Pay anteriormente prevista.";
    clauses.push({ kind: "Take or Pay", title: "Configuração do Take or Pay", text });
  }

  const byItem = (rows: AddendumChange[]) =>
    groupBy(rows, (row) => `${row.flowCode}|${row.service}|${row.plaza}`);
  const included = input.changes.filter((change) => change.operation === "Incluir");
  for (const rows of byItem(included).values()) {
    const head = rows[0];
    const volume = rows.reduce((sum, row) => sum + Number(row.after?.volume ?? 0), 0);
    clauses.push({
      kind: "Inclusão",
      title: `Inclusão de Agenda · ${head.route} · ${head.service}`,
      text: `Fica incluída a prestação do serviço ${head.service} no fluxo ${flowLabel(head)}, ${periodsLabel(rows)}, com volume total de ${volume.toLocaleString("pt-BR")} ${head.unit} e tarifa de ${money(tariffOf(rows[0].after))} por ${head.unit}.`,
    });
  }
  const altered = input.changes.filter((change) => change.operation === "Alterar");
  for (const rows of byItem(altered).values()) {
    const head = rows[0];
    const priceRows = rows.filter((row) =>
      row.fields.some((field) => field.startsWith("tariff") || field.startsWith("accessory")),
    );
    const volumeRows = rows.filter((row) => row.fields.includes("volume"));
    const parts: string[] = [];
    if (priceRows.length)
      parts.push(
        `a tarifa passa de ${money(tariffOf(priceRows[0].before))} para ${money(tariffOf(priceRows[0].after))} por ${head.unit} ${periodsLabel(priceRows)}`,
      );
    if (volumeRows.length)
      parts.push(
        `o volume passa de ${Number(volumeRows[0].before?.volume ?? 0).toLocaleString("pt-BR")} para ${Number(volumeRows[0].after?.volume ?? 0).toLocaleString("pt-BR")} ${head.unit} ${periodsLabel(volumeRows)}`,
      );
    const other = rows.filter(
      (row) => !priceRows.includes(row) && !volumeRows.includes(row),
    );
    if (other.length)
      parts.push(
        `ficam ajustados ${[...new Set(other.flatMap((row) => row.fields.map((field) => FIELD_LABELS[field] ?? field)))].join(", ")} ${periodsLabel(other)}`,
      );
    clauses.push({
      kind: "Alteração",
      title: `Alteração de Agenda · ${head.route} · ${head.service}`,
      text: `No fluxo ${flowLabel(head)}, serviço ${head.service}, ${parts.join("; ")}.`,
    });
  }
  const excluded = input.changes.filter((change) => change.operation === "Excluir");
  for (const rows of byItem(excluded).values()) {
    const head = rows[0];
    clauses.push({
      kind: "Exclusão",
      title: `Exclusão de Agenda · ${head.route} · ${head.service}`,
      text: `Fica excluída a prestação do serviço ${head.service} no fluxo ${flowLabel(head)} ${periodsLabel(rows)}.`,
    });
  }
  const diesel = dieselBaseClauseText(input.changes, input.applicationDay);
  if (diesel) clauses.push({ kind: "Base Diesel", title: "Data Base Diesel", text: diesel });
  if (!!input.baseTakeOrPay !== !!input.newTakeOrPay)
    clauses.push({
      kind: "Take or Pay",
      title: input.newTakeOrPay ? "Inclusão de Take or Pay" : "Retirada de Take or Pay",
      text: input.newTakeOrPay
        ? "Passa a vigorar a cláusula de Take or Pay, conforme as tolerâncias informadas nas Agendas."
        : "Deixa de vigorar a cláusula de Take or Pay a partir da assinatura deste aditivo.",
    });
  return clauses.map((clause, index) => ({ ...clause, number: index + 1 }));
}

/** Resumo por operação, usado nos painéis. */
export function summarizeChanges(changes: AddendumChange[]) {
  const counts: Record<AddendumOperation, number> = { Manter: 0, Incluir: 0, Alterar: 0, Excluir: 0 };
  for (const change of changes) counts[change.operation]++;
  return counts;
}

/** Texto curto do resumo: "Incluir 3 · Alterar 3 · Excluir 3". */
export function summaryText(summary: unknown) {
  if (!summary || typeof summary !== "object") return summary ? String(summary) : "";
  return (["Incluir", "Alterar", "Excluir"] as const)
    .map((operation) => [operation, Number((summary as Record<string, unknown>)[operation] ?? 0)] as const)
    .filter(([, count]) => count > 0)
    .map(([operation, count]) => `${operation} ${count}`)
    .join(" · ");
}

/** "no período 02/2027" ou "nos períodos 12/2027 a 02/2028". */
function periodsLabel(rows: AddendumChange[]) {
  const unique = new Set(rows.map((row) => row.year * 100 + row.month));
  return `${unique.size > 1 ? "nos períodos" : "no período"} ${periodRange(rows)}`;
}
