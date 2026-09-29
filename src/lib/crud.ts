import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, ensureSchema } from "./db";
import {
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
  TABLES,
  type TableName,
} from "./schema";
import { asc as ascending } from "drizzle-orm";
import { seededFaker } from "./generators/core";

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
  const rows = await db
    .select({
      id: opportunities.id,
      account_id: opportunities.account_id,
      name: opportunities.name,
      instrument_type: opportunities.instrument_type,
      stage: opportunities.stage,
      integration_tariff: opportunities.integration_tariff,
      segment: opportunities.segment,
      amount: opportunities.amount,
      close_date: opportunities.close_date,
      contract_start: opportunities.contract_start,
      contract_end: opportunities.contract_end,
      application_day: opportunities.application_day,
      diesel_pct: opportunities.diesel_pct,
      igpm_pct: opportunities.igpm_pct,
      ipca_pct: opportunities.ipca_pct,
      contracting_parties: opportunities.contracting_parties,
      vli_entity: opportunities.vli_entity,
      joint_debtor: opportunities.joint_debtor,
      take_or_pay: opportunities.take_or_pay,
      account_name: accounts.name,
    })
    .from(opportunities)
    .leftJoin(accounts, eq(opportunities.account_id, accounts.id))
    .orderBy(asc(opportunities.name));
  return rows.map((row) => ({ ...row, account_name: row.account_name ?? "—" }));
});

export const listAccountOpportunities = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { accountId } = input as { accountId: string };
    return db
      .select()
      .from(opportunities)
      .where(eq(opportunities.account_id, accountId))
      .orderBy(asc(opportunities.name));
  },
);

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
    db
      .select()
      .from(opportunities)
      .where(eq(opportunities.account_id, id))
      .orderBy(asc(opportunities.name)),
  ]);
  return { account: account ?? null, contacts: contactRows, opportunities: opportunityRows };
});

export const getOpportunityFull = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!opportunity) return null;
    const [account] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        industry: accounts.industry,
        city: accounts.city,
        state: accounts.state,
      })
      .from(accounts)
      .where(eq(accounts.id, opportunity.account_id));
    return { opportunity, account: account ?? null };
  },
);

export const listQuotes = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  return db
    .select({
      id: quotes.id,
      opportunity_id: quotes.opportunity_id,
      quote_number: quotes.quote_number,
      name: quotes.name,
      record_type: quotes.record_type,
      tariff_mode: quotes.tariff_mode,
      status: quotes.status,
      is_synced: quotes.is_synced,
      seed: quotes.seed,
      created_at: quotes.created_at,
      updated_at: quotes.updated_at,
      opportunity_name: opportunities.name,
      account_name: accounts.name,
    })
    .from(quotes)
    .innerJoin(opportunities, eq(quotes.opportunity_id, opportunities.id))
    .innerJoin(accounts, eq(opportunities.account_id, accounts.id))
    .orderBy(asc(quotes.quote_number));
});

export const listOpportunityQuotes = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { opportunityId } = input as { opportunityId: string };
    return db
      .select()
      .from(quotes)
      .where(eq(quotes.opportunity_id, opportunityId))
      .orderBy(asc(quotes.quote_number));
  },
);

export const getQuoteFull = createServerFn({ method: "GET" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { id } = input as { id: string };
  const [quote] = await db
    .select({
      id: quotes.id,
      quote_number: quotes.quote_number,
      name: quotes.name,
      record_type: quotes.record_type,
      tariff_mode: quotes.tariff_mode,
      status: quotes.status,
      is_synced: quotes.is_synced,
      seed: quotes.seed,
      created_at: quotes.created_at,
      updated_at: quotes.updated_at,
      opportunity_name: opportunities.name,
      opportunity_id: opportunities.id,
      account_id: accounts.id,
      account_name: accounts.name,
      instrument_type: opportunities.instrument_type,
      stage: opportunities.stage,
    })
    .from(quotes)
    .innerJoin(opportunities, eq(quotes.opportunity_id, opportunities.id))
    .innerJoin(accounts, eq(opportunities.account_id, accounts.id))
    .where(eq(quotes.id, id));
  if (!quote) return null;
  const items = await db
    .select({
      id: quote_line_items.id,
      quote_id: quote_line_items.quote_id,
      planned_flow_id: quote_line_items.planned_flow_id,
      service: quote_line_items.service,
      volume_total: quote_line_items.volume_total,
      revenue_total: quote_line_items.revenue_total,
      top_eligible: quote_line_items.top_eligible,
      created_at: quote_line_items.created_at,
      updated_at: quote_line_items.updated_at,
      flow_code: planned_flows.code,
      flow_id: planned_flows.id,
      account_id: planned_flows.account_id,
      origin_id: planned_flows.origin_id,
      destination_id: planned_flows.destination_id,
      merchandise_id: planned_flows.merchandise_id,
      modal: planned_flows.modal,
      origin_system: planned_flows.origin_system,
      origin_code: locations.code,
      origin_name: locations.name,
      destination_code: locations.code,
      merchandise_name: merchandise.name,
      unit: merchandise.unit,
    })
    .from(quote_line_items)
    .innerJoin(planned_flows, eq(quote_line_items.planned_flow_id, planned_flows.id))
    .innerJoin(locations, eq(planned_flows.origin_id, locations.id))
    .innerJoin(merchandise, eq(planned_flows.merchandise_id, merchandise.id))
    .where(eq(quote_line_items.quote_id, id));
  const fullItems = await Promise.all(
    items.map(async (item) => {
      const [destination] = await db
        .select({ code: locations.code, name: locations.name })
        .from(locations)
        .where(eq(locations.id, item.destination_id));
      const schedules = await db
        .select()
        .from(quote_schedules)
        .where(eq(quote_schedules.quote_line_item_id, item.id))
        .orderBy(asc(quote_schedules.year), asc(quote_schedules.month));
      return {
        ...item,
        destination_code: destination?.code ?? "?",
        destination_name: destination?.name ?? "?",
        route: `${item.origin_code} → ${destination?.code ?? "?"}`,
        schedules,
      };
    }),
  );
  return { quote, items: fullItems };
});

export const listQuoteOptions = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { opportunityId } = input as { opportunityId: string };
    const [opportunity] = await db
      .select({
        account_id: opportunities.account_id,
        instrument_type: opportunities.instrument_type,
        segment: opportunities.segment,
        stage: opportunities.stage,
        integration_tariff: opportunities.integration_tariff,
        contract_start: opportunities.contract_start,
        contract_end: opportunities.contract_end,
        application_day: opportunities.application_day,
      })
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId));
    if (!opportunity) return { flows: [], dieselBases: [], opportunity: null };
    await ensureRailCatalog(opportunity.account_id, 260929);
    const allFlows = await db
      .select({
        id: planned_flows.id,
        code: planned_flows.code,
        modal: planned_flows.modal,
        account_id: planned_flows.account_id,
        origin_id: planned_flows.origin_id,
        origin_system: planned_flows.origin_system,
        merchandise_id: planned_flows.merchandise_id,
        merchandise: merchandise.name,
        unit: merchandise.unit,
        origin_code: locations.code,
        origin_name: locations.name,
        destination_id: planned_flows.destination_id,
      })
      .from(planned_flows)
      .innerJoin(merchandise, eq(planned_flows.merchandise_id, merchandise.id))
      .innerJoin(locations, eq(planned_flows.origin_id, locations.id))
      .where(eq(planned_flows.account_id, opportunity.account_id))
      .orderBy(asc(planned_flows.code));
    const flows = allFlows.filter(
      (flow) => flow.modal === "Ferroviário" && flow.origin_system === "FLOU",
    );
    const options = await Promise.all(
      flows.map(async (flow) => {
        const [destination] = await db
          .select({ code: locations.code, name: locations.name })
          .from(locations)
          .where(eq(locations.id, flow.destination_id));
        return {
          ...flow,
          destination_code: destination?.code,
          destination_name: destination?.name,
          route: `${flow.origin_code} → ${destination?.code}`,
        };
      }),
    );
    return {
      flows: options,
      dieselBases: await db.select().from(diesel_bases).orderBy(asc(diesel_bases.name)),
      usedSchedules: await db
        .select({
          quote_id: quote_line_items.quote_id,
          schedule_key: quote_schedules.schedule_key,
          service: quote_schedules.service,
        })
        .from(quote_schedules)
        .innerJoin(quote_line_items, eq(quote_schedules.quote_line_item_id, quote_line_items.id)),
      opportunity,
    };
  },
);

