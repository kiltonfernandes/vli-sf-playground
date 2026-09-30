import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  applyRecommendedPrices,
  completeQuote,
  deleteRecord,
  getQuoteFull,
  listQuoteOptions,
  saveRecord,
  saveQuoteItemScreenflow,
  setAddendumScheduleExclusion,
  submitQuoteForApproval,
  syncQuote,
  updateOpportunityTerm,
  updateScheduleTariff,
  validateQuotePrices,
} from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfRecordDialog, SfDeleteButton, type FieldDef } from "@/components/SfRecordDialog";
import { QuoteItemEditDialog, QuoteItemScreenflow } from "@/components/QuoteItemScreenflow";
import { fmtMoney } from "@/lib/format";
import { BusinessRulesChecklist, type BusinessRule } from "@/components/BusinessRulesChecklist";
import { SfPath } from "@/components/SfPath";
import { FIELD_LABELS } from "@/lib/addendum";

const SERVICES = ["FRETE", "CARGA", "DESCARGA", "BALDEAÇÃO", "MANOBRA ORIGEM", "MANOBRA DESTINO"];
export const Route = createFileRoute("/quotes/$id")({
  head: () => ({ meta: [{ title: "Cotação | CRM" }] }),
  component: QuotePage,
});

function QuotePage() {
  const { id } = Route.useParams(),
    qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({ items: true, header: true }),
    [newItem, setNewItem] = useState(false),
    [scheduleItem, setScheduleItem] = useState<any>(null),
    [editItem, setEditItem] = useState<any>(null),
    [editSchedule, setEditSchedule] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pricePanel, setPricePanel] = useState<any>(null),
    [groupMode, setGroupMode] = useState<"structure" | "period">("structure");
  const { data, isLoading } = useQuery({
    queryKey: ["quote-full", id],
    queryFn: () => getQuoteFull({ data: { id } }) as Promise<any>,
  });
  const { data: options } = useQuery({
    queryKey: ["quote-options", data?.quote?.opportunity_id],
    enabled: !!data?.quote,
    queryFn: () =>
      listQuoteOptions({ data: { opportunityId: data!.quote.opportunity_id } }) as Promise<any>,
  });
  if (isLoading)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>Carregando Cotação…</div>
      </SfShell>
    );
  if (!data?.quote)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>
          Cotação não encontrada. <Link to="/quotes">Voltar às Cotações</Link>
        </div>
      </SfShell>
    );
  const q = data.quote,
    items = data.items as any[];
  const thresholds = data.thresholds ?? { gg: 5, dir: 7 };
  const tariffMode = q.tariff_mode || options?.opportunity?.integration_tariff || "Líquida";
  const canChangeTariff = !items.some((item) => item.schedules?.length);
  const applicationDay = Number(options?.opportunity?.application_day ?? 10);
  const addendum = data.addendum as any | null;
  const isAddendum = q.instrument_type === "Aditivo";
  const editable = q.status === "Rascunho" && !q.is_synced;
  const businessRules = [
    ...getQuoteBusinessRules(q, items, options, tariffMode, applicationDay),
    ...(isAddendum
      ? [
          {
            label: "Aditivo com ao menos uma mudança",
            passed: !!addendum?.hasChanges,
            detail: addendum
              ? `${addendum.summary.Incluir} incluir · ${addendum.summary.Alterar} alterar · ${addendum.summary.Excluir} excluir${addendum.termChanged ? " · vigência alterada" : ""}`
              : "Sem contrato original vinculado.",
            explanation:
              "A Cotação do aditivo começa com as Agendas do contrato vigente marcadas como Manter. Para concluir, inclua uma Agenda, altere volume/preço/Base Diesel de uma Agenda existente, marque uma como Excluir ou altere a vigência. A alçada de preço considera somente as Agendas incluídas ou alteradas.",
          },
        ]
      : []),
  ];
  const priceOk = ["Ok", "Aprovada"].includes(String(q.price_status));
  const needsApproval =
    ["Pendente alçada", "Aprovada", "Rejeitada"].includes(String(q.price_status)) ||
    (q.alcada_level && q.alcada_level !== "Sem alçada");
  const hasSchedules = items.some((item) => item.schedules?.length);
  const pathSteps = [
    { label: "Rascunho", hint: hasSchedules ? `${items.length} itens` : "Adicione Itens e Agendas" },
    { label: "Validação de preços", hint: String(q.price_status) },
    ...(needsApproval
      ? [{ label: "Aprovação", hint: q.price_status === "Aprovada" ? "Aprovada" : q.price_status === "Rejeitada" ? "Rejeitada" : "Pendente" }]
      : []),
    { label: "Concluída" },
    { label: "Sincronizada" },
  ];
  const pathIndex = (() => {
    const approvalOffset = needsApproval ? 1 : 0;
    if (q.is_synced) return pathSteps.length - 1;
    if (q.status === "Concluída") return 3 + approvalOffset;
    if (!hasSchedules) return 0;
    if (needsApproval && q.price_status !== "Aprovada") return q.price_status === "Não validada" ? 1 : 2;
    if (!priceOk) return 1;
    return 2 + approvalOffset;
  })();
  const pathBlocked = q.price_status === "Rejeitada";
  function scheduleRow(row: any, item: any, withContext = false) {
    const practiced = Number(
      tariffMode === "CBS"
        ? (row.accessory_cbs ?? row.tariff_cbs ?? 0)
        : (row.accessory_net ?? row.tariff_net ?? 0),
    );
    const jetsons = row.recommended_unit;
    const deviation = jetsons && jetsons > 0 ? ((practiced - jetsons) / jetsons) * 100 : null;
    const situation = priceSituation(deviation, thresholds, q.price_status === "Aprovada");
    const operation = row.operation as string | null;
    const baseline = !!row.base_snapshot;
    const excluded = operation === "Excluir";
    return (
      <tr
        key={row.id}
        style={{
          ...situationRowStyle(situation),
          ...(excluded ? { opacity: 0.55, textDecoration: "line-through" } : {}),
        }}
      >
        {isAddendum && (
          <td>
            <span
              className={`sf-op-chip sf-op-chip--${operation ?? "Incluir"}`}
              title={
                operation === "Alterar"
                  ? `Alterado: ${changedLabels(row).join(", ")}`
                  : operation === "Manter"
                    ? "Sem mudança em relação ao contrato"
                    : undefined
              }
            >
              {operation ?? "Incluir"}
            </span>
          </td>
        )}
        <td>
          <Link to="/quote-schedules/$id" params={{ id: row.id }} style={{ color: "#0176d3" }}>
            {String(row.month).padStart(2, "0")}/{row.year} · {row.period_window}
          </Link>
        </td>
        {withContext && (
          <>
            <td>{item.route}</td>
            <td>{item.merchandise_name}</td>
            <td>{row.service}</td>
          </>
        )}
        <td>{row.plaza}</td>
        <td>
          {row.volume.toLocaleString("pt-BR")} {item.unit}
        </td>
        <td>{fmtMoney(Number(tariffMode === "CBS" ? row.tariff_cbs : row.tariff_net))}</td>
        <td>{fmtMoney(practiced)}</td>
        <td>{jetsons ? fmtMoney(Number(jetsons)) : "—"}</td>
        <td style={{ color: deviationColor(deviation, thresholds), fontWeight: 600 }}>
          {deviation === null ? "—" : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}%`}
        </td>
        <td>
          <SituationChip situation={situation} thresholds={thresholds} />
        </td>
        <td style={{ whiteSpace: "nowrap", textDecoration: "none" }}>
          {!excluded && (
            <>
              <button className="sf-link" onClick={() => setEditSchedule({ ...row, item })}>
                Editar
              </button>{" "}
              ·{" "}
            </>
          )}
          {baseline ? (
            <button
              className="sf-link"
              style={{ color: excluded ? "#0176d3" : "#ba0517" }}
              disabled={!editable}
              onClick={async () => {
                try {
                  await setAddendumScheduleExclusion({
                    data: { quoteId: id, scheduleKey: row.schedule_key, exclude: !excluded },
                  });
                  await refresh();
                  toast.success(excluded ? "Agenda restaurada no aditivo" : "Agenda marcada como Excluir", {
                    description: "Todas as linhas de serviço desse período seguem a mesma marcação.",
                  });
                } catch (error) {
                  toast.error("Não foi possível alterar a Agenda", {
                    description: error instanceof Error ? error.message : undefined,
                  });
                }
              }}
            >
              {excluded ? "Restaurar" : "Excluir no aditivo"}
            </button>
          ) : (
            <button
              className="sf-link"
              style={{ color: "#ba0517" }}
              onClick={async () => {
                if (confirm("Excluir esta Agenda?")) {
                  try {
                    await deleteRecord({ data: { table: "quote_schedules", id: row.id } });
                    await refresh();
                  } catch (error) {
                    toast.error("Não foi possível excluir", {
                      description: error instanceof Error ? error.message : undefined,
                    });
                  }
                }
              }}
            >
              Excluir
            </button>
          )}
        </td>
      </tr>
    );
  }
  const baseLabels = new Map((options?.dieselBases ?? []).map((base: any) => [base.name, base.id]));
  const scheduleFields: FieldDef[] = [
    { name: "year", label: "Ano", type: "number", required: true },
    { name: "month", label: "Mês (1–12)", type: "number", required: true },
    {
      name: "frequency",
      label: "Periodicidade",
      type: "select",
      options: ["Mensal", "Anual"],
      required: true,
    },
    {
      name: "period_window",
      label: "Período",
      type: "select",
      options: [
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
      ],
      required: true,
    },
    { name: "division", label: "Divisão" },
    { name: "plaza", label: "Praça", placeholder: "TODAS_PRACAS_NACIONAL" },
    { name: "volume", label: "Volume inteiro", type: "number", required: true },
    { name: "tariff_cbs", label: `Tarifa CBS${tariffMode === "CBS" ? " (selecionada)" : " (não selecionada)"}`, type: "number" },
    { name: "tariff_net", label: `Tarifa líquida${tariffMode === "CBS" ? " (não selecionada)" : " (selecionada)"}`, type: "number" },
    {
      name: "diesel_label",
      label: "Base de repasse diesel",
      type: "select",
      options: [...baseLabels.keys()],
      required: true,
    },
    { name: "diesel_base_date", label: "Data base diesel (MM/AAAA)" },
    { name: "service", label: "Serviço", type: "select", options: SERVICES, required: true },
    { name: "accessory_cbs", label: "Tarifa acessória CBS", type: "number" },
    { name: "accessory_cbs_pct", label: "Percentual acessório CBS", type: "number" },
    { name: "accessory_net", label: "Tarifa acessória líquida", type: "number" },
    { name: "accessory_net_pct", label: "Percentual acessório líquido", type: "number" },
    { name: "tolerance_vli_tariff", label: "Tolerância tarifa VLI", type: "number" },
    { name: "tolerance_client_tariff", label: "Tolerância tarifa Cliente", type: "number" },
    { name: "tolerance_vli_volume", label: "Tolerância volume VLI", type: "number" },
    { name: "tolerance_client_volume", label: "Tolerância volume Cliente", type: "number" },
  ];
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["quote-full", id] });
    await qc.invalidateQueries({ queryKey: ["quote-options"] });
    await qc.invalidateQueries({ queryKey: ["quotes"] });
    await qc.invalidateQueries({ queryKey: ["opportunity-quotes"] });
    await qc.invalidateQueries({ queryKey: ["quote-items"] });
    await qc.invalidateQueries({ queryKey: ["quote-schedules"] });
  };
  async function doAction(action: "complete" | "sync") {
    setMessage("");
    setBusy(true);
    try {
      if (action === "complete") await completeQuote({ data: { id } });
      else await syncQuote({ data: { id } });
      await refresh();
      const success =
        action === "complete"
          ? "Cotação concluída. Agora pode sincronizar com a Oportunidade."
          : "Cotação sincronizada com a Oportunidade.";
      setMessage(success);
      toast.success(success);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Não foi possível concluir a ação.";
      setMessage(error);
      toast.error(
        action === "complete"
          ? "Não foi possível concluir a Cotação"
          : "Não foi possível sincronizar a Cotação",
        { description: error },
      );
    } finally {
      setBusy(false);
    }
  }
  async function doSubmitApproval() {
    setBusy(true);
    try {
      const response = await submitQuoteForApproval({ data: { id } });
      toast.success("Preços enviados para aprovação", {
        description: "A fila de Aprovação aguarda o Perfil Aprovador.",
      });
      await refresh();
      await qc.invalidateQueries({ queryKey: ["approvals"] });
    } catch (e) {
      toast.error("Não foi possível enviar para aprovação", {
        description: e instanceof Error ? e.message : "Tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  }
  function Section({
    id: sectionId,
    title,
    subtitle,
    children,
  }: {
    id: string;
    title: string;
    subtitle: string;
    children: React.ReactNode;
  }) {
    const expanded = !!open[sectionId];
    return (
      <section className="sf-card" style={{ overflow: "hidden" }}>
        <button
          onClick={() => setOpen((v) => ({ ...v, [sectionId]: !v[sectionId] }))}
          aria-expanded={expanded}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#fff",
            border: 0,
            padding: "15px 18px",
            textAlign: "left",
            cursor: "pointer",
            color: "#16325c",
          }}
        >
          <span style={{ fontSize: 18, width: 16 }}>{expanded ? "⌄" : "›"}</span>
          <strong>{title}</strong>
          <span style={{ color: "#706e6b", fontSize: 12 }}>{subtitle}</span>
        </button>
        {expanded && <div style={{ borderTop: "1px solid #e5e5e5", padding: 16 }}>{children}</div>}
      </section>
    );
  }
  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Cotação {q.quote_number}</div>
          <h1 className="sf-ph-title">{q.name}</h1>
          <div className="sf-ph-sub">
            <Link
              to="/opportunities/$id"
              params={{ id: q.opportunity_id }}
              style={{ color: "#0176d3" }}
            >
              {q.opportunity_name}
            </Link>{" "}
            · {q.account_name} · {q.instrument_type} · Ferroviário
          </div>
        </div>
        <div className="sf-ph-actions">
          <Link className="sf-btn" to="/quotes">
            Voltar
          </Link>
          <SfDeleteButton table="quotes" id={id} redirectTo="/quotes" />
        </div>
      </div>
      <SfPath
        label="Caminho da Cotação"
        steps={pathSteps}
        currentIndex={pathIndex}
        done={!!q.is_synced}
        blocked={pathBlocked}
        actions={<>
            <button
              className="sf-btn"
              disabled={busy || q.status !== "Rascunho" || !!q.is_synced}
              title="Abre o comparativo do Jetsons com todas as Agendas: desvio por linha, cores de alçada e edição de preço"
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await validateQuotePrices({ data: { id } });
                  setPricePanel(result);
                  await refresh();
                } catch (error) {
                  toast.error("Não foi possível validar os preços", {
                    description: error instanceof Error ? error.message : undefined,
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Validando…" : "Validar preços"}
            </button>
            {q.price_status === "Pendente alçada" && (
              <button
                className="sf-btn sf-btn--brand"
                disabled={busy}
                title="Envia os preços desta Cotação para a fila da aba Aprovação, onde um aprovador logado decide"
                onClick={() => doSubmitApproval()}
              >
                {busy ? "Enviando…" : "Enviar preços para aprovação"}
              </button>
            )}
            <button
              className="sf-btn"
              disabled={busy || q.status !== "Rascunho" || !!q.is_synced}
              onClick={() => doAction("complete")}
            >
              {busy ? "Validando…" : "Validar e concluir"}
            </button>
            <button
              className="sf-btn sf-btn--brand"
              disabled={busy || q.status !== "Concluída" || !!q.is_synced}
              onClick={() => doAction("sync")}
            >
              {busy ? "Sincronizando…" : "Sincronizar com Oportunidade"}
            </button>
          </>}
        message={
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PriceStatusBadge quote={q} />
            {message && (
              <span
                style={{
                  color:
                    message.includes("não") || message.includes("precisa") ? "#ba0517" : "#2e844a",
                }}
              >
                {message}
              </span>
            )}
          </span>
        }
      />
      <div className="sf-highlights">
        <Highlight label="Número" value={q.quote_number} />
        <Highlight label="Tipo" value={q.record_type} />
        <Highlight label="Status" value={q.is_synced ? "Sincronizada" : q.status} />
        <Highlight label="Seed" value={String(q.seed)} />
        <Highlight label="Itens" value={String(items.length)} />
        <Highlight
          label="Agendas"
          value={String(items.reduce((n, item) => n + item.schedules.length, 0))}
        />
      </div>
      <div className="quote-record-layout">
        <div className="quote-record-main">
        <Section id="header" title="Detalhes da Cotação" subtitle="Cabeçalho e vínculo Salesforce">
          <div className="sf-fields">
            <Field label="Oportunidade" value={q.opportunity_name} />
            <Field label="Conta de gestão" value={q.account_name} />
            <Field label="Record Type" value={q.record_type} />
            <Field label="Status" value={q.is_synced ? "Sincronizada" : q.status} />
            <Field label="Seed de geração" value={String(q.seed)} />
          </div>
          <OpportunityTermQuickFix
            opportunity={options?.opportunity}
            onSaved={async () => {
              await refresh();
              await qc.invalidateQueries({ queryKey: ["quote-full", id] });
              await qc.invalidateQueries({ queryKey: ["opportunities"] });
            }}
          />
        </Section>
        {isAddendum && addendum && <AddendumPanel addendum={addendum} />}
        <Section
          id="items"
          title="Itens da Cotação"
          subtitle={
            groupMode === "period"
              ? `${items.length} itens · agrupados por Período`
              : `${items.length} itens · agrupados por Companhia, Mercadoria, Trecho, Modal e Serviço`
          }
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#514f4d" }}>
              Agrupar por
              <div className="sf-segmented" role="group" aria-label="Agrupar Agendas">
                <button
                  type="button"
                  aria-pressed={groupMode === "structure"}
                  onClick={() => setGroupMode("structure")}
                >
                  Estrutura
                </button>
                <button
                  type="button"
                  aria-pressed={groupMode === "period"}
                  onClick={() => setGroupMode("period")}
                >
                  Período
                </button>
              </div>
            </div>
            <button
              className="sf-btn sf-btn--brand"
              onClick={() => setNewItem(true)}
              disabled={!options}
            >
              + Adicionar Item
            </button>
          </div>
          {!items.length && (
            <p style={{ color: "#706e6b" }}>
              Nenhum Item. Adicione uma combinação de Companhia, Trecho, Mercadoria, Modal e
              Serviço.
            </p>
          )}
          {groupMode === "period" && (
            <PeriodGroups
              items={items}
              isAddendum={isAddendum}
              tariffMode={tariffMode}
              renderRow={(row, item) => scheduleRow(row, item, true)}
            />
          )}
          {groupMode === "structure" && buildItemGroups(items, q.account_name).map((company) => (
            <details key={company.id} className="sf-nested-accordion" open>
              <summary>
                <span>›</span>
                <strong>🏢 {company.name}</strong>
                <small>
                  {company.itemCount} itens · {company.scheduleCount} agendas · volume{" "}
                  {company.volume.toLocaleString("pt-BR")}
                </small>
              </summary>
              <div style={{ padding: "2px 0 8px 18px" }}>
                {company.merchandises.map((merch) => (
                  <details key={merch.key} className="sf-nested-accordion" open>
                    <summary>
                      <span>›</span>
                      <strong>📦 {merch.name}</strong>
                      <small>
                        {merch.itemCount} itens · volume {merch.volume.toLocaleString("pt-BR")}{" "}
                        {merch.unit}
                      </small>
                    </summary>
                    <div style={{ padding: "2px 0 8px 18px" }}>
                      {merch.routes.map((route) => (
                        <details key={route.key} className="sf-nested-accordion" open>
                          <summary>
                            <span>›</span>
                            <strong>🛤️ {route.label}</strong>
                            <small>🚂 {route.modal}</small>
                          </summary>
                          <div style={{ padding: "2px 0 8px 18px" }}>
                            {route.items.map((item) => (
                              <details key={item.id} className="sf-nested-accordion" open>
                                <summary>
                                  <span>›</span>
                                  <strong>🔧 {item.service}</strong>
                                  <small>
                                    {item.schedules.length} agendas · praticado{" "}
                                    {fmtMoney(itemPracticedTotal(item, tariffMode))} ·{" "}
                                    <SituationChip
                                      situation={itemSituation(
                                        item,
                                        tariffMode,
                                        thresholds,
                                        q.price_status === "Aprovada",
                                      )}
                                      thresholds={thresholds}
                                    />
                                  </small>
                                  <Link
                                    to="/quote-line-items/$id"
                                    params={{ id: item.id }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Abrir registro
                                  </Link>
                                  <button
                                    className="sf-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditItem(item);
                                    }}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="sf-btn sf-btn--brand"
                                    style={{ padding: "2px 10px", fontSize: 12 }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setScheduleItem(item);
                                    }}
                                  >
                                    + Agenda
                                  </button>
                                </summary>
                                <div style={{ padding: 8 }}>
                                  {item.schedules.length > 0 ? (
                                    <div style={{ overflowX: "auto" }}>
                                      <table className="sf-table">
                                        <thead>
                                          <tr>
                                            {isAddendum && <th>Operação</th>}
                                            <th>Período</th>
                                            <th>Praça</th>
                                            <th>Volume</th>
                                            <th>Tarifa grupo</th>
                                            <th>Praticada</th>
                                            <th>Jetsons</th>
                                            <th>Desvio</th>
                                            <th>Situação</th>
                                            <th>Ações</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {item.schedules.map((row: any) => scheduleRow(row, item))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p style={{ color: "#706e6b" }}>Nenhuma agenda neste serviço.</p>
                                  )}
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </Section>
        </div>
        <aside className="quote-record-aside">
          <BusinessRulesChecklist rules={businessRules} />
        </aside>
      </div>
      {(newItem || scheduleItem) && (
        <QuoteItemScreenflow
          accountName={q.account_name}
          flows={options?.flows ?? []}
          dieselBases={options?.dieselBases ?? []}
          opportunityId={options?.opportunity?.id ?? ""}
          instrumentType={options?.opportunity?.instrument_type ?? "Contrato"}
          contractStart={options?.opportunity?.contract_start ?? ""}
          contractEnd={options?.opportunity?.contract_end ?? ""}
          firstReadjustmentDate={options?.opportunity?.first_readjustment_date ?? ""}
          readjustment={{
            diesel: Number(options?.opportunity?.diesel_pct ?? 0),
            igpm: Number(options?.opportunity?.igpm_pct ?? 0),
            ipca: Number(options?.opportunity?.ipca_pct ?? 0),
          }}
          integrationTariff={tariffMode}
          applicationDay={applicationDay}
          canChangeTariff={canChangeTariff}
          usedSchedules={(options?.usedSchedules ?? []).filter((row: any) => row.quote_id === id)}
          allowExtendTerm
          initialFlowId={scheduleItem?.flow_id}
          initialService={scheduleItem?.service}
          itemId={scheduleItem?.id}
          onClose={() => {
            setNewItem(false);
            setScheduleItem(null);
          }}
          onTermSaved={async () => {
            await refresh();
            await qc.invalidateQueries({ queryKey: ["quote-full", id] });
            await qc.invalidateQueries({ queryKey: ["opportunities"] });
          }}
          onSave={async ({ flowId, itemService, tariffMode: selectedTariffMode, groups }) => {
            try {
              const result = await saveQuoteItemScreenflow({
                data: {
                  quoteId: id,
                  itemId: scheduleItem?.id,
                  flowId,
                  itemService,
                  tariffMode: selectedTariffMode,
                  groups,
                },
              });
              await refresh();
              toast.success(
                scheduleItem ? "Agendas adicionadas ao Item" : "Item e Agendas salvos",
                {
                  description: result.extendedEnd
                    ? `${result.scheduleCount} linhas de Agenda criadas. Vigência estendida até ${result.extendedEnd.split("-").reverse().join("/")}.`
                    : `${result.scheduleCount} linhas de Agenda criadas.`,
                },
              );
              if (result.extendedEnd) await qc.invalidateQueries({ queryKey: ["opportunity-full"] });
              return true;
            } catch (error) {
              toast.error("Não foi possível salvar o Item e as Agendas", {
                description: error instanceof Error ? error.message : "Tente novamente.",
              });
              return false;
            }
          }}
        />
      )}
      {editItem && (
        <QuoteItemEditDialog
          item={editItem}
          quoteId={id}
          onClose={() => setEditItem(null)}
          onSaved={refresh}
        />
      )}
      {pricePanel && (
        <PricePanel
          result={pricePanel}
          canEdit={q.status === "Rascunho" && !q.is_synced}
          onClose={() => setPricePanel(null)}
          onRefreshed={(fresh) => setPricePanel(fresh)}
        />
      )}
      {editSchedule && (
        <SfRecordDialog
          title={
            editSchedule
              ? "Editar Agenda"
              : `Adicionar Agenda · ${scheduleItem.route} · ${scheduleItem.service}`
          }
          table="quote_schedules"
          recordId={editSchedule?.id}
          fields={scheduleFields}
          defaults={
            editSchedule
              ? {
                  ...editSchedule,
                  item: undefined,
                  diesel_label:
                    editSchedule.diesel_base_name ??
                    [...baseLabels.keys()].find(
                      (label) => baseLabels.get(label) === editSchedule.diesel_base_id,
                    ) ??
                    "",
                }
              : {
                  year: Number(options?.opportunity?.contract_start?.slice(0, 4) ?? 2026),
                  month: Number(options?.opportunity?.contract_start?.slice(5, 7) ?? 10),
                  frequency: "Mensal",
                  period_window: "Mês",
                  division: "Todas",
                  plaza: "TODAS_PRACAS_NACIONAL",
                  volume: 1000,
                  tariff_cbs: tariffMode === "CBS" ? 400 : "",
                  tariff_net: tariffMode === "CBS" ? "" : 400,
                  diesel_label: "ELDORADO",
                  diesel_base_date: `${String(applicationDay).padStart(2, "0")}/${String(options?.opportunity?.contract_start?.slice(5, 7) ?? "10").padStart(2, "0")}/${options?.opportunity?.contract_start?.slice(0, 4) ?? "2026"}`,
                  service: scheduleItem?.service ?? "FRETE",
                  accessory_cbs: tariffMode === "CBS" ? 400 : "",
                  accessory_cbs_pct: tariffMode === "CBS" ? 100 : "",
                  accessory_net: tariffMode === "CBS" ? "" : 400,
                  accessory_net_pct: tariffMode === "CBS" ? "" : 100,
                  tolerance_vli_tariff: 0,
                  tolerance_client_tariff: 0,
                  tolerance_vli_volume: 0,
                  tolerance_client_volume: 0,
                }
          }
          transform={(form) => {
            const { diesel_label, ...rest } = form;
            const parentItem = editSchedule?.item ?? scheduleItem;
            return {
              ...rest,
              quote_line_item_id: parentItem.id,
              diesel_base_id: baseLabels.get(diesel_label),
              schedule_key: "",
            };
          }}
          generateTransform={(form) => {
            const parentItem = editSchedule?.item ?? scheduleItem;
            const flow = (options?.flows ?? []).find(
              (entry: any) => entry.id === parentItem.flow_id,
            );
            if (!flow) throw new Error("Não foi possível localizar o Fluxo Planejado deste Item.");
            const start = options?.opportunity?.contract_start;
            const end = options?.opportunity?.contract_end;
            if (!start || !end)
              throw new Error("Preencha a vigência da Oportunidade antes de gerar Agendas.");
            const firstMonth = Number(start.slice(0, 4) + start.slice(5, 7));
            const lastMonth = Number(end.slice(0, 4) + end.slice(5, 7));
            const used = new Set(
              (options?.usedSchedules ?? []).map(
                (row: any) => `${row.schedule_key}|${row.service}`,
              ),
            );
            const division = String(form.division || "Todas");
            const plaza = String(form.plaza || "TODAS_PRACAS_NACIONAL");
            const service = String(form.service || "FRETE");
            const current = Number(form.year) * 100 + Number(form.month);
            for (
              let period = Math.max(firstMonth, current);
              period <= lastMonth;
              period = period % 100 === 12 ? period + 89 : period + 1
            ) {
              const year = Math.floor(period / 100);
              const month = period % 100;
              const key = `${flow.code}|${year}${String(month).padStart(2, "0")}|${division}|${plaza}`;
              if (!used.has(`${key}|${service}`)) {
                return {
                  year,
                  month,
                  service,
                  diesel_base_date: `${String(applicationDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
                };
              }
            }
            throw new Error(
              "Não há um período livre para esse serviço dentro da vigência da Oportunidade.",
            );
          }}
          onClose={() => {
            setScheduleItem(null);
            setEditSchedule(null);
          }}
          onSaved={refresh}
        />
      )}
    </SfShell>
  );
}
function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="sf-highlight">
      <div className="sf-highlight-label">{label}</div>
      <div className="sf-highlight-value">{value}</div>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="sf-field">
      <div className="sf-field-label">{label}</div>
      <div className="sf-field-value">{value}</div>
    </div>
  );
}

