import type { Generator } from "./core";
export const quoteLineItemsGenerator: Generator = (f) => ({
  service: f.helpers.arrayElement([
    "FRETE",
    "CARGA",
    "DESCARGA",
    "BALDEAÇÃO",
    "MANOBRA ORIGEM",
    "MANOBRA DESTINO",
  ]),
  volume_total: 0,
  revenue_total: 0,
  top_eligible: 0,
});
