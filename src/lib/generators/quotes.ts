import type { Generator } from "./core";

export const quotesGenerator: Generator = (f) => ({
  name: `${f.helpers.arrayElement(["Proposta", "Contrato", "Renovação"])} ferroviária ${f.date.soon({ days: 365 }).getFullYear()}`,
  record_type: "VLI_General",
  status: "Rascunho",
  is_synced: 0,
  seed: 20260929,
});
