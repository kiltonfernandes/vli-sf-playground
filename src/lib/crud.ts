import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
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
  approvers,
  recommended_prices,
  quote_approvals,
  app_settings,
  netlex_contracts,
  TABLES,
  type TableName,
} from "./schema";
import { asc as ascending } from "drizzle-orm";
import { randomSeed, seededFaker } from "./generators/core";
import { planAddendumShuffle, type ShuffleGroup } from "./addendum-shuffle";
import { jetsonsUnitPrice, type JetsonsEndpoint } from "./jetsons";
import {
  buildAddendumClauses,
  changedFields,
  effectiveOperation,
  parseSnapshot,
  snapshotOf,
  summarizeChanges,
  type AddendumChange,
} from "./addendum";

type SaveInput = {
  table: TableName;
  recordId?: string | null;
  data: Record<string, unknown>;
};

/** Painel inicial: top contas por LTV + contagem de contatos. */
export const homeDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const [top, contactRows, approvalRows] = await Promise.all([
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
    db
      .select({ id: quote_approvals.id })
      .from(quote_approvals)
      .where(eq(quote_approvals.status, "Pendente")),
  ]);
  return {
    accounts: top,
    contactCount: contactRows.length,
    pendingApprovals: approvalRows.length,
  };
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

export const getOpportunityFull = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(
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
    const [contract] = await db
      .select()
      .from(netlex_contracts)
      .where(eq(netlex_contracts.opportunity_id, id));
    const [baseContract] = opportunity.base_contract_id
      ? await db
          .select({
            id: netlex_contracts.id,
            netlex_number: netlex_contracts.netlex_number,
            title: netlex_contracts.title,
            status: netlex_contracts.status,
            opportunity_id: netlex_contracts.opportunity_id,
          })
          .from(netlex_contracts)
          .where(eq(netlex_contracts.id, opportunity.base_contract_id))
      : [];
    return {
      opportunity,
      account: account ?? null,
      netlexContract: contract
        ? { ...contract, document: parseContractDocument(contract.document_json) }
        : null,
      baseContract: baseContract ?? null,
      addenda: contract ? await listContractAddenda(contract.id) : [],
    };
  },
);

function parseContractDocument(raw: string): Record<string, any> {
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return {};
  }
}

/** Snapshot da cotação aprovada para a etapa simulada de envio ao NetLex. */
export const sendOpportunityToNetlex = createServerFn({ method: "POST" })
  .inputValidator((data: { opportunityId: string }) => data)
  .handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { opportunityId } = input as { opportunityId: string };
    const [existing] = await db
      .select()
      .from(netlex_contracts)
      .where(eq(netlex_contracts.opportunity_id, opportunityId));
    if (existing)
      return {
        ok: true,
        created: false,
        contract: {
          ...existing,
          document: parseContractDocument(existing.document_json),
        },
      };

    const [opportunity] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId));
    if (!opportunity) throw new Error("Oportunidade não encontrada.");
    if (opportunity.stage !== "Formalização")
      throw new Error("Avance a Oportunidade para Formalização antes de enviar o contrato.");
    if (!["Contrato", "ACS", "Aditivo"].includes(opportunity.instrument_type))
      throw new Error("O envio ao NetLex atende Contrato, ACS e Aditivo.");
    const isAddendum = opportunity.instrument_type === "Aditivo";
    const [baseContract] =
      isAddendum && opportunity.base_contract_id
        ? await db
            .select()
            .from(netlex_contracts)
            .where(eq(netlex_contracts.id, opportunity.base_contract_id))
        : [];
    if (isAddendum && !baseContract)
      throw new Error("O aditivo precisa estar vinculado ao contrato original.");
    if (isAddendum && baseContract.status !== NETLEX_SIGNATURE)
      throw new Error("O contrato original precisa estar em Assinatura no NetLex.");
    if (!opportunity.contract_start || !opportunity.contract_end)
      throw new Error("Preencha o início e o fim da vigência do contrato.");
    const termStart = Date.parse(`${opportunity.contract_start}T00:00:00Z`);
    const termEnd = Date.parse(`${opportunity.contract_end}T00:00:00Z`);
    if (!Number.isFinite(termStart) || !Number.isFinite(termEnd) || termEnd < termStart)
      throw new Error("A vigência do contrato está inválida.");
    if (![1, 10, 20].includes(Number(opportunity.application_day)))
      throw new Error("Defina o dia de aplicação do reajuste como 1, 10 ou 20.");
    if (termEnd - termStart > 365 * 86400000) {
      const readjustmentTotal =
        Number(opportunity.diesel_pct) +
        Number(opportunity.igpm_pct) +
        Number(opportunity.ipca_pct);
      const firstReadjustment = opportunity.first_readjustment_date
        ? Date.parse(`${opportunity.first_readjustment_date}T00:00:00Z`)
        : Number.NaN;
      if (
        Math.abs(readjustmentTotal - 100) > 0.001 ||
        !Number.isFinite(firstReadjustment) ||
        firstReadjustment < termStart ||
        firstReadjustment > termEnd
      )
        throw new Error(
          "Contratos com mais de 365 dias precisam de reajustes totalizando 100% e data do primeiro reajuste dentro da vigência.",
        );
    }
    if (!opportunity.contracting_parties?.trim() || !opportunity.vli_entity?.trim())
      throw new Error("Preencha a parte contratante e a entidade contratada VLI.");

    const syncedQuotes = await db
      .select()
      .from(quotes)
      .where(eq(quotes.opportunity_id, opportunityId));
    const quote = syncedQuotes.find(
      (row) => row.is_synced && row.status === "Sincronizada",
    );
    if (!quote) throw new Error("Conclua e sincronize uma Cotação antes de enviar o contrato.");
    if (!["Ok", "Aprovada"].includes(quote.price_status))
      throw new Error("Valide e aprove os preços da Cotação antes de enviar o contrato.");
    const approvals = await db
      .select()
      .from(quote_approvals)
      .where(eq(quote_approvals.quote_id, quote.id));
    if (approvals.some((approval) => approval.status === "Pendente"))
      throw new Error("Há uma aprovação de preço pendente para esta Cotação.");
    if (
      quote.price_status === "Aprovada" &&
      !approvals.some((approval) => approval.status === "Aprovada")
    )
      throw new Error("A aprovação precisa estar registrada na fila antes de enviar o contrato.");

    const [account] = await db.select().from(accounts).where(eq(accounts.id, opportunity.account_id));
    if (!account) throw new Error("A Conta de gestão da Oportunidade não foi encontrada.");
    const items = await db
      .select()
      .from(quote_line_items)
      .where(eq(quote_line_items.quote_id, quote.id));
    if (!items.length) throw new Error("A Cotação sincronizada não possui Itens.");

    const contractItems = await Promise.all(
      items.map(async (item) => {
        const [flow] = await db
          .select()
          .from(planned_flows)
          .where(eq(planned_flows.id, item.planned_flow_id));
        if (!flow) throw new Error("Um Fluxo Planejado da Cotação não foi encontrado.");
        const [[origin], [destination], [product], schedules] = await Promise.all([
          db.select().from(locations).where(eq(locations.id, flow.origin_id)),
          db.select().from(locations).where(eq(locations.id, flow.destination_id)),
          db.select().from(merchandise).where(eq(merchandise.id, flow.merchandise_id)),
          db
            .select()
            .from(quote_schedules)
            .where(eq(quote_schedules.quote_line_item_id, item.id))
            .orderBy(asc(quote_schedules.year), asc(quote_schedules.month)),
        ]);
        return {
          service: item.service,
          plannedFlowId: flow.id,
          flowCode: flow.code,
          modal: flow.modal,
          merchandise: product?.name ?? "—",
          unit: product?.unit ?? "—",
          origin: origin?.name ?? "—",
          destination: destination?.name ?? "—",
          schedules: schedules.map((schedule) => ({
            service: schedule.service,
            operation: schedule.operation ?? null,
            dieselBaseId: schedule.diesel_base_id,
            accessoryNetPct: schedule.accessory_net_pct,
            accessoryCbsPct: schedule.accessory_cbs_pct,
            year: schedule.year,
            month: schedule.month,
            period: `${schedule.year}-${String(schedule.month).padStart(2, "0")}`,
            frequency: schedule.frequency,
            periodWindow: schedule.period_window,
            plaza: schedule.plaza,
            division: schedule.division,
            volume: schedule.volume,
            tariffNet: Number(schedule.tariff_net),
            tariffCbs: schedule.tariff_cbs === null ? null : Number(schedule.tariff_cbs),
            accessoryNet: schedule.accessory_net === null ? null : Number(schedule.accessory_net),
            accessoryCbs: schedule.accessory_cbs === null ? null : Number(schedule.accessory_cbs),
            dieselBaseDate: schedule.diesel_base_date,
            tolerance: {
              vliVolume: schedule.tolerance_vli_volume,
              clientVolume: schedule.tolerance_client_volume,
              vliTariff: schedule.tolerance_vli_tariff,
              clientTariff: schedule.tolerance_client_tariff,
            },
          })),
        };
      }),
    );
    if (contractItems.some((item) => !item.schedules.length))
      throw new Error("Cada Item da Cotação precisa ter ao menos uma Agenda.");
    const termStartMonth = Number(
      opportunity.contract_start.slice(0, 4) + opportunity.contract_start.slice(5, 7),
    );
    const termEndMonth = Number(
      opportunity.contract_end.slice(0, 4) + opportunity.contract_end.slice(5, 7),
    );
    if (
      contractItems.some((item) =>
        item.schedules.some(
          (schedule) =>
            schedule.year * 100 + schedule.month < termStartMonth ||
            schedule.year * 100 + schedule.month > termEndMonth,
        ),
      )
    )
      throw new Error("Todas as Agendas precisam estar dentro da vigência do contrato.");
    const hasTakeOrPayTolerance = contractItems.some((item) =>
      item.schedules.some((schedule) =>
        [
          schedule.tolerance.vliVolume,
          schedule.tolerance.clientVolume,
          schedule.tolerance.vliTariff,
          schedule.tolerance.clientTariff,
        ].some((value) => Number(value) > 0),
      ),
    );
    if (opportunity.take_or_pay && !hasTakeOrPayTolerance)
      throw new Error("Take or Pay está marcado, mas as Agendas não possuem tolerâncias configuradas.");

    const now = new Date().toISOString();
    const currentContracts = await db
      .select({ netlex_number: netlex_contracts.netlex_number })
      .from(netlex_contracts);
    const netlexNumber = String(
      Math.max(18000, ...currentContracts.map((row) => Number(row.netlex_number) || 0)) + 1,
    );
    const contractId = crypto.randomUUID();
    if (isAddendum) {
      const addendum = await buildQuoteAddendum(quote.id);
      if (!addendum?.hasChanges)
        throw new Error("O aditivo não tem mudanças em relação ao contrato original.");
      const siblings = await db
        .select({ id: netlex_contracts.id })
        .from(netlex_contracts)
        .where(eq(netlex_contracts.base_contract_id, baseContract.id));
      const sequence = siblings.length + 1;
      const number = `${baseContract.netlex_number}-A${sequence}`;
      const addendumTitle = `Aditivo ${sequence} ao contrato ${baseContract.netlex_number} · ${account.name}`;
      const addendumDocument = {
        simulation: true,
        kind: "Aditivo",
        notice:
          "Aditivo demonstrativo do Playground: o NetLex recebe somente as mudanças, não o contrato inteiro.",
        title: addendumTitle,
        netlexNumber: number,
        status: NETLEX_WAITING,
        createdAt: now,
        baseContract: {
          id: baseContract.id,
          netlexNumber: baseContract.netlex_number,
          title: baseContract.title,
        },
        parties: {
          customerAccount: account.name,
          contractingParties: opportunity.contracting_parties
            .split(/[,;\n]/)
            .map((party) => party.trim())
            .filter(Boolean),
          contractedEntity: opportunity.vli_entity,
          jointDebtor: opportunity.joint_debtor || null,
        },
        opportunity: {
          id: opportunity.id,
          name: opportunity.name,
          instrumentType: opportunity.instrument_type,
          segment: opportunity.segment,
        },
        baseTerm: addendum.baseTerm,
        term: {
          start: opportunity.contract_start,
          end: opportunity.contract_end,
          applicationDay: opportunity.application_day,
        },
        commercialConditions: {
          quoteNumber: quote.quote_number,
          quoteName: quote.name,
          quoteId: quote.id,
          priceApproval: quote.price_status,
          tariffBasis: quote.tariff_mode || opportunity.integration_tariff,
          currency: "BRL",
        },
        readjustment: {
          dieselPct: Number(opportunity.diesel_pct),
          igpmPct: Number(opportunity.igpm_pct),
          ipcaPct: Number(opportunity.ipca_pct),
          firstReadjustmentDate: opportunity.first_readjustment_date,
        },
        takeOrPay: { enabled: !!opportunity.take_or_pay || hasTakeOrPayTolerance },
        summary: addendum.summary,
        changes: addendum.changes.filter((change) => change.operation !== "Manter"),
        clauses: addendum.clauses,
      };
      const addendumContract = {
        id: contractId,
        opportunity_id: opportunityId,
        netlex_number: number,
        title: addendumTitle,
        status: NETLEX_WAITING,
        kind: "Aditivo",
        base_contract_id: baseContract.id,
        document_json: JSON.stringify(addendumDocument),
        created_at: now,
        updated_at: now,
      };
      await db.insert(netlex_contracts).values(addendumContract);
      return {
        ok: true,
        created: true,
        contract: { ...addendumContract, document: addendumDocument },
      };
    }
    const title =
      opportunity.instrument_type === "ACS"
        ? `ACS · Acordo Contrato Simplificado · ${account.name}`
        : `Contrato de transporte · ${account.name}`;
    const document = {
      simulation: true,
      notice:
        "Documento demonstrativo do Playground. A integração externa e a validade jurídica dependem do NetLex.",
      title,
      netlexNumber,
      status: "Aguardando retorno da NetLex",
      createdAt: now,
      parties: {
        customerAccount: account.name,
        contractingParties: opportunity.contracting_parties
          .split(/[,;\n]/)
          .map((party) => party.trim())
          .filter(Boolean),
        contractedEntity: opportunity.vli_entity,
        jointDebtor: opportunity.joint_debtor || null,
      },
      opportunity: {
        id: opportunity.id,
        name: opportunity.name,
        instrumentType: opportunity.instrument_type,
        segment: opportunity.segment,
      },
      term: {
        start: opportunity.contract_start,
        end: opportunity.contract_end,
        applicationDay: opportunity.application_day,
      },
      kind: opportunity.instrument_type,
      commercialConditions: {
        quoteNumber: quote.quote_number,
        quoteName: quote.name,
        quoteId: quote.id,
        quoteStatus: quote.status,
        priceApproval: quote.price_status,
        tariffBasis: opportunity.integration_tariff,
        currency: "BRL",
      },
      readjustment: {
        dieselPct: Number(opportunity.diesel_pct),
        igpmPct: Number(opportunity.igpm_pct),
        ipcaPct: Number(opportunity.ipca_pct),
        firstReadjustmentDate: opportunity.first_readjustment_date,
      },
      takeOrPay: {
        enabled: !!opportunity.take_or_pay || hasTakeOrPayTolerance,
      },
      items: contractItems,
      manualCompletionNote:
        "Condições jurídicas complementares e questionário do NetLex não cobertos pelo Playground.",
    };
    const contract = {
      id: contractId,
      opportunity_id: opportunityId,
      netlex_number: netlexNumber,
      title,
      kind: opportunity.instrument_type,
      status: NETLEX_WAITING,
      document_json: JSON.stringify(document),
      created_at: now,
      updated_at: now,
    };
    await db.insert(netlex_contracts).values(contract);
    return { ok: true, created: true, contract: { ...contract, document } };
  },
);

