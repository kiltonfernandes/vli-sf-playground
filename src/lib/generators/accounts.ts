import type { Generator } from "./core";
import { slug } from "./core";
import { TIPOS, STATUS, RISCOS, SAUDE } from "../options";

const SETORES = [
  "Tecnologia",
  "Varejo",
  "Saúde",
  "Educação",
  "Financeiro",
  "Agronegócio",
  "Logística",
  "Indústria",
  "Energia",
  "Construção",
  "Telecom",
  "Alimentos",
];
const SUFIXOS = ["Ltda", "S.A.", "ME", "EIRELI", "Group", "Holding"];
const FILIAIS = [
  "Matriz",
  "Filial Sul",
  "Filial Norte",
  "Filial Nordeste",
  "Filial Centro-Oeste",
  "Filial Sudeste",
];

export const accountsGenerator: Generator = (f) => {
  const nome = f.company
    .name()
    .replace(/ e .*$/, "")
    .split(" ")[0];
  const employees = f.number.int({ min: 5, max: 20000 });
  const revenue =
    Math.round((employees * f.number.int({ min: 80_000, max: 600_000 })) / 1000) * 1000;
  return {
    name: `${nome} ${f.helpers.arrayElement(SETORES)} ${f.helpers.arrayElement(SUFIXOS)}`,
    type: f.helpers.arrayElement(TIPOS),
    industry: f.helpers.arrayElement(SETORES),
    city: f.location.city(),
    state: f.location.state({ abbreviated: true }),
    phone: f.phone.number(),
    website: `https://www.${slug(nome)}.com.br`,
    account_owner: f.person.fullName(),
    revenue,
    employees,
    lifetime_value: Math.round(revenue * f.number.float({ min: 0.01, max: 0.3 })),
    health: f.helpers.arrayElement(SAUDE),
    customer_status: f.helpers.arrayElement(STATUS),
    risk_level: f.helpers.arrayElement(RISCOS),
    branch_name: f.helpers.arrayElement(FILIAIS),
    notes: f.lorem.sentences({ min: 1, max: 2 }),
  };
};
