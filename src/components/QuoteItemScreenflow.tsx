import { useMemo, useState } from "react";
import { saveRecord, updateOpportunityReadjustment, updateOpportunityTerm } from "@/lib/crud";
import { contractDurationDays, readjustmentRuleError } from "@/lib/business-rules";
import { takeOrPayRuleError, type TakeOrPayConfig } from "@/lib/take-or-pay";
import { toast } from "sonner";

type Flow = {
  id: string;
  code: string;
  account_id: string;
  origin_id: string;
  origin_code: string;
  origin_name: string;
  destination_id: string;
  destination_code: string;
  destination_name: string;
  merchandise_id: string;
  merchandise: string;
  modal: string;
};
type AgendaGroup = {
  year: number;
  month: number;
  frequency: string;
  period_window: string;
  division: string;
  plaza: string;
  volume: number;
  tariff: number;
  diesel_base_id: string;
  diesel_base_date: string;
  tolerance_vli_volume: number;
  tolerance_client_volume: number;
  tolerance_vli_tariff: number;
  tolerance_client_tariff: number;
  services: Array<{ service: string; percent: number }>;
};
type Props = {
  accountName: string;
  flows: Flow[];
  dieselBases: Array<{ id: string; name: string }>;
  opportunityId: string;
  instrumentType: string;
  contractStart: string;
  contractEnd: string;
  firstReadjustmentDate: string;
  readjustment: { diesel: number; igpm: number; ipca: number };
  integrationTariff: string;
  applicationDay: number;
  canChangeTariff: boolean;
  usedSchedules: Array<{ schedule_key: string; service: string }>;
  /** O mês final do lote é livre: meses após o fim estendem a vigência ao salvar. */
  allowExtendTerm?: boolean;
  initialFlowId?: string;
  initialService?: string;
  itemId?: string;
  onClose: () => void;
  onTermSaved?: () => Promise<void> | void;
  initialTakeOrPayConfig?: TakeOrPayConfig | null;
  onTakeOrPaySave?: (config: TakeOrPayConfig | null) => Promise<void>;
  onSave: (payload: {
    flowId: string;
    itemService: string;
    tariffMode: string;
    groups: AgendaGroup[];
  }) => Promise<boolean>;
};

const SERVICES = ["FRETE", "CARGA", "DESCARGA", "BALDEAÇÃO", "MANOBRA ORIGEM", "MANOBRA DESTINO"];
const WINDOWS = [
  "Mês",
  "1ª Dezena",
  "2ª Dezena",
  "3ª Dezena",
  "1ª Quinzena",
  "2ª Quinzena",
  "1ª Semana",
  "2ª Semana",
  "3ª Semana",
  "4ª Semana",
  "5ª Semana",
];
const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #c9c9c9",
  borderRadius: 4,
  background: "white",
} as const;
const labelStyle = {
  display: "grid",
  gap: 5,
  marginBottom: 12,
  fontSize: 12,
  fontWeight: 600,
} as const;

