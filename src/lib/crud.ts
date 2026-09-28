import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, ensureSchema } from "./db";
import { accounts, contacts, opportunities, TABLES, type TableName } from "./schema";

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


export const listOpportunities = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const rows = await db.select({
    id: opportunities.id, account_id: opportunities.account_id, name: opportunities.name,
    instrument_type: opportunities.instrument_type, stage: opportunities.stage, segment: opportunities.segment,
    amount: opportunities.amount, close_date: opportunities.close_date, contract_start: opportunities.contract_start,
    contract_end: opportunities.contract_end, diesel_pct: opportunities.diesel_pct, igpm_pct: opportunities.igpm_pct,
    ipca_pct: opportunities.ipca_pct, contracting_parties: opportunities.contracting_parties,
    vli_entity: opportunities.vli_entity, joint_debtor: opportunities.joint_debtor,
    integration_tariff: opportunities.integration_tariff, take_or_pay: opportunities.take_or_pay,
    account_name: accounts.name,
  }).from(opportunities).leftJoin(accounts, eq(opportunities.account_id, accounts.id)).orderBy(asc(opportunities.name));
  return rows.map((row) => ({ ...row, account_name: row.account_name ?? "—" }));
});

export const listAccountOpportunities = createServerFn({ method: "GET" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { accountId } = input as { accountId: string };
  return db.select().from(opportunities).where(eq(opportunities.account_id, accountId)).orderBy(asc(opportunities.name));
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
  const [contactRows, opportunityRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.account_id, id)).orderBy(asc(contacts.name)),
    db.select().from(opportunities).where(eq(opportunities.account_id, id)).orderBy(asc(opportunities.name)),
  ]);
  return { account: account ?? null, contacts: contactRows, opportunities: opportunityRows };
});

export const getOpportunityFull = createServerFn({ method: "GET" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { id } = input as { id: string };
  const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!opportunity) return null;
  const [account] = await db.select({ id: accounts.id, name: accounts.name, industry: accounts.industry, city: accounts.city, state: accounts.state })
    .from(accounts).where(eq(accounts.id, opportunity.account_id));
  return { opportunity, account: account ?? null };
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
  if (!Array.isArray(records) || records.length === 0 || records.length > 500) {
    throw new Error("A operação deve conter entre 1 e 500 registros.");
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
  if (uniqueIds.length === 0 || uniqueIds.length > 500) {
    throw new Error("A operação deve conter entre 1 e 100 registros.");
  }
  if (table === "accounts") {
    await db.delete(opportunities).where(inArray(opportunities.account_id, uniqueIds));
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
    await db.delete(opportunities).where(
      id ? eq(opportunities.account_id, id) : isNull(opportunities.account_id),
    );
    await db.delete(contacts).where(
      id ? eq(contacts.account_id, id) : isNull(contacts.account_id),
    );
  }
  // Registros salvos sem id (bug antigo) ficam com id NULL — limpa pelo IS NULL.
  await db.delete(t).where(id ? eq((t as typeof t & { id: never }).id, id) : isNull((t as typeof t & { id: never }).id));
  return { ok: true };
});


/** Deletes records from every registered object, then optionally restores demo data. */
export const resetPlaygroundData = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { mode } = input as { mode: "clear" | "factory" };
  if (mode !== "clear" && mode !== "factory") throw new Error("Modo de reset inválido.");

  // Delete in reverse registration order so dependent objects are removed first.
  for (const table of Object.values(TABLES).reverse() as any[]) {
    await db.delete(table);
  }

  if (mode === "factory") {
    const now = new Date().toISOString();
    const demoAccounts = [
      { name: "VLI Logística", type: "Cliente - Direto", industry: "Logística", city: "São Paulo", state: "SP", account_owner: "Maria Silva", health: "Verde", customer_status: "Cliente", risk_level: "Baixo", lifetime_value: 1250000, revenue: 8200000, employees: 450, branch_name: "Matriz", phone: "(11) 3000-0000", website: "https://vli-logistica.example", notes: "Conta de demonstração" },
      { name: "Ferrovia Central", type: "Cliente - Direto", industry: "Transporte", city: "Belo Horizonte", state: "MG", account_owner: "João Santos", health: "Amarelo", customer_status: "Cliente", risk_level: "Médio", lifetime_value: 640000, revenue: 4100000, employees: 220, branch_name: "Minas Gerais", phone: "(31) 3000-0000", website: "https://ferrovia.example", notes: "Conta de demonstração" },
    ];
    const ids = demoAccounts.map(() => crypto.randomUUID());
    await db.insert(accounts).values(demoAccounts.map((account, index) => ({ id: ids[index], ...account, created_at: now, updated_at: now })));
    await db.insert(contacts).values([
      { id: crypto.randomUUID(), account_id: ids[0], name: "Ana Costa", title: "Diretora Comercial", email: "ana.costa@example.com", phone: "(11) 99999-1000", decision_role: "Decisor", created_at: now, updated_at: now },
      { id: crypto.randomUUID(), account_id: ids[1], name: "Pedro Almeida", title: "Gerente de Operações", email: "pedro.almeida@example.com", phone: "(31) 99999-2000", decision_role: "Influenciador", created_at: now, updated_at: now },
    ]);
  }

  return { ok: true, mode };
});