export const listQuoteItems = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const rows = await db
    .select({
      id: quote_line_items.id,
      quote_id: quote_line_items.quote_id,
      planned_flow_id: planned_flows.id,
      service: quote_line_items.service,
      volume_total: quote_line_items.volume_total,
      revenue_total: quote_line_items.revenue_total,
      quote_number: quotes.quote_number,
      quote_name: quotes.name,
      flow_code: planned_flows.code,
      origin_id: planned_flows.origin_id,
      destination_id: planned_flows.destination_id,
      merchandise_name: merchandise.name,
      route_origin: locations.code,
    })
    .from(quote_line_items)
    .innerJoin(quotes, eq(quote_line_items.quote_id, quotes.id))
    .innerJoin(planned_flows, eq(quote_line_items.planned_flow_id, planned_flows.id))
    .innerJoin(merchandise, eq(planned_flows.merchandise_id, merchandise.id))
    .innerJoin(locations, eq(planned_flows.origin_id, locations.id))
    .orderBy(asc(quotes.quote_number));
  return Promise.all(
    rows.map(async (row) => {
      const [destination] = await db
        .select({ code: locations.code })
        .from(locations)
        .where(eq(locations.id, row.destination_id));
      const schedules = await db
        .select({ id: quote_schedules.id })
        .from(quote_schedules)
        .where(eq(quote_schedules.quote_line_item_id, row.id));
      return {
        ...row,
        route: `${row.route_origin} → ${destination?.code ?? "?"}`,
        schedule_count: schedules.length,
      };
    }),
  );
});

export const listQuoteSchedules = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const rows = await db
    .select({
      id: quote_schedules.id,
      quote_line_item_id: quote_schedules.quote_line_item_id,
      schedule_key: quote_schedules.schedule_key,
      year: quote_schedules.year,
      month: quote_schedules.month,
      frequency: quote_schedules.frequency,
      period_window: quote_schedules.period_window,
      division: quote_schedules.division,
      plaza: quote_schedules.plaza,
      volume: quote_schedules.volume,
      tariff_cbs: quote_schedules.tariff_cbs,
      tariff_net: quote_schedules.tariff_net,
      diesel_base_id: quote_schedules.diesel_base_id,
      diesel_base_date: quote_schedules.diesel_base_date,
      service: quote_schedules.service,
      accessory_cbs: quote_schedules.accessory_cbs,
      accessory_cbs_pct: quote_schedules.accessory_cbs_pct,
      accessory_net: quote_schedules.accessory_net,
      accessory_net_pct: quote_schedules.accessory_net_pct,
      tolerance_vli_volume: quote_schedules.tolerance_vli_volume,
      tolerance_client_volume: quote_schedules.tolerance_client_volume,
      tolerance_vli_tariff: quote_schedules.tolerance_vli_tariff,
      tolerance_client_tariff: quote_schedules.tolerance_client_tariff,
      created_at: quote_schedules.created_at,
      updated_at: quote_schedules.updated_at,
      item_id: quote_line_items.id,
      quote_id: quotes.id,
      quote_number: quotes.quote_number,
      flow_id: planned_flows.id,
      flow_code: planned_flows.code,
      origin_id: planned_flows.origin_id,
      destination_id: planned_flows.destination_id,
      diesel_base_name: diesel_bases.name,
      origin_code: locations.code,
    })
    .from(quote_schedules)
    .innerJoin(quote_line_items, eq(quote_schedules.quote_line_item_id, quote_line_items.id))
    .innerJoin(quotes, eq(quote_line_items.quote_id, quotes.id))
    .innerJoin(planned_flows, eq(quote_line_items.planned_flow_id, planned_flows.id))
    .innerJoin(diesel_bases, eq(quote_schedules.diesel_base_id, diesel_bases.id))
    .innerJoin(locations, eq(planned_flows.origin_id, locations.id))
    .orderBy(asc(quote_schedules.year), asc(quote_schedules.month));
  return Promise.all(
    rows.map(async (row) => {
      const [destination] = await db
        .select({ code: locations.code })
        .from(locations)
        .where(eq(locations.id, row.destination_id));
      return { ...row, route: `${row.origin_code} → ${destination?.code ?? "?"}` };
    }),
  );
});

export const listReferenceRecords = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { table } = input as { table: string };
    if (!["locations", "merchandise", "diesel_bases", "planned_flows"].includes(table))
      throw new Error("Cadastro ferroviário inválido.");
    const target = TABLES[table as TableName] as any;
    return db
      .select()
      .from(target)
      .orderBy(asc(target.name ?? target.code));
  },
);

export const getReferenceRecord = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { table, id } = input as { table: string; id: string };
    if (!["locations", "merchandise", "diesel_bases", "planned_flows"].includes(table))
      throw new Error("Cadastro ferroviário inválido.");
    const target = TABLES[table as TableName] as any;
    const [record] = await db.select().from(target).where(eq(target.id, id));
    if (!record) return null;
    if (table === "planned_flows") {
      const [account] = await db
        .select({ name: accounts.name })
        .from(accounts)
        .where(eq(accounts.id, record.account_id));
      const [origin] = await db
        .select({ code: locations.code, name: locations.name })
        .from(locations)
        .where(eq(locations.id, record.origin_id));
      const [destination] = await db
        .select({ code: locations.code, name: locations.name })
        .from(locations)
        .where(eq(locations.id, record.destination_id));
      const [product] = await db
        .select({ name: merchandise.name, unit: merchandise.unit })
        .from(merchandise)
        .where(eq(merchandise.id, record.merchandise_id));
      return {
        ...record,
        account_name: account?.name,
        origin_label: `${origin?.code} · ${origin?.name}`,
        destination_label: `${destination?.code} · ${destination?.name}`,
        merchandise_label: product?.name,
        unit: product?.unit,
      };
    }
    return record;
  },
);

export const getQuoteLineItemFull = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const [item] = await db
      .select({
        id: quote_line_items.id,
        quote_id: quote_line_items.quote_id,
        planned_flow_id: quote_line_items.planned_flow_id,
        service: quote_line_items.service,
        volume_total: quote_line_items.volume_total,
        revenue_total: quote_line_items.revenue_total,
        top_eligible: quote_line_items.top_eligible,
        created_at: quote_line_items.created_at,
        updated_at: quote_line_items.updated_at,
        quote_number: quotes.quote_number,
        quote_name: quotes.name,
        opportunity_id: quotes.opportunity_id,
        flow_code: planned_flows.code,
        flow_id: planned_flows.id,
        origin_id: planned_flows.origin_id,
        destination_id: planned_flows.destination_id,
        merchandise_id: planned_flows.merchandise_id,
        merchandise_name: merchandise.name,
        unit: merchandise.unit,
        origin_code: locations.code,
      })
      .from(quote_line_items)
      .innerJoin(quotes, eq(quote_line_items.quote_id, quotes.id))
      .innerJoin(planned_flows, eq(quote_line_items.planned_flow_id, planned_flows.id))
      .innerJoin(merchandise, eq(planned_flows.merchandise_id, merchandise.id))
      .innerJoin(locations, eq(planned_flows.origin_id, locations.id))
      .where(eq(quote_line_items.id, id));
    if (!item) return null;
    const [dest] = await db
      .select({ code: locations.code, name: locations.name })
      .from(locations)
      .where(eq(locations.id, item.destination_id));
    const schedules = await db
      .select()
      .from(quote_schedules)
      .where(eq(quote_schedules.quote_line_item_id, id))
      .orderBy(asc(quote_schedules.year), asc(quote_schedules.month));
    return {
      ...item,
      route: `${item.origin_code} → ${dest?.code}`,
      destination_name: dest?.name,
      schedules,
    };
  },
);

export const getQuoteScheduleFull = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const [row] = await db
      .select({
        id: quote_schedules.id,
        quote_line_item_id: quote_schedules.quote_line_item_id,
        schedule_key: quote_schedules.schedule_key,
        year: quote_schedules.year,
        month: quote_schedules.month,
        frequency: quote_schedules.frequency,
        period_window: quote_schedules.period_window,
        division: quote_schedules.division,
        plaza: quote_schedules.plaza,
        volume: quote_schedules.volume,
        tariff_cbs: quote_schedules.tariff_cbs,
        tariff_net: quote_schedules.tariff_net,
        diesel_base_id: quote_schedules.diesel_base_id,
        diesel_base_date: quote_schedules.diesel_base_date,
        service: quote_schedules.service,
        accessory_cbs: quote_schedules.accessory_cbs,
        accessory_cbs_pct: quote_schedules.accessory_cbs_pct,
        accessory_net: quote_schedules.accessory_net,
        accessory_net_pct: quote_schedules.accessory_net_pct,
        tolerance_vli_volume: quote_schedules.tolerance_vli_volume,
        tolerance_client_volume: quote_schedules.tolerance_client_volume,
        tolerance_vli_tariff: quote_schedules.tolerance_vli_tariff,
        tolerance_client_tariff: quote_schedules.tolerance_client_tariff,
        created_at: quote_schedules.created_at,
        updated_at: quote_schedules.updated_at,
        item_id: quote_line_items.id,
        item_service: quote_line_items.service,
        quote_id: quotes.id,
        quote_number: quotes.quote_number,
        flow_id: planned_flows.id,
        flow_code: planned_flows.code,
        origin_id: planned_flows.origin_id,
        destination_id: planned_flows.destination_id,
        origin_code: locations.code,
        diesel_base_name: diesel_bases.name,
      })
      .from(quote_schedules)
      .innerJoin(quote_line_items, eq(quote_schedules.quote_line_item_id, quote_line_items.id))
      .innerJoin(quotes, eq(quote_line_items.quote_id, quotes.id))
      .innerJoin(planned_flows, eq(quote_line_items.planned_flow_id, planned_flows.id))
      .innerJoin(locations, eq(planned_flows.origin_id, locations.id))
      .innerJoin(diesel_bases, eq(quote_schedules.diesel_base_id, diesel_bases.id))
      .where(eq(quote_schedules.id, id));
    if (!row) return null;
    const [dest] = await db
      .select({ code: locations.code, name: locations.name })
      .from(locations)
      .where(eq(locations.id, row.destination_id));
    return { ...row, route: `${row.origin_code} → ${dest?.code}`, destination_name: dest?.name };
  },
);

