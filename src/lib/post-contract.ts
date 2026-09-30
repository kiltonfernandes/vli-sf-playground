/**
 * Pós-contrato: Ordem de Vendas e Curva de Ajuste (regras puras, sem banco).
 *
 * Os dois processos nascem exclusivamente de um Contrato em Assinatura e nunca
 * alteram os itens do contrato. Mudança permanente de preço, prazo, cláusula
 * ou agenda contratual continua sendo Aditivo.
 */

export const SALES_ORDER = "Ordem de Vendas";
export const ADJUSTMENT_CURVE = "Curva de Ajuste";
export const POST_CONTRACT_INSTRUMENTS = [SALES_ORDER, ADJUSTMENT_CURVE] as const;
export type PostContractInstrument = (typeof POST_CONTRACT_INSTRUMENTS)[number];

export const SALES_ORDER_RECORD_TYPE = "VLI_SalesOrder";
export const ADJUSTMENT_CURVE_RECORD_TYPE = "VLI_AdjustmentCurve";

/** A proposta de ordem de vendas vale sempre uma semana para o cliente assinar. */
export const SALES_ORDER_VALIDITY_DAYS = 7;

export const SALES_ORDER_STATUS = {
  sent: "Enviada ao cliente",
  approved: "Aprovada pelo cliente",
  expired: "Expirada",
} as const;
export const CURVE_STATUS = { registered: "Registrada" } as const;

export const CURVE_REASONS = [
  "Quebra de safra",
  "Disponibilidade operacional",
  "Manutenção de via ou terminal",
  "Solicitação do cliente",
  "Outro motivo operacional",
] as const;

export function isPostContractInstrument(value: unknown): value is PostContractInstrument {
  return POST_CONTRACT_INSTRUMENTS.includes(String(value) as PostContractInstrument);
}

export function recordTypeFor(instrument: string) {
  if (instrument === SALES_ORDER) return SALES_ORDER_RECORD_TYPE;
  if (instrument === ADJUSTMENT_CURVE) return ADJUSTMENT_CURVE_RECORD_TYPE;
  return "VLI_General";
}

/** Guia de decisão do hub pós-contrato (mesma linguagem da documentação de negócio). */
export const POST_CONTRACT_GUIDE = [
  {
    kind: "Aditivo",
    icon: "✍️",
    question: "Precisa mudar o contrato?",
    summary: "Altera preço, volume, prazo, índice, agenda, fluxo ou cláusula de forma permanente.",
    example: "Novo percentual de reajuste válido a partir de janeiro.",
    changesContract: true,
  },
  {
    kind: SALES_ORDER,
    icon: "⚡",
    question: "Venda pontual sobre este contrato?",
    summary: "Registro próprio, sem novo ciclo jurídico. Herda condições e Take or Pay; o cliente aprova no portal em até 7 dias.",
    example: "Aproveitar capacidade ociosa de um contrato ferroviário vigente.",
    changesContract: false,
  },
  {
    kind: ADJUSTMENT_CURVE,
    icon: "📈",
    question: "Deslocar volume entre meses?",
    summary: "Redistribui volumes já previstos entre períodos. Preços não mudam e o total de cada fluxo se mantém.",
    example: "7.000 t de novembro deslocadas para dezembro por quebra de safra.",
    changesContract: false,
  },
] as const;

export type CurveMove = {
  id: string;
  flowCode: string;
  route?: string;
  from: { year: number; month: number; key: string };
  to: { year: number; month: number; key: string };
  volume: number;
  unit?: string;
  reason: string;
  note?: string | null;
  at: string;
};

export function parseCurveLog(raw: unknown): CurveMove[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(String(raw));
    return Array.isArray(value) ? (value as CurveMove[]) : [];
  } catch {
    return [];
  }
}

export function periodLabel(year: number, month: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

/** Data Base Diesel do mês de destino com o dia de aplicação da Oportunidade. */
export function destinationDieselDate(applicationDay: number, year: number, month: number) {
  return `${String(applicationDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

type CurveRow = {
  schedule_key: string;
  year: number;
  month: number;
  volume: number;
  service: string;
  base_snapshot?: string | null;
  flow_code?: string;
  flow_id?: string;
};

export type CurvePeriod = {
  key: string;
  year: number;
  month: number;
  before: number;
  after: number;
  delta: number;
};

export type CurveFlowBalance = {
  flowCode: string;
  flowId?: string;
  route?: string;
  unit?: string;
  baseTotal: number;
  newTotal: number;
  delta: number;
  moved: number;
  balanced: boolean;
  periods: CurvePeriod[];
};

function baseVolume(raw: unknown): number {
  if (!raw) return 0;
  try {
    return Number(JSON.parse(String(raw))?.volume ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Saldo da curva por fluxo. O volume pertence ao grupo da Agenda (chave), não ao
 * serviço: cada chave conta uma única vez. "moved" soma os aumentos por período,
 * que é o volume efetivamente deslocado.
 */
export function curveBalance(
  items: Array<{ flow_code?: string; planned_flow_id?: string; route?: string; unit?: string; schedules: CurveRow[] }>,
): { flows: CurveFlowBalance[]; balanced: boolean; changed: boolean; moved: number } {
  const flows = new Map<string, CurveFlowBalance>();
  const seen = new Set<string>();
  for (const item of items) {
    const flowCode = String(item.flow_code ?? "?");
    const flow =
      flows.get(flowCode) ??
      ({
        flowCode,
        flowId: item.planned_flow_id,
        route: item.route,
        unit: item.unit,
        baseTotal: 0,
        newTotal: 0,
        delta: 0,
        moved: 0,
        balanced: true,
        periods: [],
      } as CurveFlowBalance);
    for (const row of item.schedules) {
      if (seen.has(row.schedule_key)) continue;
      seen.add(row.schedule_key);
      const before = baseVolume(row.base_snapshot);
      const after = Number(row.volume ?? 0);
      flow.baseTotal += before;
      flow.newTotal += after;
      flow.periods.push({ key: row.schedule_key, year: row.year, month: row.month, before, after, delta: after - before });
    }
    flows.set(flowCode, flow);
  }
  let moved = 0;
  let changed = false;
  for (const flow of flows.values()) {
    flow.periods.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
    flow.delta = flow.newTotal - flow.baseTotal;
    flow.balanced = Math.abs(flow.delta) < 0.0001;
    flow.moved = flow.periods.reduce((sum, period) => sum + Math.max(0, period.delta), 0);
    moved += flow.moved;
    if (flow.periods.some((period) => period.delta !== 0)) changed = true;
  }
  const list = [...flows.values()].sort((a, b) => a.flowCode.localeCompare(b.flowCode, "pt-BR"));
  return { flows: list, balanced: list.every((flow) => flow.balanced), changed, moved };
}

/** Status efetivo da ordem de vendas: a proposta expira uma semana após o envio. */
export function effectiveSalesOrderStatus(
  status: string,
  expiresAt: string | null | undefined,
  now: number = Date.now(),
) {
  if (status !== SALES_ORDER_STATUS.sent || !expiresAt) return status;
  const limit = Date.parse(expiresAt);
  return Number.isFinite(limit) && now > limit ? SALES_ORDER_STATUS.expired : status;
}

export function daysUntil(iso: string | null | undefined, now: number = Date.now()) {
  if (!iso) return null;
  const limit = Date.parse(iso);
  if (!Number.isFinite(limit)) return null;
  return Math.ceil((limit - now) / 86400000);
}