export const getNetlexContractFull = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const [contract] = await db.select().from(netlex_contracts).where(eq(netlex_contracts.id, id));
    if (!contract) return null;
    const [opportunity] = await db
      .select({
        id: opportunities.id,
        name: opportunities.name,
        stage: opportunities.stage,
        instrument_type: opportunities.instrument_type,
      })
      .from(opportunities)
      .where(eq(opportunities.id, contract.opportunity_id));
    const [baseContract] = contract.base_contract_id
      ? await db
          .select({
            id: netlex_contracts.id,
            netlex_number: netlex_contracts.netlex_number,
            title: netlex_contracts.title,
            status: netlex_contracts.status,
          })
          .from(netlex_contracts)
          .where(eq(netlex_contracts.id, contract.base_contract_id))
      : [];
    return {
      contract,
      document: parseContractDocument(contract.document_json),
      opportunity: opportunity ?? null,
      baseContract: baseContract ?? null,
      addenda: await listContractAddenda(contract.id),
    };
  },
);

export const NETLEX_WAITING = "Aguardando retorno da NetLex";
export const NETLEX_SIGNATURE = "Assinatura";

/** Aditivos (RAT) e oportunidades aditivas de um contrato. */
async function listContractAddenda(contractId: string) {
  const [documents, addendumOpportunities] = await Promise.all([
    db
      .select({
        id: netlex_contracts.id,
        netlex_number: netlex_contracts.netlex_number,
        title: netlex_contracts.title,
        status: netlex_contracts.status,
        opportunity_id: netlex_contracts.opportunity_id,
        signed_at: netlex_contracts.signed_at,
      })
      .from(netlex_contracts)
      .where(eq(netlex_contracts.base_contract_id, contractId))
      .orderBy(asc(netlex_contracts.created_at)),
    db
      .select({ id: opportunities.id, name: opportunities.name, stage: opportunities.stage })
      .from(opportunities)
      .where(eq(opportunities.base_contract_id, contractId))
      .orderBy(asc(opportunities.created_at)),
  ]);
  return addendumOpportunities.map((opportunity) => ({
    ...opportunity,
    document: documents.find((doc) => doc.opportunity_id === opportunity.id) ?? null,
  }));
}

type DocSchedule = Record<string, any>;
type DocItem = Record<string, any> & { schedules: DocSchedule[] };

function docScheduleRow(schedule: DocSchedule) {
  const tariffNet = Number(schedule.tariffNet ?? 0);
  const tariffCbs = schedule.tariffCbs === null || schedule.tariffCbs === undefined ? null : Number(schedule.tariffCbs);
  const main = tariffCbs && tariffCbs > 0 ? tariffCbs : tariffNet;
  const pct = (value: unknown, explicit: unknown) =>
    explicit !== null && explicit !== undefined
      ? Number(explicit)
      : value === null || value === undefined
        ? null
        : main > 0
          ? Number(((Number(value) / main) * 100).toFixed(2))
          : 100;
  return {
    volume: Number(schedule.volume),
    tariff_cbs: tariffCbs,
    tariff_net: tariffNet,
    accessory_cbs: schedule.accessoryCbs ?? null,
    accessory_cbs_pct: pct(schedule.accessoryCbs, schedule.accessoryCbsPct),
    accessory_net: schedule.accessoryNet ?? null,
    accessory_net_pct: pct(schedule.accessoryNet, schedule.accessoryNetPct),
    diesel_base_date: schedule.dieselBaseDate ?? null,
    tolerance_vli_volume: schedule.tolerance?.vliVolume ?? 0,
    tolerance_client_volume: schedule.tolerance?.clientVolume ?? 0,
    tolerance_vli_tariff: schedule.tolerance?.vliTariff ?? 0,
    tolerance_client_tariff: schedule.tolerance?.clientTariff ?? 0,
  };
}

/**
 * Cotação aditiva: copia as Agendas do contrato vigente como linha de base
 * ("Manter"). O usuário altera, exclui ou inclui a partir dela.
 */
async function seedAddendumBaseline(
  quoteId: string,
  opp: typeof opportunities.$inferSelect,
) {
  if (!opp.base_contract_id) return;
  const [base] = await db
    .select()
    .from(netlex_contracts)
    .where(eq(netlex_contracts.id, opp.base_contract_id));
  if (!base) return;
  const doc = parseContractDocument(base.document_json);
  const items = (doc.items ?? []) as DocItem[];
  const [firstBase] = await db.select().from(diesel_bases).orderBy(asc(diesel_bases.name));
  const now = new Date().toISOString();
  const tariffBasis = String(doc.commercialConditions?.tariffBasis ?? opp.integration_tariff);
  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({ tariff_mode: tariffBasis === "CBS" ? "CBS" : "Líquida", updated_at: now })
      .where(eq(quotes.id, quoteId));
    for (const item of items) {
      let flowId = item.plannedFlowId as string | undefined;
      if (!flowId) {
        const [flow] = await tx
          .select({ id: planned_flows.id })
          .from(planned_flows)
          .where(and(eq(planned_flows.code, String(item.flowCode)), eq(planned_flows.account_id, opp.account_id)));
        flowId = flow?.id;
      }
      if (!flowId) continue;
      const itemId = crypto.randomUUID();
      await tx.insert(quote_line_items).values({
        id: itemId,
        quote_id: quoteId,
        planned_flow_id: flowId,
        service: String(item.service ?? "FRETE"),
        volume_total: 0,
        revenue_total: 0,
        top_eligible: 0,
        created_at: now,
        updated_at: now,
      });
      for (const schedule of item.schedules ?? []) {
        const values = docScheduleRow(schedule);
        const division = String(schedule.division ?? "Todas");
        const plaza = String(schedule.plaza ?? "TODAS_PRACAS_NACIONAL");
        const scheduleKey = `${item.flowCode}|${schedule.year}${String(schedule.month).padStart(2, "0")}|${division}|${plaza}`;
        const service = String(schedule.service ?? item.service ?? "FRETE");
        let dieselBaseId = schedule.dieselBaseId as string | undefined;
        if (!dieselBaseId) {
          const [previous] = await tx
            .select({ id: quote_schedules.diesel_base_id })
            .from(quote_schedules)
            .where(and(eq(quote_schedules.schedule_key, scheduleKey), eq(quote_schedules.service, service)));
          dieselBaseId = previous?.id ?? firstBase?.id;
        }
        if (!dieselBaseId) continue;
        await tx.insert(quote_schedules).values({
          id: crypto.randomUUID(),
          quote_line_item_id: itemId,
          schedule_key: scheduleKey,
          year: Number(schedule.year),
          month: Number(schedule.month),
          frequency: String(schedule.frequency ?? "Mensal"),
          period_window: String(schedule.periodWindow ?? "Mês"),
          division,
          plaza,
          service,
          diesel_base_id: dieselBaseId,
          ...values,
          operation: "Manter",
          base_snapshot: JSON.stringify(snapshotOf(values)),
          created_at: now,
          updated_at: now,
        } as typeof quote_schedules.$inferInsert);
      }
    }
  });
  await ensureRecommendedPricesForQuote(quoteId);
}

/** Mudanças, resumo e cláusulas da Cotação aditiva (motor de aditivo). */
async function buildQuoteAddendum(quoteId: string) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) return null;
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, quote.opportunity_id));
  if (!opp || opp.instrument_type !== "Aditivo" || !opp.base_contract_id) return null;
  const [base] = await db
    .select()
    .from(netlex_contracts)
    .where(eq(netlex_contracts.id, opp.base_contract_id));
  if (!base) return null;
  const baseDoc = parseContractDocument(base.document_json);
  const items = await db.select().from(quote_line_items).where(eq(quote_line_items.quote_id, quoteId));
  const changes: Array<AddendumChange & { itemService: string; plannedFlowId: string; dieselBaseId: string; frequency: string }> = [];
  for (const item of items) {
    const [flow] = await db.select().from(planned_flows).where(eq(planned_flows.id, item.planned_flow_id));
    if (!flow) continue;
    const [[origin], [destination], [product], schedules] = await Promise.all([
      db.select().from(locations).where(eq(locations.id, flow.origin_id)),
      db.select().from(locations).where(eq(locations.id, flow.destination_id)),
      db.select().from(merchandise).where(eq(merchandise.id, flow.merchandise_id)),
      db
        .select()
        .from(quote_schedules)
        .where(eq(quote_schedules.quote_line_item_id, item.id))
        .orderBy(asc(quote_schedules.year), asc(quote_schedules.month)),
    ]);
    for (const schedule of schedules) {
      const operation = effectiveOperation(schedule);
      const before = parseSnapshot(schedule.base_snapshot);
      changes.push({
        operation,
        flowCode: flow.code,
        route: `${origin?.code ?? "?"} → ${destination?.code ?? "?"}`,
        origin: origin?.name ?? "?",
        destination: destination?.name ?? "?",
        merchandise: product?.name ?? "?",
        unit: product?.unit ?? "",
        service: schedule.service,
        itemService: item.service,
        plannedFlowId: flow.id,
        dieselBaseId: schedule.diesel_base_id,
        frequency: schedule.frequency,
        year: schedule.year,
        month: schedule.month,
        periodWindow: schedule.period_window,
        plaza: schedule.plaza,
        division: schedule.division,
        before,
        after: operation === "Excluir" ? null : snapshotOf(schedule),
        fields: operation === "Alterar" ? changedFields(schedule, before) : [],
      });
    }
  }
  const baseTerm = {
    start: baseDoc.term?.start ?? null,
    end: baseDoc.term?.end ?? null,
    applicationDay: baseDoc.term?.applicationDay ?? null,
  };
  const newTerm = { start: opp.contract_start, end: opp.contract_end, applicationDay: opp.application_day };
  const baseReadjustment = baseDoc.readjustment
    ? {
        dieselPct: Number(baseDoc.readjustment.dieselPct ?? 0),
        igpmPct: Number(baseDoc.readjustment.igpmPct ?? 0),
        ipcaPct: Number(baseDoc.readjustment.ipcaPct ?? 0),
      }
    : null;
  const newReadjustment = {
    dieselPct: Number(opp.diesel_pct),
    igpmPct: Number(opp.igpm_pct),
    ipcaPct: Number(opp.ipca_pct),
  };
  const tariffBasis = quote.tariff_mode || opp.integration_tariff;
  const clauses = buildAddendumClauses({
    baseTerm,
    newTerm,
    baseReadjustment,
    newReadjustment,
    baseTakeOrPay: !!baseDoc.takeOrPay?.enabled,
    newTakeOrPay: !!opp.take_or_pay,
    changes,
    tariffBasis,
    applicationDay: Number(opp.application_day),
  });
  const summary = summarizeChanges(changes);
  const termChanged = baseTerm.end !== newTerm.end || baseTerm.start !== newTerm.start;
  return {
    baseContract: {
      id: base.id,
      netlex_number: base.netlex_number,
      title: base.title,
      status: base.status,
    },
    baseTerm,
    newTerm,
    termChanged,
    changes,
    summary,
    clauses,
    hasChanges: termChanged || summary.Incluir + summary.Alterar + summary.Excluir > 0 || clauses.length > 0,
  };
}

