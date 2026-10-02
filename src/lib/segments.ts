/**
 * Políticas por modal (Ferroviário × Portuário) compartilhadas pela UI e pelo servidor.
 *
 * O Salesforce da VLI mantém paridade entre os dois modais (IGPM_Rail/IGPM_Harbor,
 * ToPRailQtt/ToPHarborQtt, QuoteLineQtdRail/QuoteLineQtdHarbor), mas as regras mudam:
 * - Ferro (ANTT): FRETE obrigatório, Base Diesel obrigatória, reajuste por diesel + inflação.
 * - Porto (ANTAQ): sem produto obrigatório, Base Diesel proibida (vazia), reajuste por
 *   inflação (IGP-M a 100% citado como padrão), Take or Pay em registro separado por modal.
 * Tudo que não foi demonstrado em KT fica marcado como hipótese do Playground.
 */
import { contractDurationDays, readjustmentRuleError } from "./business-rules";

export const RAIL = "Ferroviário" as const;
export const PORT = "Portuário" as const;
export const RAIL_PORT = "Ferroviário + Portuário" as const;
export const ROAD = "Rodoviário" as const;
export type Modal = typeof RAIL | typeof PORT | typeof ROAD;
export const MODALS: Modal[] = [RAIL, PORT, ROAD];

/** Segmento (operação) da Oportunidade: define quais modais a Cotação aceita. */
export const OPPORTUNITY_SEGMENTS = [RAIL, PORT, RAIL_PORT, ROAD];
export const QUOTE_SEGMENTS = [RAIL, PORT, RAIL_PORT, ROAD];

export function segmentModals(segment: string | null | undefined): Modal[] {
  if (segment === RAIL) return [RAIL];
  if (segment === PORT) return [PORT];
  if (segment === RAIL_PORT) return [RAIL, PORT];
  if (segment === ROAD) return [ROAD];
  return [];
}
export const isQuoteSegment = (segment: string | null | undefined) => segmentModals(segment).length > 0;
export const segmentHasModal = (segment: string | null | undefined, modal: string) =>
  segmentModals(segment).includes(modal as Modal);
export const isModal = (value: unknown): value is Modal => value === RAIL || value === PORT || value === ROAD;

/** Ferro = FRETE + acessórios (regra ANTT). Porto = serviços de terminal (ANTAQ), sem obrigatório. */
export const RAIL_SERVICES = ["FRETE", "CARGA", "DESCARGA", "BALDEAÇÃO", "MANOBRA ORIGEM", "MANOBRA DESTINO"];
/** No Playground rodoviário, a cotação registra tarifa líquida por Agenda. */
export const ROAD_SERVICES = ["FRETE"];
/** Serviços das tabelas públicas dos terminais VLI (TIPLAM/TMIB). Lista oficial a confirmar no KT. */
export const PORT_SERVICES = ["EMBARQUE", "DESEMBARQUE", "ARMAZENAGEM", "PESAGEM"];
/** Serviços que movimentam a carga no cais: definem o sentido da operação portuária. */
export const PORT_MOVEMENT_SERVICES = ["EMBARQUE", "DESEMBARQUE"];

/**
 * Porto não usa Base Diesel. Como a Agenda do Playground guarda a base numa coluna
 * obrigatória, o porto aponta para este registro técnico, exibido como “vazio/proibido”.
 */
export const PORT_DIESEL_BASE_ID = "diesel-na-porto";
export const PORT_DIESEL_BASE_NAME = "NÃO SE APLICA · PORTO";
export const isPortDieselBase = (id: string | null | undefined) => id === PORT_DIESEL_BASE_ID;

/** Local marítimo usado como destino (exportação) ou origem (importação) dos fluxos portuários. */
export const SHIP_LOCATION_TYPE = "Navio";

export type ModalPolicy = {
  modal: Modal;
  short: string;
  icon: string;
  regulator: string;
  productFamily: string;
  services: string[];
  defaultService: string;
  requiredService: string | null;
  dieselBase: "required" | "forbidden";
  applicationDayRequired: boolean;
  readjustmentIndexes: string[];
  readjustmentStepTitle: string;
  scheduleStepTitle: string;
  unit: string;
  takeOrPayLabel: string;
};

