import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  completeQuote,
  deleteRecord,
  getQuoteFull,
  listQuoteOptions,
  saveRecord,
  saveQuoteItemScreenflow,
  syncQuote,
} from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfRecordDialog, SfDeleteButton, type FieldDef } from "@/components/SfRecordDialog";
import { QuoteItemEditDialog, QuoteItemScreenflow } from "@/components/QuoteItemScreenflow";
import { fmtMoney } from "@/lib/format";

const SERVICES = ["FRETE", "CARGA", "DESCARGA", "BALDEAÇÃO", "MANOBRA ORIGEM", "MANOBRA DESTINO"];
export const Route = createFileRoute("/quotes/$id")({
  head: () => ({ meta: [{ title: "Cotação | CRM" }] }),
  component: QuotePage,
});

function QuotePage() {
  const { id } = Route.useParams(),
    qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({ items: true }),
    [newItem, setNewItem] = useState(false),
    [scheduleItem, setScheduleItem] = useState<any>(null),
    [editItem, setEditItem] = useState<any>(null),
    [editSchedule, setEditSchedule] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
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
  const tariffMode = q.tariff_mode || options?.opportunity?.integration_tariff || "Líquida";
  const canChangeTariff = !items.some((item) => item.schedules?.length);
  const applicationDay = Number(options?.opportunity?.application_day ?? 10);
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
      <div style={{ padding: 20, display: "grid", gap: 14 }}>
        <Section id="header" title="Detalhes da Cotação" subtitle="Cabeçalho e vínculo Salesforce">
          <div className="sf-fields">
            <Field label="Oportunidade" value={q.opportunity_name} />
            <Field label="Conta de gestão" value={q.account_name} />
            <Field label="Record Type" value={q.record_type} />
            <Field label="Status" value={q.is_synced ? "Sincronizada" : q.status} />
            <Field label="Seed de geração" value={String(q.seed)} />
          </div>
        </Section>
        <Section
          id="items"
          title="Itens da Cotação"
          subtitle={`${items.length} itens, agrupados por Cliente, Origem, Destino, Mercadoria e Modal`}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
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
              Nenhum Item. Adicione uma combinação de Cliente, Origem, Destino, Mercadoria e Modal.
            </p>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((item) => (
              <details key={item.id} className="sf-nested-accordion" open>
                <summary>
                  <span>›</span>
                  <strong>
                    {q.account_name} · {item.route} · {item.merchandise_name} · Ferroviário ·{" "}
                    {item.service}
                  </strong>
                  <small>
                    {item.schedules.length} agendas · {item.unit}
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
                </summary>
                <div style={{ padding: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span>{item.schedules.length} subitens de agenda</span>
                    <button className="sf-btn sf-btn--brand" onClick={() => setScheduleItem(item)}>
                      + Adicionar Agenda
                    </button>
                  </div>
                  {item.schedules.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table className="sf-table">
                        <thead>
                          <tr>
                            <th>Período</th>
                            <th>Chave da agenda</th>
                            <th>Volume</th>
                            <th>Tarifa</th>
                            <th>Serviço</th>
                            <th>Acessório</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.schedules.map((row: any) => (
                            <tr key={row.id}>
                              <td>
                                {String(row.month).padStart(2, "0")}/{row.year} ·{" "}
                                {row.period_window}
                              </td>
                              <td>
                                <Link
                                  to="/quote-schedules/$id"
                                  params={{ id: row.id }}
                                  style={{ color: "#0176d3" }}
                                >
                                  {row.schedule_key}
                                </Link>
                              </td>
                              <td>
                                {row.volume.toLocaleString("pt-BR")} {item.unit}
                              </td>
                              <td>{fmtMoney(Number(row.tariff_cbs ?? row.tariff_net))}</td>
                              <td>{row.service}</td>
                              <td>
                                {fmtMoney(Number(row.accessory_cbs ?? row.accessory_net))} ·{" "}
                                {Number(row.accessory_cbs_pct ?? row.accessory_net_pct).toFixed(2)}%
                              </td>
                              <td>
                                <button
                                  className="sf-link"
                                  onClick={() => setEditSchedule({ ...row, item })}
                                >
                                  Editar
                                </button>{" "}
                                ·{" "}
                                <button
                                  className="sf-link"
                                  style={{ color: "#ba0517" }}
                                  onClick={async () => {
                                    if (confirm("Excluir esta Agenda?")) {
                                      await deleteRecord({
                                        data: { table: "quote_schedules", id: row.id },
                                      });
                                      await refresh();
                                    }
                                  }}
                                >
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Section>
        <Section
          id="rules"
          title="Regras e validações aplicadas"
          subtitle="Ferroviário · Contrato e ACS"
        >
          <ul style={{ margin: 0, lineHeight: 1.8, paddingLeft: 22 }}>
            <li>
              <strong>Cliente</strong>
              <ul>
                <li>
                  É a Conta de gestão da Oportunidade.
                  <ul>
                    <li>O sistema oferece os Fluxos Planejados elegíveis vinculados a essa Conta.</li>
                  </ul>
                </li>
                <li>
                  <strong>Origem</strong>
                  <ul>
                    <li>
                      <strong>Destino</strong>
                      <ul>
                        <li>
                          <strong>Mercadoria</strong>
                          <ul>
                            <li>
                              <strong>Modal</strong> — neste escopo, Ferroviário.
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
            <li>
              <strong>Itens e agendas</strong>
              <ul>
                <li>Volume é inteiro e positivo; CBS ou tarifa líquida deve estar preenchida.</li>
                <li>Cada grupo tem FRETE, Base Diesel e rateio que fecha o total e soma 100%.</li>
                <li>A Data de aplicação diesel usa automaticamente o dia configurado na Oportunidade.</li>
                <li>
                  Duplicidade usa código de fluxo, ano/mês, divisão, praça e serviço, inclusive
                  entre Cotações.
                </li>
              </ul>
            </li>
            <li>
              <strong>ACS</strong>
              <ul>
                <li>Vigência inferior a 12 meses; não aceita tolerâncias nem Take or Pay.</li>
              </ul>
            </li>
            <li>
              <strong>Oportunidade</strong>
              <ul>
                <li>Concluir e sincronizar libera o avanço para Aprovação.</li>
              </ul>
            </li>
          </ul>
        </Section>
        <div
          className="sf-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 14,
            gap: 12,
          }}
        >
          <div>
            <strong>Etapas da Cotação</strong>
            <div style={{ fontSize: 12, color: "#706e6b" }}>
              Rascunho → Concluída → Sincronizada
            </div>
            {message && (
              <div
                role="status"
                style={{
                  color:
                    message.includes("não") || message.includes("precisa") ? "#ba0517" : "#2e844a",
                  marginTop: 6,
                }}
              >
                {message}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
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
          </div>
        </div>
      </div>
      {(newItem || scheduleItem) && (
        <QuoteItemScreenflow
          accountName={q.account_name}
          flows={options?.flows ?? []}
          dieselBases={options?.dieselBases ?? []}
          contractStart={options?.opportunity?.contract_start ?? ""}
          contractEnd={options?.opportunity?.contract_end ?? ""}
          integrationTariff={tariffMode}
          applicationDay={applicationDay}
          canChangeTariff={canChangeTariff}
          usedSchedules={options?.usedSchedules ?? []}
          initialFlowId={scheduleItem?.flow_id}
          initialService={scheduleItem?.service}
          itemId={scheduleItem?.id}
          onClose={() => {
            setNewItem(false);
            setScheduleItem(null);
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
                { description: `${result.scheduleCount} linhas de Agenda criadas.` },
              );
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