/** Aditivo em Assinatura: aplica as mudanças no contrato original e guarda a versão anterior. */
async function materializeAddendum(addendum: typeof netlex_contracts.$inferSelect, now: string) {
  if (!addendum.base_contract_id) return;
  const [base] = await db
    .select()
    .from(netlex_contracts)
    .where(eq(netlex_contracts.id, addendum.base_contract_id));
  if (!base) return;
  const baseDoc = parseContractDocument(base.document_json);
  const addendumDoc = parseContractDocument(addendum.document_json);
  const previous = { term: baseDoc.term, readjustment: baseDoc.readjustment, takeOrPay: baseDoc.takeOrPay, items: baseDoc.items };
  const items = JSON.parse(JSON.stringify(baseDoc.items ?? [])) as DocItem[];
  const sameSchedule = (schedule: DocSchedule, item: DocItem, change: Record<string, any>) =>
    Number(schedule.year) === Number(change.year) &&
    Number(schedule.month) === Number(change.month) &&
    String(schedule.plaza) === String(change.plaza) &&
    String(schedule.division) === String(change.division) &&
    String(schedule.service ?? item.service) === String(change.service);
  const toDocSchedule = (change: Record<string, any>) => {
    const after = change.after ?? {};
    return {
      service: change.service,
      dieselBaseId: change.dieselBaseId,
      accessoryNetPct: after.accessory_net_pct ?? null,
      accessoryCbsPct: after.accessory_cbs_pct ?? null,
      year: change.year,
      month: change.month,
      period: `${change.year}-${String(change.month).padStart(2, "0")}`,
      frequency: change.frequency ?? "Mensal",
      periodWindow: change.periodWindow,
      plaza: change.plaza,
      division: change.division,
      volume: after.volume,
      tariffNet: Number(after.tariff_net ?? 0),
      tariffCbs: after.tariff_cbs ?? null,
      accessoryNet: after.accessory_net ?? null,
      accessoryCbs: after.accessory_cbs ?? null,
      dieselBaseDate: after.diesel_base_date ?? null,
      tolerance: {
        vliVolume: after.tolerance_vli_volume ?? 0,
        clientVolume: after.tolerance_client_volume ?? 0,
        vliTariff: after.tolerance_vli_tariff ?? 0,
        clientTariff: after.tolerance_client_tariff ?? 0,
      },
    };
  };
  for (const change of (addendumDoc.changes ?? []) as Array<Record<string, any>>) {
    let item = items.find(
      (entry) => entry.flowCode === change.flowCode && String(entry.service) === String(change.itemService ?? change.service),
    );
    if (change.operation === "Incluir" && !item) {
      item = {
        service: change.itemService ?? change.service,
        plannedFlowId: change.plannedFlowId,
        flowCode: change.flowCode,
        modal: "Ferroviário",
        merchandise: change.merchandise,
        unit: change.unit,
        origin: change.origin,
        destination: change.destination,
        schedules: [],
      };
      items.push(item);
    }
    if (!item) continue;
    const index = item.schedules.findIndex((schedule) => sameSchedule(schedule, item!, change));
    if (change.operation === "Excluir" && index >= 0) item.schedules.splice(index, 1);
    if (change.operation === "Alterar" && index >= 0) item.schedules[index] = toDocSchedule(change);
    if (change.operation === "Incluir" && index < 0) item.schedules.push(toDocSchedule(change));
    item.schedules.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month));
  }
  const versions = (baseDoc.versions as Array<Record<string, any>> | undefined) ?? [
    {
      version: 1,
      label: "Contrato original",
      effectiveAt: base.signed_at ?? base.created_at,
      term: baseDoc.term,
    },
  ];
  versions[versions.length - 1] = { ...versions[versions.length - 1], snapshot: previous };
  versions.push({
    version: versions.length + 1,
    label: `Aditivo ${addendum.netlex_number}`,
    addendumId: addendum.id,
    effectiveAt: now,
    term: addendumDoc.term,
    summary: addendumDoc.summary,
    clauses: (addendumDoc.clauses ?? []).map((clause: Record<string, any>) => clause.title),
  });
  const nextDoc = {
    ...baseDoc,
    items: items.filter((item) => item.schedules.length),
    term: { ...baseDoc.term, start: addendumDoc.term?.start ?? baseDoc.term?.start, end: addendumDoc.term?.end ?? baseDoc.term?.end },
    readjustment: addendumDoc.readjustment ?? baseDoc.readjustment,
    takeOrPay: addendumDoc.takeOrPay ?? baseDoc.takeOrPay,
    versions,
    lastAddendum: addendum.netlex_number,
  };
  await db
    .update(netlex_contracts)
    .set({ document_json: JSON.stringify(nextDoc), updated_at: now })
    .where(eq(netlex_contracts.id, base.id));
}

/** Simula o analista do NetLex mudando o documento para Assinatura. */
export const moveNetlexContractToSignature = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const [contract] = await db.select().from(netlex_contracts).where(eq(netlex_contracts.id, id));
    if (!contract) throw new Error("Documento NetLex não encontrado.");
    if (contract.status === NETLEX_SIGNATURE) return { ok: true, changed: false };
    if (contract.status !== NETLEX_WAITING)
      throw new Error("Só é possível ir para Assinatura a partir de Aguardando retorno da NetLex.");
    const now = new Date().toISOString();
    const doc = parseContractDocument(contract.document_json);
    await db
      .update(netlex_contracts)
      .set({
        status: NETLEX_SIGNATURE,
        signed_at: now,
        document_json: JSON.stringify({ ...doc, status: NETLEX_SIGNATURE, signedAt: now }),
        updated_at: now,
      })
      .where(eq(netlex_contracts.id, id));
    if (contract.kind === "Aditivo") await materializeAddendum(contract, now);
    return { ok: true, changed: true };
  });

/** Cria a Oportunidade aditiva a partir de um Contrato em Assinatura (ACS não gera aditivo). */
export const createAddendumOpportunity = createServerFn({ method: "POST" })
  .inputValidator((data: { contractId: string }) => data)
  .handler(async ({ data: input }) => {
    await ensureSchema();
    const { contractId } = input as { contractId: string };
    const [base] = await db.select().from(netlex_contracts).where(eq(netlex_contracts.id, contractId));
    if (!base) throw new Error("Contrato não encontrado.");
    if (base.kind !== "Contrato")
      throw new Error("Somente Contrato gera aditivo. ACS e aditivos não podem ser aditados.");
    if (base.status !== NETLEX_SIGNATURE)
      throw new Error("O contrato precisa estar em Assinatura no NetLex para receber aditivo.");
    const [baseOpportunity] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, base.opportunity_id));
    if (!baseOpportunity) throw new Error("Oportunidade do contrato não encontrada.");
    const doc = parseContractDocument(base.document_json);
    const existing = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.base_contract_id, base.id));
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const [account] = await db.select().from(accounts).where(eq(accounts.id, baseOpportunity.account_id));
    await db.insert(opportunities).values({
      id,
      account_id: baseOpportunity.account_id,
      name: `Aditivo ${existing.length + 1} · Contrato ${base.netlex_number} · ${account?.name ?? ""}`.trim(),
      instrument_type: "Aditivo",
      stage: "Prospecção",
      segment: baseOpportunity.segment,
      amount: 0,
      close_date: baseOpportunity.close_date,
      contract_start: doc.term?.start ?? baseOpportunity.contract_start,
      contract_end: doc.term?.end ?? baseOpportunity.contract_end,
      first_readjustment_date: doc.readjustment?.firstReadjustmentDate ?? baseOpportunity.first_readjustment_date,
      application_day: Number(doc.term?.applicationDay ?? baseOpportunity.application_day),
      diesel_pct: Number(doc.readjustment?.dieselPct ?? baseOpportunity.diesel_pct),
      igpm_pct: Number(doc.readjustment?.igpmPct ?? baseOpportunity.igpm_pct),
      ipca_pct: Number(doc.readjustment?.ipcaPct ?? baseOpportunity.ipca_pct),
      contracting_parties: baseOpportunity.contracting_parties,
      vli_entity: baseOpportunity.vli_entity,
      joint_debtor: baseOpportunity.joint_debtor,
      integration_tariff:
        String(doc.commercialConditions?.tariffBasis ?? baseOpportunity.integration_tariff) === "CBS"
          ? "CBS"
          : "Líquida",
      take_or_pay: doc.takeOrPay?.enabled ? 1 : 0,
      base_contract_id: base.id,
      created_at: now,
      updated_at: now,
    });
    return { ok: true, id };
  });

/** Aditivo: marca (ou restaura) uma Agenda do contrato como "Excluir". */
export const setAddendumScheduleExclusion = createServerFn({ method: "POST" })
  .inputValidator((data: { quoteId: string; scheduleKey: string; exclude: boolean }) => data)
  .handler(async ({ data: input }) => {
    await ensureSchema();
    const { quoteId, scheduleKey, exclude } = input as {
      quoteId: string;
      scheduleKey: string;
      exclude: boolean;
    };
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote || quote.status !== "Rascunho" || quote.is_synced)
      throw new Error("Só é possível editar uma Cotação em Rascunho.");
    const rows = await quoteSchedulesByKey(quoteId, scheduleKey);
    if (!rows.length || rows.some((row) => !row.base_snapshot))
      throw new Error("Somente Agendas do contrato vigente podem ser excluídas no aditivo.");
    for (const row of rows)
      await db
        .update(quote_schedules)
        .set({ operation: exclude ? "Excluir" : null, updated_at: new Date().toISOString() })
        .where(eq(quote_schedules.id, row.id));
    await markQuotePricesStale(quoteId);
    return { ok: true };
  });

/**
 * Aditivo: embaralha as Agendas com uma seed nova. Volta tudo à linha de base
 * (Agendas, vigência e reajuste do contrato vigente) e sorteia um cenário em
 * que pelo menos 60% das Agendas mudam (alterar/excluir) e cerca de 30% são
 * incluídas. As regras de data estão documentadas em `addendum-shuffle.ts`.
 */
