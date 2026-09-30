import {
  sqliteTable,
  text,
  real,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Cliente - Direto"),
  industry: text("industry"),
  city: text("city"),
  state: text("state"),
  account_owner: text("account_owner"),
  health: text("health").notNull().default("Verde"),
  customer_status: text("customer_status").notNull().default("Prospecção"),
  risk_level: text("risk_level").notNull().default("Baixo"),
  lifetime_value: real("lifetime_value").notNull().default(0),
  revenue: real("revenue").notNull().default(0),
  employees: integer("employees").notNull().default(0),
  branch_name: text("branch_name"),
  phone: text("phone"),
  website: text("website"),
  notes: text("notes"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    account_id: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    decision_role: text("decision_role"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("idx_contacts_account_id").on(t.account_id)],
);

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    account_id: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instrument_type: text("instrument_type").notNull().default("Contrato"),
    stage: text("stage").notNull().default("Prospecção"),
    segment: text("segment"),
    amount: real("amount").notNull().default(0),
    close_date: text("close_date"),
    contract_start: text("contract_start"),
    contract_end: text("contract_end"),
    first_readjustment_date: text("first_readjustment_date"),
    application_day: integer("application_day").notNull().default(10),
    diesel_pct: real("diesel_pct").notNull().default(0),
    igpm_pct: real("igpm_pct").notNull().default(0),
    ipca_pct: real("ipca_pct").notNull().default(0),
    contracting_parties: text("contracting_parties"),
    vli_entity: text("vli_entity"),
    joint_debtor: text("joint_debtor"),
    integration_tariff: text("integration_tariff").notNull().default("Líquida"),
    take_or_pay: integer("take_or_pay").notNull().default(0),
    /** Aditivo: contrato NetLex (vigente/assinado) que esta oportunidade modifica. */
    base_contract_id: text("base_contract_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("idx_opportunities_account_id").on(t.account_id)],
);

/** Snapshot da minuta enviada ao NetLex simulado pelo Playground. */
export const netlex_contracts = sqliteTable(
  "netlex_contracts",
  {
    id: text("id").primaryKey(),
    opportunity_id: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    netlex_number: text("netlex_number").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("Análise jurídica"),
    /** Contrato, ACS ou Aditivo (RAT). */
    kind: text("kind").notNull().default("Contrato"),
    /** Aditivo: contrato original que recebe as mudanças na assinatura. */
    base_contract_id: text("base_contract_id"),
    signed_at: text("signed_at"),
    document_json: text("document_json").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_netlex_contracts_opportunity_id").on(t.opportunity_id),
    uniqueIndex("idx_netlex_contracts_number").on(t.netlex_number),
  ],
);

// Catálogo fictício, reproduzível e relacionado, usado pelo fluxo ferroviário.
export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  microregion: text("microregion").notNull(),
  location_type: text("location_type").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});
