import type { Generator } from "./core";
import { slug } from "./core";
import { PAPEIS } from "../options";

const CARGOS = [
  "Diretor(a) de Compras",
  "CEO",
  "CFO",
  "CTO",
  "Gerente de TI",
  "Gerente Comercial",
  "Coordenador(a) de Operações",
  "Analista de Compras",
  "Head de Marketing",
  "Gerente Financeiro",
];
const DOMINIOS = ["gmail.com", "outlook.com", "empresa.com.br", "uol.com.br"];

// A conta vinculada (select "Conta") é sorteada automaticamente entre as opções do formulário.
export const contactsGenerator: Generator = (f) => {
  const first = f.person.firstName();
  const last = f.person.lastName();
  return {
    name: `${first} ${last}`,
    title: f.helpers.arrayElement(CARGOS),
    email: `${slug(first)}.${slug(last)}@${f.helpers.arrayElement(DOMINIOS)}`,
    phone: f.phone.number(),
    decision_role: f.helpers.arrayElement(PAPEIS),
  };
};
