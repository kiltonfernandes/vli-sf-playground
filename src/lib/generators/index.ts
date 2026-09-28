import type { FieldDef } from "@/components/SfRecordDialog";
import { runGenerator, type Generator } from "./core";
import { accountsGenerator } from "./accounts";
import { contactsGenerator } from "./contacts";
import { opportunitiesGenerator } from "./opportunities";

export { randomSeed } from "./core";
export type { Generator } from "./core";

/** Registro: nome da tabela -> gerador. Adicione aqui cada novo objeto. */
export const generators: Record<string, Generator> = {
  accounts: accountsGenerator,
  contacts: contactsGenerator,
  opportunities: opportunitiesGenerator,
};

export function generateRecord(table: string, seed: number, fields: FieldDef[]) {
  const gen = generators[table];
  return gen ? runGenerator(gen, seed, fields) : null;
}
