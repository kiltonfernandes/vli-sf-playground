import type { Generator } from "./core";

export const approversGenerator: Generator = (f) => ({
  name: f.person.fullName(),
  level: f.helpers.arrayElement(["Gerente Geral", "Diretoria"]),
  email: f.internet.email(),
});