export const syncQuote = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { id } = input as { id: string };
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) throw new Error("Cotação não encontrada.");
  if (quote.status !== "Concluída") throw new Error("Conclua a Cotação antes de sincronizar.");
  const [opportunity] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, quote.opportunity_id));
  if (opportunity?.stage !== "Negociação")
    throw new Error("A oportunidade precisa estar em Negociação.");
  if (
    opportunity.segment !== "Ferroviário" ||
    !["Contrato", "ACS"].includes(opportunity.instrument_type)
  )
    throw new Error("Esta versão atende somente Ferroviário de Contrato e ACS.");
  if (
    opportunity.instrument_type === "ACS" &&
    opportunity.contract_start &&
    opportunity.contract_end
  ) {
    const start = new Date(`${opportunity.contract_start}T00:00:00Z`),
      end = new Date(`${opportunity.contract_end}T00:00:00Z`);
    const limit = new Date(start);
    limit.setMonth(limit.getMonth() + 12);
    if (end >= limit) throw new Error("A vigência ACS deve ser inferior a 12 meses.");
  }
  const syncedRows = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.opportunity_id, quote.opportunity_id));
  if (syncedRows.some((row) => row.id !== id)) {
    const matching = await db
      .select()
      .from(quotes)
      .where(eq(quotes.opportunity_id, quote.opportunity_id));
    if (matching.some((row) => row.id !== id && row.is_synced))
      throw new Error("Esta oportunidade já tem uma Cotação sincronizada.");
  }
  const [firstItem] = await db
    .select()
    .from(quote_line_items)
    .where(eq(quote_line_items.quote_id, id));
  if (!firstItem)
    throw new Error("Adicione ao menos um Item e uma Agenda antes de concluir a Cotação.");
  const scheduleRows = await db
    .select()
    .from(quote_line_items)
    .where(eq(quote_line_items.quote_id, id));
  let totalSchedules = 0;
  const allSchedules = [] as Array<typeof quote_schedules.$inferSelect>;
  for (const item of scheduleRows) {
    const rows = await db
      .select()
      .from(quote_schedules)
      .where(eq(quote_schedules.quote_line_item_id, item.id));
    totalSchedules += rows.length;
    allSchedules.push(...rows);
  }
  if (!totalSchedules) throw new Error("Adicione ao menos uma Agenda antes de concluir a Cotação.");
  const groups = new Map<string, typeof allSchedules>();
  for (const row of allSchedules)
    groups.set(row.schedule_key, [...(groups.get(row.schedule_key) ?? []), row]);
  for (const group of groups.values()) {
    if (!group.some((row) => row.service.toUpperCase() === "FRETE"))
      throw new Error("Cada grupo de agenda ferroviária precisa incluir FRETE.");
    if (
      group.some(
        (row) =>
          row.tariff_net !== group[0].tariff_net ||
          row.tariff_cbs !== group[0].tariff_cbs ||
          row.volume !== group[0].volume ||
          row.diesel_base_id !== group[0].diesel_base_id ||
          row.diesel_base_date !== group[0].diesel_base_date,
      )
    )
      throw new Error(
        "Volume, tarifa e Base Diesel devem ser consistentes em todas as linhas da mesma agenda.",
      );
    const useCbs = (quote.tariff_mode || opportunity.integration_tariff) === "CBS";
    if (
      group.some((row) =>
        useCbs
          ? row.accessory_cbs === null || row.accessory_cbs_pct === null
          : row.accessory_net === null || row.accessory_net_pct === null,
      )
    )
      throw new Error("Preencha tarifa e percentual acessório em todas as linhas da agenda.");
    const amount = group.reduce(
      (sum, row) => sum + Math.round(Number(useCbs ? row.accessory_cbs : row.accessory_net) * 100),
      0,
    );
    const pct = group.reduce(
      (sum, row) => sum + Number(useCbs ? row.accessory_cbs_pct : row.accessory_net_pct),
      0,
    );
    if (
      Math.abs(
        amount - Math.round(Number(useCbs ? group[0].tariff_cbs : group[0].tariff_net) * 100),
      ) > 2 ||
      Math.abs(pct - 100) > 0.2
    )
      throw new Error(
        "O rateio ferroviário deve fechar a tarifa e somar 100% (tolerância 0,2 ponto percentual).",
      );
  }
  if (opportunity.instrument_type === "ACS") {
    if (
      allSchedules.some((row) =>
        [
          row.tolerance_vli_volume,
          row.tolerance_client_volume,
          row.tolerance_vli_tariff,
          row.tolerance_client_tariff,
        ].some((v) => v !== null && v > 0),
      )
    )
      throw new Error("ACS não pode ter Take or Pay. Remova as tolerâncias das agendas.");
  }
  await db
    .update(quotes)
    .set({ is_synced: 0, status: "Rascunho", updated_at: new Date().toISOString() })
    .where(eq(quotes.opportunity_id, quote.opportunity_id));
  await db
    .update(quotes)
    .set({ is_synced: 1, status: "Sincronizada", updated_at: new Date().toISOString() })
    .where(eq(quotes.id, id));
  return { ok: true };
});

