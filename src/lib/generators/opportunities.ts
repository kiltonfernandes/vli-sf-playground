import type { Generator } from "./core";

const INSTRUMENTS = ["Contrato", "ACS"];

export const opportunitiesGenerator: Generator = (f) => {
  const instrument = f.helpers.arrayElement(INSTRUMENTS);
  const segment = "Ferroviário";
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  if (instrument === "ACS") end.setUTCMonth(end.getUTCMonth() + f.number.int({ min: 1, max: 11 }));
  else end.setUTCFullYear(end.getUTCFullYear() + f.number.int({ min: 1, max: 5 }));

  const diesel = f.number.int({ min: 0, max: 100 });
  const igpm = f.number.int({ min: 0, max: 100 - diesel });
  const ipca = 100 - diesel - igpm;

  return {
    name: `${f.helpers.arrayElement(["Contrato", "Renovação", "Expansão", "Operação"])} ${f.company.name()}`,
    instrument_type: instrument,
    stage: "Prospecção",
    segment,
    amount: f.number.int({ min: 100, max: 9999 }),
    close_date: start.toISOString().slice(0, 10),
    contract_start: start.toISOString().slice(0, 10),
    contract_end: end.toISOString().slice(0, 10),
    application_day: String(f.helpers.arrayElement([1, 10, 20])),
    diesel_pct: diesel,
    igpm_pct: igpm,
    ipca_pct: ipca,
    contracting_parties: f.company.name(),
    vli_entity: "VLI Multimodal S.A.",
    joint_debtor: "",
    integration_tariff: f.helpers.arrayElement(["CBS", "Líquida"]),
    take_or_pay: instrument !== "ACS" && f.datatype.boolean(),
  };
};
