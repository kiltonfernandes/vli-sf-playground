import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, ensureSchema } from "./db";
import { accounts, contacts, TABLES, type TableName } from "./schema";

type SaveInput = {
  table: TableName;
  recordId?: string | null;
  data: Record<string, unknown>;
};

/** Painel inicial: top contas por LTV + contagem de contatos. */
export const homeDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const [top, contactRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        health: accounts.health,
        risk_level: accounts.risk_level,
        lifetime_value: accounts.lifetime_value,
        account_owner: accounts.account_owner,
      })
      .from(accounts)
      .orderBy(desc(accounts.lifetime_value)),
    db.select({ id: contacts.id }).from(contacts),
  ]);
  return { accounts: top, contactCount: contactRows.length };
});

export const listAccounts = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  return db.select().from(accounts).orderBy(asc(accounts.name));
});

export const listAccountOptions = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  return db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .orderBy(asc(accounts.name));
});

export const listContactsWithAccount = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      title: contacts.title,
      account_id: contacts.account_id,
      email: contacts.email,
      phone: contacts.phone,
      decision_role: contacts.decision_role,
      account_name: accounts.name,
    })
    .from(contacts)
    .leftJoin(accounts, eq(contacts.account_id, accounts.id))
    .orderBy(asc(contacts.name));
  return rows.map((r) => ({ ...r, account_name: r.account_name ?? "—" }));
});

export const getAccountFull = createServerFn({ method: "GET" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { id } = input as { id: string };
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  const contactRows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.account_id, id))
    .orderBy(asc(contacts.name));
  return { account: account ?? null, contacts: contactRows };
});

export const getContactFull = createServerFn({ method: "GET" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { id } = input as { id: string };
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) return null;
  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      industry: accounts.industry,
      city: accounts.city,
      state: accounts.state,
    })
    .from(accounts)
    .where(eq(accounts.id, contact.account_id));
  return { contact, account: account ?? null };
});

/** Insert ou update genérico, usado pelo SfRecordDialog. */
export const saveRecord = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { table, recordId, data } = input as SaveInput;
  const t = TABLES[table];
  if (!t) throw new Error(`Objeto desconhecido: ${table}`);
  const now = new Date().toISOString();
  const values = { ...(data as object), updated_at: now };
  if (recordId) {
    await db
      .update(t)
      .set(values as never)
      .where(eq((t as typeof t & { id: never }).id, recordId));
  } else {
    // Sempre gera o id no servidor — nunca confia no payload do cliente.
    await db.insert(t).values({ id: crypto.randomUUID(), ...values, created_at: now } as never);
  }
  return { ok: true };
});

/** Saves up to 100 records in one server call, used by bulk create and update. */
export const saveRecordsBulk = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { table, records } = input as {
    table: TableName;
    records: Array<{ recordId?: string | null; data: Record<string, unknown> }>;
  };
  const target = TABLES[table] as any;
  if (!target) throw new Error(`Objeto desconhecido: ${table}`);
  if (!Array.isArray(records) || records.length === 0 || records.length > 100) {
    throw new Error("A operação deve conter entre 1 e 100 registros.");
  }
  const now = new Date().toISOString();
  for (let offset = 0; offset < records.length; offset += 10) {
    const chunk = records.slice(offset, offset + 10);
    await Promise.all(chunk.map(({ recordId, data }) => {
      const values = { ...data, updated_at: now };
      if (recordId) {
        return db.update(target).set(values).where(eq(target.id, recordId));
      }
      return db.insert(target).values({ id: crypto.randomUUID(), ...values, created_at: now });
    }));
  }
  return { ok: true, count: records.length };
});

/** Deletes up to 100 selected records with one server call. */
export const deleteRecordsBulk = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { table, ids } = input as { table: TableName; ids: string[] };
  const target = TABLES[table] as any;
  const uniqueIds = Array.from(new Set(ids ?? []));
  if (!target) throw new Error(`Objeto desconhecido: ${table}`);
  if (uniqueIds.length === 0 || uniqueIds.length > 100) {
    throw new Error("A operação deve conter entre 1 e 100 registros.");
  }
  if (table === "accounts") {
    await db.delete(contacts).where(inArray(contacts.account_id, uniqueIds));
  }
  await db.delete(target).where(inArray(target.id, uniqueIds));
  return { ok: true, count: uniqueIds.length };
});

/** Delete genérico. Excluir uma conta remove seus contatos. */
export const deleteRecord = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { table, id } = input as { table: TableName; id: string };
  const t = TABLES[table];
  if (!t) throw new Error(`Objeto desconhecido: ${table}`);
  if (table === "accounts") {
    await db.delete(contacts).where(
      id ? eq(contacts.account_id, id) : isNull(contacts.account_id),
    );
  }
  // Registros salvos sem id (bug antigo) ficam com id NULL — limpa pelo IS NULL.
  await db.delete(t).where(id ? eq((t as typeof t & { id: never }).id, id) : isNull((t as typeof t & { id: never }).id));
  return { ok: true };
});