export const shuffleAddendumQuote = createServerFn({ method: "POST" })
  .inputValidator((data: { quoteId: string; seed?: number }) => data)
  .handler(async ({ data: input }) => {
    await ensureSchema();
    const { quoteId, seed: requestedSeed } = input as { quoteId: string; seed?: number };
    const seed = Number.isInteger(requestedSeed) ? Number(requestedSeed) : randomSeed();
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote || quote.status !== "Rascunho" || quote.is_synced)
      throw new Error("Só é possível embaralhar uma Cotação em Rascunho.");
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, quote.opportunity_id));
    if (!opp || opp.instrument_type !== "Aditivo" || !opp.base_contract_id)
      throw new Error("O shuffle existe somente para Cotações de aditivo.");
    if (opp.stage !== "Negociação") throw new Error("A oportunidade vinculada precisa estar em Negociação.");
    if (![1, 10, 20].includes(Number(opp.application_day)))
      throw new Error("Defina na Oportunidade um dia de aplicação igual a 1, 10 ou 20.");
    const [base] = await db.select().from(netlex_contracts).where(eq(netlex_contracts.id, opp.base_contract_id));
    if (!base) throw new Error("Contrato original não encontrado.");
    const baseDoc = parseContractDocument(base.document_json);
    const baseStart = String(baseDoc.term?.start ?? opp.contract_start ?? "");
    const baseEnd = String(baseDoc.term?.end ?? opp.contract_end ?? "");
    if (!baseStart || !baseEnd) throw new Error("O contrato original precisa ter início e fim de vigência.");
    const monthOf = (iso: string) => Number(iso.slice(0, 4)) * 100 + Number(iso.slice(5, 7));

    const items = await db.select().from(quote_line_items).where(eq(quote_line_items.quote_id, quoteId));
    const rows = await quoteScheduleRows(quoteId);
    const baselineRows = rows.filter((row) => row.base_snapshot);
    if (!baselineRows.length) throw new Error("A Cotação não tem Agendas do contrato vigente.");
    const itemById = new Map(items.map((item) => [item.id, item]));

    // Valores de cada linha da base, como no contrato vigente.
    const restored = new Map<string, Partial<typeof quote_schedules.$inferInsert>>();
    for (const row of baselineRows) {
      const snap = parseSnapshot(row.base_snapshot) ?? {};
      const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
      restored.set(row.id, {
        volume: Number(snap.volume ?? row.volume),
        tariff_cbs: num(snap.tariff_cbs),
        tariff_net: Number(snap.tariff_net ?? 0),
        accessory_cbs: num(snap.accessory_cbs),
        accessory_cbs_pct: num(snap.accessory_cbs_pct),
        accessory_net: num(snap.accessory_net),
        accessory_net_pct: num(snap.accessory_net_pct),
        diesel_base_date: snap.diesel_base_date === null || snap.diesel_base_date === undefined ? null : String(snap.diesel_base_date),
        tolerance_vli_volume: num(snap.tolerance_vli_volume),
        tolerance_client_volume: num(snap.tolerance_client_volume),
        tolerance_vli_tariff: num(snap.tolerance_vli_tariff),
        tolerance_client_tariff: num(snap.tolerance_client_tariff),
      });
    }
    const groupMap = new Map<string, ShuffleGroup>();
    for (const row of baselineRows) {
      const item = itemById.get(row.quote_line_item_id);
      if (!item) continue;
      const values = restored.get(row.id) as Record<string, any>;
      const group =
        groupMap.get(row.schedule_key) ??
        ({ key: row.schedule_key, flowId: item.planned_flow_id, year: row.year, month: row.month, rows: [] } as ShuffleGroup);
      group.rows.push({
        id: row.id,
        itemId: item.id,
        service: row.service,
        diesel_base_id: row.diesel_base_id,
        frequency: row.frequency,
        period_window: row.period_window,
        division: row.division,
        plaza: row.plaza,
        ...values,
      } as ShuffleGroup["rows"][number]);
      groupMap.set(row.schedule_key, group);
    }

    // Preço recomendado do Jetsons (mock) e Fluxos ainda fora da Cotação.
    const [locationRows, merchandiseRows, accountFlows] = await Promise.all([
      db.select().from(locations),
      db.select().from(merchandise),
      db.select().from(planned_flows).where(eq(planned_flows.account_id, opp.account_id)),
    ]);
    const locationById = new Map(locationRows.map((row) => [row.id, row]));
    const merchandiseById = new Map(merchandiseRows.map((row) => [row.id, row]));
    const flowById = new Map(accountFlows.map((row) => [row.id, row]));
    const quoteFlowIds = new Set(items.map((item) => item.planned_flow_id));
    const dieselBaseId = baselineRows[0].diesel_base_id;
    const newFlows = accountFlows
      .filter((flow) => flow.modal === "Ferroviário" && flow.origin_system === "FLOU" && !quoteFlowIds.has(flow.id))
      .map((flow) => ({ flowId: flow.id, dieselBaseId }));
    const recommended = (flowId: string, service: string, year: number, month: number) => {
      const flow = flowById.get(flowId);
      const origin = locationById.get(flow?.origin_id ?? "");
      const destination = locationById.get(flow?.destination_id ?? "");
      if (!flow || !origin || !destination) throw new Error("Fluxo sem origem/destino cadastrados.");
      return jetsonsUnitPrice({
        origin: origin as JetsonsEndpoint,
        destination: destination as JetsonsEndpoint,
        merchandise: merchandiseById.get(flow.merchandise_id)?.name ?? "",
        service,
        year,
        month,
      });
    };

    const today = new Date();
    const plan = planAddendumShuffle({
      seed,
      groups: [...groupMap.values()],
      tariffMode: quote.tariff_mode || opp.integration_tariff,
      applicationDay: Number(opp.application_day),
      startPeriod: monthOf(baseStart),
      endPeriod: monthOf(baseEnd),
      todayPeriod: today.getUTCFullYear() * 100 + today.getUTCMonth() + 1,
      newFlows,
      recommended,
    });

    // Vigência: início e fim voltam ao contrato; agenda depois do fim prorroga.
    let newEnd = baseEnd;
    if (plan.lastPeriod > monthOf(baseEnd)) {
      const year = Math.floor(plan.lastPeriod / 100),
        month = plan.lastPeriod % 100;
      newEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    }
    const readjustment = baseDoc.readjustment as Record<string, any> | undefined;
    let dieselPct = Number(readjustment?.dieselPct ?? opp.diesel_pct);
    let igpmPct = Number(readjustment?.igpmPct ?? opp.igpm_pct);
    let ipcaPct = Number(readjustment?.ipcaPct ?? opp.ipca_pct);
    let firstReadjustment: string | null = readjustment?.firstReadjustmentDate ?? opp.first_readjustment_date ?? null;
    let readjustmentConfigured = false;
    const termDays = Math.round(
      (Date.parse(`${newEnd}T00:00:00Z`) - Date.parse(`${baseStart}T00:00:00Z`)) / 86400000,
    );
    if (termDays > 365) {
      // Vigência acima de 365 dias exige reajuste anual (Diesel + IGP-M + IPCA = 100%).
      const outOfTerm =
        !firstReadjustment || firstReadjustment < baseStart || firstReadjustment > newEnd;
      if (Math.abs(dieselPct + igpmPct + ipcaPct - 100) > 0.001 || outOfTerm) {
        if (Math.abs(dieselPct + igpmPct + ipcaPct - 100) > 0.001) {
          dieselPct = 50;
          igpmPct = 25;
          ipcaPct = 25;
        }
        if (outOfTerm) {
          const start = new Date(`${baseStart}T00:00:00Z`);
          firstReadjustment = new Date(
            Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()),
          )
            .toISOString()
            .slice(0, 10);
        }
        readjustmentConfigured = true;
      }
    }

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      // 1. Volta à linha de base.
      const addedIds = rows.filter((row) => !row.base_snapshot).map((row) => row.id);
      if (addedIds.length) await tx.delete(quote_schedules).where(inArray(quote_schedules.id, addedIds));
      for (const row of baselineRows)
        await tx
          .update(quote_schedules)
          .set({ ...restored.get(row.id), operation: "Manter", updated_at: now })
          .where(eq(quote_schedules.id, row.id));
      const baselineItemIds = new Set(baselineRows.map((row) => row.quote_line_item_id));
      const orphanItems = items.filter((item) => !baselineItemIds.has(item.id)).map((item) => item.id);
      if (orphanItems.length) await tx.delete(quote_line_items).where(inArray(quote_line_items.id, orphanItems));

      // 2. Excluir.
      for (const key of plan.excludedKeys) {
        const group = groupMap.get(key);
        if (!group) continue;
        await tx
          .update(quote_schedules)
          .set({ operation: "Excluir", updated_at: now })
          .where(inArray(quote_schedules.id, group.rows.map((row) => row.id)));
      }

      // 3. Alterar.
      for (const entry of plan.altered)
        for (const { rowId, patch } of entry.patches)
          if (Object.keys(patch).length)
            await tx
              .update(quote_schedules)
              .set({ ...patch, updated_at: now })
              .where(eq(quote_schedules.id, rowId));

      // 4. Incluir.
      const createdItems = new Map<string, string>();
      for (const group of plan.created) {
        const flow = flowById.get(group.flowId);
        if (!flow) continue;
        const scheduleKey = `${flow.code}|${group.year}${String(group.month).padStart(2, "0")}|${group.division}|${group.plaza}`;
        for (const entry of group.rows) {
          let itemId = entry.itemId;
          if (!itemId) {
            const itemKey = `${group.flowId}|${entry.service}`;
            itemId = createdItems.get(itemKey) ?? null;
            if (!itemId) {
              itemId = crypto.randomUUID();
              createdItems.set(itemKey, itemId);
              await tx.insert(quote_line_items).values({
                id: itemId,
                quote_id: quoteId,
                planned_flow_id: group.flowId,
                service: entry.service,
                volume_total: 0,
                revenue_total: 0,
                top_eligible: 0,
                created_at: now,
                updated_at: now,
              });
            }
          }
          await tx.insert(quote_schedules).values({
            id: crypto.randomUUID(),
            quote_line_item_id: itemId,
            schedule_key: scheduleKey,
            year: group.year,
            month: group.month,
            frequency: group.frequency,
            period_window: group.period_window,
            division: group.division,
            plaza: group.plaza,
            volume: group.volume,
            tariff_cbs: entry.tariff_cbs,
            tariff_net: entry.tariff_net,
            diesel_base_id: group.diesel_base_id,
            diesel_base_date: group.diesel_base_date,
            service: entry.service,
            accessory_cbs: entry.accessory_cbs,
            accessory_cbs_pct: entry.accessory_cbs_pct,
            accessory_net: entry.accessory_net,
            accessory_net_pct: entry.accessory_net_pct,
            tolerance_vli_volume: entry.tolerance_vli_volume,
            tolerance_client_volume: entry.tolerance_client_volume,
            tolerance_vli_tariff: entry.tolerance_vli_tariff,
            tolerance_client_tariff: entry.tolerance_client_tariff,
            operation: "Incluir",
            base_snapshot: null,
            created_at: now,
            updated_at: now,
          } as typeof quote_schedules.$inferInsert);
        }
      }

      // 5. Vigência e reajuste.
      await tx
        .update(opportunities)
        .set({
          contract_start: baseStart,
          contract_end: newEnd,
          diesel_pct: dieselPct,
          igpm_pct: igpmPct,
          ipca_pct: ipcaPct,
          first_readjustment_date: firstReadjustment,
          updated_at: now,
        })
        .where(eq(opportunities.id, opp.id));
    });
    await ensureRecommendedPricesForQuote(quoteId);
    await markQuotePricesStale(quoteId);
    const modified = plan.excludedKeys.length + plan.altered.length;
    return {
      ok: true,
      baseline: plan.baselineGroups,
      modified,
      excluded: plan.excludedKeys.length,
      altered: plan.altered.length,
      included: plan.created.length,
      extendedEnd: newEnd !== baseEnd ? newEnd : null,
      readjustmentConfigured,
    };
  });

/** Agendas do contrato vigente não são apagadas: no aditivo elas são marcadas como Excluir. */
async function assertNotAddendumBaseline(table: string, ids: string[]) {
  if (!ids.length) return;
  if (table === "quote_schedules") {
    const rows = await db
      .select({ id: quote_schedules.id, base: quote_schedules.base_snapshot })
      .from(quote_schedules)
      .where(inArray(quote_schedules.id, ids));
    if (rows.some((row) => row.base))
      throw new Error("Esta Agenda faz parte do contrato vigente. Use “Excluir no aditivo” para retirá-la.");
  }
  if (table === "quote_line_items") {
    const rows = await db
      .select({ id: quote_schedules.id, base: quote_schedules.base_snapshot })
      .from(quote_schedules)
      .where(inArray(quote_schedules.quote_line_item_id, ids));
    if (rows.some((row) => row.base))
      throw new Error("Este Item tem Agendas do contrato vigente. Marque-as como “Excluir no aditivo”.");
  }
}

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
      price_status: quotes.price_status,
      max_discount_pct: quotes.max_discount_pct,
      alcada_level: quotes.alcada_level,
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
      price_status: quotes.price_status,
      max_discount_pct: quotes.max_discount_pct,
      alcada_level: quotes.alcada_level,
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
  const flowIds = [...new Set(items.map((item) => item.planned_flow_id))];
  const priceRows = flowIds.length
    ? await db
        .select()
        .from(recommended_prices)
        .where(inArray(recommended_prices.planned_flow_id, flowIds))
    : [];
  const priceMap = new Map(
    priceRows.map((price) => [
      `${price.planned_flow_id}|${price.service}|${price.year}|${price.month}`,
      Number(price.unit_price),
    ]),
  );
  const { thresholds } = await readAppSettings();
  const itemsWithPrices = fullItems.map((item) => ({
    ...item,
    schedules: item.schedules.map((schedule) => ({
      ...schedule,
      recommended_unit:
        priceMap.get(
          `${item.planned_flow_id}|${schedule.service}|${schedule.year}|${schedule.month}`,
        ) ?? null,
    })),
  }));
  const addendum = quote.instrument_type === "Aditivo" ? await buildQuoteAddendum(id) : null;
  return { quote, items: itemsWithPrices, thresholds, addendum };
});

