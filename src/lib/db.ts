import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Dev local sem Turso configurado usa SQLite local (file:./local.db).
// Na Vercel, TURSO_DATABASE_URL e TURSO_AUTH_TOKEN são obrigatórios.
const url = process.env.TURSO_DATABASE_URL || "file:./local.db";

if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
  throw new Error(
    "Variável TURSO_DATABASE_URL ausente. Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN na Vercel (Settings → Environment Variables).",
  );
}

const client: Client = createClient({
  url,
  ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
});

export const db = drizzle(client, { schema });

let schemaReady: Promise<void> | undefined;

/** Cria as tabelas se ainda não existirem (idempotente). */
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await client.execute(`CREATE TABLE IF NOT EXISTS accounts (
      id text PRIMARY KEY,
      name text NOT NULL,
      type text NOT NULL DEFAULT 'Cliente - Direto',
      industry text,
      city text,
      state text,
      account_owner text,
      health text NOT NULL DEFAULT 'Verde',
      customer_status text NOT NULL DEFAULT 'Prospecção',
      risk_level text NOT NULL DEFAULT 'Baixo',
      lifetime_value real NOT NULL DEFAULT 0,
      revenue real NOT NULL DEFAULT 0,
      employees integer NOT NULL DEFAULT 0,
      branch_name text,
      phone text,
      website text,
      notes text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`);
    await client.execute(`CREATE TABLE IF NOT EXISTS contacts (
      id text PRIMARY KEY,
      account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      title text,
      email text,
      phone text,
      decision_role text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`);
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id)`,
    );
    await client.execute(`CREATE TABLE IF NOT EXISTS opportunities (
      id text PRIMARY KEY,
      account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name text NOT NULL,
      instrument_type text NOT NULL DEFAULT 'Contrato',
      stage text NOT NULL DEFAULT 'Prospecção',
      segment text,
      amount real NOT NULL DEFAULT 0,
      close_date text,
      contract_start text,
      contract_end text,
      first_readjustment_date text,
      application_day integer NOT NULL DEFAULT 10,
      diesel_pct real NOT NULL DEFAULT 0,
      igpm_pct real NOT NULL DEFAULT 0,
      ipca_pct real NOT NULL DEFAULT 0,
      contracting_parties text,
      vli_entity text,
      joint_debtor text,
      integration_tariff text NOT NULL DEFAULT 'Líquida',
      take_or_pay integer NOT NULL DEFAULT 0,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`);
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id)`,
    );
    const opportunityColumns = await client.execute(`PRAGMA table_info(opportunities)`);
    if (!opportunityColumns.rows.some((row) => row.name === "application_day"))
      await client.execute(
        `ALTER TABLE opportunities ADD COLUMN application_day integer NOT NULL DEFAULT 10`,
      );
    if (!opportunityColumns.rows.some((row) => row.name === "first_readjustment_date"))
      await client.execute(`ALTER TABLE opportunities ADD COLUMN first_readjustment_date text`);

    await client.execute(
      `CREATE TABLE IF NOT EXISTS locations (id text PRIMARY KEY, name text NOT NULL, code text NOT NULL, city text NOT NULL, state text NOT NULL, microregion text NOT NULL, location_type text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)`,
    );
    await client.execute(
      `CREATE TABLE IF NOT EXISTS merchandise (id text PRIMARY KEY, name text NOT NULL, unit text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)`,
    );
    await client.execute(
      `CREATE TABLE IF NOT EXISTS diesel_bases (id text PRIMARY KEY, name text NOT NULL, anp_base integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL)`,
    );
    await client.execute(
      `CREATE TABLE IF NOT EXISTS planned_flows (id text PRIMARY KEY, code text NOT NULL, account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, origin_id text NOT NULL REFERENCES locations(id), destination_id text NOT NULL REFERENCES locations(id), merchandise_id text NOT NULL REFERENCES merchandise(id), modal text NOT NULL DEFAULT 'Ferroviário', origin_system text NOT NULL DEFAULT 'FLOU', created_at text NOT NULL, updated_at text NOT NULL)`,
    );
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_planned_flows_account_id ON planned_flows(account_id)`,
    );
    await client.execute(
      `CREATE TABLE IF NOT EXISTS quotes (id text PRIMARY KEY, opportunity_id text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, quote_number text NOT NULL, name text NOT NULL, record_type text NOT NULL DEFAULT 'VLI_General', tariff_mode text, status text NOT NULL DEFAULT 'Rascunho', is_synced integer NOT NULL DEFAULT 0, seed integer NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)`,
    );
    const quoteColumns = await client.execute(`PRAGMA table_info(quotes)`);
    if (!quoteColumns.rows.some((row) => row.name === "tariff_mode"))
      await client.execute(`ALTER TABLE quotes ADD COLUMN tariff_mode text`);
    for (const column of [
      { name: "price_status", sql: `ALTER TABLE quotes ADD COLUMN price_status text NOT NULL DEFAULT 'Não validada'` },
      { name: "max_discount_pct", sql: `ALTER TABLE quotes ADD COLUMN max_discount_pct real NOT NULL DEFAULT 0` },
      { name: "alcada_level", sql: `ALTER TABLE quotes ADD COLUMN alcada_level text NOT NULL DEFAULT 'Sem alçada'` },
    ])
      if (!quoteColumns.rows.some((row) => row.name === column.name))
        await client.execute(column.sql);
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_quotes_opportunity_id ON quotes(opportunity_id)`,
    );
    await client.execute(
      `CREATE TABLE IF NOT EXISTS quote_line_items (id text PRIMARY KEY, quote_id text NOT NULL REFERENCES quotes(id) ON DELETE CASCADE, planned_flow_id text NOT NULL REFERENCES planned_flows(id) ON DELETE CASCADE, service text NOT NULL DEFAULT 'FRETE', volume_total real NOT NULL DEFAULT 0, revenue_total real NOT NULL DEFAULT 0, top_eligible integer NOT NULL DEFAULT 0, created_at text NOT NULL, updated_at text NOT NULL)`,
    );
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote_id ON quote_line_items(quote_id)`,
    );
    await client.execute(
      `CREATE TABLE IF NOT EXISTS quote_schedules (id text PRIMARY KEY, quote_line_item_id text NOT NULL REFERENCES quote_line_items(id) ON DELETE CASCADE, schedule_key text NOT NULL, year integer NOT NULL, month integer NOT NULL, frequency text NOT NULL DEFAULT 'Mensal', period_window text NOT NULL DEFAULT 'Mês', division text NOT NULL DEFAULT 'Todas', plaza text NOT NULL DEFAULT 'TODAS_PRACAS_NACIONAL', volume integer NOT NULL, tariff_cbs real, tariff_net real NOT NULL, diesel_base_id text NOT NULL REFERENCES diesel_bases(id), diesel_base_date text, service text NOT NULL, accessory_cbs real, accessory_cbs_pct real, accessory_net real, accessory_net_pct real, tolerance_vli_volume integer, tolerance_client_volume integer, tolerance_vli_tariff integer, tolerance_client_tariff integer, created_at text NOT NULL, updated_at text NOT NULL)`,
    );
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_quote_schedules_item_id ON quote_schedules(quote_line_item_id)`,
    );
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_quote_schedules_key ON quote_schedules(schedule_key)`,
    );
    await client.execute(`CREATE TABLE IF NOT EXISTS approvers (
      id text PRIMARY KEY,
      name text NOT NULL,
      level text NOT NULL DEFAULT 'Gerente Geral',
      email text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`);
    await client.execute(`CREATE TABLE IF NOT EXISTS recommended_prices (
      id text PRIMARY KEY,
      planned_flow_id text NOT NULL REFERENCES planned_flows(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT 'FRETE',
      year integer NOT NULL,
      month integer NOT NULL,
      unit_price real NOT NULL,
      source text NOT NULL DEFAULT 'Jetsons (mock)',
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`);
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_recommended_prices_flow ON recommended_prices(planned_flow_id)`,
    );
    await client.execute(`CREATE TABLE IF NOT EXISTS quote_approvals (
      id text PRIMARY KEY,
      quote_id text NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      alcada_level text NOT NULL,
      status text NOT NULL DEFAULT 'Pendente',
      max_discount_pct real NOT NULL DEFAULT 0,
      requested_at text NOT NULL,
      decided_at text,
      decided_by text,
      decided_by_name text,
      decision_note text,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )`);
    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_quote_approvals_quote_id ON quote_approvals(quote_id)`,
    );
    await client.execute(`CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text,
      updated_at text NOT NULL
    )`);
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      args: ["alcada_gg_pct", "5", now],
    });
    await client.execute({
      sql: `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      args: ["alcada_diretoria_pct", "7", now],
    });
    await client.execute({
      sql: `INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      args: ["current_approver_id", "", now],
    });
    // Aprovadores chumbados no sistema: sempre disponíveis para assumir a visão de alçada.
    const defaultApprovers: Array<[string, string, string]> = [
      ["Marina Duarte", "Diretoria", "marina.duarte@example.com"],
      ["Ricardo Nunes", "Gerente Geral", "ricardo.nunes@example.com"],
      ["Fernanda Lopes", "Gerente Geral", "fernanda.lopes@example.com"],
    ];
    const existing = await client.execute(`SELECT email FROM approvers`);
    const existingEmails = new Set(existing.rows.map((row) => String(row.email)));
    for (const [name, level, email] of defaultApprovers) {
      if (!existingEmails.has(email)) {
        await client.execute({
          sql: `INSERT INTO approvers (id, name, level, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [crypto.randomUUID(), name, level, email, now, now],
        });
      }
    }
  })();
  return schemaReady;
}
