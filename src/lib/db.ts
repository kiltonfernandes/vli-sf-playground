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
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id)`);

  })();
  return schemaReady;
}
