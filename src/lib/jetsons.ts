/**
 * Modelo de mercado do Jetsons (mock): preço recomendado para um produto em um
 * trecho, por serviço e período (ano/mês). Determinístico e coerente com o
 * mercado — o mesmo fluxo + serviço + período sempre devolve o mesmo preço, em
 * qualquer Cotação, simulando o cadastro real do Jetsons:
 *
 *   preço = base(trecho, mercadoria, serviço) × sazonalidade(mês) × inflação(ano) × ruído leve
 */

/** Distância média por par de estados (km) — referência de malha ferroviária. */
const STATE_DISTANCE_KM: Record<string, Record<string, number>> = {
  SP: { SP: 180, MG: 560, ES: 780, RJ: 430, BA: 1250, GO: 800 },
  MG: { MG: 420, SP: 560, ES: 520, RJ: 480, BA: 950, GO: 700 },
  ES: { ES: 150, SP: 780, MG: 520, RJ: 520, BA: 720 },
  RJ: { RJ: 250, SP: 430, MG: 480, ES: 520, BA: 1050 },
  BA: { BA: 600, SP: 1250, MG: 950, ES: 720, RJ: 1050 },
  GO: { GO: 400, SP: 800, MG: 700, ES: 1100, RJ: 1000 },
};

/** Tarifa básica de FRETE por mercadoria (R$ por unidade transportada por km). */
const MERCHANDISE_RATE: Record<string, number> = {
  "OLEO DIESEL": 0.38,
  GASOLINA: 0.36,
  ÁLCOOL: 0.41,
  AÇÚCAR: 0.12,
};

/** Serviços acessórios: custo fixo por operação (R$ por unidade), sem distância. */
const SERVICE_FIXED_PRICE: Record<string, number> = {
  CARGA: 24,
  DESCARGA: 22,
  BALDEAÇÃO: 42,
  "MANOBRA ORIGEM": 14,
  "MANOBRA DESTINO": 12,
};

/**
 * Serviços portuários (R$/t) — ordem de grandeza das tabelas públicas dos terminais
 * VLI (TIPLAM 2023 / TMIB 2026): embarque de granéis ~R$73–80/t, desembarque de
 * fertilizantes ~R$91–175/t, armazenagem por período adicional ~R$15–45/t, pesagem ~R$3/t.
 */
const PORT_SERVICE_PRICE: Record<string, number> = {
  EMBARQUE: 76,
  DESEMBARQUE: 128,
  ARMAZENAGEM: 28,
  PESAGEM: 3.2,
};

/** Hash determinístico estável de string, normalizado para 0..1. */
function stableUnit(value: string) {
  let h = 2166136261;
  for (let index = 0; index < value.length; index++) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export interface JetsonsEndpoint {
  code: string;
  state: string;
  microregion: string;
}

/** Distância ferroviária estimada (km) entre dois terminais, com variação por micro-região. */
export function jetsonsDistanceKm(origin: JetsonsEndpoint, destination: JetsonsEndpoint) {
  const base = STATE_DISTANCE_KM[origin.state]?.[destination.state];
  const raw = base ?? 250 + stableUnit(`${origin.state}>${destination.state}`) * 1400;
  const microFactor = 0.9 + stableUnit(`${origin.microregion}>${destination.microregion}`) * 0.18;
  const codeFactor = 0.93 + stableUnit(`${origin.code}>${destination.code}`) * 0.14;
  return Math.round(raw * microFactor * codeFactor);
}

/**
 * Preço recomendado (R$ por unidade) para o produto/serviço no trecho e no
 * período. Independente do preço praticado: é o "preço de mercado" do Jetsons.
 */
export function jetsonsUnitPrice(input: {
  origin: JetsonsEndpoint;
  destination: JetsonsEndpoint;
  merchandise: string;
  service: string;
  year: number;
  month: number;
}) {
  const merchandise = input.merchandise.trim();
  const service = input.service.trim().toUpperCase();
  let price: number;
  if (PORT_SERVICE_PRICE[service] !== undefined) {
    // Porto não depende de distância: preço do terminal (±6%) e da mercadoria (±4%).
    const terminal = input.origin.code === "NAV" ? input.destination.code : input.origin.code;
    price =
      PORT_SERVICE_PRICE[service] *
      (0.94 + stableUnit(`terminal:${terminal}|${service}`) * 0.12) *
      (0.96 + stableUnit(`port-merch:${merchandise}|${service}`) * 0.08);
  } else if (service === "FRETE") {
    const rate = MERCHANDISE_RATE[merchandise] ?? 0.1 + stableUnit(`merch:${merchandise}`) * 0.3;
    price = rate * jetsonsDistanceKm(input.origin, input.destination);
  } else {
    const fixed = SERVICE_FIXED_PRICE[service];
    price = fixed !== undefined ? fixed : 12 + stableUnit(`service:${service}`) * 20;
  }
  // Sazonalidade: demanda sobe no meio do ano e recua no início (±5%).
  const seasonal = 1 + 0.05 * Math.sin((2 * Math.PI * (input.month - 5)) / 12);
  // Inflação anual composta (~3,5% a.a.) sobre o ano-base 2026.
  const yearly = Math.pow(1.035, input.year - 2026);
  // Ruído leve determinístico por combinação exata (±1,5%).
  const noiseKey = `${merchandise}|${service}|${input.origin.code}>${input.destination.code}|${input.year}-${String(input.month).padStart(2, "0")}`;
  const noise = 0.985 + stableUnit(noiseKey) * 0.03;
  return Math.max(1, Number((price * seasonal * yearly * noise).toFixed(2)));
}