export const merchandise = sqliteTable("merchandise", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});
export const diesel_bases = sqliteTable("diesel_bases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  anp_base: integer("anp_base").notNull().default(0),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});
export const planned_flows = sqliteTable(
  "planned_flows",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    account_id: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    origin_id: text("origin_id")
      .notNull()
      .references(() => locations.id),
    destination_id: text("destination_id")
      .notNull()
      .references(() => locations.id),
    merchandise_id: text("merchandise_id")
      .notNull()
      .references(() => merchandise.id),
    modal: text("modal").notNull().default("Ferroviário"),
    origin_system: text("origin_system").notNull().default("FLOU"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("idx_planned_flows_account_id").on(t.account_id)],
);

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    opportunity_id: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    quote_number: text("quote_number").notNull(),
    name: text("name").notNull(),
    record_type: text("record_type").notNull().default("VLI_General"),
    tariff_mode: text("tariff_mode"),
    status: text("status").notNull().default("Rascunho"),
    is_synced: integer("is_synced").notNull().default(0),
    price_status: text("price_status").notNull().default("Não validada"),
    max_discount_pct: real("max_discount_pct").notNull().default(0),
    alcada_level: text("alcada_level").notNull().default("Sem alçada"),
    seed: integer("seed").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("idx_quotes_opportunity_id").on(t.opportunity_id)],
);
export const quote_line_items = sqliteTable(
  "quote_line_items",
  {
    id: text("id").primaryKey(),
    quote_id: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    planned_flow_id: text("planned_flow_id")
      .notNull()
      .references(() => planned_flows.id, { onDelete: "cascade" }),
    service: text("service").notNull().default("FRETE"),
    volume_total: real("volume_total").notNull().default(0),
    revenue_total: real("revenue_total").notNull().default(0),
    top_eligible: integer("top_eligible").notNull().default(0),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("idx_quote_line_items_quote_id").on(t.quote_id)],
);
export const quote_schedules = sqliteTable(
  "quote_schedules",
  {
    id: text("id").primaryKey(),
    quote_line_item_id: text("quote_line_item_id")
      .notNull()
      .references(() => quote_line_items.id, { onDelete: "cascade" }),
    schedule_key: text("schedule_key").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    frequency: text("frequency").notNull().default("Mensal"),
    period_window: text("period_window").notNull().default("Mês"),
    division: text("division").notNull().default("Todas"),
    plaza: text("plaza").notNull().default("TODAS_PRACAS_NACIONAL"),
    volume: integer("volume").notNull(),
    tariff_cbs: real("tariff_cbs"),
    tariff_net: real("tariff_net").notNull(),
    diesel_base_id: text("diesel_base_id")
      .notNull()
      .references(() => diesel_bases.id),
    diesel_base_date: text("diesel_base_date"),
    service: text("service").notNull(),
    accessory_cbs: real("accessory_cbs"),
    accessory_cbs_pct: real("accessory_cbs_pct"),
    accessory_net: real("accessory_net"),
    accessory_net_pct: real("accessory_net_pct"),
    tolerance_vli_volume: integer("tolerance_vli_volume"),
    tolerance_client_volume: integer("tolerance_client_volume"),
    tolerance_vli_tariff: integer("tolerance_vli_tariff"),
    tolerance_client_tariff: integer("tolerance_client_tariff"),
    /** Aditivo: Manter, Incluir, Alterar ou Excluir. Nulo fora do aditivo. */
    operation: text("operation"),
    /** Aditivo: valores da Agenda no contrato vigente (JSON), base da comparação. */
    base_snapshot: text("base_snapshot"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_quote_schedules_item_id").on(t.quote_line_item_id),
    index("idx_quote_schedules_key").on(t.schedule_key),
  ],
);

/** Legacy storage; approval access is now controlled by the simulated profile. */
export const approvers = sqliteTable("approvers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  level: text("level").notNull().default("Aprovador"),
  email: text("email"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

/** Preço recomendado (mock do Jetsons) por Fluxo Planejado, serviço e período. */
export const recommended_prices = sqliteTable(
  "recommended_prices",
  {
    id: text("id").primaryKey(),
    planned_flow_id: text("planned_flow_id")
      .notNull()
      .references(() => planned_flows.id, { onDelete: "cascade" }),
    service: text("service").notNull().default("FRETE"),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    unit_price: real("unit_price").notNull(),
    source: text("source").notNull().default("Jetsons (mock)"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("idx_recommended_prices_flow").on(t.planned_flow_id)],
);

/** Solicitação de alçada: uma cotação com desvio de preço acima do limite. */
export const quote_approvals = sqliteTable(
  "quote_approvals",
  {
    id: text("id").primaryKey(),
    quote_id: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    alcada_level: text("alcada_level").notNull(),
    status: text("status").notNull().default("Pendente"),
    max_discount_pct: real("max_discount_pct").notNull().default(0),
    requested_at: text("requested_at").notNull(),
    decided_at: text("decided_at"),
    decided_by: text("decided_by"),
    decided_by_name: text("decided_by_name"),
    decision_note: text("decision_note"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [index("idx_quote_approvals_quote_id").on(t.quote_id)],
);

/** Configurações do playground em chave-valor (limiares de alçada, aprovador logado). */
export const app_settings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updated_at: text("updated_at").notNull(),
});

/** Registro: nome do objeto -> tabela. Adicione aqui cada novo objeto. */
export const TABLES = {
  accounts,
  contacts,
  opportunities,
  locations,
  merchandise,
  diesel_bases,
  planned_flows,
  quotes,
  quote_line_items,
  quote_schedules,
  approvers,
  recommended_prices,
  quote_approvals,
  app_settings,
} as const;
export type TableName = keyof typeof TABLES;