export const MODAL_POLICIES: Record<Modal, ModalPolicy> = {
  [RAIL]: {
    modal: RAIL,
    short: "Ferro",
    icon: "🚂",
    regulator: "ANTT",
    productFamily: "Serviço de Transporte Ferroviário",
    services: RAIL_SERVICES,
    defaultService: "FRETE",
    requiredService: "FRETE",
    dieselBase: "required",
    applicationDayRequired: true,
    readjustmentIndexes: ["Diesel", "IGP-M", "IPCA"],
    readjustmentStepTitle: "Reajuste Ferro",
    scheduleStepTitle: "Agendas e Data Base Diesel",
    unit: "unidade da mercadoria",
    takeOrPayLabel: "Take or Pay ferroviário",
  },
  [PORT]: {
    modal: PORT,
    short: "Porto",
    icon: "⚓",
    regulator: "ANTAQ",
    productFamily: "Serviço de Transporte Portuário",
    services: PORT_SERVICES,
    defaultService: "EMBARQUE",
    requiredService: null,
    dieselBase: "forbidden",
    applicationDayRequired: false,
    readjustmentIndexes: ["IGP-M", "IPCA"],
    readjustmentStepTitle: "Reajuste Porto",
    scheduleStepTitle: "Agendas portuárias",
    unit: "tonelada",
    takeOrPayLabel: "Take or Pay portuário",
  },
  [ROAD]: {
    modal: ROAD,
    short: "Rodo",
    icon: "🚚",
    regulator: "ANTT",
    productFamily: "Serviço de Transporte Rodoviário",
    services: ROAD_SERVICES,
    defaultService: "FRETE",
    requiredService: "FRETE",
    dieselBase: "required",
    applicationDayRequired: false,
    readjustmentIndexes: ["Diesel"],
    readjustmentStepTitle: "Reajuste Rodoviário",
    scheduleStepTitle: "Agendas e Diesel Rodoviário",
    unit: "tonelada",
    takeOrPayLabel: "Take or Pay rodoviário",
  },
};

export function modalPolicy(modal: string | null | undefined): ModalPolicy {
  return MODAL_POLICIES[(modal === PORT ? PORT : modal === ROAD ? ROAD : RAIL) as Modal];
}
export const servicesForModal = (modal: string | null | undefined) => modalPolicy(modal).services;
export function modalOfService(service: string | null | undefined): Modal | null {
  const value = String(service ?? "").trim().toUpperCase();
  if (RAIL_SERVICES.includes(value)) return RAIL;
  if (PORT_SERVICES.includes(value)) return PORT;
  if (ROAD_SERVICES.includes(value)) return ROAD;
  return null;
}
export const segmentLabel = (segment: string | null | undefined) =>
  segmentModals(segment)
    .map((modal) => `${MODAL_POLICIES[modal].icon} ${MODAL_POLICIES[modal].short}`)
    .join(" + ") || String(segment ?? "—");

/** Agenda rodoviária distingue o mês inteiro das duas quinzenas. */
export function scheduleIdentityKey(
  flowCode: string,
  year: number,
  month: number,
  division: string,
  plaza: string,
  modal: string,
  periodWindow: string,
) {
  const monthKey = `${flowCode}|${year}${String(month).padStart(2, "0")}|${division}|${plaza}`;
  return modal === ROAD ? `${monthKey}|${periodWindow || "Mês"}` : monthKey;
}

/** Sentido da operação portuária a partir dos locais do Fluxo. */
export function portOperation(originType: string | null | undefined, destinationType: string | null | undefined) {
  if (destinationType === SHIP_LOCATION_TYPE) return "Embarque (exportação)";
  if (originType === SHIP_LOCATION_TYPE) return "Desembarque (importação)";
  return "Movimentação interna";
}
/** Serviço de cais esperado para o sentido do fluxo (EMBARQUE na exportação, DESEMBARQUE na importação). */
export function expectedPortMovement(originType: string | null | undefined, destinationType: string | null | undefined) {
  if (destinationType === SHIP_LOCATION_TYPE) return "EMBARQUE";
  if (originType === SHIP_LOCATION_TYPE) return "DESEMBARQUE";
  return null;
}

// ===== Reajuste por modal =====

export type OpportunityReadjustment = {
  contract_start?: string | null;
  contract_end?: string | null;
  diesel_pct?: number | null;
  igpm_pct?: number | null;
  ipca_pct?: number | null;
  port_igpm_pct?: number | null;
  port_ipca_pct?: number | null;
  first_readjustment_date?: string | null;
};

/** Porto: reajuste por inflação (IGP-M/IPCA) sem diesel; acima de 365 dias soma 100%. */
export function portReadjustmentRuleError(input: {
  contractStart: string;
  contractEnd: string;
  igpmPct: number;
  ipcaPct: number;
  firstReadjustmentDate: string | null | undefined;
}) {
  // Reaproveita as validações de vigência e data; o diesel do porto é sempre 0%.
  return readjustmentRuleError({
    contractStart: input.contractStart,
    contractEnd: input.contractEnd,
    dieselPct: 0,
    igpmPct: input.igpmPct,
    ipcaPct: input.ipcaPct,
    firstReadjustmentDate: input.firstReadjustmentDate,
  })?.replace("Diesel + IGP-M + IPCA precisam somar 100%", "IGP-M + IPCA do porto precisam somar 100% (sem diesel)") ?? null;
}