function getQuoteBusinessRules(
  quote: any,
  items: any[],
  options: any,
  tariffMode: string,
  applicationDay: number,
): BusinessRule[] {
  const schedules = items.flatMap((item) =>
    (item.schedules ?? []).map((schedule: any) => ({ ...schedule, item })),
  );
  const groups = new Map<string, any[]>();
  for (const schedule of schedules) {
    groups.set(schedule.schedule_key, [...(groups.get(schedule.schedule_key) ?? []), schedule]);
  }
  const accountMatches =
    items.length > 0 && items.every((item) => item.account_id === quote.account_id);
  const dimensionsComplete =
    items.length > 0 &&
    items.every(
      (item) =>
        item.modal === "Ferroviário" &&
        item.origin_system === "FLOU" &&
        !!item.origin_id &&
        !!item.destination_id &&
        !!item.merchandise_id,
    );
  const hasSchedules = schedules.length > 0;
  const tariffRulesPass =
    hasSchedules &&
    schedules.every((row) => {
      const selected = Number(tariffMode === "CBS" ? row.tariff_cbs : row.tariff_net);
      const other = Number(tariffMode === "CBS" ? row.tariff_net : row.tariff_cbs);
      return (
        Number.isInteger(Number(row.volume)) && Number(row.volume) > 0 && selected > 0 && other <= 0
      );
    });
  const freightPass =
    groups.size > 0 &&
    [...groups.values()].every((rows) =>
      rows.some((row) => String(row.service).toUpperCase() === "FRETE"),
    );
  const dieselPass =
    hasSchedules &&
    schedules.every((row) => {
      if (!row.diesel_base_id || !row.diesel_base_date) return false;
      const value = String(row.diesel_base_date);
      const full = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const monthYear = value.match(/^(\d{2})\/(\d{4})$/);
      if (full)
        return (
          Number(full[1]) === applicationDay &&
          Number(full[2]) === Number(row.month) &&
          Number(full[3]) === Number(row.year)
        );
      return (
        !!monthYear &&
        Number(monthYear[1]) === Number(row.month) &&
        Number(monthYear[2]) === Number(row.year)
      );
    });
  const allocationPass =
    groups.size > 0 &&
    [...groups.values()].every((rows) => {
      const amountField = tariffMode === "CBS" ? "accessory_cbs" : "accessory_net";
      const percentField = tariffMode === "CBS" ? "accessory_cbs_pct" : "accessory_net_pct";
      const amounts = rows.map((row) => Number(row[amountField] ?? 0));
      const percentages = rows.map((row) => Number(row[percentField] ?? 0));
      const mainTariff = Number(tariffMode === "CBS" ? rows[0].tariff_cbs : rows[0].tariff_net);
      const amountCents = amounts.reduce((sum, value) => sum + Math.round(value * 100), 0);
      const mainCents = Math.round(mainTariff * 100);
      const percentTotal = percentages.reduce((sum, value) => sum + value, 0);
      return Math.abs(amountCents - mainCents) <= 2 && Math.abs(percentTotal - 100) <= 0.2;
    });
  const localCounts = new Map<string, number>();
  for (const row of schedules) {
    const key = `${row.schedule_key}|${row.service}`;
    localCounts.set(key, (localCounts.get(key) ?? 0) + 1);
  }
  // A duplicidade vale dentro da Cotação: outras Cotações (inclusive aditivos) podem repetir a chave.
  const noDuplicates = hasSchedules && [...localCounts.values()].every((count) => count === 1);
  const opportunity = options?.opportunity;
  const termValid = isQuoteTermValid(opportunity);
  const termDays = opportunity?.contract_start && opportunity?.contract_end
    ? Math.round((Date.parse(`${opportunity.contract_end}T00:00:00Z`) - Date.parse(`${opportunity.contract_start}T00:00:00Z`)) / 86400000)
    : 0;
  const annualReadjustmentPass = termDays <= 365 || (
    Math.abs(Number(opportunity?.diesel_pct ?? 0) + Number(opportunity?.igpm_pct ?? 0) + Number(opportunity?.ipca_pct ?? 0) - 100) <= 0.001 &&
    !!opportunity?.first_readjustment_date &&
    opportunity.first_readjustment_date >= opportunity.contract_start &&
    opportunity.first_readjustment_date <= opportunity.contract_end
  );
  const acsRulesPass =
    opportunity?.instrument_type !== "ACS" ||
    (termValid &&
      items.every((item) => !item.top_eligible) &&
      schedules.every(
        (row) =>
          Number(row.tolerance_vli_volume ?? 0) === 0 &&
          Number(row.tolerance_client_volume ?? 0) === 0 &&
          Number(row.tolerance_vli_tariff ?? 0) === 0 &&
          Number(row.tolerance_client_tariff ?? 0) === 0,
      ));
  const synced = !!quote.is_synced && quote.status === "Sincronizada";

  return [
    {
      label: "Reajuste anual configurado",
      passed: annualReadjustmentPass,
      detail: annualReadjustmentPass
        ? termDays > 365 ? "Percentuais fecham 100% e a primeira data está na vigência." : "Percentuais anuais não são exigidos para esta vigência."
        : "Some Diesel, IGP-M e IPCA em 100% e informe a primeira data dentro da vigência.",
      explanation: "Quando a vigência passa de 365 dias, a Oportunidade precisa ter percentuais de reajuste cuja soma seja 100% e uma data para o primeiro reajuste dentro da vigência. O Playground valida os parâmetros cadastrados; o cálculo financeiro do reajuste ainda não está conectado ao objeto completo de reajustes.",
    },
    {
      label: "Cliente igual à Conta de gestão",
      passed: accountMatches,
      detail: accountMatches
        ? `${quote.account_name}: todos os Itens usam Fluxos desta Conta.`
        : "Adicione um Item com Fluxo da Conta de gestão desta Oportunidade.",
      explanation:
        "O cliente da Cotação vem da Conta de gestão da Oportunidade. Cada Item deve apontar para um Fluxo Planejado dessa mesma Conta, mantendo cliente, negociação e operação alinhados.",
    },
    {
      label: "Origem, destino, mercadoria e modal definidos",
      passed: dimensionsComplete,
      detail: dimensionsComplete
        ? "Os Itens usam Fluxos ferroviários completos."
        : "Selecione um Fluxo ferroviário elegível em cada Item.",
      explanation:
        "Cada Item representa um Fluxo com origem, destino, mercadoria e modal definidos. O Fluxo precisa estar elegível para uso ferroviário e associado ao cliente da Oportunidade; o Playground seleciona esses Fluxos automaticamente dentro do catálogo permitido.",
    },
    {
      label: "Volume inteiro e tarifa selecionada preenchidos",
      passed: tariffRulesPass,
      detail: tariffRulesPass
        ? `Volumes positivos e tarifa ${tariffMode} consistente em todas as linhas.`
        : `Adicione agendas com volume inteiro positivo e somente tarifa ${tariffMode}.`,
      explanation:
        "O volume de cada Agenda deve ser um número inteiro maior que zero. Para a Cotação, escolha CBS ou tarifa líquida; todas as linhas devem preencher a modalidade escolhida com valor positivo e deixar a alternativa vazia. Isso mantém a unidade de cálculo uniforme no conjunto.",
    },
    {
      label: "FRETE presente em cada grupo de Agenda",
      passed: freightPass,
      detail: freightPass
        ? `${groups.size} grupo(s) conferidos.`
        : "Cada grupo de período e praça precisa conter uma linha FRETE.",
      explanation:
        "Cada grupo de Agenda é formado pelo Fluxo, período, divisão e praça. No ferroviário, cada grupo precisa ter uma linha do serviço FRETE; serviços acessórios podem aparecer como linhas adicionais do mesmo grupo, sem repetir o mesmo serviço.",
    },
    {
      label: "Base Diesel e data automática válidas",
      passed: dieselPass,
      detail: dieselPass
        ? `Base e data compatíveis com o dia ${applicationDay}.`
        : "Informe a Base Diesel e a data correspondente ao período; o dia vem da Oportunidade.",
      explanation:
        "A Base Diesel precisa corresponder a uma base cadastrada e aplicável ao Fluxo. A Data Base Diesel é necessária para periodicidade anual ou quando o mesmo Fluxo tiver Agendas em mais de um mês. O dia efetivo é sempre herdado da Oportunidade (1, 10 ou 20), e as linhas do grupo devem compartilhar a mesma data.",
    },
    {
      label: "Rateio fecha a tarifa e soma 100%",
      passed: allocationPass,
      detail: allocationPass
        ? "Valores e percentuais das linhas acessórias conferidos."
        : "Confira os valores e percentuais dos serviços em cada grupo.",
      explanation:
        "Nas linhas acessórias, tarifa CBS e líquida são alternativas; o mesmo vale para os percentuais CBS e líquido. Quando só o valor ou só o percentual é informado, o outro é calculado. Quando ambos são informados, precisam corresponder. A soma dos valores deve fechar a tarifa principal, com ajuste residual de até R$ 0,02, e os percentuais devem totalizar 100% (tolerância de 0,2 ponto percentual). Se FRETE deixar os quatro campos acessórios vazios, as demais linhas ainda precisam cobrir 100% da tarifa.",
    },
    {
      label: "Sem serviço duplicado na chave da Agenda",
      passed: noDuplicates,
      detail: noDuplicates
        ? "Nenhum serviço repetido nesta Cotação."
        : "A mesma chave de Agenda já contém esse serviço.",
      explanation:
        "A duplicidade é verificada pela combinação funcional do Fluxo, ano e mês, divisão, praça e serviço. Um serviço só pode aparecer uma vez para essa combinação dentro da mesma Cotação. Ajuste o período, a praça ou remova a linha repetida.",
    },
    ...(opportunity?.instrument_type === "ACS"
      ? [
          {
            label: "Regras ACS atendidas",
            passed: acsRulesPass,
            detail: acsRulesPass
              ? "Vigência abaixo de 12 meses e sem tolerâncias ou Take or Pay."
              : "ACS exige vigência abaixo de 12 meses e não aceita tolerâncias nem Take or Pay.",
            explanation:
              "No instrumento ACS, a vigência precisa ser menor que 12 meses. Esta modalidade não aceita tolerâncias nem registros de Take or Pay; a Cotação só atende à regra quando não há esses valores ou vínculos.",
          },
        ]
      : []),
    {
      label: "Preço validado ou aprovado",
      passed: ["Ok", "Aprovada"].includes(String(quote.price_status ?? "")),
      detail: ["Ok", "Aprovada"].includes(String(quote.price_status ?? ""))
        ? `Desvio máximo de ${Number(quote.max_discount_pct ?? 0).toFixed(2)}%${quote.price_status === "Ok" ? " — sem aprovação" : " — aprovação concedida"}.`
        : "Use Validar preços para comparar cada Item com o preço recomendado do Jetsons.",
      explanation:
        "No ferroviário a margem é avaliada por competitividade de preço: cada Item é comparado ao preço recomendado (Jetsons). O desvio percentual é o maior desconto praticado em relação ao recomendado. Use o botão Validar preços para ver o comparativo por Item e o veredito da Cotação.",
    },
    {
      label: "Aprovação registrada quando necessária",
      passed:
        quote.price_status === "Ok" ||
        (quote.alcada_level !== "Sem alçada" && quote.price_status === "Aprovada") ||
        (quote.alcada_level === "Sem alçada" && ["Ok", "Aprovada"].includes(String(quote.price_status ?? ""))),
      detail:
        quote.price_status === "Aprovada"
          ? "Solicitação aprovada; a Cotação pode seguir para conclusão."
          : quote.price_status === "Pendente alçada"
            ? `Desvio de ${Number(quote.max_discount_pct ?? 0).toFixed(2)}% exige aprovação do Perfil Aprovador.`
            : "Sem aprovação necessária ou ainda não avaliada.",
      explanation:
        "Desvios até o limite configurado dispensam aprovação. Acima dele, a Cotação inteira fica pendente com base na pior Agenda. O Perfil Aprovador pode aprovar ou rejeitar qualquer solicitação; ao aprovar, os preços atuais passam na validação e a Cotação pode seguir.",
    },
    {
      label: "Cotação concluída e sincronizada",
      passed: synced,
      detail: synced
        ? "A sincronização foi concluída na Oportunidade."
        : "Valide e conclua a Cotação; depois sincronize com a Oportunidade.",
      explanation:
        "Concluir registra que os dados da Cotação passaram pelas validações disponíveis. Sincronizar vincula esse resultado à Oportunidade; a combinação desses estados libera o avanço para Aprovação quando as demais regras também estiverem atendidas.",
    },
  ];
}

