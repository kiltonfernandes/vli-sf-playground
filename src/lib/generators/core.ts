import { Faker, pt_BR, en, base } from "@faker-js/faker";
import type { FieldDef } from "@/components/SfRecordDialog";

/** Um gerador recebe um Faker já semeado e devolve os valores do registro. */
export type Generator = (f: Faker) => Record<string, any>;

export function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Cria um Faker pt-BR determinístico: mesma seed => mesmos dados. */
export function seededFaker(seed: number) {
  const f = new Faker({ locale: [pt_BR, en, base] });
  f.seed(seed);
  return f;
}

/** Roda o gerador e mantém só os campos do formulário; selects sem valor recebem uma opção sorteada. */
export function runGenerator(gen: Generator, seed: number, fields: FieldDef[]) {
  const f = seededFaker(seed);
  const raw = gen(f);
  const out: Record<string, any> = {};
  for (const fd of fields) {
    if (fd.name in raw) out[fd.name] = raw[fd.name];
    else if (fd.type === "select" && fd.options?.length)
      out[fd.name] = f.helpers.arrayElement(fd.options);
  }
  return out;
}

export function randomSeed() {
  return Math.floor(Math.random() * 1_000_000) + 1;
}
