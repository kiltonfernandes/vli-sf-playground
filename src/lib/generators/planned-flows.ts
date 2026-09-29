import type { Generator } from "./core";
export const plannedFlowsGenerator: Generator = (f) => ({
  code: String(f.number.int({ min: 250000, max: 999999 })),
  modal: "Ferroviário",
  origin_system: "FLOU",
});
