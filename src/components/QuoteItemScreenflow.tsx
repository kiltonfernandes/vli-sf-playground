import { useMemo, useState } from "react";
import { saveRecord } from "@/lib/crud";
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
  services: Array<{ service: string; percent: number }>;
};
type Props = {
  accountName: string;
  flows: Flow[];
  dieselBases: Array<{ id: string; name: string }>;
  contractStart: string;
  contractEnd: string;
  firstReadjustmentDate: string;
  readjustment: { diesel: number; igpm: number; ipca: number };
  integrationTariff: string;
  applicationDay: number;
  canChangeTariff: boolean;
  usedSchedules: Array<{ schedule_key: string; service: string }>;
  initialFlowId?: string;
  initialService?: string;
  itemId?: string;
  onClose: () => void;
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
  contractStart,
  contractEnd,
  firstReadjustmentDate,
  readjustment,
  integrationTariff,
  applicationDay,
  canChangeTariff,
  usedSchedules,
  initialFlowId,
  initialService = "FRETE",
  itemId,
  onClose,
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
  const startYear = Number(contractStart?.slice(0, 4) || new Date().getFullYear());
  const startMonth = Number(contractStart?.slice(5, 7) || 1);
  const endYear = Number(contractEnd?.slice(0, 4) || startYear);
  const endMonth = Number(contractEnd?.slice(5, 7) || 12);
  const termDays =
    contractStart && contractEnd
      ? Math.round(
          (Date.parse(`${contractEnd}T00:00:00Z`) - Date.parse(`${contractStart}T00:00:00Z`)) /
            86400000,
        )
      : 0;
  const requiresAnnualSplit = termDays > 365;
  const readjustmentTotal = readjustment.diesel + readjustment.igpm + readjustment.ipca;
  const readjustmentValid = !requiresAnnualSplit || Math.abs(readjustmentTotal - 100) < 0.001;
  const yearMonths = useMemo(() => {
    const result: Array<{ year: number; month: number }> = [];
    for (let y = startYear; y <= endYear; y++)
      for (let m = y === startYear ? startMonth : 1; m <= (y === endYear ? endMonth : 12); m++)
        result.push({ year: y, month: m });
    return result;
  }, [startYear, startMonth, endYear, endMonth]);
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
        services: [{ service: "FRETE", percent: 100 }],
      },
    ];
  });
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
    setBatchStart(`${group.year}-${String(group.month).padStart(2, "0")}`);
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
    const selectedPeriods = yearMonths.filter((period) => {
      const key = period.year * 100 + period.month;
      return key >= startKey && key <= endKey;
    });
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
    setGroups((old) => [...old, ...additions]);
    setBatchTarget(null);
    setError("");
    toast.success(`${additions.length} novo(s) grupo(s) de Agenda adicionado(s)`, {
      description: skipped
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
      setError("Para vigência superior a 365 dias, Diesel + IGP-M + IPCA precisam somar 100%.");
      return false;
    }
    if (step === 1 && requiresAnnualSplit && !firstReadjustmentDate) {
      setError("Informe a data do primeiro reajuste na Oportunidade antes de continuar.");
      return false;
    }
    if (step === 1 && firstReadjustmentDate && contractStart && contractEnd) {
      const firstDate = Date.parse(`${firstReadjustmentDate}T00:00:00Z`);
      if (
        firstDate < Date.parse(`${contractStart}T00:00:00Z`) ||
        firstDate > Date.parse(`${contractEnd}T00:00:00Z`)
      ) {
        setError("A data do primeiro reajuste precisa estar dentro da vigência do contrato.");
        return false;
      }
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
          Math.abs(g.services.reduce((s, x) => s + x.percent, 0) - 100) > 0.2,
      )
    ) {
      setError("Revise volume, tarifa, Base Diesel e rateio de serviços de cada grupo.");
      return false;
    }
    return true;
  }
  async function save() {
    if (!validateCurrent() || !selectedFlow) return;
    setBusy(true);
    try {
      if (await onSave({ flowId: selectedFlow.id, itemService, tariffMode, groups })) onClose();
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
  const stepTitles = [
    "Fluxo do Cliente",
    "Reajuste Ferro",
    "Agendas e Data Base Diesel",
    "Revisão",
  ];
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
            Etapa {step + 1} de 4 · {stepTitles[step]}
          </b>
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            {stepTitles.map((title, i) => (
              <div
                key={title}
                style={{
                  height: 5,
                  flex: 1,
                  borderRadius: 4,
                  background: i <= step ? "#0176d3" : "#ddd",
                }}
              />
            ))}
          </div>
        </div>
        <div className="sf-modal-body" style={{ overflow: "auto", padding: 20 }}>
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
                  {[
                    ["Diesel", readjustment.diesel],
                    ["IGP-M", readjustment.igpm],
                    ["IPCA", readjustment.ipca],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      style={{ padding: 12, background: "#f3f3f3", borderRadius: 4 }}
                    >
                      <small>{label}</small>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>
                        {Number(value).toFixed(2)}%
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
                  Vigência: {contractStart || "—"} a {contractEnd || "—"} · {termDays} dias · Dia de
                  aplicação: {applicationDay}
                </small>
                {requiresAnnualSplit && (
                  <p
                    role="status"
                    style={{ color: readjustmentValid ? "#2e844a" : "#ba0517", marginBottom: 0 }}
                  >
                    Contratos com mais de 365 dias precisam distribuir 100% entre Diesel, IGP-M e
                    IPCA. Para ajustar os percentuais, edite a Oportunidade e retorne a esta
                    Cotação.
                  </p>
                )}
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
                  Primeiro reajuste: {firstReadjustmentDate || "não informado"}. As aplicações
                  seguem o dia {applicationDay} de cada período.
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
                          yearMonths.map((period) => {
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
                        {select(
                          batchEnd,
                          setBatchEnd,
                          yearMonths.map((period) => {
                            const value = `${period.year}-${String(period.month).padStart(2, "0")}`;
                            return {
                              value,
                              label: `${String(period.month).padStart(2, "0")}/${period.year}`,
                            };
                          }),
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
                        mantido e os outros meses serão adicionados. Meses fora da vigência ou com
                        Agenda nessa chave serão ignorados.
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
                  Vigência permitida: {contractStart} a {contractEnd}
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
                setStep((s) => s - 1);
              }}
              disabled={busy}
            >
              Voltar
            </button>
          )}
          {step < 3 ? (
            <button
              className="sf-btn sf-btn--brand"
              onClick={() => {
                if (validateCurrent()) setStep((s) => s + 1);
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