export const completeQuote = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { id } = input as { id: string };
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) throw new Error("Cotação não encontrada.");
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, quote.opportunity_id));
  if (
    opp?.stage !== "Negociação" ||
    opp.segment !== "Ferroviário" ||
    !["Contrato", "ACS"].includes(opp.instrument_type)
  )
    throw new Error(
      "A Cotação precisa pertencer a uma oportunidade ferroviária de Contrato ou ACS em Negociação.",
    );
  if (!opp.contract_start || !opp.contract_end)
    throw new Error(
      "Preencha o início e o fim da vigência na Oportunidade antes de concluir a Cotação.",
    );
  if (opp.instrument_type === "ACS") {
    const start = new Date(`${opp.contract_start}T00:00:00Z`),
      end = new Date(`${opp.contract_end}T00:00:00Z`);
    const limit = new Date(start);
    limit.setMonth(limit.getMonth() + 12);
    if (end >= limit) throw new Error("A vigência ACS deve ser inferior a 12 meses.");
  }
  if (![1, 10, 20].includes(Number(opp.application_day)))
    throw new Error("Defina na Oportunidade um dia de aplicação igual a 1, 10 ou 20.");
  const items = await db.select().from(quote_line_items).where(eq(quote_line_items.quote_id, id));
  if (!items.length) throw new Error("Adicione ao menos um Item à Cotação.");
  const rows = [] as Array<typeof quote_schedules.$inferSelect>;
  for (const item of items)
    rows.push(
      ...(await db
        .select()
        .from(quote_schedules)
        .where(eq(quote_schedules.quote_line_item_id, item.id))),
    );
  if (!rows.length) throw new Error("Adicione ao menos uma Agenda.");
  const flowForItem = new Map(items.map((item) => [item.id, item.planned_flow_id]));
  const monthsByFlow = new Map<string, Set<number>>();
  const frequencyByFlow = new Map<string, Set<string>>();
  const dieselByFlow = new Map<string, Set<string>>();
  const windowsByContext = new Map<string, Set<string>>();
  const tariffMode = quote.tariff_mode || opp.integration_tariff;
  const startMonth = Number(opp.contract_start.slice(0, 4) + opp.contract_start.slice(5, 7));
  const endMonth = Number(opp.contract_end.slice(0, 4) + opp.contract_end.slice(5, 7));
  for (const row of rows) {
    const flowId = flowForItem.get(row.quote_line_item_id) ?? "";
    const monthKey = row.year * 100 + row.month;
    monthsByFlow.set(flowId, (monthsByFlow.get(flowId) ?? new Set()).add(monthKey));
    frequencyByFlow.set(flowId, (frequencyByFlow.get(flowId) ?? new Set()).add(row.frequency));
    dieselByFlow.set(flowId, (dieselByFlow.get(flowId) ?? new Set()).add(row.diesel_base_id));
    const context = `${flowId}|${row.year}|${row.month}|${row.division}|${row.plaza}`;
    windowsByContext.set(
      context,
      (windowsByContext.get(context) ?? new Set()).add(row.period_window),
    );
    if (monthKey < startMonth || monthKey > endMonth)
      throw new Error("A vigência da Oportunidade precisa cobrir a primeira e a última Agenda.");
    if (frequencyByFlow.get(flowId)!.size > 1)
      throw new Error("Um Fluxo não pode misturar periodicidade mensal e anual na mesma Cotação.");
    if (row.diesel_base_date)
      applicationDate(Number(opp.application_day), row.diesel_base_date, row.month, row.year);
  }
  if ([...dieselByFlow.values()].some((bases) => bases.size > 1))
    throw new Error("Cada Fluxo Planejado só pode usar uma Base Diesel nesta Cotação.");
  if ([...windowsByContext.values()].some((windows) => windows.size > 1))
    throw new Error("Não misture tipos de janela no mesmo Fluxo, ano, mês, divisão e praça.");
  for (const row of rows) {
    const flowId = flowForItem.get(row.quote_line_item_id) ?? "";
    if (
      (row.frequency === "Anual" || (monthsByFlow.get(flowId)?.size ?? 0) > 1) &&
      !row.diesel_base_date
    )
      throw new Error(
        "DataBaseDiesel é obrigatória para periodicidade anual ou fluxos com agendas em vários meses.",
      );
  }
  const groups = new Map<string, typeof rows>();
  for (const row of rows)
    groups.set(row.schedule_key, [...(groups.get(row.schedule_key) ?? []), row]);
  for (const group of groups.values()) {
    if (!group.some((row) => row.service === "FRETE"))
      throw new Error("Cada grupo precisa conter o serviço FRETE.");
    if (
      group.some(
        (row) =>
          row.tariff_net !== group[0].tariff_net ||
          row.tariff_cbs !== group[0].tariff_cbs ||
          row.volume !== group[0].volume ||
          row.diesel_base_id !== group[0].diesel_base_id ||
          row.diesel_base_date !== group[0].diesel_base_date,
      )
    )
      throw new Error("Volume, tarifa e Base Diesel devem ser iguais no grupo da agenda.");
    const useCbs = tariffMode === "CBS";
    if (
      group.some((row) =>
        useCbs
          ? row.accessory_cbs === null || row.accessory_cbs_pct === null
          : row.accessory_net === null || row.accessory_net_pct === null,
      )
    )
      throw new Error("Complete os valores e percentuais de rateio em cada linha do grupo.");
    const amount = group.reduce(
        (sum, row) =>
          sum + Math.round(Number(useCbs ? row.accessory_cbs : row.accessory_net) * 100),
        0,
      ),
      pct = group.reduce(
        (sum, row) => sum + Number(useCbs ? row.accessory_cbs_pct : row.accessory_net_pct),
        0,
      );
    if (
      Math.abs(
        amount - Math.round(Number(useCbs ? group[0].tariff_cbs : group[0].tariff_net) * 100),
      ) > 2 ||
      Math.abs(pct - 100) > 0.2
    )
      throw new Error(
        "O rateio deve totalizar a tarifa e fechar 100% (tolerância de 0,2 ponto percentual).",
      );
  }
  if (
    opp.instrument_type === "ACS" &&
    rows.some((row) =>
      [
        row.tolerance_vli_volume,
        row.tolerance_client_volume,
        row.tolerance_vli_tariff,
        row.tolerance_client_tariff,
      ].some((v) => v !== null && v > 0),
    )
  )
    throw new Error("ACS não pode ter Take or Pay.");
  await db
    .update(quotes)
    .set({ status: "Concluída", updated_at: new Date().toISOString() })
    .where(eq(quotes.id, id));
  return { ok: true };
});

function partitionInteger(total: number, parts: number, f: ReturnType<typeof seededFaker>) {
  const result: number[] = [];
  let remaining = total;
  for (let index = 0; index < parts - 1; index++) {
    const next = f.number.int({ min: 1, max: remaining - (parts - index - 1) });
    result.push(next);
    remaining -= next;
  }
  result.push(remaining);
  return result;
}

/** Cadastra um catálogo ferroviário fictício por conta, com seed estável e vínculos reais locais. */
async function ensureRailCatalog(accountId: string, seed: number) {
  const existing = await db
    .select({ id: planned_flows.id, modal: planned_flows.modal, origin_system: planned_flows.origin_system })
    .from(planned_flows)
    .where(eq(planned_flows.account_id, accountId));
  const hasEligibleFlows = existing.some(
    (flow) => flow.modal === "Ferroviário" && flow.origin_system === "FLOU",
  );
  const now = new Date().toISOString();
  const f = seededFaker(seed);
  const locationsData = [
    ["Pátio PPN", "PPN", "Paulínia", "SP", "Campinas", "Pátio"],
    ["Terminal QPM", "QPM", "Químicos", "SP", "Campinas", "Terminal"],
    ["Terminal EYU", "EYU", "Aracruz", "ES", "Litoral Norte ES", "Terminal"],
    ["Pátio VGV", "VGV", "Vitória", "ES", "Grande Vitória", "Pátio"],
    ["Pátio PPM", "PPM", "Paulínia", "SP", "Campinas", "Pátio"],
    ["Terminal KIT", "KIT", "Uberaba", "MG", "Triângulo Mineiro", "Terminal"],
  ] as const;
  const locIds: string[] = [];
  for (const [name, code, city, state, microregion, location_type] of locationsData) {
    let [loc] = await db.select().from(locations).where(eq(locations.code, code));
    if (!loc) {
      const id = crypto.randomUUID();
      await db.insert(locations).values({
        id,
        name,
        code,
        city,
        state,
        microregion,
        location_type,
        created_at: now,
        updated_at: now,
      });
      [loc] = await db.select().from(locations).where(eq(locations.id, id));
    }
    locIds.push(loc.id);
  }
  const merchNames = [
    ["ÁLCOOL", "M³"],
    ["GASOLINA", "M³"],
    ["OLEO DIESEL", "M³"],
    ["AÇÚCAR", "TON"],
  ] as const;
  const merchIds: string[] = [];
  for (const [name, unit] of merchNames) {
    let [m] = await db.select().from(merchandise).where(eq(merchandise.name, name));
    if (!m) {
      const id = crypto.randomUUID();
      await db.insert(merchandise).values({ id, name, unit, created_at: now, updated_at: now });
      [m] = await db.select().from(merchandise).where(eq(merchandise.id, id));
    }
    merchIds.push(m.id);
  }
  let [diesel] = await db.select().from(diesel_bases).where(eq(diesel_bases.name, "ELDORADO"));
  if (!diesel) {
    const id = crypto.randomUUID();
    await db
      .insert(diesel_bases)
      .values({ id, name: "ELDORADO", anp_base: 0, created_at: now, updated_at: now });
    [diesel] = await db.select().from(diesel_bases).where(eq(diesel_bases.id, id));
  }
  const pairs = [
    [0, 1, 0],
    [2, 3, 2],
    [4, 5, 1],
    [0, 5, 3],
  ] as const;
  if (!hasEligibleFlows)
    for (const [origin, dest, product] of pairs)
      await db.insert(planned_flows).values({
        id: crypto.randomUUID(),
        code: String(f.number.int({ min: 250000, max: 999999 })),
        account_id: accountId,
        origin_id: locIds[origin],
        destination_id: locIds[dest],
        merchandise_id: merchIds[product],
        modal: "Ferroviário",
        origin_system: "FLOU",
        created_at: now,
        updated_at: now,
      });
}

