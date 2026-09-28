import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq, isNull } from "drizzle-orm";
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
