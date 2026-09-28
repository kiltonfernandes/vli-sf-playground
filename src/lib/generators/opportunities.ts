import type { Generator } from "./core";

const INSTRUMENTS = ["Contrato", "ACS", "Aditivo", "Outros Serviços"];
const STAGES = ["Prospecção", "Negociação", "Aprovação", "Formalização", "Fechado"];
const SEGMENTS = ["Ferroviário", "Portuário", "Rodoviário"];

export const opportunitiesGenerator: Generator = (f) => {
  const instrument = f.helpers.arrayElement(INSTRUMENTS);
  const segment = f.helpers.arrayElement(SEGMENTS);
  const start = f.date.soon({ days: 180 });
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);

  let diesel = 0, igpm = 0, ipca = 0;
  if (segment === "Portuário") {
    igpm = 100;
  } else if (segment === "Ferroviário") {
    diesel = f.number.int({ min: 0, max: 100 });
    igpm = f.number.int({ min: 0, max: 100 - diesel });
    ipca = 100 - diesel - igpm;
  } else {
    diesel = f.number.int({ min: 0, max: 100 });
    igpm = f.number.int({ min: 0, max: 100 - diesel });
    ipca = 100 - diesel - igpm;
  }

  return {
    name: `${f.helpers.arrayElement(["Contrato", "Renovação", "Expansão", "Operação"])} ${f.company.name()}`,
    instrument_type: instrument,
    stage: f.helpers.arrayElement(STAGES),
    segment,
    amount: f.number.int({ min: 100_000, max: 25_000_000 }),
    close_date: f.date.soon({ days: 120 }).toISOString().slice(0, 10),
    contract_start: start.toISOString().slice(0, 10),
    contract_end: end.toISOString().slice(0, 10),
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