export function modalReadjustmentError(modal: Modal, opp: OpportunityReadjustment, contractEnd?: string) {
  // Rodoviário respeita os parâmetros informados no contrato, sem impor uma
  // soma padrão de índices ou um calendário único no Playground.
  if (modal === ROAD) return null;
  const contractStart = String(opp.contract_start ?? "");
  const end = String(contractEnd ?? opp.contract_end ?? "");
  if (modal === PORT)
    return portReadjustmentRuleError({
      contractStart,
      contractEnd: end,
      igpmPct: Number(opp.port_igpm_pct ?? 0),
      ipcaPct: Number(opp.port_ipca_pct ?? 0),
      firstReadjustmentDate: opp.first_readjustment_date,
    });
  return readjustmentRuleError({
    contractStart,
    contractEnd: end,
    dieselPct: Number(opp.diesel_pct ?? 0),
    igpmPct: Number(opp.igpm_pct ?? 0),
    ipcaPct: Number(opp.ipca_pct ?? 0),
    firstReadjustmentDate: opp.first_readjustment_date,
  });
}

export function termOver365(opp: OpportunityReadjustment) {
  const days = contractDurationDays(String(opp.contract_start ?? ""), String(opp.contract_end ?? ""));
  return days !== null && days > 365;
}

// ===== Condições portuárias (armazenagem) =====

export type PortTerms = { freeTimeDays: number; extraPeriodDays: number };
/** Referência pública TIPLAM: 7 dias de livre armazenagem e períodos adicionais de 5 dias. */
export const DEFAULT_PORT_TERMS: PortTerms = { freeTimeDays: 7, extraPeriodDays: 5 };

export function parsePortTerms(raw: string | null | undefined): PortTerms | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PortTerms>;
    return { freeTimeDays: Number(parsed.freeTimeDays), extraPeriodDays: Number(parsed.extraPeriodDays) };
  } catch {
    return null;
  }
}

export function portTermsRuleError(terms: PortTerms | null | undefined) {
  if (!terms) return "Defina a franquia de armazenagem (free time) e o período adicional.";
  if (!Number.isInteger(terms.freeTimeDays) || terms.freeTimeDays < 1 || terms.freeTimeDays > 60)
    return "A franquia de armazenagem deve ser um número inteiro de 1 a 60 dias.";
  if (!Number.isInteger(terms.extraPeriodDays) || terms.extraPeriodDays < 1 || terms.extraPeriodDays > 30)
    return "O período adicional de armazenagem deve ser um número inteiro de 1 a 30 dias.";
  return null;
}

// ===== Take or Pay por modal =====

type TakeOrPayLike = {
  compensationMode: string;
  pairs: Array<{ compensatedFlowId: string; compensatingFlowId: string }>;
  groups: Array<{ name: string; flowIds: string[] }>;
};

/**
 * Ferro e porto geram registros de Take or Pay separados (15 fluxos ferro + 1 porto = 2 registros):
 * nenhuma compensação pode cruzar modais.
 */
export function takeOrPayModalSeparationError(
  config: TakeOrPayLike | null | undefined,
  flowModalById: Map<string, string>,
) {
  if (!config) return null;
  for (const pair of config.pairs ?? []) {
    const from = flowModalById.get(pair.compensatedFlowId);
    const to = flowModalById.get(pair.compensatingFlowId);
    if (from && to && from !== to)
      return "Take or Pay é separado por modal: um fluxo portuário não compensa um ferroviário (e vice-versa).";
  }
  for (const group of config.groups ?? []) {
    const modals = new Set(group.flowIds.map((id) => flowModalById.get(id)).filter(Boolean));
    if (modals.size > 1)
      return `O grupo “${group.name}” mistura fluxos ferroviários e portuários; crie um grupo por modal.`;
  }
  return null;
}

/** Registros de Take or Pay materializados por modal na minuta. */
export function takeOrPayRecordsByModal(flowModalById: Map<string, string>, tolerantFlowIds: Set<string>) {
  const records: Array<{ modal: Modal; label: string; flowIds: string[] }> = [];
  for (const modal of MODALS) {
    const flowIds = [...tolerantFlowIds].filter((id) => flowModalById.get(id) === modal);
    if (flowIds.length) records.push({ modal, label: MODAL_POLICIES[modal].takeOrPayLabel, flowIds });
  }
  return records;
}