function isQuoteTermValid(opportunity: any) {
  if (!opportunity?.contract_start || !opportunity?.contract_end) return false;
  const start = new Date(`${opportunity.contract_start}T00:00:00Z`);
  const end = new Date(`${opportunity.contract_end}T00:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return false;
  if (opportunity.instrument_type !== "ACS") return true;
  const limit = new Date(start);
  limit.setUTCMonth(limit.getUTCMonth() + 12);
  return end < limit;
}

/** Exibe a vigência da Oportunidade e, quando ausente, permite defini-la sem sair da Cotação. */
function OpportunityTermQuickFix({
  opportunity,
  onSaved,
}: {
  opportunity: any;
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  if (!opportunity) return null;
  const valid = isQuoteTermValid(opportunity);
  if (!editing) {
    if (valid) {
      return (
        <p style={{ fontSize: 12, color: "#706e6b", margin: "12px 0 0" }}>
          Vigência da Oportunidade:{" "}
          <strong>
            {String(opportunity.contract_start).slice(0, 10)} a{" "}
            {String(opportunity.contract_end).slice(0, 10)}
          </strong>{" "}
          ·{" "}
          <button
            className="sf-link"
            onClick={() => {
              setStart(String(opportunity.contract_start).slice(0, 10));
              setEnd(String(opportunity.contract_end).slice(0, 10));
              setEditing(true);
            }}
          >
            editar
          </button>
        </p>
      );
    }
    return (
      <div
        role="status"
        style={{
          marginTop: 12,
          padding: "10px 12px",
          border: "1px solid #fe9339",
          background: "#fffaf2",
          borderRadius: 6,
          fontSize: 13,
          color: "#b6761c",
        }}
      >
        <strong>Vigência da Oportunidade não definida.</strong> As Agendas e a conclusão da Cotação
        exigem o início e o fim da vigência — configure aqui mesmo, sem sair da Cotação.{" "}
        <button
          className="sf-btn"
          style={{ marginLeft: 8, padding: "4px 10px", fontSize: 12 }}
          onClick={() => {
            setStart("");
            setEnd("");
            setEditing(true);
          }}
        >
          Definir vigência
        </button>
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        border: "1px solid #dddbda",
        borderRadius: 6,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "flex-end",
        fontSize: 12,
      }}
    >
      <label>
        <span style={{ display: "block", marginBottom: 4, fontWeight: 600, color: "#444" }}>
          Início da vigência
        </span>
        <input
          className="sf-input"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          style={{ padding: 6 }}
        />
      </label>
      <label>
        <span style={{ display: "block", marginBottom: 4, fontWeight: 600, color: "#444" }}>
          Fim da vigência
        </span>
        <input
          className="sf-input"
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          style={{ padding: 6 }}
        />
      </label>
      <button
        className="sf-btn sf-btn--brand"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await updateOpportunityTerm({
              data: { id: opportunity.id, contract_start: start, contract_end: end },
            });
            toast.success("Vigência da Oportunidade atualizada.");
            setEditing(false);
            await onSaved();
          } catch (error) {
            toast.error("Não foi possível salvar a vigência", {
              description: error instanceof Error ? error.message : undefined,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Salvando…" : "Salvar vigência"}
      </button>
      <button className="sf-btn" disabled={busy} onClick={() => setEditing(false)}>
        Cancelar
      </button>
      {opportunity.instrument_type === "ACS" && (
        <span style={{ color: "#706e6b", alignSelf: "center" }}>ACS exige menos de 12 meses.</span>
      )}
    </div>
  );
}

function PriceStatusBadge({ quote }: { quote: any }) {
  const status = String(quote.price_status ?? "Não validada");
  const needsAlcada =
    quote.alcada_level && quote.alcada_level !== "Sem alçada" && status !== "Não validada";
  const color =
    status === "Ok" || status === "Aprovada"
      ? "#2e844a"
      : status === "Não validada"
        ? "#706e6b"
        : status === "Rejeitada"
          ? "#ba0517"
          : "#fe9339";
  const suffix = needsAlcada
    ? ` · ${quote.alcada_level}`
    : status === "Ok"
      ? " — sem alçada"
      : "";
  return (
    <span style={{ color, fontWeight: 600 }} title="Situação da validação de preço da Cotação">
      Preço: {status}
      {suffix}
    </span>
  );
}

type PriceSituation = "ok" | "gg" | "dir" | "approved" | null;

/** Classifica a situação do preço; uma decisão aprovada cobre todas as Agendas. */
function priceSituation(
  deviation: number | null,
  thresholds: { gg: number; dir: number },
  approved = false,
): PriceSituation {
  if (approved) return "approved";
  if (deviation === null) return null;
  const discount = Math.max(0, -deviation);
  if (discount > thresholds.dir) return "dir";
  if (discount > thresholds.gg) return "gg";
  return "ok";
}

function deviationColor(
  deviation: number | null,
  thresholds: { gg: number; dir: number },
  approved = false,
) {
  const situation = priceSituation(deviation, thresholds, approved);
  if (situation === "dir") return "#ba0517";
  if (situation === "gg") return "#fe9339";
  if (situation === "ok" || situation === "approved") return "#2e844a";
  return "#706e6b";
}

function situationRowStyle(situation: PriceSituation) {
  if (situation === "dir") return { background: "#fdeef0" };
  if (situation === "gg") return { background: "#fef7e3" };
  if (situation === "ok" || situation === "approved")
    return { background: "#f0f9f1" };
  return undefined;
}

function SituationChip({
  situation,
  thresholds,
}: {
  situation: PriceSituation;
  thresholds: { gg: number; dir: number };
}) {
  if (!situation)
    return <span style={{ color: "#706e6b", fontSize: 12 }}>sem preço Jetsons</span>;
  const config = {
    ok: { bg: "#f0f9f1", color: "#2e844a", label: "✅ Ok · sem aprovação" },
    gg: { bg: "#fef7e3", color: "#9c6700", label: `⚠️ Requer aprovação (> ${thresholds.gg}%)` },
    dir: { bg: "#fdeef0", color: "#ba0517", label: `⛔ Gravidade alta (> ${thresholds.dir}%)` },
    approved: { bg: "#f0f9f1", color: "#2e844a", label: "✅ Aprovada" },
  }[situation];
  return (
    <span
      style={{
        background: config.bg,
        color: config.color,
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}

type GroupedRoute = { key: string; label: string; modal: string; items: any[] };
type GroupedMerchandise = {
  key: string;
  id: string;
  name: string;
  unit: string;
  itemCount: number;
  scheduleCount: number;
  volume: number;
  routes: GroupedRoute[];
};
type GroupedCompany = {
  id: string;
  name: string;
  itemCount: number;
  scheduleCount: number;
  volume: number;
  merchandises: GroupedMerchandise[];
};

/** Árvore de Itens em 5 layers: Companhia → Mercadoria → Trecho → Modal → Serviço. */
function buildItemGroups(items: any[], accountName: string): GroupedCompany[] {
  const companies = new Map<string, GroupedCompany>();
  for (const item of items) {
    let company = companies.get(item.account_id);
    if (!company) {
      company = {
        id: item.account_id,
        name: accountName,
        itemCount: 0,
        scheduleCount: 0,
        volume: 0,
        merchandises: [],
      };
      companies.set(item.account_id, company);
    }
    const volume = (item.schedules ?? []).reduce(
      (sum: number, row: any) => sum + Number(row.volume ?? 0),
      0,
    );
    company.itemCount++;
    company.scheduleCount += (item.schedules ?? []).length;
    company.volume += volume;
    let merch = company.merchandises.find((entry) => entry.id === item.merchandise_id);
    if (!merch) {
      merch = {
        key: item.merchandise_id,
        id: item.merchandise_id,
        name: item.merchandise_name,
        unit: item.unit,
        itemCount: 0,
        scheduleCount: 0,
        volume: 0,
        routes: [],
      };
      company.merchandises.push(merch);
    }
    merch.itemCount++;
    merch.scheduleCount += (item.schedules ?? []).length;
    merch.volume += volume;
    const routeKey = `${item.origin_id}|${item.destination_id}`;
    let route = merch.routes.find((entry) => entry.key === routeKey);
    if (!route) {
      route = {
        key: routeKey,
        label: `${item.origin_name} (${item.origin_code}) → ${item.destination_name} (${item.destination_code})`,
        modal: item.modal,
        items: [],
      };
      merch.routes.push(route);
    }
    route.items.push(item);
  }
  return [...companies.values()];
}

function schedulePracticedUnit(row: any, tariffMode: string) {
  return Number(
    tariffMode === "CBS"
      ? (row.accessory_cbs ?? row.tariff_cbs ?? 0)
      : (row.accessory_net ?? row.tariff_net ?? 0),
  );
}

function itemPracticedTotal(item: any, tariffMode: string) {
  return (item.schedules ?? []).reduce(
    (sum: number, row: any) => sum + schedulePracticedUnit(row, tariffMode) * Number(row.volume ?? 0),
    0,
  );
}

/** Pior situação entre as Agendas do Item (a maior exigência governa o Item). */
function itemSituation(
  item: any,
  tariffMode: string,
  thresholds: { gg: number; dir: number },
  approved = false,
): PriceSituation {
  if (approved) return "approved";
  let worst: PriceSituation = null;
  for (const row of item.schedules ?? []) {
    const jetsons = row.recommended_unit;
    if (!jetsons) continue;
    const deviation =
      ((schedulePracticedUnit(row, tariffMode) - jetsons) / jetsons) * 100;
    const situation = priceSituation(deviation, thresholds);
    if (situation === "dir") return "dir";
    if (situation === "gg") worst = "gg";
    if (situation === "ok" && !worst) worst = "ok";
  }
  return worst;
}

/** Campo editável de preço praticado: salva ao sair do campo (blur) ou com Enter. */
function PriceInput({
  scheduleId,
  value,
  disabled,
  onSaved,
}: {
  scheduleId: string;
  value: number;
  disabled: boolean;
  onSaved: (response: any) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(String(value)), [value]);
  async function commit() {
    const parsed = Number(draft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed === Number(value)) {
      setDraft(String(value));
      return;
    }
    setSaving(true);
    try {
      const response = await updateScheduleTariff({
        data: { scheduleId, unitPrice: parsed },
      });
      await onSaved(response);
    } catch (error) {
      toast.error("Não foi possível salvar o preço", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
      setDraft(String(value));
    } finally {
      setSaving(false);
    }
  }
  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={draft}
      disabled={disabled || saving}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      title={
        disabled
          ? "Edição de preço disponível somente em Rascunho"
          : "Edite o preço praticado e saia do campo para salvar e recalcular"
      }
      style={{
        width: 96,
        textAlign: "right",
        padding: "3px 6px",
        border: "1px solid #dddbda",
        borderRadius: 4,
        color: "#16325c",
      }}
    />
  );
}

function PricePanel({
  result,
  canEdit,
  onClose,
  onRefreshed,
}: {
  result: any;
  canEdit: boolean;
  onClose: () => void;
  onRefreshed: (fresh: any) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const thresholds = result.thresholds ?? { gg: 5, dir: 7 };
  const schedules = (result.schedules ?? []) as any[];
  const approved = result.price_status === "Aprovada";
  const ok = result.price_status === "Ok" || approved;
  const byItem = new Map<string, any[]>();
  for (const row of schedules)
    byItem.set(row.item_id, [...(byItem.get(row.item_id) ?? []), row]);

  const verdict = ok
    ? result.price_status === "Aprovada"
      ? `✅ Preços aprovados — desvio máximo de ${Number(result.max_discount_pct).toFixed(2)}%. A Cotação pode seguir.`
      : `✅ Preços ok — desvio máximo de ${Number(result.max_discount_pct).toFixed(2)}%, dentro do limite de ${thresholds.gg}%. Sem aprovação.`
    : result.price_status === "Não validada"
      ? "⚠️ Sem preços para comparar. Adicione Itens e Agendas à Cotação."
      : result.price_status === "Rejeitada"
        ? "⛔ Alçada rejeitada — ajuste os preços e valide novamente para concluir."
        : `⚠️ Desvio de ${Number(result.max_discount_pct).toFixed(2)}% acima do limite de ${thresholds.gg}%. Exige aprovação do Perfil Aprovador.`;

  const verdictColor = ok
    ? "#2e844a"
    : result.price_status === "Não validada"
      ? "#706e6b"
      : result.price_status === "Rejeitada"
        ? "#ba0517"
        : "#fe9339";

  async function invalidateAll() {
    await qc.invalidateQueries({ queryKey: ["quote-full", result.quote_id] });
    await qc.invalidateQueries({ queryKey: ["approvals"] });
    await qc.invalidateQueries({ queryKey: ["quotes"] });
    await qc.invalidateQueries({ queryKey: ["home-dashboard"] });
  }

  async function revalidate(action?: () => Promise<any>) {
    setBusy(true);
    try {
      if (action) await action();
      const fresh = await validateQuotePrices({ data: { id: result.quote_id } });
      onRefreshed(fresh);
      await invalidateAll();
      return fresh;
    } catch (error) {
      toast.error("Não foi possível concluir a ação", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sf-modal-backdrop" onClick={() => !busy && onClose()}>
      <section
        className="sf-modal sf-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-panel-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 1280 }}
      >
        <div className="sf-modal-header">
          <h2 id="price-panel-title">Comparativo de preços · Jetsons</h2>
          <button className="sf-btn" disabled={busy} onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="sf-modal-body">
          <div
            role="status"
            style={{
              color: verdictColor,
              fontWeight: 600,
              border: `1px solid ${verdictColor}`,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
            }}
          >
            {verdict}
          </div>
          <p style={{ fontSize: 12, color: "#706e6b" }}>
            Modalidade de tarifa: {result.tariff_mode}. O Jetsons (mock de mercado) mantém o preço
            recomendado por produto + trecho + serviço + período. Linhas verdes dispensam alçada
            (desvio até {thresholds.gg}%), amarelas indicam aprovação necessária e vermelhas
            gravidade alta (acima de {thresholds.dir}%). Qualquer solicitação pode ser decidida pelo
            Perfil Aprovador. Uma aprovação cobre todas as Agendas da Cotação. Edite o preço
            praticado direto na linha e saia do campo para salvar.
          </p>
          {(result.rows ?? []).map((row: any) => {
            const groupRows = byItem.get(row.item_id) ?? [];
            const situation = groupRows.reduce<PriceSituation>((worst, entry) => {
              const entrySituation = priceSituation(entry.deviation_pct, thresholds, approved);
              if (entrySituation === "dir" || worst === "dir") return "dir";
              if (entrySituation === "gg" || worst === "gg") return "gg";
              return entrySituation ?? worst;
            }, null);
            return (
              <div key={row.item_id} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 6,
                  }}
                >
                  <div>
                    <strong>
                      {row.flow_code} · {row.origin_name} → {row.destination_name}
                    </strong>
                    <div style={{ fontSize: 12, color: "#706e6b" }}>
                      {row.merchandise} · {row.service} · volume{" "}
                      {Number(row.volume_total).toLocaleString("pt-BR")} {row.unit}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12 }}>
                    <div>
                      Praticado <strong>{fmtMoney(Number(row.practiced_total))}</strong> · Jetsons{" "}
                      <strong>
                        {row.recommended_total === null
                          ? "—"
                          : fmtMoney(Number(row.recommended_total))}
                      </strong>
                    </div>
                    <SituationChip situation={situation} thresholds={thresholds} />
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="sf-table">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Praça</th>
                        <th>Volume</th>
                        <th>Preço praticado</th>
                        <th>Preço Jetsons</th>
                        <th>Desvio</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((entry: any) => {
                        const deviation = entry.deviation_pct;
                        const entrySituation = priceSituation(deviation, thresholds, approved);
                        return (
                          <tr
                            key={entry.schedule_id}
                            style={situationRowStyle(entrySituation)}
                          >
                            <td>
                              {String(entry.month).padStart(2, "0")}/{entry.year} ·{" "}
                              {entry.period_window}
                            </td>
                            <td>{entry.plaza}</td>
                            <td>{Number(entry.volume).toLocaleString("pt-BR")}</td>
                            <td>
                              <PriceInput
                                scheduleId={entry.schedule_id}
                                value={Number(entry.practiced_unit)}
                                disabled={busy || !canEdit}
                                onSaved={async (response) => {
                                  onRefreshed(response.result);
                                  await invalidateAll();
                                  toast.success("Preço atualizado", {
                                    description:
                                      "Comparativo recalculado com o novo preço praticado.",
                                  });
                                }}
                              />
                            </td>
                            <td>
                              {entry.recommended_unit === null
                                ? "—"
                                : fmtMoney(Number(entry.recommended_unit))}
                            </td>
                            <td
                              style={{
                                color: deviationColor(deviation, thresholds, approved),
                                fontWeight: 600,
                              }}
                            >
                              {deviation === null
                                ? "—"
                                : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}%`}
                            </td>
                            <td>
                              <SituationChip
                                situation={entrySituation}
                                thresholds={thresholds}
                              />
                            </td>
                          </tr>
                        );
                      })}
                      {!groupRows.length && (
                        <tr>
                          <td colSpan={7} style={{ color: "#706e6b" }}>
                            Nenhuma Agenda neste Item.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {!(result.rows ?? []).length && (
            <p style={{ color: "#706e6b" }}>
              Adicione Itens e Agendas para comparar preços com o Jetsons.
            </p>
          )}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 16,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <button
              className="sf-btn"
              disabled={busy || !canEdit}
              title={
                canEdit
                  ? "Grava o preço recomendado do Jetsons em todas as Agendas, mantendo o rateio em 100%"
                  : "Disponível somente em uma Cotação em Rascunho"
              }
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await applyRecommendedPrices({
                    data: { id: result.quote_id },
                  });
                  onRefreshed(response.result);
                  await invalidateAll();
                  toast.success("Preço recomendado aplicado em todas as Agendas", {
                    description: `Desvio máximo agora é de ${Number(
                      response.result.max_discount_pct,
                    ).toFixed(2)}%.`,
                  });
                } catch (error) {
                  toast.error("Não foi possível aplicar os preços", {
                    description: error instanceof Error ? error.message : "Tente novamente.",
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Aplicando…" : "Aprovar todas com preço recomendado"}
            </button>
            {result.price_status === "Pendente alçada" && (
              <button
                className="sf-btn sf-btn--brand"
                disabled={busy || result.open_approval}
                title={
                  result.open_approval
                    ? "Já existe uma solicitação aberta na fila de Aprovação"
                    : "Envia os preços desta Cotação para a fila da aba Aprovação, onde um aprovador logado decide"
                }
                onClick={async () => {
                  setBusy(true);
                  try {
                    await submitQuoteForApproval({ data: { id: result.quote_id } });
                    await invalidateAll();
                    toast.success("Preços enviados para aprovação", {
                      description: `A fila de Aprovação aguarda um aprovador ${result.alcada_level}.`,
                    });
                    const fresh = await validateQuotePrices({ data: { id: result.quote_id } });
                    onRefreshed(fresh);
                  } catch (error) {
                    toast.error("Não foi possível enviar para aprovação", {
                      description: error instanceof Error ? error.message : "Tente novamente.",
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {result.open_approval ? "Na fila de aprovação" : "Enviar preços para aprovação"}
              </button>
            )}
            <button
              className="sf-btn"
              disabled={busy}
              title="Recalcula o comparativo com os dados atuais"
              onClick={async () => {
                const fresh = await revalidate();
                if (fresh)
                  toast.success("Comparativo revalidado", {
                    description: `Situação: ${fresh.price_status} · desvio máximo de ${Number(
                      fresh.max_discount_pct,
                    ).toFixed(2)}%.`,
                  });
              }}
            >
              {busy ? "Revalidando…" : "Revalidar"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function changedLabels(row: any) {
  if (!row.base_snapshot) return [];
  try {
    const base = JSON.parse(row.base_snapshot) as Record<string, unknown>;
    return Object.keys(FIELD_LABELS)
      .filter((field) => {
        const a = base[field],
          b = row[field];
        const empty = (value: unknown) => value === null || value === undefined || value === "";
        if (empty(a) && empty(b)) return false;
        if ((empty(a) && Number(b) === 0) || (empty(b) && Number(a) === 0)) return false;
        if (typeof a === "number" || typeof b === "number")
          return Math.abs(Number(a) - Number(b)) >= 0.005;
        return String(a) !== String(b);
      })
      .map((field) => FIELD_LABELS[field]);
  } catch {
    return [];
  }
}

function PeriodGroups({
  items,
  isAddendum,
  tariffMode,
  renderRow,
}: {
  items: any[];
  isAddendum: boolean;
  tariffMode: string;
  renderRow: (row: any, item: any) => React.ReactNode;
}) {
  const periods = new Map<string, Array<{ row: any; item: any }>>();
  for (const item of items)
    for (const row of item.schedules ?? []) {
      const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
      periods.set(key, [...(periods.get(key) ?? []), { row, item }]);
    }
  const sorted = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!sorted.length) return null;
  return (
    <>
      {sorted.map(([key, rows]) => {
        const [year, month] = key.split("-");
        const volume = rows
          .filter(({ row }) => row.service === "FRETE")
          .reduce((sum, { row }) => sum + Number(row.volume), 0);
        const practiced = rows.reduce((sum, { row }) => {
          const unit = Number(
            tariffMode === "CBS"
              ? (row.accessory_cbs ?? row.tariff_cbs ?? 0)
              : (row.accessory_net ?? row.tariff_net ?? 0),
          );
          return sum + unit * Number(row.volume);
        }, 0);
        const flows = new Set(rows.map(({ item }) => item.flow_id)).size;
        return (
          <details key={key} className="sf-nested-accordion" open>
            <summary>
              <span>›</span>
              <strong>📅 {month}/{year}</strong>
              <small>
                {rows.length} agendas · {flows} fluxo(s) · volume {volume.toLocaleString("pt-BR")} ·
                praticado {fmtMoney(practiced)}
              </small>
            </summary>
            <div style={{ padding: 8, overflowX: "auto" }}>
              <table className="sf-table">
                <thead>
                  <tr>
                    {isAddendum && <th>Operação</th>}
                    <th>Período</th>
                    <th>Trecho</th>
                    <th>Mercadoria</th>
                    <th>Serviço</th>
                    <th>Praça</th>
                    <th>Volume</th>
                    <th>Tarifa grupo</th>
                    <th>Praticada</th>
                    <th>Jetsons</th>
                    <th>Desvio</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>{rows.map(({ row, item }) => renderRow(row, item))}</tbody>
              </table>
            </div>
          </details>
        );
      })}
    </>
  );
}

function AddendumPanel({ addendum }: { addendum: any }) {
  const summary = addendum.summary ?? {};
  const fmt = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "—");
  return (
    <section className="sf-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="sf-next-step-eyebrow">Motor de aditivo</div>
          <strong style={{ fontSize: 16, color: "#032d60" }}>
            Mudanças sobre o contrato{" "}
            <a
              href={`/netlex/contracts/${addendum.baseContract.id}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#0176d3" }}
            >
              Nº {addendum.baseContract.netlex_number}
            </a>
          </strong>
          <div style={{ fontSize: 12, color: "#514f4d", marginTop: 4 }}>
            Vigência do contrato: {fmt(addendum.baseTerm.start)} a {fmt(addendum.baseTerm.end)}
            {addendum.termChanged && (
              <>
                {" "}
                → <strong>{fmt(addendum.newTerm.start)} a {fmt(addendum.newTerm.end)}</strong>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {(["Manter", "Incluir", "Alterar", "Excluir"] as const).map((operation) => (
            <span key={operation} className={`sf-op-chip sf-op-chip--${operation}`}>
              {operation}: {summary[operation] ?? 0}
            </span>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#514f4d", margin: "10px 0 6px" }}>
        As Agendas do contrato entram como <b>Manter</b>. Editar volume, preço ou Base Diesel vira{" "}
        <b>Alterar</b>; “Excluir no aditivo” marca <b>Excluir</b>; Agendas novas, inclusive depois do
        fim original da vigência, entram como <b>Incluir</b>. A alçada considera só Incluir e Alterar.
      </p>
      <strong style={{ fontSize: 13 }}>Cláusulas geradas ({addendum.clauses.length})</strong>
      {addendum.clauses.length ? (
        <ol className="sf-clause-list">
          {addendum.clauses.map((clause: any) => (
            <li key={clause.number}>
              <strong>
                {clause.number}. {clause.title}
              </strong>
              {clause.text}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: 12, color: "#706e6b" }}>
          Nenhuma mudança ainda. O aditivo precisa de ao menos uma inclusão, alteração, exclusão ou
          mudança de vigência.
        </p>
      )}
    </section>
  );
}