export const listQuoteOptions = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { opportunityId } = input as { opportunityId: string };
    const [opportunity] = await db
      .select({
        id: opportunities.id,
        account_id: opportunities.account_id,
        instrument_type: opportunities.instrument_type,
        segment: opportunities.segment,
        stage: opportunities.stage,
        integration_tariff: opportunities.integration_tariff,
        contract_start: opportunities.contract_start,
        contract_end: opportunities.contract_end,
        first_readjustment_date: opportunities.first_readjustment_date,
        application_day: opportunities.application_day,
        diesel_pct: opportunities.diesel_pct,
        igpm_pct: opportunities.igpm_pct,
        ipca_pct: opportunities.ipca_pct,
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
    if (
      ![
        "locations",
        "merchandise",
        "diesel_bases",
        "planned_flows",
        "approvers",
        "recommended_prices",
      ].includes(table)
    )
      throw new Error("Cadastro ferroviário inválido.");
    if (table === "recommended_prices") {
      return db
        .select({
          id: recommended_prices.id,
          planned_flow_id: recommended_prices.planned_flow_id,
          flow_code: planned_flows.code,
          service: recommended_prices.service,
          year: recommended_prices.year,
          month: recommended_prices.month,
          unit_price: recommended_prices.unit_price,
          source: recommended_prices.source,
          created_at: recommended_prices.created_at,
          updated_at: recommended_prices.updated_at,
        })
        .from(recommended_prices)
        .innerJoin(planned_flows, eq(recommended_prices.planned_flow_id, planned_flows.id))
        .orderBy(asc(planned_flows.code), asc(recommended_prices.year), asc(recommended_prices.month));
    }
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
    if (
      ![
        "locations",
        "merchandise",
        "diesel_bases",
        "planned_flows",
        "approvers",
        "recommended_prices",
      ].includes(table)
    )
      throw new Error("Cadastro ferroviário inválido.");
    if (table === "recommended_prices") {
      const [record] = await db
        .select({
          id: recommended_prices.id,
          planned_flow_id: recommended_prices.planned_flow_id,
          flow_code: planned_flows.code,
          service: recommended_prices.service,
          year: recommended_prices.year,
          month: recommended_prices.month,
          unit_price: recommended_prices.unit_price,
          source: recommended_prices.source,
          created_at: recommended_prices.created_at,
          updated_at: recommended_prices.updated_at,
        })
        .from(recommended_prices)
        .innerJoin(planned_flows, eq(recommended_prices.planned_flow_id, planned_flows.id))
        .where(eq(recommended_prices.id, id));
      if (!record) return null;
      return {
        ...record,
        name: `${record.flow_code} · ${record.service} · ${String(record.month).padStart(2, "0")}/${record.year}`,
      };
    }
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
  if (!["Ok", "Aprovada"].includes(quote.price_status))
    throw new Error("Valide os preços da Cotação antes de sincronizar.");
  const [opportunity] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, quote.opportunity_id));
  if (opportunity?.stage !== "Negociação")
    throw new Error("A oportunidade precisa estar em Negociação.");
  if (
    opportunity.segment !== "Ferroviário" ||
    !QUOTE_INSTRUMENTS.includes(opportunity.instrument_type)
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
    !QUOTE_INSTRUMENTS.includes(opp.instrument_type)
  )
    throw new Error(
      "A Cotação precisa pertencer a uma oportunidade ferroviária de Contrato ou ACS em Negociação.",
    );
  if (!opp.contract_start || !opp.contract_end)
    throw new Error(
      "Preencha o início e o fim da vigência na Oportunidade antes de concluir a Cotação.",
    );
  const contractDays = Math.round(
    (Date.parse(`${opp.contract_end}T00:00:00Z`) - Date.parse(`${opp.contract_start}T00:00:00Z`)) /
      86400000,
  );
  if (contractDays > 365) {
    const percentageTotal = Number(opp.diesel_pct) + Number(opp.igpm_pct) + Number(opp.ipca_pct);
    if (Math.abs(percentageTotal - 100) > 0.001)
      throw new Error(
        "Para vigência superior a 365 dias, Diesel + IGP-M + IPCA precisam somar 100%.",
      );
    if (!opp.first_readjustment_date)
      throw new Error("Informe a data do primeiro reajuste na Oportunidade.");
    const firstDate = Date.parse(`${opp.first_readjustment_date}T00:00:00Z`);
    if (
      firstDate < Date.parse(`${opp.contract_start}T00:00:00Z`) ||
      firstDate > Date.parse(`${opp.contract_end}T00:00:00Z`)
    )
      throw new Error("A data do primeiro reajuste precisa estar dentro da vigência do contrato.");
  }
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
  if (opp.instrument_type === "Aditivo") {
    const addendum = await buildQuoteAddendum(id);
    if (!addendum) throw new Error("A Oportunidade de aditivo precisa de um contrato base.");
    if (!addendum.hasChanges)
      throw new Error(
        "O aditivo precisa de ao menos uma mudança: inclua, altere ou exclua uma Agenda, ou altere a vigência.",
      );
  }
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
  const priceCheck = await computeQuotePriceComparison(id);
  if (priceCheck.rows.some((row) => row.missing))
    throw new Error(
      "Preço recomendado não encontrado no Jetsons para um ou mais Itens. Gere os preços recomendados ausentes na Cotação e valide novamente.",
    );
  if (priceCheck.price_status === "Pendente alçada") {
    await upsertOpenApproval(id, priceCheck);
    throw new Error(
      `Desvio de preço de ${priceCheck.max_discount_pct.toFixed(2)}% exige aprovação. A solicitação foi enviada para a fila.`,
    );
  }
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
    .select({
      id: planned_flows.id,
      modal: planned_flows.modal,
      origin_system: planned_flows.origin_system,
    })
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
    const locationRows = await db.select().from(locations);
    const locationById = new Map(locationRows.map((location) => [location.id, location]));
    const merchRows = await db.select().from(merchandise);
    const merchById = new Map(merchRows.map((entry) => [entry.id, entry]));
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
        const originLoc = locationById.get(flow.origin_id);
        const destinationLoc = locationById.get(flow.destination_id);
        const merchName = merchById.get(flow.merchandise_id)?.name ?? "";
        if (!originLoc || !destinationLoc)
          throw new Error("Fluxo sem origem/destino cadastrados.");
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
        // schedule_key identifica agendas dentro da Cotação, não do Fluxo
        // globalmente: cotações alternativas da mesma Oportunidade precisam
        // poder reutilizar o mesmo período e praça.
        const used = new Set<string>();
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
          const useCbs = opp.integration_tariff === "CBS";
          // Preço de mercado do Jetsons por serviço; o preço praticado oscila em
          // torno dele (desconto de até 13% ou ágio de até 6%) para simular
          // cenários de competitividade e alçada.
          const marketRows = serviceNames.map((service) => {
            const recommended = jetsonsUnitPrice({
              origin: originLoc,
              destination: destinationLoc,
              merchandise: merchName,
              service,
              year,
              month,
            });
            const practiced = Math.max(
              1,
              Number(
                (recommended * (1 + f.number.float({ min: -0.13, max: 0.06 }))).toFixed(2),
              ),
            );
            return { service, practiced };
          });
          const tariffCents = marketRows.reduce(
            (sum, row) => sum + Math.round(row.practiced * 100),
            0,
          );
          for (let index = 0; index < serviceNames.length; index++) {
            const service = serviceNames[index];
            const shareCents = Math.round(marketRows[index].practiced * 100);
            const sharePct = Number(((shareCents / tariffCents) * 100).toFixed(2));
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
              accessory_cbs: useCbs ? shareCents / 100 : null,
              accessory_cbs_pct: useCbs ? sharePct : null,
              accessory_net: useCbs ? null : shareCents / 100,
              accessory_net_pct: useCbs ? null : sharePct,
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
    await ensureRecommendedPricesForQuote(quoteId);
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

/** Instrumentos que usam Cotação ferroviária. Aditivo parte de um Contrato assinado. */
const QUOTE_INSTRUMENTS = ["Contrato", "ACS", "Aditivo"];

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
    const quoteRows = await db
      .select()
      .from(quotes)
      .where(eq(quotes.opportunity_id, recordId));
    const syncedQuote = quoteRows.find(
      (row) => row.is_synced && row.status === "Sincronizada",
    );
    if (!syncedQuote)
      throw new Error("Conclua e sincronize uma Cotação antes de formalizar.");
    if (!["Ok", "Aprovada"].includes(syncedQuote.price_status))
      throw new Error("A aprovação de preço precisa estar resolvida antes de formalizar.");
    const approvals = await db
      .select()
      .from(quote_approvals)
      .where(eq(quote_approvals.quote_id, syncedQuote.id));
    if (approvals.some((approval) => approval.status === "Pendente"))
      throw new Error("Há uma aprovação de preço pendente para esta Cotação.");
    if (
      syncedQuote.price_status === "Aprovada" &&
      !approvals.some((approval) => approval.status === "Aprovada")
    )
      throw new Error("A decisão de aprovação da Cotação ainda não foi registrada.");
    return;
  }
  if (current.stage === "Formalização" && nextStage === "Fechado") {
    const [contract] = await db
      .select()
      .from(netlex_contracts)
      .where(eq(netlex_contracts.opportunity_id, recordId));
    if (!contract) throw new Error("Envie o contrato ao NetLex antes de fechar a Oportunidade.");
    if (contract.status !== NETLEX_SIGNATURE)
      throw new Error("No NetLex, mude o status do documento para Assinatura antes de fechar.");
    return;
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
    targetMonth < 1 ||
    targetMonth > 12 ||
    date.getUTCMonth() + 1 !== targetMonth ||
    date.getUTCFullYear() !== targetYear
  )
    throw new Error(
      "A Data base diesel precisa ter uma data válida e o dia de aplicação da Oportunidade.",
    );
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
  if (opp.segment !== "Ferroviário" || !QUOTE_INSTRUMENTS.includes(opp.instrument_type))
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
  // A chave identifica a Agenda dentro da Cotação: Cotações alternativas e a
  // linha de base de um aditivo reutilizam os mesmos períodos.
  const duplicates = await quoteSchedulesByKey(item.quote_id, scheduleKey);
  // Volume e Base Diesel são do grupo: ao editar uma linha, o saveRecord replica
  // nos serviços irmãos. As tarifas do grupo precisam continuar iguais.
  if (
    duplicates.some(
      (row) =>
        row.id !== recordId &&
        (Number(row.tariff_cbs ?? 0) !== Number(cbs ?? 0) ||
          Number(row.tariff_net ?? 0) !== Number(net ?? 0) ||
          (!recordId &&
            (row.volume !== volume || row.diesel_base_id !== d.diesel_base_id))),
    )
  )
    throw new Error(
      "Volume, tarifas, Base Diesel e data precisam ser iguais nas linhas da mesma Agenda.",
    );
  if (duplicates.some((row) => row.id !== recordId)) {
    const matching = duplicates;
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
async function assertOpportunityContractUnchanged(
  recordId: string | null | undefined,
  data: Record<string, unknown>,
) {
  if (!recordId) return;
  const [sentContract] = await db
    .select({ id: netlex_contracts.id })
    .from(netlex_contracts)
    .where(eq(netlex_contracts.opportunity_id, recordId));
  if (!sentContract) return;
  const [currentOpportunity] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, recordId));
  const lockedFields = [
    "account_id",
    "name",
    "instrument_type",
    "stage",
    "segment",
    "amount",
    "contract_start",
    "contract_end",
    "first_readjustment_date",
    "application_day",
    "diesel_pct",
    "igpm_pct",
    "ipca_pct",
    "contracting_parties",
    "vli_entity",
    "joint_debtor",
    "integration_tariff",
    "take_or_pay",
  ];
  if (
    currentOpportunity &&
    lockedFields.some(
      (field) =>
        // Fechar a Oportunidade após a Assinatura no NetLex é permitido.
        !(field === "stage" && data.stage === "Fechado" && currentOpportunity.stage === "Formalização") &&
        Object.prototype.hasOwnProperty.call(data, field) &&
        String(data[field] ?? "") !== String((currentOpportunity as any)[field] ?? ""),
    )
  )
    throw new Error(
      "A minuta já foi enviada. Para mudar condições do contrato, cancele a integração no NetLex e reinicie o fluxo.",
    );
}

