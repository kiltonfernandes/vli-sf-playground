import { sqliteTable, text, real, integer, index } from "drizzle-orm/sqlite-core";

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

/** Registro: nome do objeto -> tabela. Adicione aqui cada novo objeto. */
export const TABLES = { accounts, contacts } as const;
export type TableName = keyof typeof TABLES;
