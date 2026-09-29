import type { Generator } from "./core";
export const merchandiseGenerator: Generator = (f) =>
  f.helpers.arrayElement([
    { name: "ÁLCOOL", unit: "M³" },
    { name: "GASOLINA", unit: "M³" },
    { name: "OLEO DIESEL", unit: "M³" },
    { name: "AÇÚCAR", unit: "TON" },
  ]);
