import type { FieldDef } from "@/components/SfRecordDialog";
import { runGenerator, type Generator } from "./core";
import { accountsGenerator } from "./accounts";
import { contactsGenerator } from "./contacts";
import { opportunitiesGenerator } from "./opportunities";
import { quotesGenerator } from "./quotes";
import { quoteLineItemsGenerator } from "./quote-line-items";
import { quoteSchedulesGenerator } from "./quote-schedules";
import { locationsGenerator } from "./locations";
import { merchandiseGenerator } from "./merchandise";
import { dieselBasesGenerator } from "./diesel-bases";
import { plannedFlowsGenerator } from "./planned-flows";
import { approversGenerator } from "./approvers";
import { recommendedPricesGenerator } from "./recommended-prices";

export { randomSeed } from "./core";
export type { Generator } from "./core";

/** Registro: nome da tabela -> gerador. Adicione aqui cada novo objeto. */
export const generators: Record<string, Generator> = {
  accounts: accountsGenerator,
  contacts: contactsGenerator,
  opportunities: opportunitiesGenerator,
  quotes: quotesGenerator,
  quote_line_items: quoteLineItemsGenerator,
  quote_schedules: quoteSchedulesGenerator,
  locations: locationsGenerator,
  merchandise: merchandiseGenerator,
  diesel_bases: dieselBasesGenerator,
  planned_flows: plannedFlowsGenerator,
  approvers: approversGenerator,
  recommended_prices: recommendedPricesGenerator,
};

export function generateRecord(table: string, seed: number, fields: FieldDef[]) {
  const gen = generators[table];
  return gen ? runGenerator(gen, seed, fields) : null;
}
