/**
 * MODELO para um novo objeto. Para adicionar o botão "Gerar" a um objeto novo:
 * 1. Copie este arquivo para `<tabela>.ts` e ajuste os campos (use os mesmos nomes das colunas).
 * 2. Registre em `index.ts`: `<tabela>: <tabela>Generator`.
 * Pronto: o SfRecordDialog com `table="<tabela>"` mostra o botão automaticamente.
 * Selects não retornados aqui são sorteados entre as opções do formulário.
 */
import type { Generator } from "./core";

export const templateGenerator: Generator = (f) => ({
  name: f.company.name(),
  // outro_campo: f.helpers.arrayElement(["A", "B"]),
});