export const saveRecord = createServerFn({ method: "POST" }).handler(async ({ data: input }) => {
  await ensureSchema();
  const { table, recordId, data } = input as SaveInput;
  const t = TABLES[table];
  if (!t) throw new Error(`Objeto desconhecido: ${table}`);
  if (table === "opportunities") {
    if (!recordId && data.application_day === undefined) data.application_day = 10;
    if (data.application_day !== undefined) data.application_day = Number(data.application_day);
    await validateOpportunityStage(recordId, data);
    await assertOpportunityContractUnchanged(recordId, data);
  }
  if (table === "quotes") {
    const opportunityId = String(data.opportunity_id ?? "");
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    if (
      !opp ||
      opp.stage !== "Negociação" ||
      opp.segment !== "Ferroviário" ||
      !QUOTE_INSTRUMENTS.includes(opp.instrument_type)
    )
      throw new Error(
        "A Cotação exige uma oportunidade Ferroviária de Contrato ou ACS em Negociação.",
      );
    if (opp.instrument_type === "Aditivo" && !opp.base_contract_id)
      throw new Error("A Oportunidade de aditivo precisa estar vinculada a um contrato assinado.");
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
  if (table === "quote_schedules") {
    // operação e linha de base do aditivo são controladas pelo servidor
    delete (values as any).operation;
    delete (values as any).base_snapshot;
  }
  const newId = crypto.randomUUID();
  if (recordId) {
    await db
      .update(t)
      .set(values as never)
      .where(eq((t as typeof t & { id: never }).id, recordId));
  } else {
    // Sempre gera o id no servidor — nunca confia no payload do cliente.
    await db.insert(t).values({ id: newId, ...values, created_at: now } as never);
  }
  if (table === "quote_schedules" && recordId) {
    const [edited] = await db.select().from(quote_schedules).where(eq(quote_schedules.id, recordId));
    const [item] = edited
      ? await db.select().from(quote_line_items).where(eq(quote_line_items.id, edited.quote_line_item_id))
      : [];
    if (edited && item)
      for (const sibling of await quoteSchedulesByKey(item.quote_id, edited.schedule_key))
        if (sibling.id !== edited.id)
          await db
            .update(quote_schedules)
            .set({
              volume: edited.volume,
              diesel_base_id: edited.diesel_base_id,
              diesel_base_date: edited.diesel_base_date,
              updated_at: now,
            })
            .where(eq(quote_schedules.id, sibling.id));
  }
  if (table === "quote_schedules" && !recordId) {
    const quoteId = await quoteIdForRecord(table, null, data as Record<string, unknown>);
    const [row] = await db
      .select({ instrument: opportunities.instrument_type })
      .from(quotes)
      .innerJoin(opportunities, eq(quotes.opportunity_id, opportunities.id))
      .where(eq(quotes.id, quoteId));
    if (row?.instrument === "Aditivo")
      await db.update(quote_schedules).set({ operation: "Incluir" }).where(eq(quote_schedules.id, newId));
  }
  if (table === "quotes" && !recordId) {
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, String(data.opportunity_id ?? "")));
    if (opp?.instrument_type === "Aditivo") await seedAddendumBaseline(newId, opp);
  }
  if (table === "quote_line_items" || table === "quote_schedules") {
    const quoteId = await quoteIdForRecord(table, recordId, data as Record<string, unknown>);
    await markQuotePricesStale(quoteId);
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
      !QUOTE_INSTRUMENTS.includes(opp.instrument_type)
    )
      throw new Error(
        "A Oportunidade precisa ser Ferroviária, de Contrato/ACS e estar em Negociação.",
      );
    if (!opp.contract_start || !opp.contract_end)
      throw new Error("Preencha início e fim da vigência na Oportunidade antes de montar Agendas.");
    const termDays = Math.round(
      (Date.parse(`${opp.contract_end}T00:00:00Z`) -
        Date.parse(`${opp.contract_start}T00:00:00Z`)) /
        86400000,
    );
    if (termDays > 365) {
      const percentageTotal = Number(opp.diesel_pct) + Number(opp.igpm_pct) + Number(opp.ipca_pct);
      if (Math.abs(percentageTotal - 100) > 0.001)
        throw new Error(
          "Para vigência superior a 365 dias, Diesel + IGP-M + IPCA precisam somar 100%.",
        );
      if (!opp.first_readjustment_date)
        throw new Error("Informe a data do primeiro reajuste na Oportunidade.");
      const firstDate = Date.parse(`${opp.first_readjustment_date}T00:00:00Z`);
      if (
        firstDate < Date.parse(`${opp.contract_start}T00:00:00Z`) ||
        firstDate > Date.parse(`${opp.contract_end}T00:00:00Z`)
      )
        throw new Error(
          "A data do primeiro reajuste precisa estar dentro da vigência do contrato.",
        );
    }
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
      throw new Error(
        "A modalidade de tarifa não pode mudar depois da primeira Agenda da Cotação.",
      );
    const [dieselBase] = await db
      .select()
      .from(diesel_bases)
      .where(eq(diesel_bases.id, request.groups[0].diesel_base_id));
    if (!dieselBase) throw new Error("Selecione uma Base Diesel válida.");
    const startMonth = Number(opp.contract_start.slice(0, 4) + opp.contract_start.slice(5, 7));
    const endMonth = Number(opp.contract_end.slice(0, 4) + opp.contract_end.slice(5, 7));
    const isAddendum = opp.instrument_type === "Aditivo";
    const draftKeys = new Set<string>();
    const rowsToInsert: Array<Record<string, unknown>> = [];
    let lastPeriod = endMonth;
    for (const group of request.groups) {
      const period = group.year * 100 + group.month;
      // O início segue a vigência da Oportunidade; o fim é livre: um período
      // depois do término estende a vigência (no aditivo, vira cláusula de prazo).
      if (
        !Number.isInteger(group.year) ||
        !Number.isInteger(group.month) ||
        group.month < 1 ||
        group.month > 12 ||
        period < startMonth
      )
        throw new Error("O período de cada Agenda deve começar dentro da vigência da Oportunidade.");
      if (period > lastPeriod) lastPeriod = period;
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
      const existing = await quoteSchedulesByKey(request.quoteId, scheduleKey);
      const duplicate = existing.some((row) =>
        group.services.some((entry) => row.service === entry.service),
      );
      if (duplicate)
        throw new Error("Já existe Agenda para este Fluxo, período, divisão, praça e serviço.");
      if (existing.length && isAddendum)
        throw new Error(
          `Para o mesmo fluxo não pode existir frete em ${String(group.month).padStart(2, "0")}/${group.year}: esse período já está no contrato. Edite a Agenda existente para alterá-la.`,
        );
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
          operation: isAddendum ? "Incluir" : null,
        }),
      );
    }
    let extendedEnd: string | null = null;
    if (lastPeriod > endMonth) {
      const year = Math.floor(lastPeriod / 100),
        month = lastPeriod % 100;
      extendedEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      const start = new Date(`${opp.contract_start}T00:00:00Z`);
      const end = new Date(`${extendedEnd}T00:00:00Z`);
      if (opp.instrument_type === "ACS") {
        const limit = new Date(start);
        limit.setUTCMonth(limit.getUTCMonth() + 12);
        if (end >= limit)
          throw new Error(
            `ACS deve ter vigência inferior a 12 meses; o mês final ${String(month).padStart(2, "0")}/${year} ultrapassa esse limite.`,
          );
      }
      if ((end.valueOf() - start.valueOf()) / 86400000 > 365) {
        const percentageTotal = Number(opp.diesel_pct) + Number(opp.igpm_pct) + Number(opp.ipca_pct);
        if (Math.abs(percentageTotal - 100) > 0.001 || !opp.first_readjustment_date)
          throw new Error(
            `Com o fim em ${String(month).padStart(2, "0")}/${year}, a vigência passa de 365 dias. Configure na Oportunidade Diesel + IGP-M + IPCA = 100% e a data do primeiro reajuste.`,
          );
      }
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
      if (extendedEnd)
        await tx
          .update(opportunities)
          .set({ contract_end: extendedEnd, updated_at: now })
          .where(eq(opportunities.id, opp.id));
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
    // O Jetsons (mock) cadastra preço de mercado para as novas Agendas.
    await ensureRecommendedPricesForQuote(request.quoteId);
    await markQuotePricesStale(request.quoteId);
    return { itemId, scheduleCount: rowsToInsert.length, extendedEnd };
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
            if (!recordId && recordData.application_day === undefined)
              recordData.application_day = 10;
            if (recordData.application_day !== undefined)
              recordData.application_day = Number(recordData.application_day);
            await validateOpportunityStage(recordId, recordData);
            await assertOpportunityContractUnchanged(recordId, recordData);
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
              !QUOTE_INSTRUMENTS.includes(opp.instrument_type)
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
    if (table === "quote_line_items" || table === "quote_schedules") {
      const quoteIds = new Set<string>();
      for (const { recordId, data } of records) {
        const quoteId = await quoteIdForRecord(table, recordId, data);
        if (quoteId) quoteIds.add(quoteId);
      }
      for (const quoteId of quoteIds) await markQuotePricesStale(quoteId);
    }
    return { ok: true, count: records.length };
  },
);

async function assertQuoteNotContracted(quoteId: string) {
  if (!quoteId) return;
  const [contract] = await db
    .select({ id: netlex_contracts.id })
    .from(netlex_contracts)
    .innerJoin(quotes, eq(netlex_contracts.opportunity_id, quotes.opportunity_id))
    .where(eq(quotes.id, quoteId));
  if (contract)
    throw new Error(
      "Esta Cotação faz parte de um contrato enviado ao NetLex e não pode ser alterada ou excluída.",
    );
}

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
    if (table === "opportunities") {
      const protectedRows = await db
        .select({ id: netlex_contracts.id })
        .from(netlex_contracts)
        .where(inArray(netlex_contracts.opportunity_id, uniqueIds));
      if (protectedRows.length)
        throw new Error("Não é possível excluir uma Oportunidade com contrato enviado ao NetLex.");
    }
    if (table === "accounts") {
      const protectedRows = await db
        .select({ id: netlex_contracts.id })
        .from(netlex_contracts)
        .innerJoin(opportunities, eq(netlex_contracts.opportunity_id, opportunities.id))
        .where(inArray(opportunities.account_id, uniqueIds));
      if (protectedRows.length)
        throw new Error("A Conta possui contrato enviado ao NetLex e não pode ser excluída.");
    }
    if (table === "quotes")
      for (const id of uniqueIds) await assertQuoteNotContracted(id);
    await assertNotAddendumBaseline(table, uniqueIds);
    if (table === "quote_line_items" || table === "quote_schedules")
      for (const id of uniqueIds) {
        const quoteId = await quoteIdForRecord(table, id, undefined);
        await assertQuoteNotContracted(quoteId);
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
  if (table === "opportunities") {
    const [protectedRow] = await db
      .select({ id: netlex_contracts.id })
      .from(netlex_contracts)
      .where(eq(netlex_contracts.opportunity_id, id));
    if (protectedRow)
      throw new Error("Não é possível excluir uma Oportunidade com contrato enviado ao NetLex.");
  }
  if (table === "accounts") {
    const [protectedRow] = await db
      .select({ id: netlex_contracts.id })
      .from(netlex_contracts)
      .innerJoin(opportunities, eq(netlex_contracts.opportunity_id, opportunities.id))
      .where(eq(opportunities.account_id, id));
    if (protectedRow)
      throw new Error("A Conta possui contrato enviado ao NetLex e não pode ser excluída.");
  }
  if (table === "quotes") await assertQuoteNotContracted(id);
  await assertNotAddendumBaseline(table, [id]);
  const staleQuoteId =
    table === "quote_line_items" || table === "quote_schedules"
      ? await quoteIdForRecord(table, id, undefined)
      : "";
  await assertQuoteNotContracted(staleQuoteId);
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
  await markQuotePricesStale(staleQuoteId);
  return { ok: true };
});

/** Quick fix: define a vigência da Oportunidade direto da Cotação ou do screenflow. */
export const updateOpportunityTerm = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id, contract_start, contract_end } = input as {
      id: string;
      contract_start: string;
      contract_end: string;
    };
    if (!id) throw new Error("Oportunidade não informada.");
    if (!contract_start || !contract_end)
      throw new Error("Informe o início e o fim da vigência.");
    const start = new Date(`${contract_start}T00:00:00Z`);
    const end = new Date(`${contract_end}T00:00:00Z`);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start)
      throw new Error("O início da vigência precisa ser antes ou igual ao fim.");
    const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    if (!opportunity) throw new Error("Oportunidade não encontrada.");
    const [sentContract] = await db
      .select({ id: netlex_contracts.id })
      .from(netlex_contracts)
      .where(eq(netlex_contracts.opportunity_id, id));
    if (sentContract)
      throw new Error(
        "A minuta já foi enviada. Cancele a integração no NetLex antes de mudar a vigência.",
      );
    if (opportunity.instrument_type === "ACS") {
      const limit = new Date(start);
      limit.setUTCMonth(limit.getUTCMonth() + 12);
      if (!(end < limit)) throw new Error("ACS exige vigência inferior a 12 meses.");
    }
    await db
      .update(opportunities)
      .set({
        contract_start,
        contract_end,
        updated_at: new Date().toISOString(),
      })
      .where(eq(opportunities.id, id));
    return { ok: true, contract_start, contract_end };
  },
);

/** Deletes records from every registered object, then optionally restores demo data. */
export const resetPlaygroundData = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { mode } = input as { mode: "clear" | "factory" };
    if (mode !== "clear" && mode !== "factory") throw new Error("Modo de reset inválido.");

    await db.delete(netlex_contracts);
    // Delete in reverse registration order so dependent objects are removed first.
    for (const table of Object.values(TABLES).reverse() as any[]) {
      await db.delete(table);
    }
    const resetNow = new Date().toISOString();
    await db.insert(app_settings).values([
      { key: "alcada_gg_pct", value: "5", updated_at: resetNow },
      { key: "alcada_diretoria_pct", value: "7", updated_at: resetNow },
      { key: "current_approver_id", value: "", updated_at: resetNow },
      { key: "active_profile", value: "sales", updated_at: resetNow },
    ]);

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
          lifetime_value: 4250,
          revenue: 8750,
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
          lifetime_value: 2780,
          revenue: 6340,
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

// ===== Margem/Alçada: validação de preço contra o recomendado (Jetsons mock) =====

/** Lê os limites de preço e o perfil simulado atualmente ativo. */
async function readAppSettings() {
  const rows = await db.select().from(app_settings);
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const gg = Number(map.get("alcada_gg_pct") ?? 5);
  const dir = Number(map.get("alcada_diretoria_pct") ?? 7);
  const savedProfile = map.get("active_profile");
  const legacyApproverId = map.get("current_approver_id") ?? "";
  const activeProfile =
    savedProfile === "approver" || (!savedProfile && legacyApproverId) ? "approver" : "sales";
  return {
    thresholds: { gg, dir },
    activeProfile,
    currentApprover:
      activeProfile === "approver"
        ? { id: "profile-approver", name: "Perfil Aprovador", level: "Aprovador" }
        : null,
  };
}

