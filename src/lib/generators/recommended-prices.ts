import type { Generator } from "./core";

export const recommendedPricesGenerator: Generator = (f) => {
  const now = new Date();
  return {
    service: f.helpers.arrayElement([
      "FRETE",
      "CARGA",
      "DESCARGA",
      "BALDEAÇÃO",
      "MANOBRA ORIGEM",
      "MANOBRA DESTINO",
    ]),
    year: now.getUTCFullYear(),
    month: ((now.getUTCMonth() + f.number.int({ min: 0, max: 11 })) % 12) + 1,
    unit_price: Number(f.number.float({ min: 40, max: 320 }).toFixed(2)),
  };
};