/** Cria uma Cotação, itens por fluxo e agendas relacionadas usando dados reproduzíveis pela seed. */
export const generateQuoteBundle = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const {
      opportunityId,
      seed,
      scheduleCount = 4,
    } = input as { opportunityId: string; seed: number; scheduleCount?: number };
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (!opp) throw new Error("Oportunidade não encontrada.");
    if (opp.stage !== "Negociação")
      throw new Error("A oportunidade precisa estar em Negociação para receber uma Cotação.");
    if (!["Contrato", "ACS"].includes(opp.instrument_type) || opp.segment !== "Ferroviário")
      throw new Error("Esta versão atende somente oportunidades ferroviárias de Contrato e ACS.");
    if (!Number.isInteger(seed) || seed < 1) throw new Error("Informe uma seed inteira positiva.");
    if (!Number.isInteger(scheduleCount) || scheduleCount < 1 || scheduleCount > 24)
      throw new Error("Gere entre 1 e 24 agendas por fluxo.");
    await ensureRailCatalog(opp.account_id, seed);
    const flows = await db
      .select()
      .from(planned_flows)
      .where(eq(planned_flows.account_id, opp.account_id))
      .orderBy(asc(planned_flows.code));
    const eligibleFlows = flows.filter(
      (flow) => flow.modal === "Ferroviário" && flow.origin_system === "FLOU",
    );
    if (!eligibleFlows.length)
      throw new Error("Não foi possível preparar Fluxos ferroviários para esta Conta.");
    const bases = await db.select().from(diesel_bases).where(eq(diesel_bases.name, "ELDORADO"));
    const f = seededFaker(seed);
    const now = new Date().toISOString();
    const quoteId = crypto.randomUUID();
    const quoteNum = `COT-${String(f.number.int({ min: 100000, max: 999999 }))}`;
    await db.transaction(async (tx) => {
      await tx.insert(quotes).values({
        id: quoteId,
        opportunity_id: opp.id,
        quote_number: quoteNum,
        name: `${opp.name} · Ferroviário`,
        record_type: "VLI_General",
        tariff_mode: opp.integration_tariff,
        status: "Rascunho",
        is_synced: 0,
        seed,
        created_at: now,
        updated_at: now,
      });
      for (const flow of eligibleFlows.slice(0, 3)) {
        const start = opp.contract_start
          ? new Date(`${opp.contract_start}T00:00:00Z`)
          : new Date(Date.UTC(2027 + (seed % 3), seed % 12, 1));
        const accessories = f.helpers.arrayElements(
          ["CARGA", "DESCARGA", "BALDEAÇÃO", "MANOBRA ORIGEM", "MANOBRA DESTINO"],
          { min: 2, max: 3 },
        );
        const serviceNames = ["FRETE", ...accessories];
        const itemIds = new Map<string, string>();
        for (const service of serviceNames) {
          const itemId = crypto.randomUUID();
          itemIds.set(service, itemId);
          await tx.insert(quote_line_items).values({
            id: itemId,
            quote_id: quoteId,
            planned_flow_id: flow.id,
            service,
            volume_total: 0,
            revenue_total: 0,
            top_eligible: 0,
            created_at: now,
            updated_at: now,
          });
        }
        const flowSchedules = await tx
          .select({ schedule_key: quote_schedules.schedule_key })
          .from(quote_schedules)
          .innerJoin(quote_line_items, eq(quote_schedules.quote_line_item_id, quote_line_items.id))
          .where(eq(quote_line_items.planned_flow_id, flow.id));
        const used = new Set(flowSchedules.map((row) => row.schedule_key));
        let made = 0,
          offset = 0;
        while (made < scheduleCount && offset < 36) {
          const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
          offset++;
          const acsLimit = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 11, 20));
          const contractLimit = opp.contract_end
            ? new Date(`${opp.contract_end}T00:00:00Z`)
            : acsLimit;
          if (
            opp.instrument_type === "ACS" &&
            date.getTime() > Math.min(acsLimit.getTime(), contractLimit.getTime())
          )
            break;
          if (
            opp.contract_end &&
            date.getUTCFullYear() * 100 + date.getUTCMonth() + 1 >
              Number(opp.contract_end.slice(0, 4) + opp.contract_end.slice(5, 7))
          )
            break;
          const year = date.getUTCFullYear(),
            month = date.getUTCMonth() + 1;
          const period = `${year}${String(month).padStart(2, "0")}`;
          const key = `${flow.code}|${period}|Todas|TODAS_PRACAS_NACIONAL`;
          if (used.has(key)) continue;
          used.add(key);
          made++;
          const volume = f.number.int({ min: 1000, max: 9000 });
          const tariffCents = f.number.int({ min: 18000, max: 52000 });
          const shares = partitionInteger(tariffCents, serviceNames.length, f);
          const percentages = partitionInteger(10000, serviceNames.length, f);
          const useCbs = opp.integration_tariff === "CBS";
          for (let index = 0; index < serviceNames.length; index++) {
            const service = serviceNames[index];
            await tx.insert(quote_schedules).values({
              id: crypto.randomUUID(),
              quote_line_item_id: itemIds.get(service)!,
              schedule_key: key,
              year,
              month,
              frequency: "Mensal",
              period_window: "Mês",
              division: "Todas",
              plaza: "TODAS_PRACAS_NACIONAL",
              volume,
              tariff_cbs: useCbs ? tariffCents / 100 : null,
              tariff_net: useCbs ? 0 : tariffCents / 100,
              diesel_base_id: bases[0].id,
              diesel_base_date: `${String(opp.application_day ?? 10).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
              service,
              accessory_cbs: useCbs ? shares[index] / 100 : null,
              accessory_cbs_pct: useCbs ? percentages[index] / 100 : null,
              accessory_net: useCbs ? null : shares[index] / 100,
              accessory_net_pct: useCbs ? null : percentages[index] / 100,
              tolerance_vli_volume: null,
              tolerance_client_volume: null,
              tolerance_vli_tariff: null,
              tolerance_client_tariff: null,
              created_at: now,
              updated_at: now,
            });
          }
        }
        if (made < scheduleCount)
          throw new Error(
            "O período da oportunidade não permite gerar a quantidade de agendas solicitada.",
          );
      }
    });
    return {
      id: quoteId,
      quote_number: quoteNum,
      seed,
      itemCount: Math.min(eligibleFlows.length, 3),
      scheduleCount: Math.min(eligibleFlows.length, 3) * scheduleCount,
    };
  },
);

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

const OPPORTUNITY_STAGES = [
  "Prospecção",
  "Negociação",
  "Aprovação",
  "Formalização",
  "Fechado",
] as const;

/** Valida a máquina de estados no servidor para formulários individuais e operações em lote. */
async function validateOpportunityStage(
  recordId: string | null | undefined,
  data: Record<string, unknown>,
) {
  if (
    Object.prototype.hasOwnProperty.call(data, "application_day") &&
    ![1, 10, 20].includes(Number(data.application_day))
  )
    throw new Error("O dia de aplicação deve ser 1, 10 ou 20.");
  if (!Object.prototype.hasOwnProperty.call(data, "stage")) return;
  const nextStage = String(data.stage ?? "");
  if (!OPPORTUNITY_STAGES.includes(nextStage as (typeof OPPORTUNITY_STAGES)[number])) {
    throw new Error("Selecione uma etapa válida para a oportunidade.");
  }
  if (!recordId) {
    if (nextStage !== "Prospecção")
      throw new Error("Toda oportunidade deve começar em Prospecção.");
    return;
  }

  const [current] = await db
    .select({ stage: opportunities.stage })
    .from(opportunities)
    .where(eq(opportunities.id, recordId));
  if (!current) throw new Error("Oportunidade não encontrada.");
  if (current.stage === nextStage) return;
  if (current.stage === "Prospecção" && nextStage === "Negociação") return;
  if (current.stage === "Aprovação" && nextStage === "Negociação") return;
  if (current.stage === "Negociação" && nextStage === "Aprovação") {
    const hasSynced = await db.select().from(quotes).where(eq(quotes.opportunity_id, recordId));
    if (!hasSynced.some((row) => row.is_synced && row.status === "Sincronizada"))
      throw new Error("Antes de avançar, conclua e sincronize uma Cotação.");
    return;
  }
  if (current.stage === "Aprovação" && nextStage === "Formalização") {
    throw new Error("Antes de formalizar, registre a aprovação da oportunidade.");
  }
  if (current.stage === "Formalização" && nextStage === "Fechado") {
    throw new Error("O fechamento depende da formalização via NetLex.");
  }
  throw new Error("A oportunidade só pode avançar pelas etapas disponíveis no Path.");
}

const RAIL_SERVICES = [
  "FRETE",
  "CARGA",
  "DESCARGA",
  "BALDEAÇÃO",
  "MANOBRA ORIGEM",
  "MANOBRA DESTINO",
];

function applicationDate(day: number, rawValue: unknown, month: number, year: number) {
  const raw = String(rawValue ?? "").trim();
  let targetMonth = month;
  let targetYear = year;
  if (/^\d{2}\/\d{4}$/.test(raw)) {
    targetMonth = Number(raw.slice(0, 2));
    targetYear = Number(raw.slice(3));
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    targetMonth = Number(raw.slice(3, 5));
    targetYear = Number(raw.slice(6));
  } else if (raw) {
    throw new Error("Informe a Data base diesel como MM/AAAA ou DD/MM/AAAA.");
  }
  const date = new Date(Date.UTC(targetYear, targetMonth - 1, day));
  if (
    ![1, 10, 20].includes(day) ||
    targetMonth < 1 || targetMonth > 12 ||
    date.getUTCMonth() + 1 !== targetMonth ||
    date.getUTCFullYear() !== targetYear
  )
    throw new Error("A Data base diesel precisa ter uma data válida e o dia de aplicação da Oportunidade.");
  return `${String(day).padStart(2, "0")}/${String(targetMonth).padStart(2, "0")}/${targetYear}`;
}

async function validateQuoteSchedule(
  recordId: string | null | undefined,
  input: Record<string, unknown>,
) {
  const d = input as any;
  const year = Number(d.year),
    month = Number(d.month),
    volume = Number(d.volume);
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 4000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new Error("Ano ou mês inválido na agenda.");
  if (!Number.isInteger(volume) || volume <= 0)
    throw new Error("O volume ferroviário deve ser um número inteiro positivo.");
  const cbs =
    d.tariff_cbs === "" || d.tariff_cbs === null || d.tariff_cbs === undefined
      ? null
      : Number(d.tariff_cbs);
  const net =
    d.tariff_net === "" || d.tariff_net === null || d.tariff_net === undefined
      ? null
      : Number(d.tariff_net);
  if (cbs !== null && (!Number.isFinite(cbs) || cbs < 0))
    throw new Error("A Tarifa CBS não pode ser negativa.");
  if (net !== null && (!Number.isFinite(net) || net < 0))
    throw new Error("A Tarifa Líquida não pode ser negativa.");
  if (!(Number(cbs ?? 0) > 0) && !(Number(net ?? 0) > 0))
    throw new Error("Informe a Tarifa CBS ou a Tarifa Líquida.");
  if (Number(cbs ?? 0) > 0 && Number(net ?? 0) > 0)
    throw new Error("Preencha Tarifa CBS ou Tarifa Líquida, nunca as duas.");
  const service = String(d.service ?? "")
    .trim()
    .toUpperCase();
  if (!RAIL_SERVICES.includes(service))
    throw new Error("Selecione FRETE ou um acessório ferroviário válido.");
  if (!d.diesel_base_id)
    throw new Error("Base de repasse de diesel é obrigatória para Ferroviário.");
  if (d.frequency && !["Mensal", "Anual"].includes(String(d.frequency)))
    throw new Error("Periodicidade inválida.");
  if (
    d.period_window &&
    ![
      "Mês",
      "1ª Dezena",
      "2ª Dezena",
      "3ª Dezena",
      "1ª Quinzena",
      "2ª Quinzena",
      "1ª Semana",
      "2ª Semana",
      "3ª Semana",
      "4ª Semana",
      "5ª Semana",
    ].includes(String(d.period_window))
  )
    throw new Error("Período inválido.");
  const tolerances = [
    d.tolerance_vli_volume,
    d.tolerance_client_volume,
    d.tolerance_vli_tariff,
    d.tolerance_client_tariff,
  ].map((value) =>
    value === "" || value === undefined ? null : value === null ? null : Number(value),
  );
  if (
    tolerances.some(
      (value) => value !== null && (!Number.isInteger(value) || value < 0 || value > 100),
    )
  )
    throw new Error("As quatro tolerâncias aceitam somente números inteiros de 0 a 100.");
  const anyTolerance = tolerances.some((value) => value !== null && value > 0);
  if (anyTolerance && tolerances.some((value) => value === null))
    throw new Error("Preencha as quatro tolerâncias ou deixe as quatro vazias/zeradas.");
  const [item] = await db
    .select()
    .from(quote_line_items)
    .where(eq(quote_line_items.id, String(d.quote_line_item_id ?? "")));
  if (!item) throw new Error("Item da Cotação não encontrado.");
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, item.quote_id));
  const [opp] = quote
    ? await db.select().from(opportunities).where(eq(opportunities.id, quote.opportunity_id))
    : [];
  const [flow] = await db
    .select()
    .from(planned_flows)
    .where(eq(planned_flows.id, item.planned_flow_id));
  if (!opp || opp.stage !== "Negociação")
    throw new Error("A oportunidade vinculada precisa estar em Negociação.");
  if (![1, 10, 20].includes(Number(opp.application_day)))
    throw new Error("Defina na Oportunidade um dia de aplicação igual a 1, 10 ou 20.");
  if (opp.segment !== "Ferroviário" || !["Contrato", "ACS"].includes(opp.instrument_type))
    throw new Error("Esta agenda atende somente Ferroviário de Contrato e ACS.");
  if (!opp.contract_start || !opp.contract_end)
    throw new Error("Preencha início e fim da vigência na Oportunidade antes de criar Agendas.");
  const period = year * 100 + month;
  const contractStart = Number(opp.contract_start.slice(0, 4) + opp.contract_start.slice(5, 7));
  const contractEnd = Number(opp.contract_end.slice(0, 4) + opp.contract_end.slice(5, 7));
  if (period < contractStart || period > contractEnd)
    throw new Error("O período da Agenda deve estar dentro da vigência da Oportunidade.");
  if (
    !flow ||
    flow.account_id !== opp.account_id ||
    flow.modal !== "Ferroviário" ||
    flow.origin_system !== "FLOU"
  )
    throw new Error(
      "O Fluxo Planejado precisa ser ferroviário, ter origem FLOU e pertencer à conta da oportunidade.",
    );
  if (opp.instrument_type === "ACS" && anyTolerance)
    throw new Error("ACS não aceita tolerâncias nem Take or Pay.");
  const tariffMode = quote?.tariff_mode || opp.integration_tariff;
  if (tariffMode === "CBS" && !(Number(cbs ?? 0) > 0))
    throw new Error("A Oportunidade usa tarifa CBS. Preencha Tarifa CBS e deixe a líquida vazia.");
  if (tariffMode !== "CBS" && !(Number(net ?? 0) > 0))
    throw new Error(
      "A Oportunidade usa tarifa líquida. Preencha Tarifa Líquida e deixe CBS vazia.",
    );
  const division = String(d.division ?? "Todas"),
    plaza = String(d.plaza ?? "TODAS_PRACAS_NACIONAL");
  const scheduleKey = `${flow.code}|${year}${String(month).padStart(2, "0")}|${division}|${plaza}`;
  const duplicates = await db
    .select({ id: quote_schedules.id })
    .from(quote_schedules)
    .where(eq(quote_schedules.schedule_key, scheduleKey));
  if (
    duplicates.some(
      (row) =>
        row.volume !== volume ||
        row.tariff_cbs !== cbs ||
        row.tariff_net !== (net ?? 0) ||
        row.diesel_base_id !== d.diesel_base_id ||
        row.diesel_base_date !== d.diesel_base_date,
    )
  )
    throw new Error("Volume, tarifas, Base Diesel e data precisam ser iguais nas linhas da mesma Agenda.");
  if (duplicates.some((row) => row.id !== recordId)) {
    const matching = await db
      .select()
      .from(quote_schedules)
      .where(eq(quote_schedules.schedule_key, scheduleKey));
    const duplicate = matching.some(
      (row) => row.id !== recordId && row.service.toUpperCase() === service,
    );
    if (duplicate)
      throw new Error("Já existe uma Agenda para este Fluxo, período, divisão, praça e serviço.");
  }
  const accessoryNet =
    d.accessory_net === "" || d.accessory_net === undefined
      ? null
      : d.accessory_net === null
        ? null
        : Number(d.accessory_net);
  const accessoryPct =
    d.accessory_net_pct === "" || d.accessory_net_pct === undefined
      ? null
      : d.accessory_net_pct === null
        ? null
        : Number(d.accessory_net_pct);
  if (accessoryNet !== null && (!Number.isFinite(accessoryNet) || accessoryNet < 0))
    throw new Error("Tarifa acessória não pode ser negativa.");
  if (
    accessoryPct !== null &&
    (!Number.isFinite(accessoryPct) || accessoryPct < 0 || accessoryPct > 100)
  )
    throw new Error("Percentual acessório deve ficar entre 0 e 100.");
  const accessoryCbs =
    d.accessory_cbs === "" || d.accessory_cbs === undefined
      ? null
      : d.accessory_cbs === null
        ? null
        : Number(d.accessory_cbs);
  const accessoryCbsPct =
    d.accessory_cbs_pct === "" || d.accessory_cbs_pct === undefined
      ? null
      : d.accessory_cbs_pct === null
        ? null
        : Number(d.accessory_cbs_pct);
  if (tariffMode === "CBS" && (accessoryCbs === null || accessoryCbsPct === null))
    throw new Error("Preencha tarifa acessória e percentual no modo CBS.");
  if (tariffMode !== "CBS" && (accessoryNet === null || accessoryPct === null))
    throw new Error("Preencha tarifa acessória e percentual no modo líquido.");
  d.diesel_base_date = applicationDate(
    Number(opp.application_day),
    d.diesel_base_date,
    month,
    year,
  );
  d.tariff_cbs = cbs;
  d.tariff_net = net ?? 0;
  d.accessory_cbs = accessoryCbs;
  d.accessory_cbs_pct = accessoryCbsPct;
  d.service = service;
  d.schedule_key = scheduleKey;
  d.tolerance_vli_volume = tolerances[0];
  d.tolerance_client_volume = tolerances[1];
  d.tolerance_vli_tariff = tolerances[2];
  d.tolerance_client_tariff = tolerances[3];
  d.accessory_net = accessoryNet;
  d.accessory_net_pct = accessoryPct;
}

/** Insert ou update genérico, usado pelo SfRecordDialog. */
export const saveRecord = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { table, recordId, data } = input as SaveInput;
  const t = TABLES[table];
  if (!t) throw new Error(`Objeto desconhecido: ${table}`);
  if (table === "opportunities") {
    if (!recordId && data.application_day === undefined) data.application_day = 10;
    if (data.application_day !== undefined) data.application_day = Number(data.application_day);
    await validateOpportunityStage(recordId, data);
  }
  if (table === "quotes") {
    const opportunityId = String(data.opportunity_id ?? "");
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (
      !opp ||
      opp.stage !== "Negociação" ||
      opp.segment !== "Ferroviário" ||
      !["Contrato", "ACS"].includes(opp.instrument_type)
    )
      throw new Error(
        "A Cotação exige uma oportunidade Ferroviária de Contrato ou ACS em Negociação.",
      );
    if (!recordId && !(data as any).quote_number)
      (data as any).quote_number = `COT-${Date.now().toString().slice(-6)}`;
    if (!recordId && !(data as any).seed) (data as any).seed = 20260929;
    if (!recordId && !(data as any).tariff_mode) (data as any).tariff_mode = opp.integration_tariff;
  }
  if (table === "quote_line_items") {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, String(data.quote_id ?? "")));
    const [opp] = quote
      ? await db.select().from(opportunities).where(eq(opportunities.id, quote.opportunity_id))
      : [];
    const [flow] = await db
      .select()
      .from(planned_flows)
      .where(eq(planned_flows.id, String(data.planned_flow_id ?? "")));
    if (
      !quote ||
      !opp ||
      !flow ||
      opp.account_id !== flow.account_id ||
      flow.modal !== "Ferroviário" ||
      flow.origin_system !== "FLOU"
    )
      throw new Error(
        "O Item precisa usar um Fluxo Planejado ferroviário da Conta da Oportunidade.",
      );
    if (
      !RAIL_SERVICES.includes(
        String(data.service ?? "")
          .trim()
          .toUpperCase(),
      )
    )
      throw new Error("Selecione um serviço ferroviário permitido.");
  }
  if (table === "quote_schedules") await validateQuoteSchedule(recordId, data);
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

/** Valida e grava o Item e seus grupos de Agenda numa única transação. */
export const saveQuoteItemScreenflow = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const request = input as {
      quoteId: string;
      itemId?: string;
      flowId: string;
      itemService: string;
      tariffMode: string;
      groups: Array<{
        year: number;
        month: number;
        frequency: string;
        period_window: string;
        division: string;
        plaza: string;
        volume: number;
        tariff: number;
        diesel_base_id: string;
        diesel_base_date: string;
        services: Array<{ service: string; percent: number }>;
      }>;
    };
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, request.quoteId));
    if (!quote || quote.status !== "Rascunho" || quote.is_synced)
      throw new Error("Só é possível editar uma Cotação em Rascunho.");
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, quote.opportunity_id));
    if (
      !opp ||
      opp.stage !== "Negociação" ||
      opp.segment !== "Ferroviário" ||
      !["Contrato", "ACS"].includes(opp.instrument_type)
    )
      throw new Error(
        "A Oportunidade precisa ser Ferroviária, de Contrato/ACS e estar em Negociação.",
      );
    if (!opp.contract_start || !opp.contract_end)
      throw new Error("Preencha início e fim da vigência na Oportunidade antes de montar Agendas.");
    if (![1, 10, 20].includes(Number(opp.application_day)))
      throw new Error("Defina na Oportunidade um dia de aplicação igual a 1, 10 ou 20.");
    if (opp.instrument_type === "ACS") {
      const start = new Date(`${opp.contract_start}T00:00:00Z`);
      const limit = new Date(start);
      limit.setMonth(limit.getMonth() + 12);
      if (new Date(`${opp.contract_end}T00:00:00Z`) >= limit)
        throw new Error("A vigência ACS deve ser inferior a 12 meses.");
    }
    const [flow] = await db
      .select()
      .from(planned_flows)
      .where(eq(planned_flows.id, request.flowId));
    if (
      !flow ||
      flow.account_id !== opp.account_id ||
      flow.modal !== "Ferroviário" ||
      flow.origin_system !== "FLOU"
    )
      throw new Error(
        "O Fluxo precisa pertencer ao Cliente da Oportunidade, ter origem FLOU e modal Ferroviário.",
      );
    if (!RAIL_SERVICES.includes(request.itemService))
      throw new Error("Selecione um serviço ferroviário válido para o Item.");
    if (!request.groups.length) throw new Error("Adicione ao menos um grupo de Agenda.");
    if (!["CBS", "Líquida"].includes(request.tariffMode))
      throw new Error("Escolha tarifa CBS ou tarifa líquida nesta Cotação.");
    const quoteItemsBefore = await db
      .select({ id: quote_line_items.id })
      .from(quote_line_items)
      .where(eq(quote_line_items.quote_id, request.quoteId));
    let existingScheduleCount = 0;
    for (const existingItem of quoteItemsBefore) {
      const existingSchedules = await db
        .select({ id: quote_schedules.id })
        .from(quote_schedules)
        .where(eq(quote_schedules.quote_line_item_id, existingItem.id));
      existingScheduleCount += existingSchedules.length;
    }
    const savedTariffMode = quote.tariff_mode || opp.integration_tariff;
    if (existingScheduleCount && request.tariffMode !== savedTariffMode)
      throw new Error("A modalidade de tarifa não pode mudar depois da primeira Agenda da Cotação.");
    const [dieselBase] = await db
      .select()
      .from(diesel_bases)
      .where(eq(diesel_bases.id, request.groups[0].diesel_base_id));
    if (!dieselBase) throw new Error("Selecione uma Base Diesel válida.");
    const startMonth = Number(opp.contract_start.slice(0, 4) + opp.contract_start.slice(5, 7));
    const endMonth = Number(opp.contract_end.slice(0, 4) + opp.contract_end.slice(5, 7));
    const draftKeys = new Set<string>();
    const rowsToInsert: Array<Record<string, unknown>> = [];
    for (const group of request.groups) {
      const period = group.year * 100 + group.month;
      if (
        !Number.isInteger(group.year) ||
        !Number.isInteger(group.month) ||
        group.month < 1 ||
        group.month > 12 ||
        period < startMonth ||
        period > endMonth
      )
        throw new Error("O período de cada Agenda deve estar dentro da vigência da Oportunidade.");
      if (!Number.isInteger(group.volume) || group.volume <= 0)
        throw new Error("O volume ferroviário deve ser um número inteiro positivo.");
      if (!Number.isFinite(group.tariff) || group.tariff <= 0)
        throw new Error("Informe uma tarifa maior que zero.");
      if (!group.diesel_base_id || group.diesel_base_id !== request.groups[0].diesel_base_id)
        throw new Error("Use uma única Base Diesel por Fluxo nesta Cotação.");
      if (!["Mensal", "Anual"].includes(group.frequency))
        throw new Error("Periodicidade inválida na Agenda.");
      if (
        ![
          "Mês",
          "1ª Dezena",
          "2ª Dezena",
          "3ª Dezena",
          "1ª Quinzena",
          "2ª Quinzena",
          "1ª Semana",
          "2ª Semana",
          "3ª Semana",
          "4ª Semana",
          "5ª Semana",
        ].includes(group.period_window)
      )
        throw new Error("Período inválido na Agenda.");
      const normalizedDieselDate = applicationDate(
        Number(opp.application_day),
        group.diesel_base_date,
        group.month,
        group.year,
      );
      if (!group.services.some((entry) => entry.service === "FRETE"))
        throw new Error("Cada grupo precisa incluir o serviço FRETE.");
      if (group.services.some((entry) => !RAIL_SERVICES.includes(entry.service)))
        throw new Error("O grupo contém um serviço ferroviário inválido.");
      if (
        group.services.some(
          (entry) =>
            !Number.isFinite(Number(entry.percent)) ||
            Number(entry.percent) < 0 ||
            Number(entry.percent) > 100,
        )
      )
        throw new Error("Cada percentual de rateio deve ficar entre 0 e 100.");
      if (new Set(group.services.map((entry) => entry.service)).size !== group.services.length)
        throw new Error("Não repita o mesmo serviço dentro de um grupo de Agenda.");
      const percentTotal = group.services.reduce((sum, entry) => sum + Number(entry.percent), 0);
      if (Math.abs(percentTotal - 100) > 0.2)
        throw new Error("O rateio percentual do grupo precisa somar 100%.");
      const scheduleKey = `${flow.code}|${group.year}${String(group.month).padStart(2, "0")}|${group.division}|${group.plaza}`;
      if (draftKeys.has(scheduleKey))
        throw new Error(
          "Cada período precisa ser um grupo único; una os serviços do mesmo período no mesmo grupo.",
        );
      draftKeys.add(scheduleKey);
      const existing = await db
        .select()
        .from(quote_schedules)
        .where(eq(quote_schedules.schedule_key, scheduleKey));
      const duplicate = existing.some((row) =>
        group.services.some((entry) => row.service === entry.service),
      );
      if (duplicate)
        throw new Error("Já existe Agenda para este Fluxo, período, divisão, praça e serviço.");
      if (existing.length)
        throw new Error(
          "Este grupo de Agenda já tem linhas salvas. Edite o grupo existente para ajustar o rateio.",
        );
      const cbs = request.tariffMode === "CBS";
      const cents = Math.round(group.tariff * 100);
      const pctUnits = group.services.map((entry) => Math.round(Number(entry.percent) * 100));
      const pctDiff = 10000 - pctUnits.reduce((sum, value) => sum + value, 0);
      pctUnits[pctUnits.length - 1] += pctDiff;
      const shares = group.services.map((_, index) =>
        Math.floor((cents * pctUnits[index]) / 10000),
      );
      shares[shares.length - 1] += cents - shares.reduce((sum, value) => sum + value, 0);
      group.services.forEach((entry, index) =>
        rowsToInsert.push({
          quote_line_item_id: "",
          schedule_key: scheduleKey,
          year: group.year,
          month: group.month,
          frequency: group.frequency,
          period_window: group.period_window,
          division: group.division,
          plaza: group.plaza,
          volume: group.volume,
          tariff_cbs: cbs ? cents / 100 : null,
          tariff_net: cbs ? 0 : cents / 100,
          diesel_base_id: group.diesel_base_id,
          diesel_base_date: normalizedDieselDate,
          service: entry.service,
          accessory_cbs: cbs ? shares[index] / 100 : null,
          accessory_cbs_pct: cbs ? pctUnits[index] / 100 : null,
          accessory_net: cbs ? null : shares[index] / 100,
          accessory_net_pct: cbs ? null : pctUnits[index] / 100,
          tolerance_vli_volume: 0,
          tolerance_client_volume: 0,
          tolerance_vli_tariff: 0,
          tolerance_client_tariff: 0,
        }),
      );
    }
    const now = new Date().toISOString();
    const itemId = request.itemId ?? crypto.randomUUID();
    if (request.itemId) {
      const [existingItem] = await db
        .select()
        .from(quote_line_items)
        .where(eq(quote_line_items.id, request.itemId));
      if (
        !existingItem ||
        existingItem.quote_id !== request.quoteId ||
        existingItem.planned_flow_id !== request.flowId
      )
        throw new Error("O Item selecionado não pertence a esta Cotação e a este Fluxo.");
    }
    await db.transaction(async (tx) => {
      await tx
        .update(quotes)
        .set({ tariff_mode: request.tariffMode, updated_at: now })
        .where(eq(quotes.id, request.quoteId));
      if (!request.itemId) {
        await tx.insert(quote_line_items).values({
          id: itemId,
          quote_id: request.quoteId,
          planned_flow_id: request.flowId,
          service: request.itemService,
          volume_total: 0,
          revenue_total: 0,
          top_eligible: 0,
          created_at: now,
          updated_at: now,
        });
      }
      for (const row of rowsToInsert)
        await tx.insert(quote_schedules).values({
          ...row,
          quote_line_item_id: itemId,
          id: crypto.randomUUID(),
          created_at: now,
          updated_at: now,
        } as typeof quote_schedules.$inferInsert);
    });
    return { itemId, scheduleCount: rowsToInsert.length };
  },
);

/** Saves up to 100 records in one server call, used by bulk create and update. */
export const saveRecordsBulk = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
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
      await Promise.all(
        chunk.map(async ({ recordId, data }, localIndex) => {
          const recordData = { ...data };
          if (table === "opportunities") {
            if (!recordId && recordData.application_day === undefined) recordData.application_day = 10;
            if (recordData.application_day !== undefined)
              recordData.application_day = Number(recordData.application_day);
            await validateOpportunityStage(recordId, recordData);
          }
          if (table === "quotes") {
            const [opp] = await db
              .select()
              .from(opportunities)
              .where(eq(opportunities.id, String(data.opportunity_id ?? "")));
            if (
              !opp ||
              opp.stage !== "Negociação" ||
              opp.segment !== "Ferroviário" ||
              !["Contrato", "ACS"].includes(opp.instrument_type)
            )
              throw new Error(
                "A Cotação exige uma oportunidade Ferroviária de Contrato ou ACS em Negociação.",
              );
            if (!recordId) {
              if (!recordData.quote_number)
                recordData.quote_number = `COT-${Date.now().toString().slice(-6)}${String(offset + localIndex).padStart(2, "0")}`;
              if (!recordData.seed) recordData.seed = 20260929;
              if (!recordData.tariff_mode) recordData.tariff_mode = opp.integration_tariff;
            }
          }
          if (table === "quote_schedules") await validateQuoteSchedule(recordId, recordData);
          const values = { ...recordData, updated_at: now };
          if (recordId) {
            return db.update(target).set(values).where(eq(target.id, recordId));
          }
          return db
            .insert(target)
            .values({ id: crypto.randomUUID(), ...recordData, updated_at: now, created_at: now });
        }),
      );
    }
    return { ok: true, count: records.length };
  },
);

/** Deletes up to 100 selected records with one server call. */
export const deleteRecordsBulk = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
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
  },
);

/** Delete genérico. Excluir uma conta remove seus contatos. */
export const deleteRecord = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { table, id } = input as { table: TableName; id: string };
  const t = TABLES[table];
  if (!t) throw new Error(`Objeto desconhecido: ${table}`);
  if (table === "accounts") {
    await db
      .delete(opportunities)
      .where(id ? eq(opportunities.account_id, id) : isNull(opportunities.account_id));
    await db.delete(contacts).where(id ? eq(contacts.account_id, id) : isNull(contacts.account_id));
  }
  // Registros salvos sem id (bug antigo) ficam com id NULL — limpa pelo IS NULL.
  await db
    .delete(t)
    .where(
      id ? eq((t as typeof t & { id: never }).id, id) : isNull((t as typeof t & { id: never }).id),
    );
  return { ok: true };
});

/** Deletes records from every registered object, then optionally restores demo data. */
export const resetPlaygroundData = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
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
        {
          name: "VLI Logística",
          type: "Cliente - Direto",
          industry: "Logística",
          city: "São Paulo",
          state: "SP",
          account_owner: "Maria Silva",
          health: "Verde",
          customer_status: "Cliente",
          risk_level: "Baixo",
          lifetime_value: 1250000,
          revenue: 8200000,
          employees: 450,
          branch_name: "Matriz",
          phone: "(11) 3000-0000",
          website: "https://vli-logistica.example",
          notes: "Conta de demonstração",
        },
        {
          name: "Ferrovia Central",
          type: "Cliente - Direto",
          industry: "Transporte",
          city: "Belo Horizonte",
          state: "MG",
          account_owner: "João Santos",
          health: "Amarelo",
          customer_status: "Cliente",
          risk_level: "Médio",
          lifetime_value: 640000,
          revenue: 4100000,
          employees: 220,
          branch_name: "Minas Gerais",
          phone: "(31) 3000-0000",
          website: "https://ferrovia.example",
          notes: "Conta de demonstração",
        },
      ];
      const ids = demoAccounts.map(() => crypto.randomUUID());
      await db.insert(accounts).values(
        demoAccounts.map((account, index) => ({
          id: ids[index],
          ...account,
          created_at: now,
          updated_at: now,
        })),
      );
      await db.insert(contacts).values([
        {
          id: crypto.randomUUID(),
          account_id: ids[0],
          name: "Ana Costa",
          title: "Diretora Comercial",
          email: "ana.costa@example.com",
          phone: "(11) 99999-1000",
          decision_role: "Decisor",
          created_at: now,
          updated_at: now,
        },
        {
          id: crypto.randomUUID(),
          account_id: ids[1],
          name: "Pedro Almeida",
          title: "Gerente de Operações",
          email: "pedro.almeida@example.com",
          phone: "(31) 99999-2000",
          decision_role: "Influenciador",
          created_at: now,
          updated_at: now,
        },
      ]);
    }

    return { ok: true, mode };
  },
);