type PriceComparison = {
  quote_id: string;
  tariff_mode: string;
  price_status: string;
  alcada_level: string;
  max_discount_pct: number;
  thresholds: { gg: number; dir: number };
  approved: boolean;
  open_approval: boolean;
  /** Detalhe de cada Agenda da Cotação para o comparativo visual por linha. */
  schedules: Array<{
    schedule_id: string;
    operation?: string | null;
    item_id: string;
    flow_code: string;
    route: string;
    merchandise: string;
    unit: string;
    service: string;
    year: number;
    month: number;
    period_window: string;
    division: string;
    plaza: string;
    volume: number;
    practiced_unit: number;
    recommended_unit: number | null;
    deviation_pct: number | null;
  }>;
  rows: Array<{
    item_id: string;
    service: string;
    flow_code: string;
    route: string;
    origin_name: string;
    destination_name: string;
    merchandise: string;
    unit: string;
    volume_total: number;
    practiced_total: number;
    recommended_total: number | null;
    deviation_pct: number | null;
    missing: boolean;
    missing_periods: string[];
  }>;
};

/** Compara preço praticado x preço recomendado de cada Item e calcula a alçada da Cotação. */
async function computeQuotePriceComparison(quoteId: string): Promise<PriceComparison> {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) throw new Error("Cotação não encontrada.");
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, quote.opportunity_id));
  const tariffMode = quote.tariff_mode || opp?.integration_tariff || "Líquida";
  const useCbs = tariffMode === "CBS";
  const items = await db
    .select()
    .from(quote_line_items)
    .where(eq(quote_line_items.quote_id, quoteId));
  const flowIds = [...new Set(items.map((item) => item.planned_flow_id))];
  const flows = flowIds.length
    ? await db.select().from(planned_flows).where(inArray(planned_flows.id, flowIds))
    : [];
  const flowById = new Map(flows.map((flow) => [flow.id, flow]));
  const locationIds = flows.flatMap((flow) => [flow.origin_id, flow.destination_id]);
  const locationRows = locationIds.length
    ? await db.select().from(locations).where(inArray(locations.id, locationIds))
    : [];
  const locationById = new Map(locationRows.map((location) => [location.id, location]));
  const merchIds = [...new Set(flows.map((flow) => flow.merchandise_id))];
  const merchRows = merchIds.length
    ? await db.select().from(merchandise).where(inArray(merchandise.id, merchIds))
    : [];
  const merchById = new Map(merchRows.map((entry) => [entry.id, entry]));
  const prices = flowIds.length
    ? await db
        .select()
        .from(recommended_prices)
        .where(inArray(recommended_prices.planned_flow_id, flowIds))
    : [];
  const priceMap = new Map(
    prices.map((price) => [
      `${price.planned_flow_id}|${price.service}|${price.year}|${price.month}`,
      price,
    ]),
  );
  const rows: PriceComparison["rows"] = [];
  const scheduleRows: PriceComparison["schedules"] = [];
  for (const item of items) {
    const schedules = await db
      .select()
      .from(quote_schedules)
      .where(eq(quote_schedules.quote_line_item_id, item.id))
      .orderBy(asc(quote_schedules.year), asc(quote_schedules.month));
    const flow = flowById.get(item.planned_flow_id);
    const origin = locationById.get(flow?.origin_id ?? "");
    const destination = locationById.get(flow?.destination_id ?? "");
    let practiced = 0,
      recommended = 0,
      found = 0,
      volumeTotal = 0;
    const missingPeriods: string[] = [];
    for (const schedule of schedules) {
      const unit = Number(
        useCbs
          ? (schedule.accessory_cbs ?? schedule.tariff_cbs ?? 0)
          : (schedule.accessory_net ?? schedule.tariff_net ?? 0),
      );
      practiced += unit * schedule.volume;
      volumeTotal += schedule.volume;
      const price = priceMap.get(
        `${item.planned_flow_id}|${schedule.service}|${schedule.year}|${schedule.month}`,
      );
      if (price) {
        recommended += price.unit_price * schedule.volume;
        found++;
      } else missingPeriods.push(`${String(schedule.month).padStart(2, "0")}/${schedule.year}`);
      scheduleRows.push({
        schedule_id: schedule.id,
        operation: schedule.operation ?? null,
        item_id: item.id,
        flow_code: flow?.code ?? "?",
        route: `${origin?.code ?? "?"} → ${destination?.code ?? "?"}`,
        merchandise: merchById.get(flow?.merchandise_id ?? "")?.name ?? "?",
        unit: merchById.get(flow?.merchandise_id ?? "")?.unit ?? "",
        service: schedule.service,
        year: schedule.year,
        month: schedule.month,
        period_window: schedule.period_window,
        division: schedule.division,
        plaza: schedule.plaza,
        volume: schedule.volume,
        practiced_unit: unit,
        recommended_unit: price ? Number(price.unit_price) : null,
        deviation_pct:
          price && Number(price.unit_price) > 0
            ? ((unit - Number(price.unit_price)) / Number(price.unit_price)) * 100
            : null,
      });
    }
    rows.push({
      item_id: item.id,
      service: item.service,
      flow_code: flow?.code ?? "?",
      route: `${origin?.code ?? "?"} → ${destination?.code ?? "?"}`,
      origin_name: origin?.name ?? "?",
      destination_name: destination?.name ?? "?",
      merchandise: merchById.get(flow?.merchandise_id ?? "")?.name ?? "?",
      unit: merchById.get(flow?.merchandise_id ?? "")?.unit ?? "",
      volume_total: volumeTotal,
      practiced_total: practiced,
      recommended_total: found > 0 ? recommended : null,
      deviation_pct: found > 0 && recommended > 0 ? ((practiced - recommended) / recommended) * 100 : null,
      missing: schedules.length > 0 && found < schedules.length,
      missing_periods: missingPeriods,
    });
  }
  const { thresholds } = await readAppSettings();
  // A cotação é governada pela pior Agenda individual, não pela média ponderada
  // do Item. Caso contrário, um desconto acima da alçada em uma linha poderia
  // ser diluído pelas demais Agendas do mesmo Item.
  // No aditivo a alçada compara só o que muda: Agendas mantidas ou excluídas
  // já foram aprovadas no contrato vigente.
  const governedRows = scheduleRows.filter(
    (schedule) => !["Manter", "Excluir"].includes(String(schedule.operation ?? "")),
  );
  const discounts = governedRows
    .map((schedule) =>
      schedule.deviation_pct === null ? 0 : Math.max(0, -schedule.deviation_pct),
    )
    .filter((value) => value > 0);
  const maxDiscount = discounts.length ? Math.max(...discounts) : 0;
  const exceedsGg = governedRows.some(
    (schedule) =>
      schedule.deviation_pct !== null && -schedule.deviation_pct > thresholds.gg,
  );
  const alcadaLevel = exceedsGg ? "Perfil Aprovador" : "Sem alçada";
  const anyMissing = rows.some((row) => row.missing);
  const approved = quote.price_status === "Aprovada";
  const priceStatus = approved
    ? "Aprovada"
    : anyMissing
      ? "Não validada"
      : alcadaLevel === "Sem alçada"
        ? "Ok"
        : "Pendente alçada";
  const openApprovals = await db
    .select({ id: quote_approvals.id, status: quote_approvals.status })
    .from(quote_approvals)
    .where(eq(quote_approvals.quote_id, quoteId));
  if (!approved)
    await db
      .update(quotes)
      .set({
        price_status: priceStatus,
        max_discount_pct: maxDiscount,
        alcada_level: approved ? quote.alcada_level : alcadaLevel,
        updated_at: new Date().toISOString(),
      })
      .where(eq(quotes.id, quoteId));
  return {
    quote_id: quoteId,
    tariff_mode: tariffMode,
    price_status: priceStatus,
    alcada_level: approved ? quote.alcada_level : alcadaLevel,
    max_discount_pct: maxDiscount,
    thresholds,
    approved,
    open_approval:
      openApprovals.some((approval) => approval.status === "Pendente") &&
      priceStatus === "Pendente alçada",
    schedules: scheduleRows,
    rows,
  };
}

/** Marca os preços da Cotação como desatualizados após editar itens ou agendas. */
async function markQuotePricesStale(quoteId: string) {
  if (!quoteId) return;
  await db
    .update(quotes)
    .set({ price_status: "Não validada", updated_at: new Date().toISOString() })
    .where(eq(quotes.id, quoteId));
  await refreshAddendumOperations(quoteId);
}

/** Linhas de Agenda da mesma Cotação com a mesma chave (Fluxo, período, divisão e praça). */
async function quoteSchedulesByKey(quoteId: string, scheduleKey: string) {
  const rows = await db
    .select({ schedule: quote_schedules })
    .from(quote_schedules)
    .innerJoin(quote_line_items, eq(quote_schedules.quote_line_item_id, quote_line_items.id))
    .where(and(eq(quote_line_items.quote_id, quoteId), eq(quote_schedules.schedule_key, scheduleKey)));
  return rows.map((row) => row.schedule);
}

async function quoteScheduleRows(quoteId: string) {
  const rows = await db
    .select({ schedule: quote_schedules })
    .from(quote_schedules)
    .innerJoin(quote_line_items, eq(quote_schedules.quote_line_item_id, quote_line_items.id))
    .where(eq(quote_line_items.quote_id, quoteId));
  return rows.map((row) => row.schedule);
}

/**
 * Aditivo: recalcula a operação de cada Agenda comparando com a linha de base.
 * Linhas da base ficam "Manter" ou "Alterar"; novas ficam "Incluir"; "Excluir"
 * é uma marcação explícita do usuário e é preservada.
 */
async function refreshAddendumOperations(quoteId: string) {
  if (!quoteId) return;
  const [row] = await db
    .select({ instrument: opportunities.instrument_type })
    .from(quotes)
    .innerJoin(opportunities, eq(quotes.opportunity_id, opportunities.id))
    .where(eq(quotes.id, quoteId));
  if (row?.instrument !== "Aditivo") return;
  for (const schedule of await quoteScheduleRows(quoteId)) {
    const operation = effectiveOperation(schedule);
    if (operation !== schedule.operation)
      await db
        .update(quote_schedules)
        .set({ operation })
        .where(eq(quote_schedules.id, schedule.id));
  }
}

async function quoteIdForRecord(table: string, recordId: string | null | undefined, data: Record<string, unknown> | undefined) {
  if (table === "quote_line_items") return String(data?.quote_id ?? "");
  if (table === "quote_schedules") {
    if (data?.quote_line_item_id) {
      const [item] = await db
        .select({ quote_id: quote_line_items.quote_id })
        .from(quote_line_items)
        .where(eq(quote_line_items.id, String(data.quote_line_item_id)));
      return item?.quote_id ?? "";
    }
    if (recordId) {
      const [row] = await db
        .select({ quote_id: quote_line_items.quote_id })
        .from(quote_schedules)
        .innerJoin(quote_line_items, eq(quote_schedules.quote_line_item_id, quote_line_items.id))
        .where(eq(quote_schedules.id, recordId));
      return row?.quote_id ?? "";
    }
  }
  return "";
}

/** Valida os preços da Cotação contra o recomendado e devolve o comparativo por Item. */
export const validateQuotePrices = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    // O Jetsons (mock) sempre tem preço de mercado para os trechos da Cotação:
    // gerar os ausentes antes de comparar.
    await ensureRecommendedPricesForQuote(id);
    const result = await computeQuotePriceComparison(id);
    if (result.price_status === "Ok")
      await db
        .update(quote_approvals)
        .set({ status: "Cancelada", updated_at: new Date().toISOString() })
        .where(eq(quote_approvals.quote_id, id));
    return result;
  },
);

/** Cria/atualiza a solicitação de alçada aberta de uma Cotação. */
async function upsertOpenApproval(quoteId: string, result: PriceComparison) {
  const now = new Date().toISOString();
  const open = await db
    .select()
    .from(quote_approvals)
    .where(eq(quote_approvals.quote_id, quoteId));
  for (const approval of open)
    if (approval.status === "Pendente")
      await db
        .update(quote_approvals)
        .set({ status: "Cancelada", updated_at: now })
        .where(eq(quote_approvals.id, approval.id));
  await db.insert(quote_approvals).values({
    id: crypto.randomUUID(),
    quote_id: quoteId,
    alcada_level: result.alcada_level,
    status: "Pendente",
    max_discount_pct: result.max_discount_pct,
    requested_at: now,
    created_at: now,
    updated_at: now,
  });
}

/** Envia a Cotação (com desvio acima do limite) para a fila de aprovação de alçada. */
export const submitQuoteForApproval = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const result = await computeQuotePriceComparison(id);
    if (result.price_status !== "Pendente alçada")
      throw new Error("Somente cotações com desvio acima do limite podem ser enviadas.");
    await upsertOpenApproval(id, result);
    return {
      ok: true,
      alcada_level: result.alcada_level,
      max_discount_pct: result.max_discount_pct,
    };
  },
);

/** Gera (Faker, seed da Cotação) os preços recomendados ausentes de cada Item. */
export const generateMissingRecommendedPrices = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const created = await ensureRecommendedPricesForQuote(id);
    return { ok: true, created };
  },
);