function applicationDate(day: number, month: number, year: number) {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function QuoteItemEditDialog({
  item,
  quoteId,
  onClose,
  onSaved,
}: {
  item: {
    id: string;
    planned_flow_id: string;
    service: string;
    route: string;
    merchandise_name: string;
    volume_total: number;
    revenue_total: number;
    top_eligible: number;
  };
  quoteId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [service, setService] = useState(item.service);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await saveRecord({
        data: {
          table: "quote_line_items",
          recordId: item.id,
          data: {
            quote_id: quoteId,
            planned_flow_id: item.planned_flow_id,
            service,
            volume_total: item.volume_total,
            revenue_total: item.revenue_total,
            top_eligible: item.top_eligible,
          },
        },
      });
      await onSaved();
      toast.success("Item atualizado");
      onClose();
    } catch (error) {
      toast.error("Não foi possível atualizar o Item", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sf-modal-backdrop" onClick={onClose}>
      <div
        className="sf-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Editar Item"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sf-modal-header">
          <h2>Editar Item da Cotação</h2>
        </div>
        <div className="sf-modal-body">
          <p>
            {item.route} · {item.merchandise_name}
          </p>
          <label style={labelStyle}>
            Serviço principal
            <select style={inputStyle} value={service} onChange={(e) => setService(e.target.value)}>
              {SERVICES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <small>
            Para alterar o Fluxo, recrie o Item; as Agendas existentes permanecem vinculadas ao
            Fluxo atual.
          </small>
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="sf-btn sf-btn--brand" onClick={() => void save()} disabled={busy}>
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function unique<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

export function QuoteItemScreenflow({
  accountName,
  flows,
  dieselBases,
  opportunityId,
  instrumentType,
  contractStart,
  contractEnd,
  firstReadjustmentDate,
  readjustment,
  integrationTariff,
  applicationDay,
  canChangeTariff,
  usedSchedules,
  allowExtendTerm = false,
  initialFlowId,
  initialService = "FRETE",
  itemId,
  onClose,
  onTermSaved,
  initialTakeOrPayConfig,
  onTakeOrPaySave,
  onSave,
}: Props) {
  const initial = flows.find((flow) => flow.id === initialFlowId);
  const [step, setStep] = useState(0);
  const [originId, setOriginId] = useState(initial?.origin_id ?? "");
  const [destinationId, setDestinationId] = useState(initial?.destination_id ?? "");
  const [merchandiseId, setMerchandiseId] = useState(initial?.merchandise_id ?? "");
  const [modal, setModal] = useState(initial?.modal ?? "");
  const [itemService, setItemService] = useState(initialService);
  const [tariffMode, setTariffMode] = useState(integrationTariff);
  const [seed, setSeed] = useState(790043);
  const [batchTarget, setBatchTarget] = useState<number | null>(null);
  const [batchStart, setBatchStart] = useState("");
  const [batchEnd, setBatchEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [termStart, setTermStart] = useState(contractStart);
  const [termEnd, setTermEnd] = useState(contractEnd);
  const [savingTerm, setSavingTerm] = useState(false);
  const [dieselPct, setDieselPct] = useState(readjustment.diesel);
  const [igpmPct, setIgpmPct] = useState(readjustment.igpm);
  const [ipcaPct, setIpcaPct] = useState(readjustment.ipca);
  const [firstDate, setFirstDate] = useState(firstReadjustmentDate);
  const [savingReadjustment, setSavingReadjustment] = useState(false);
  const [takeOrPay, setTakeOrPay] = useState<TakeOrPayConfig>(initialTakeOrPayConfig ?? {
    auditDate: "", billingDate: "", compensationMode: "individual", calculationBasis: "volume", pairs: [], groups: [],
  });
  const [termSaved, setTermSaved] = useState(!!contractStart && !!contractEnd);
  const startYear = Number(termStart?.slice(0, 4) || new Date().getFullYear());
  const startMonth = Number(termStart?.slice(5, 7) || 1);
  const endYear = Number(termEnd?.slice(0, 4) || startYear);
  const endMonth = Number(termEnd?.slice(5, 7) || 12);
  const termDays = termStart && termEnd ? (contractDurationDays(termStart, termEnd) ?? 0) : 0;
  const requiresAnnualSplit = termDays > 365;
  const readjustmentTotal = dieselPct + igpmPct + ipcaPct;
  const readjustmentError = termStart && termEnd
    ? readjustmentRuleError({ contractStart: termStart, contractEnd: termEnd, dieselPct, igpmPct, ipcaPct, firstReadjustmentDate: firstDate })
    : "Informe uma vigência válida antes de ajustar o reajuste anual.";
  const readjustmentValid = !readjustmentError;
  const yearMonths = useMemo(() => {
    const result: Array<{ year: number; month: number }> = [];
    // Com fim livre, os seletores oferecem até 36 meses depois do término atual.
    const lastKey = allowExtendTerm
      ? (endYear + 3) * 100 + endMonth
      : endYear * 100 + endMonth;
    for (let y = startYear; y <= Math.floor(lastKey / 100); y++)
      for (
        let m = y === startYear ? startMonth : 1;
        m <= (y === Math.floor(lastKey / 100) ? lastKey % 100 : 12);
        m++
      )
        result.push({ year: y, month: m });
    return result;
  }, [startYear, startMonth, endYear, endMonth, allowExtendTerm]);
  // Mês inicial do lote: sempre dentro da vigência atual (o fim pode ser livre).
  const termMonths = useMemo(
    () => yearMonths.filter((period) => period.year * 100 + period.month <= endYear * 100 + endMonth),
    [yearMonths, endYear, endMonth],
  );
  const selectedFlow = flows.find(
    (flow) =>
      flow.origin_id === originId &&
      flow.destination_id === destinationId &&
      flow.merchandise_id === merchandiseId &&
      flow.modal === modal,
  );
  const origins = unique(flows, (f) => f.origin_id);
  const destinations = unique(
    flows.filter((f) => f.origin_id === originId),
    (f) => f.destination_id,
  );
  const merchandiseOptions = unique(
    flows.filter((f) => f.origin_id === originId && f.destination_id === destinationId),
    (f) => f.merchandise_id,
  );
  const modals = unique(
    flows.filter(
      (f) =>
        f.origin_id === originId &&
        f.destination_id === destinationId &&
        f.merchandise_id === merchandiseId,
    ),
    (f) => f.modal,
  );
  const [groups, setGroups] = useState<AgendaGroup[]>(() => {
    const tariff = 400;
    const cbs = integrationTariff === "CBS";
    return [
      {
        year: startYear,
        month: startMonth,
        frequency: "Mensal",
        period_window: "Mês",
        division: "Todas",
        plaza: "TODAS_PRACAS_NACIONAL",
        volume: 1000,
        tariff,
        diesel_base_id: dieselBases[0]?.id ?? "",
        diesel_base_date: applicationDate(applicationDay, startMonth, startYear),
        tolerance_vli_volume: 0,
        tolerance_client_volume: 0,
        tolerance_vli_tariff: 0,
        tolerance_client_tariff: 0,
        services: [{ service: "FRETE", percent: 100 }],
      },
    ];
  });
  const hasTolerance = instrumentType === "Contrato" && groups.some((group) =>
    [group.tolerance_vli_volume, group.tolerance_client_volume, group.tolerance_vli_tariff, group.tolerance_client_tariff].some((value) => value > 0),
  );
  const takeOrPayError = instrumentType === "ACS" || !hasTolerance
    ? null
    : takeOrPayRuleError(takeOrPay, true, new Set(flows.map((flow) => flow.id)));
  function updateGroup(index: number, patch: Partial<AgendaGroup>) {
    setGroups((old) => old.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }
  function toggleService(index: number, service: string) {
    setGroups((old) =>
      old.map((g, i) => {
        if (i !== index) return g;
        const selected = g.services.map((x) => x.service);
        const next =
          service === "FRETE"
            ? selected
            : selected.includes(service)
              ? selected.filter((x) => x !== service)
              : [...selected, service];
        if (!next.includes("FRETE")) next.unshift("FRETE");
        const percent = 100 / next.length;
        return {
          ...g,
          services: next.map((name, n) => ({
            service: name,
            percent: n === next.length - 1 ? 100 - percent * (next.length - 1) : percent,
          })),
        };
      }),
    );
  }
  function addGroup() {
    const last = groups.at(-1)!;
    const nextPeriod =
      yearMonths.find((p) => p.year * 100 + p.month > last.year * 100 + last.month) ??
      yearMonths[0];
    setGroups((old) => [
      ...old,
      {
        ...last,
        year: nextPeriod.year,
        month: nextPeriod.month,
        diesel_base_date: applicationDate(applicationDay, nextPeriod.month, nextPeriod.year),
        services: last.services.map((s) => ({ ...s })),
      },
    ]);
  }
  function openBatch(index: number) {
    const group = groups[index];
    setBatchTarget(index);
    const groupKey = group.year * 100 + group.month;
    const startKey = Math.min(groupKey, endYear * 100 + endMonth);
    setBatchStart(`${Math.floor(startKey / 100)}-${String(startKey % 100).padStart(2, "0")}`);
    setBatchEnd(`${endYear}-${String(endMonth).padStart(2, "0")}`);
    setError("");
  }
  function createBatch() {
    if (batchTarget === null) return;
    const startKey = Number(batchStart.replace("-", ""));
    const endKey = Number(batchEnd.replace("-", ""));
    if (!batchStart || !batchEnd || startKey > endKey) {
      setError("Escolha um intervalo válido, com o início antes do fim.");
      return;
    }
    const termStartKey = startYear * 100 + startMonth;
    if (startKey < termStartKey || startKey > endYear * 100 + endMonth) {
      setError("O mês inicial precisa estar dentro da vigência da Oportunidade.");
      return;
    }
    const selectedPeriods: Array<{ year: number; month: number }> = [];
    if (allowExtendTerm) {
      // Fim livre: gera todos os meses do intervalo, inclusive depois do término.
      let year = Math.floor(startKey / 100),
        month = startKey % 100;
      while (year * 100 + month <= endKey && selectedPeriods.length < 120) {
        selectedPeriods.push({ year, month });
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
      }
    } else
      selectedPeriods.push(
        ...yearMonths.filter((period) => {
          const key = period.year * 100 + period.month;
          return key >= startKey && key <= endKey;
        }),
      );
    if (!selectedPeriods.length) {
      setError("O intervalo precisa ficar dentro da vigência da Oportunidade.");
      return;
    }

    const template = groups[batchTarget];
    const usedKeys = new Set(usedSchedules.map((row) => row.schedule_key));
    const existingKeys = new Set(
      groups.map(
        (group) =>
          `${selectedFlow?.code}|${group.year}${String(group.month).padStart(2, "0")}|${group.division}|${group.plaza}`,
      ),
    );
    const additions: AgendaGroup[] = [];
    let skipped = 0;
    for (const period of selectedPeriods) {
      const key = `${selectedFlow?.code}|${period.year}${String(period.month).padStart(2, "0")}|${template.division}|${template.plaza}`;
      if (usedKeys.has(key) || existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key);
      additions.push({
        ...template,
        year: period.year,
        month: period.month,
        diesel_base_date: applicationDate(applicationDay, period.month, period.year),
        services: template.services.map((service) => ({ ...service })),
      });
    }
    if (!additions.length) {
      setError(
        "Não há meses disponíveis nesse intervalo; as Agendas já existem ou estão fora da vigência.",
      );
      return;
    }
    // Se o grupo usado como modelo já existe como Agenda, ele é trocado pelos meses novos.
    const templateKey = `${selectedFlow?.code}|${template.year}${String(template.month).padStart(2, "0")}|${template.division}|${template.plaza}`;
    const replaceTemplate = usedKeys.has(templateKey);
    const target = batchTarget;
    setGroups((old) => [
      ...(replaceTemplate ? old.filter((_, index) => index !== target) : old),
      ...additions,
    ]);
    setBatchTarget(null);
    setError("");
    toast.success(`${additions.length} novo(s) grupo(s) de Agenda adicionado(s)`, {
      description: replaceTemplate
        ? "O grupo modelo já existia como Agenda e foi substituído pelos meses novos. A Data Base Diesel foi ajustada automaticamente."
        : skipped
        ? `${skipped} mês(es) já tinham grupo no formulário ou Agenda nessa chave. A Data Base Diesel foi ajustada automaticamente.`
        : `Períodos de ${batchStart} a ${batchEnd}; Data Base Diesel ajustada automaticamente.`,
    });
  }
  function generateGroup(index: number) {
    const group = groups[index];
    const blocked = new Set(usedSchedules.map((row) => row.schedule_key));
    groups.forEach((candidate, candidateIndex) => {
      if (candidateIndex === index) return;
      blocked.add(
        `${selectedFlow?.code}|${candidate.year}${String(candidate.month).padStart(2, "0")}|${candidate.division}|${candidate.plaza}`,
      );
    });
    const available = yearMonths.find((period) => {
      if (period.year * 100 + period.month < group.year * 100 + group.month) return false;
      const key = `${selectedFlow?.code}|${period.year}${String(period.month).padStart(2, "0")}|${group.division}|${group.plaza}`;
      return !blocked.has(key);
    });
    if (!available) {
      setError("Não há períodos disponíveis dentro da vigência do Contrato.");
      return;
    }
    const seeded = Math.abs(Math.imul(seed + index * 7919, 2654435761) >>> 0);
    updateGroup(index, {
      ...available,
      diesel_base_date: applicationDate(applicationDay, available.month, available.year),
      volume: 1000 + (seeded % 9000),
      tariff: 100 + ((Math.imul(seeded, 1097) >>> 0) % 9900) / 100,
    });
    setError("");
  }
  function validateCurrent() {
    setError("");
    if (step === 0 && !selectedFlow) {
      setError("Complete Cliente, Origem, Destino, Mercadoria e Modal para continuar.");
      return false;
    }
    if (step === 1 && !readjustmentValid) {
      setError(readjustmentError ?? "Revise os parâmetros de reajuste anual.");
      return false;
    }
    if (
      step === 2 &&
      (!itemService || !groups.length || !["CBS", "Líquida"].includes(tariffMode))
    ) {
      setError("Escolha o serviço do Item e adicione ao menos um grupo de Agenda.");
      return false;
    }
    if (
      step === 2 &&
      groups.some(
        (g) =>
          !Number.isInteger(g.volume) ||
          g.volume <= 0 ||
          !Number.isFinite(g.tariff) ||
          g.tariff <= 0 ||
          !g.diesel_base_id ||
          [
            g.tolerance_vli_volume,
            g.tolerance_client_volume,
            g.tolerance_vli_tariff,
            g.tolerance_client_tariff,
          ].some((value) => !Number.isInteger(value) || value < 0 || value > 100) ||
          Math.abs(g.services.reduce((s, x) => s + x.percent, 0) - 100) > 0.2,
      )
    ) {
      setError("Revise volume, tarifa, Base Diesel, tolerâncias e rateio de serviços de cada grupo.");
      return false;
    }
    if (step === 3 && instrumentType === "Contrato" && takeOrPayError) {
      setError(takeOrPayError);
      return false;
    }
    return true;
  }
  async function save() {
    if (!validateCurrent() || !selectedFlow) return;
    setBusy(true);
    try {
      if (await onSave({ flowId: selectedFlow.id, itemService, tariffMode, groups })) {
        if (onTakeOrPaySave) await onTakeOrPaySave(hasTolerance ? takeOrPay : null);
        onClose();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar as condições comerciais.");
    } finally {
      setBusy(false);
    }
  }
  const select = (
    value: string,
    onChange: (value: string) => void,
    options: Array<{ value: string; label: string }>,
    disabled = false,
  ) => (
    <select
      style={inputStyle}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  // ACS não tem reajuste: a etapa de reajuste só existe para Contrato.
  const skipReadjustment = instrumentType === "ACS";
  const allSteps = [
    { id: 0, title: "Fluxo do Cliente" },
    { id: 1, title: "Reajuste Ferro" },
    { id: 2, title: "Agendas e Data Base Diesel" },
    { id: 3, title: "Condições comerciais" },
    { id: 4, title: "Revisão" },
  ];
  const stepList = skipReadjustment ? allSteps.filter((s) => s.id !== 1) : allSteps;
  const stepTitles = stepList.map((s) => s.title);
  const stepIndex = stepList.findIndex((s) => s.id === step);
  return (
    <div className="sf-modal-backdrop" onClick={onClose}>
      <div
        className="sf-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Fluxo guiado de Item e Agenda"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(920px, 96vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="sf-modal-header">
          <h2>{itemId ? "Adicionar Agendas ao Item" : "Criar Item e Agendas da Cotação"}</h2>
        </div>
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #eee",
            color: "#444",
            fontSize: 13,
          }}
        >
          <b>
            Etapa {stepIndex + 1} de {stepList.length} · {stepTitles[stepIndex]}
          </b>
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            {stepList.map((s, i) => (
              <div
                key={s.id}
                style={{
                  height: 5,
                  flex: 1,
                  borderRadius: 4,
                  background: i <= stepIndex ? "#0176d3" : "#ddd",
                }}
              />
            ))}
          </div>
        </div>
        <div className="sf-modal-body" style={{ overflow: "auto", padding: 20 }}>
          {!termSaved && (
            <div
              role="status"
              style={{
                border: "1px solid #fe9339",
                background: "#fffaf2",
                borderRadius: 6,
                padding: "10px 12px",
                marginBottom: 14,
                color: "#b6761c",
                fontSize: 13,
              }}
            >
              <strong>A Oportunidade não tem vigência definida.</strong> As Agendas precisam de
              início e fim da vigência — defina aqui mesmo para continuar:
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, color: "#444" }}>
                <label style={{ fontSize: 12 }}>
                  <span style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Início</span>
                  <input
                    className="sf-input"
                    type="date"
                    value={termStart}
                    onChange={(e) => setTermStart(e.target.value)}
                    style={{ padding: 6, width: 150 }}
                  />
                </label>
                <label style={{ fontSize: 12 }}>
                  <span style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Fim</span>
                  <input
                    className="sf-input"
                    type="date"
                    value={termEnd}
                    onChange={(e) => setTermEnd(e.target.value)}
                    style={{ padding: 6, width: 150 }}
                  />
                </label>
                <button
                  className="sf-btn sf-btn--brand"
                  disabled={savingTerm}
                  style={{ alignSelf: "flex-end" }}
                  onClick={async () => {
                    setSavingTerm(true);
                    try {
                      await updateOpportunityTerm({
                        data: {
                          id: opportunityId,
                          contract_start: termStart,
                          contract_end: termEnd,
                        },
                      });
                      toast.success("Vigência da Oportunidade atualizada.");
                      setTermSaved(true);
                      await onTermSaved?.();
                    } catch (error) {
                      toast.error("Não foi possível salvar a vigência", {
                        description: error instanceof Error ? error.message : undefined,
                      });
                    } finally {
                      setSavingTerm(false);
                    }
                  }}
                >
                  {savingTerm ? "Salvando…" : "Salvar vigência"}
                </button>
              </div>
            </div>
          )}
          {step === 0 && (
            <>
              <p style={{ marginTop: 0, color: "#706e6b", fontSize: 13 }}>
                {itemId
                  ? "O Cliente e o Fluxo estão fixados pelo Item. Monte os períodos e serviços das novas Agendas."
                  : "O Cliente vem da Conta de Gestão da Oportunidade. Escolha cada nível; as opções seguintes acompanham sua seleção."}
              </p>
              <label style={labelStyle}>
                👤 Cliente
                <select style={inputStyle} value={accountName} disabled>
                  <option>{accountName}</option>
                </select>
              </label>
              <label style={labelStyle}>
                📍 Origem
                {select(
                  originId,
                  (v) => {
                    setOriginId(v);
                    setDestinationId("");
                    setMerchandiseId("");
                    setModal("");
                  },
                  [
                    { value: "", label: "— Selecione —" },
                    ...origins.map((f) => ({
                      value: f.origin_id,
                      label: `${f.origin_code} · ${f.origin_name}`,
                    })),
                  ],
                  !!itemId,
                )}
              </label>
              <label style={labelStyle}>
                🏁 Destino
                {select(
                  destinationId,
                  (v) => {
                    setDestinationId(v);
                    setMerchandiseId("");
                    setModal("");
                  },
                  [
                    { value: "", label: "— Selecione —" },
                    ...destinations.map((f) => ({
                      value: f.destination_id,
                      label: `${f.destination_code} · ${f.destination_name}`,
                    })),
                  ],
                  !!itemId || !originId,
                )}
              </label>
              <label style={labelStyle}>
                📦 Mercadoria
                {select(
                  merchandiseId,
                  (v) => {
                    setMerchandiseId(v);
                    setModal("");
                  },
                  [
                    { value: "", label: "— Selecione —" },
                    ...merchandiseOptions.map((f) => ({
                      value: f.merchandise_id,
                      label: f.merchandise,
                    })),
                  ],
                  !!itemId || !destinationId,
                )}
              </label>
              <label style={labelStyle}>
                🚆 Modal
                {select(
                  modal,
                  setModal,
                  [
                    { value: "", label: "— Selecione —" },
                    ...modals.map((f) => ({ value: f.modal, label: f.modal })),
                  ],
                  !!itemId || !merchandiseId,
                )}
              </label>
              {!flows.length && (
                <p role="status">Não há Fluxos Planejados ferroviários para esta Conta.</p>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <p style={{ marginTop: 0, color: "#706e6b", fontSize: 13 }}>
                Confira os parâmetros anuais cadastrados na Oportunidade antes de montar as Agendas.
                O modal e o tipo do instrumento vêm do cadastro comercial.
              </p>
              <section
                style={{
                  border: "1px solid #dddbda",
                  borderRadius: 6,
                  padding: 16,
                  marginBottom: 14,
                }}
              >
                <h3 style={{ marginTop: 0 }}>Percentuais do contrato</h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                    gap: 12,
                  }}
                >
                  {([
                    ["Diesel", dieselPct, setDieselPct],
                    ["IGP-M", igpmPct, setIgpmPct],
                    ["IPCA", ipcaPct, setIpcaPct],
                  ] as const).map(([label, value, setValue]) => (
                    <div
                      key={String(label)}
                      style={{ padding: 12, background: "#f3f3f3", borderRadius: 4 }}
                    >
                      <small>{label}</small>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          aria-label={`Percentual ${label}`}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={value}
                          onChange={(event) => setValue(Number(event.target.value))}
                          style={{ ...inputStyle, fontSize: 20, fontWeight: 700, padding: "5px 7px" }}
                        />
                        <strong>%</strong>
                      </div>
                    </div>
                  ))}
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 4,
                      background: readjustmentValid ? "#eef8f1" : "#fef1ee",
                      color: readjustmentValid ? "#2e844a" : "#ba0517",
                    }}
                  >
                    <small>Total</small>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>
                      {readjustmentTotal.toFixed(2)}%
                    </div>
                    <small>
                      {requiresAnnualSplit
                        ? readjustmentValid
                          ? "Soma válida"
                          : "Precisa somar 100%"
                        : "A soma de 100% não é exigida nesta vigência"}
                    </small>
                  </div>
                </div>
                <button
                    className="sf-business-rule-help"
                    type="button"
                    aria-label="Explicação da soma dos percentuais anuais"
                    onClick={() =>
                      toast("Regra: percentuais de reajuste anual", {
                        description: "Quando a vigência do contrato ultrapassa 365 dias, os percentuais de Diesel, IGP-M e IPCA precisam totalizar 100%. Os valores são configurados na Oportunidade e conferidos antes de avançar.",
                        duration: Infinity,
                        action: { label: "Entendi", onClick: () => {} },
                      })
                    }
                  >
                    i
                  </button>
                  <small style={{ display: "block", marginTop: 12 }}>
                  Vigência: {termStart || "—"} a {termEnd || "—"} · {termDays} dias · Dia de
                  aplicação: {applicationDay}
                </small>
                {readjustmentError && (
                  <p
                    role="status"
                    style={{ color: "#ba0517", marginBottom: 0 }}
                  >
                    {readjustmentError}
                  </p>
                )}
                <small style={{ display: "block", marginTop: 8 }}>
                  Cada percentual deve ficar entre 0% e 100%. Acima de 365 dias, a soma precisa
                  fechar 100%; a data do primeiro reajuste também deve ficar na vigência.
                </small>
                <button
                  className="sf-btn"
                  type="button"
                  disabled={savingReadjustment || !readjustmentValid}
                  style={{ marginTop: 12 }}
                  onClick={async () => {
                    setSavingReadjustment(true);
                    try {
                      await updateOpportunityReadjustment({
                        data: {
                          id: opportunityId,
                          diesel_pct: dieselPct,
                          igpm_pct: igpmPct,
                          ipca_pct: ipcaPct,
                          first_readjustment_date: firstDate,
                        },
                      });
                      toast.success("Parâmetros de reajuste atualizados na Oportunidade.");
                      await onTermSaved?.();
                    } catch (error) {
                      toast.error("Não foi possível salvar o reajuste", {
                        description: error instanceof Error ? error.message : undefined,
                      });
                    } finally {
                      setSavingReadjustment(false);
                    }
                  }}
                >
                  {savingReadjustment ? "Salvando…" : "Salvar parâmetros de reajuste"}
                </button>
              </section>
              <section style={{ border: "1px solid #dddbda", borderRadius: 6, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>Primeiro reajuste</h3>
                <button
                  className="sf-business-rule-help"
                  type="button"
                  aria-label="Explicação da data do primeiro reajuste"
                  onClick={() =>
                    toast("Regra: primeiro reajuste", {
                      description: "A data do primeiro reajuste precisa estar dentro da vigência do contrato. Depois dela, as aplicações seguem o dia configurado na Oportunidade (1, 10 ou 20).",
                      duration: Infinity,
                      action: { label: "Entendi", onClick: () => {} },
                    })
                  }
                >
                  i
                </button>
                <p style={{ marginBottom: 4 }}>
                  Primeiro reajuste:
                  <input
                    aria-label="Data do primeiro reajuste"
                    type="date"
                    value={firstDate}
                    min={termStart || contractStart}
                    max={termEnd || contractEnd}
                    onChange={(event) => setFirstDate(event.target.value)}
                    style={{ ...inputStyle, width: "auto", margin: "0 8px" }}
                  />
                  As aplicações seguem o dia {applicationDay} de cada período.
                </p>
                <small>
                  A Data Base Diesel e a base aplicável serão definidas por fluxo na próxima etapa.
                  O cálculo financeiro do reajuste permanece como gap técnico registrado.
                </small>
              </section>
            </>
          )}
          {step === 2 && (
            <>
              <p style={{ marginTop: 0, color: "#706e6b", fontSize: 13 }}>
                Adicione os períodos que desejar. Os serviços do mesmo período são rateados para
                fechar 100%; FRETE é obrigatório.
              </p>
              <label style={labelStyle}>
                Tarifa usada nesta Cotação
                {select(
                  tariffMode,
                  setTariffMode,
                  [
                    { value: "CBS", label: "Tarifa CBS" },
                    { value: "Líquida", label: "Tarifa líquida" },
                  ],
                  !canChangeTariff,
                )}
                <small>
                  {canChangeTariff
                    ? "Escolha a modalidade usada em todos os valores desta Cotação."
                    : "A modalidade fica fixa depois que a Cotação recebe sua primeira Agenda."}
                </small>
              </label>
              {!itemId && (
                <label style={labelStyle}>
                  Serviço principal do Item
                  {select(
                    itemService,
                    setItemService,
                    SERVICES.map((s) => ({ value: s, label: s })),
                  )}
                </label>
              )}
              <label style={{ ...labelStyle, maxWidth: 220 }}>
                Seed do Faker
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 1)}
                />
              </label>
              {groups.map((g, index) => (
                <section
                  key={index}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <b>Grupo de Agenda {index + 1}</b>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button className="sf-btn" type="button" onClick={() => generateGroup(index)}>
                        Gerar com Faker
                      </button>
                      <button className="sf-btn" type="button" onClick={() => openBatch(index)}>
                        Criar em lote
                      </button>
                    </div>
                  </div>
                  {batchTarget === index && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                        gap: 10,
                        alignItems: "end",
                        marginBottom: 12,
                        padding: 12,
                        border: "1px solid #c9c7c5",
                        borderRadius: 4,
                        background: "#f8f8f8",
                      }}
                    >
                      <label style={labelStyle}>
                        Mês inicial
                        {select(
                          batchStart,
                          setBatchStart,
                          termMonths.map((period) => {
                            const value = `${period.year}-${String(period.month).padStart(2, "0")}`;
                            return {
                              value,
                              label: `${String(period.month).padStart(2, "0")}/${period.year}`,
                            };
                          }),
                        )}
                      </label>
                      <label style={labelStyle}>
                        Mês final
                        {allowExtendTerm ? (
                          <input
                            type="month"
                            value={batchEnd}
                            min={batchStart}
                            onChange={(event) => setBatchEnd(event.target.value)}
                            style={{ padding: "6px 8px", border: "1px solid #c9c9c9", borderRadius: 4 }}
                          />
                        ) : (
                          select(
                            batchEnd,
                            setBatchEnd,
                            yearMonths.map((period) => {
                              const value = `${period.year}-${String(period.month).padStart(2, "0")}`;
                              return {
                                value,
                                label: `${String(period.month).padStart(2, "0")}/${period.year}`,
                              };
                            }),
                          )
                        )}
                      </label>
                      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                        <button
                          className="sf-btn sf-btn--brand"
                          type="button"
                          onClick={createBatch}
                        >
                          Criar períodos
                        </button>
                        <button
                          className="sf-btn"
                          type="button"
                          onClick={() => setBatchTarget(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                      <small style={{ gridColumn: "1 / -1", color: "#514f4d" }}>
                        Adiciona um grupo por mês no intervalo, copiando os dados e o rateio deste
                        grupo. Se o mês inicial já estiver representado no formulário, ele será
                        mantido e os outros meses serão adicionados. Meses com Agenda nessa chave
                        serão ignorados.
                        {allowExtendTerm
                          ? instrumentType === "Aditivo"
                            ? " O mês final é livre: meses depois do fim original estendem a vigência e geram a cláusula de prorrogação do aditivo."
                            : " O mês final é livre: meses depois do fim atual estendem a vigência da Oportunidade ao salvar."
                          : " Meses fora da vigência serão ignorados."}
                      </small>
                    </div>
                  )}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))",
                      gap: 10,
                    }}
                  >
                    <label style={labelStyle}>
                      Ano
                      {select(
                        String(g.year),
                        (v) =>
                          updateGroup(index, {
                            year: Number(v),
                            diesel_base_date: applicationDate(applicationDay, g.month, Number(v)),
                          }),
                        unique(yearMonths, (p) => String(p.year)).map((p) => ({
                          value: String(p.year),
                          label: String(p.year),
                        })),
                      )}
                    </label>
                    <label style={labelStyle}>
                      Mês
                      {select(
                        String(g.month),
                        (v) =>
                          updateGroup(index, {
                            month: Number(v),
                            diesel_base_date: applicationDate(applicationDay, Number(v), g.year),
                          }),
                        yearMonths
                          .filter((p) => p.year === g.year)
                          .map((p) => ({
                            value: String(p.month),
                            label: String(p.month).padStart(2, "0"),
                          })),
                      )}
                    </label>
                    <label style={labelStyle}>
                      Periodicidade
                      {select(
                        g.frequency,
                        (v) => updateGroup(index, { frequency: v }),
                        ["Mensal", "Anual"].map((v) => ({ value: v, label: v })),
                      )}
                    </label>
                    <label style={labelStyle}>
                      Período
                      {select(
                        g.period_window,
                        (v) => updateGroup(index, { period_window: v }),
                        WINDOWS.map((v) => ({ value: v, label: v })),
                      )}
                    </label>
                    <label style={labelStyle}>
                      Divisão
                      <input
                        style={inputStyle}
                        value={g.division}
                        onChange={(e) => updateGroup(index, { division: e.target.value })}
                      />
                    </label>
                    <label style={labelStyle}>
                      Praça
                      <input
                        style={inputStyle}
                        value={g.plaza}
                        onChange={(e) => updateGroup(index, { plaza: e.target.value })}
                      />
                    </label>
                    <label style={labelStyle}>
                      Volume inteiro
                      <input
                        style={inputStyle}
                        type="number"
                        min="1"
                        step="1"
                        value={g.volume}
                        onChange={(e) => updateGroup(index, { volume: Number(e.target.value) })}
                      />
                    </label>
                    <label style={labelStyle}>
                      Tarifa {tariffMode === "CBS" ? "CBS" : "líquida"}
                      <input
                        style={inputStyle}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={g.tariff}
                        onChange={(e) => updateGroup(index, { tariff: Number(e.target.value) })}
                      />
                    </label>
                    <label style={labelStyle}>
                      Base Diesel do fluxo
                      {select(g.diesel_base_id, (v) => updateGroup(index, { diesel_base_id: v }), [
                        { value: "", label: "— Selecione —" },
                        ...dieselBases.map((b) => ({ value: b.id, label: b.name })),
                      ])}
                    </label>
                    <label style={labelStyle}>
                      Data Base Diesel do fluxo (automática)
                      <input
                        style={inputStyle}
                        aria-label="Data de aplicação diesel automática"
                        value={g.diesel_base_date}
                        readOnly
                      />
                    </label>
                  </div>
                  {instrumentType === "Contrato" ? (
                    <section
                      style={{
                        marginTop: 12,
                        padding: 12,
                        border: "1px solid #91c8f6",
                        borderRadius: 4,
                        background: "#f3f9fe",
                      }}
                    >
                      <b style={{ fontSize: 13 }}>Take or Pay · tolerâncias da Agenda</b>
                      <p style={{ margin: "5px 0 10px", fontSize: 12, color: "#444" }}>
                        Qualquer percentual acima de zero exige a configuração de Take or Pay na
                        Oportunidade antes de avançar. Informe as quatro tolerâncias; use zero
                        quando aquela dimensão não fizer parte do acordo.
                      </p>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))",
                          gap: 10,
                        }}
                      >
                        {([
                          ["Tolerância volume VLI", "tolerance_vli_volume"],
                          ["Tolerância volume cliente", "tolerance_client_volume"],
                          ["Tolerância tarifa VLI", "tolerance_vli_tariff"],
                          ["Tolerância tarifa cliente", "tolerance_client_tariff"],
                        ] as const).map(([label, field]) => (
                          <label key={field} style={labelStyle}>
                            {label} (%)
                            <input
                              aria-label={label}
                              style={inputStyle}
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={g[field]}
                              onChange={(event) =>
                                updateGroup(index, { [field]: Number(event.target.value) })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </section>
                  ) : instrumentType === "ACS" ? (
                    <p
                      style={{
                        margin: "12px 0 0",
                        padding: 10,
                        borderRadius: 4,
                        color: "#8a6d00",
                        background: "#fff8e1",
                        fontSize: 12,
                      }}
                    >
                      ACS não aceita tolerâncias nem Take or Pay. Por isso, esses campos não são
                      exibidos nesta Agenda.
                    </p>
                  ) : null}
                  <div style={{ marginTop: 8 }}>
                    <b style={{ fontSize: 12 }}>Serviços e rateio</b>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "8px 0" }}>
                      {SERVICES.map((s) => (
                        <label key={s} style={{ fontSize: 12 }}>
                          <input
                            type="checkbox"
                            checked={g.services.some((x) => x.service === s)}
                            disabled={s === "FRETE"}
                            onChange={() => toggleService(index, s)}
                          />{" "}
                          {s}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {g.services.map((s) => (
                        <label key={s.service} style={{ fontSize: 12 }}>
                          {s.service} %{" "}
                          <input
                            style={{ ...inputStyle, width: 80, padding: 5 }}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={s.percent}
                            onChange={(e) =>
                              updateGroup(index, {
                                services: g.services.map((x) =>
                                  x.service === s.service
                                    ? { ...x, percent: Number(e.target.value) }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <small
                      style={{
                        color:
                          Math.abs(g.services.reduce((sum, s) => sum + s.percent, 0) - 100) > 0.2
                            ? "#ba0517"
                            : "#2e844a",
                      }}
                    >
                      Total do rateio:{" "}
                      {g.services.reduce((sum, s) => sum + s.percent, 0).toFixed(2)}% (deve fechar
                      100%)
                    </small>
                  </div>
                  {groups.length > 1 && (
                    <button
                      className="sf-btn"
                      type="button"
                      style={{ marginTop: 10 }}
                      onClick={() => setGroups((old) => old.filter((_, i) => i !== index))}
                    >
                      Remover grupo
                    </button>
                  )}
                </section>
              ))}
              <button className="sf-btn" type="button" onClick={addGroup}>
                + Adicionar período
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <h3>Condições comerciais</h3>
              <p style={{ color: "#444" }}>Complete as regras comerciais antes da revisão final.</p>
              {instrumentType === "ACS" ? (
                <div role="status" style={{ padding: 12, borderRadius: 4, background: "#f3f9fe", color: "#124d73" }}>
                  <strong>Take or Pay não aplicável</strong><br />ACS não aceita tolerâncias nem configuração de Take or Pay.
                </div>
              ) : (
                <>
                  <section style={{ border: "1px solid #c9c9c9", borderRadius: 6, padding: 14, marginBottom: 16 }}>
                    <h4 style={{ margin: "0 0 8px" }}>Mapa de regras do Take or Pay</h4>
                    {[{
                      label: "Tolerâncias das Agendas",
                      passed: hasTolerance,
                      detail: hasTolerance ? "Existe tolerância positiva em volume ou tarifa." : "Nenhuma tolerância positiva foi informada.",
                    }, {
                      label: "Configuração do Take or Pay",
                      passed: !hasTolerance || (!!takeOrPay.auditDate && !!takeOrPay.billingDate),
                      detail: hasTolerance ? "Informe as datas e a regra de compensação." : "Sem tolerâncias, fica como não aplicável.",
                    }, {
                      label: "Modelo e base de compensação",
                      passed: !hasTolerance || (!!takeOrPay.compensationMode && !!takeOrPay.calculationBasis),
                      detail: "Define como a regra será registrada no Contrato.",
                    }, {
                      label: "Validação do conjunto",
                      passed: !takeOrPayError,
                      detail: takeOrPayError ?? "Todos os dados estão consistentes.",
                    }].map((rule) => (
                      <div key={rule.label} style={{ display: "flex", gap: 9, padding: "8px 0", borderTop: "1px solid #eee" }}>
                        <span style={{ color: rule.passed ? "#2e844a" : "#ba0517", fontWeight: 800 }}>{rule.passed ? "✓" : "!"}</span>
                        <span><strong>{rule.label}</strong><br /><small>{rule.detail}</small></span>
                      </div>
                    ))}
                  </section>
                  <label style={labelStyle}>Data de apuração<input style={inputStyle} type="date" value={takeOrPay.auditDate} onChange={(event) => setTakeOrPay({ ...takeOrPay, auditDate: event.target.value })} /></label>
                  <label style={labelStyle}>Data de faturamento<input style={inputStyle} type="date" value={takeOrPay.billingDate} onChange={(event) => setTakeOrPay({ ...takeOrPay, billingDate: event.target.value })} /></label>
                  <label style={labelStyle}>Modelo de compensação<select style={inputStyle} value={takeOrPay.compensationMode} onChange={(event) => setTakeOrPay({ ...takeOrPay, compensationMode: event.target.value as TakeOrPayConfig["compensationMode"] })}>
                    <option value="individual">Fluxos individuais</option><option value="all-flows">Todos os fluxos em conjunto</option><option value="flow-pairs">Pares de fluxos</option><option value="groups">Grupos de fluxos</option>
                  </select></label>
                  <label style={labelStyle}>Base de compensação<select style={inputStyle} value={takeOrPay.calculationBasis} onChange={(event) => setTakeOrPay({ ...takeOrPay, calculationBasis: event.target.value as TakeOrPayConfig["calculationBasis"] })}>
                    <option value="volume">Volume</option><option value="tariff">Tarifa</option><option value="both">Volume e tarifa</option>
                  </select></label>
                </>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <h3>Confira antes de salvar</h3>
              <ul>
                <li>Cliente: {accountName}</li>
                <li>
                  Fluxo: {selectedFlow?.origin_code} → {selectedFlow?.destination_code} ·{" "}
                  {selectedFlow?.merchandise} · {selectedFlow?.modal}
                </li>
                <li>Serviço principal do Item: {itemService}</li>
                <li>
                  {groups.length} grupo(s), {groups.reduce((n, g) => n + g.services.length, 0)}{" "}
                  linha(s) de Agenda
                </li>
                <li>
                  Vigência: {contractStart} a {contractEnd}
                  {allowExtendTerm &&
                    groups.some(
                      (g) =>
                        g.year * 100 + g.month >
                        Number(contractEnd.slice(0, 4)) * 100 + Number(contractEnd.slice(5, 7)),
                    ) &&
                    " — será estendida até o último mês das Agendas"}
                </li>
                <li>Tarifa configurada pela Oportunidade: {integrationTariff}</li>
                <li>FRETE incluído e rateio de cada grupo validado em 100%</li>
              </ul>
              <p>Item e Agendas serão gravados como uma operação única.</p>
            </>
          )}
          {error && (
            <div
              role="alert"
              style={{ padding: 10, color: "#ba0517", background: "#fef1ee", borderRadius: 4 }}
            >
              {error}
            </div>
          )}
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          {step > 0 && (
            <button
              className="sf-btn"
              onClick={() => {
                setError("");
                setStep(skipReadjustment && step === 2 ? 0 : (s) => s - 1);
              }}
              disabled={busy}
            >
              Voltar
            </button>
          )}
          {step < 4 ? (
            <button
              className="sf-btn sf-btn--brand"
              disabled={savingTakeOrPay}
              onClick={() => {
                if (!validateCurrent()) return;
                if (skipReadjustment && step === 0) setStep(2);
                else setStep((s) => s + 1);
              }}
            >
              Continuar
            </button>
          ) : (
            <button className="sf-btn sf-btn--brand" disabled={busy} onClick={() => void save()}>
              {busy ? "Salvando Item e Agendas…" : "Salvar Item e Agendas"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