/** Aplica o preço recomendado em todos os grupos de agenda da Cotação. */
export const applyRecommendedPrices = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!quote) throw new Error("Cotação não encontrada.");
    if (quote.status !== "Rascunho" || quote.is_synced)
      throw new Error("Só é possível aplicar preços em uma Cotação em Rascunho.");
    await ensureRecommendedPricesForQuote(id);
    const result = await computeQuotePriceComparison(id);
    if (result.rows.some((row) => row.missing))
      throw new Error("Gere os preços recomendados ausentes antes de aplicar.");
    const items = await db
      .select()
      .from(quote_line_items)
      .where(eq(quote_line_items.quote_id, id));
    const prices = await db
      .select()
      .from(recommended_prices)
      .where(
        inArray(
          recommended_prices.planned_flow_id,
          items.map((item) => item.planned_flow_id),
        ),
      );
    const priceMap = new Map(
      prices.map((price) => [
        `${price.planned_flow_id}|${price.service}|${price.year}|${price.month}`,
        price,
      ]),
    );
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, quote.opportunity_id));
    const useCbs = (quote.tariff_mode || opp?.integration_tariff) === "CBS";
    const groups = new Map<string, Array<typeof quote_schedules.$inferSelect>>();
    for (const item of items) {
      const schedules = await db
        .select()
        .from(quote_schedules)
        .where(eq(quote_schedules.quote_line_item_id, item.id));
      for (const schedule of schedules)
        groups.set(schedule.schedule_key, [...(groups.get(schedule.schedule_key) ?? []), schedule]);
    }
    const now = new Date().toISOString();
    for (const group of groups.values()) {
      const shares = group.map((schedule) => {
        const item = items.find((entry) => entry.id === schedule.quote_line_item_id);
        const price = item
          ? priceMap.get(`${item.planned_flow_id}|${schedule.service}|${schedule.year}|${schedule.month}`)
          : undefined;
        return Math.max(1, Math.round(Number(price?.unit_price ?? 0) * 100));
      });
      const totalCents = shares.reduce((sum, share) => sum + share, 0);
      await Promise.all(
        group.map((schedule, index) => {
          const pct = Number(((shares[index] / totalCents) * 100).toFixed(2));
          return db
            .update(quote_schedules)
            .set({
              ...(useCbs
                ? {
                    tariff_cbs: totalCents / 100,
                    accessory_cbs: shares[index] / 100,
                    accessory_cbs_pct: pct,
                  }
                : {
                    tariff_net: totalCents / 100,
                    accessory_net: shares[index] / 100,
                    accessory_net_pct: pct,
                  }),
              updated_at: now,
            })
            .where(eq(quote_schedules.id, schedule.id));
        }),
      );
    }
    await markQuotePricesStale(id);
    const fresh = await computeQuotePriceComparison(id);
    return { ok: true, result: fresh };
  },
);

/** Edita o preço praticado de uma Agenda e devolve o comparativo atualizado. */
export const updateScheduleTariff = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { scheduleId, unitPrice } = input as { scheduleId: string; unitPrice: number };
    const [schedule] = await db
      .select()
      .from(quote_schedules)
      .where(eq(quote_schedules.id, scheduleId));
    if (!schedule) throw new Error("Agenda não encontrada.");
    const [item] = await db
      .select()
      .from(quote_line_items)
      .where(eq(quote_line_items.id, schedule.quote_line_item_id));
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, item?.quote_id ?? ""));
    if (!quote) throw new Error("Cotação não encontrada.");
    if (quote.status !== "Rascunho" || quote.is_synced)
      throw new Error("Só é possível editar preços em uma Cotação em Rascunho.");
    const price = Number(unitPrice);
    if (!Number.isFinite(price) || price <= 0)
      throw new Error("Informe um preço maior que zero.");
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, quote.opportunity_id));
    const useCbs = (quote.tariff_mode || opp?.integration_tariff) === "CBS";
    const mainTariff = Number(useCbs ? schedule.tariff_cbs : schedule.tariff_net);
    const pct = mainTariff > 0 ? Number(((price / mainTariff) * 100).toFixed(2)) : 100;
    await db
      .update(quote_schedules)
      .set({
        ...(useCbs
          ? { accessory_cbs: price, accessory_cbs_pct: pct }
          : { accessory_net: price, accessory_net_pct: pct }),
        updated_at: new Date().toISOString(),
      })
      .where(eq(quote_schedules.id, scheduleId));
    await markQuotePricesStale(quote.id);
    const result = await computeQuotePriceComparison(quote.id);
    return { ok: true, result };
  },
);

/** Limites de preço e perfil simulado ativo. */
export const getAppSettings = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const settings = await readAppSettings();
  return {
    thresholds: settings.thresholds,
    activeProfile: settings.activeProfile,
  };
});

/** Alterna entre os dois perfis da simulação: Vendas e Aprovador. */
export const setActiveProfile = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { profile } = input as { profile: string };
    if (profile !== "sales" && profile !== "approver")
      throw new Error("Escolha o perfil Vendas ou Aprovador.");
    const now = new Date().toISOString();
    await db
      .insert(app_settings)
      .values({ key: "active_profile", value: profile, updated_at: now })
      .onConflictDoUpdate({
        target: app_settings.key,
        set: { value: profile, updated_at: now },
      });
    await db
      .insert(app_settings)
      .values({
        key: "current_approver_id",
        value: "",
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: app_settings.key,
        set: { value: "", updated_at: now },
      });
    return { ok: true, activeProfile: profile };
  },
);

/** Atualiza o limite sem aprovação e o limite visual de gravidade alta. */
export const updateAlcadaThresholds = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { gg, dir } = input as { gg: number; dir: number };
    const ggValue = Number(gg),
      dirValue = Number(dir);
    if (
      !Number.isFinite(ggValue) ||
      !Number.isFinite(dirValue) ||
      ggValue <= 0 ||
      dirValue <= 0 ||
      ggValue >= dirValue ||
      dirValue > 100
    )
      throw new Error(
        "Os limites precisam ser positivos; o limite de gravidade alta deve ser maior que o limite sem aprovação.",
      );
    const now = new Date().toISOString();
    for (const [key, value] of [
      ["alcada_gg_pct", String(ggValue)],
      ["alcada_diretoria_pct", String(dirValue)],
    ] as const)
      await db
        .insert(app_settings)
        .values({ key, value, updated_at: now })
        .onConflictDoUpdate({ target: app_settings.key, set: { value, updated_at: now } });
    return { ok: true, thresholds: { gg: ggValue, dir: dirValue } };
  },
);

type ApprovalSummary = {
  id: string;
  quote_id: string;
  quote_number: string;
  quote_name: string;
  opportunity_id: string;
  opportunity_name: string;
  account_id: string;
  account_name: string;
  alcada_level: string;
  status: string;
  max_discount_pct: number;
  requested_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
  can_decide: boolean;
};

async function approvalRows(where: any): Promise<ApprovalSummary[]> {
  const { currentApprover } = await readAppSettings();
  const rows = await db
    .select({
      id: quote_approvals.id,
      quote_id: quote_approvals.quote_id,
      quote_number: quotes.quote_number,
      quote_name: quotes.name,
      opportunity_id: opportunities.id,
      opportunity_name: opportunities.name,
      account_id: accounts.id,
      account_name: accounts.name,
      alcada_level: quote_approvals.alcada_level,
      status: quote_approvals.status,
      max_discount_pct: quote_approvals.max_discount_pct,
      requested_at: quote_approvals.requested_at,
      decided_at: quote_approvals.decided_at,
      decided_by_name: quote_approvals.decided_by_name,
      decision_note: quote_approvals.decision_note,
    })
    .from(quote_approvals)
    .innerJoin(quotes, eq(quote_approvals.quote_id, quotes.id))
    .innerJoin(opportunities, eq(quotes.opportunity_id, opportunities.id))
    .innerJoin(accounts, eq(opportunities.account_id, accounts.id))
    .where(where)
    .orderBy(desc(quote_approvals.requested_at))
    .limit(100);
  return rows.map((row) => ({
    ...row,
    alcada_level: row.alcada_level === "Sem alçada" ? "Sem aprovação" : "Perfil Aprovador",
    decided_by_name: row.decided_by_name ? "Perfil Aprovador" : null,
    can_decide: !!currentApprover && row.status === "Pendente",
  }));
}

/** Fila de aprovação: pendências e histórico com o aprovador logado. */
export const listApprovals = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSchema();
  const settings = await readAppSettings();
  const pending = await approvalRows(eq(quote_approvals.status, "Pendente"));
  const decided = await approvalRows(
    inArray(quote_approvals.status, ["Aprovada", "Rejeitada", "Cancelada"]),
  );
  return {
    pending,
    decided,
    activeProfile: settings.activeProfile,
    thresholds: settings.thresholds,
  };
});

/** Detalhe de uma solicitação de alçada. */
export const getApprovalFull = createServerFn({ method: "GET" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id } = input as { id: string };
    const [row] = await approvalRows(eq(quote_approvals.id, id));
    return row ?? null;
  },
);

/** Decide uma solicitação de alçada como o aprovador logado. */
export const decideQuoteApproval = createServerFn({ method: "POST" }).handler(
  async ({ data: input }) => {
    await ensureSchema();
    const { id, decision, note } = input as { id: string; decision: string; note?: string };
    if (decision !== "Aprovada" && decision !== "Rejeitada")
      throw new Error("Decisão inválida.");
    const [approval] = await db
      .select()
      .from(quote_approvals)
      .where(eq(quote_approvals.id, id));
    if (!approval) throw new Error("Solicitação de alçada não encontrada.");
    if (approval.status !== "Pendente")
      throw new Error("Esta solicitação já foi decidida.");
    const { currentApprover } = await readAppSettings();
    if (!currentApprover)
      throw new Error("Logue como aprovador em Configurações para decidir alçadas.");
    const now = new Date().toISOString();
    await db
      .update(quote_approvals)
      .set({
        status: decision,
        decided_at: now,
        decided_by: currentApprover.id,
        decided_by_name: currentApprover.name,
        decision_note: note ?? null,
        updated_at: now,
      })
      .where(eq(quote_approvals.id, id));
    await db
      .update(quotes)
      .set({ price_status: decision, updated_at: now })
      .where(eq(quotes.id, approval.quote_id));
    return { ok: true, decision, decided_by: "Perfil Aprovador" };
  },
);

/** Garante preços recomendados (Jetsons mock) para todos os serviços/períodos da Cotação. */
/**
 * Garante que o Jetsons (mock) tenha preço recomendado para cada Agenda da
 * Cotação. Os preços vêm do modelo de mercado: mesmos produto + trecho +
 * serviço + período resultam no mesmo valor em qualquer Cotação.
 */
async function ensureRecommendedPricesForQuote(quoteId: string) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) return 0;
  const items = await db
    .select()
    .from(quote_line_items)
    .where(eq(quote_line_items.quote_id, quoteId));
  if (!items.length) return 0;
  const flowIds = [...new Set(items.map((item) => item.planned_flow_id))];
  const flows = await db
    .select({
      id: planned_flows.id,
      origin_id: planned_flows.origin_id,
      destination_id: planned_flows.destination_id,
      merchandise_name: merchandise.name,
    })
    .from(planned_flows)
    .innerJoin(merchandise, eq(planned_flows.merchandise_id, merchandise.id))
    .where(inArray(planned_flows.id, flowIds));
  const flowById = new Map(flows.map((flow) => [flow.id, flow]));
  const locationRows = await db.select().from(locations);
  const locationById = new Map(locationRows.map((location) => [location.id, location]));
  const prices = await db
    .select()
    .from(recommended_prices)
    .where(inArray(recommended_prices.planned_flow_id, flowIds));
  const priceMap = new Set(
    prices.map((price) => `${price.planned_flow_id}|${price.service}|${price.year}|${price.month}`),
  );
  const now = new Date().toISOString();
  let created = 0;
  for (const item of items) {
    const flow = flowById.get(item.planned_flow_id);
    const origin = locationById.get(flow?.origin_id ?? "");
    const destination = locationById.get(flow?.destination_id ?? "");
    if (!flow || !origin || !destination) continue;
    const schedules = await db
      .select()
      .from(quote_schedules)
      .where(eq(quote_schedules.quote_line_item_id, item.id));
    for (const schedule of schedules) {
      const key = `${item.planned_flow_id}|${schedule.service}|${schedule.year}|${schedule.month}`;
      if (priceMap.has(key)) continue;
      const unitPrice = jetsonsUnitPrice({
        origin: origin as JetsonsEndpoint,
        destination: destination as JetsonsEndpoint,
        merchandise: flow.merchandise_name,
        service: schedule.service,
        year: schedule.year,
        month: schedule.month,
      });
      await db.insert(recommended_prices).values({
        id: crypto.randomUUID(),
        planned_flow_id: item.planned_flow_id,
        service: schedule.service,
        year: schedule.year,
        month: schedule.month,
        unit_price: unitPrice,
        source: "Jetsons (mock · mercado)",
        created_at: now,
        updated_at: now,
      });
      priceMap.add(key);
      created++;
    }
  }
  return created;
}
