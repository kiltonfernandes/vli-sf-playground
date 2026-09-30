import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPostContractDocument } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfPath } from "@/components/SfPath";
import { PostContractStatus } from "@/components/PostContract";
import { fmtDate, fmtMoney } from "@/lib/format";
import { SALES_ORDER, SALES_ORDER_STATUS, daysUntil, periodLabel } from "@/lib/post-contract";

export const Route = createFileRoute("/post-contract/$id")({
  head: () => ({
    meta: [
      { title: "Pós-contrato | VLI" },
      { name: "description", content: "Ordem de vendas ou curva de ajuste vinculada a um contrato." },
    ],
  }),
  component: PostContractDocumentPage,
});

const fmtVolume = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR");
const fmtTariff = (value: unknown) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function PostContractDocumentPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["post-contract-document", id],
    queryFn: () => getPostContractDocument({ data: { id } }),
  });
  if (isLoading)
    return (
      <SfShell>
        <div style={{ padding: 32 }}>Carregando documento…</div>
      </SfShell>
    );
  if (!data)
    return (
      <SfShell>
        <div style={{ padding: 32 }}>
          Documento não encontrado. <Link to="/opportunities">Voltar às oportunidades</Link>
        </div>
      </SfShell>
    );
  const doc = (data.document ?? {}) as Record<string, any>;
  const isOrder = data.kind === SALES_ORDER;
  const status = String(data.status);
  const approved = status === SALES_ORDER_STATUS.approved;
  const expired = status === SALES_ORDER_STATUS.expired;
  const days = daysUntil(doc.expiresAt);
  const parties = (doc.parties ?? {}) as Record<string, any>;
  const commercial = (doc.commercialConditions ?? {}) as Record<string, any>;
  const readjustment = (doc.readjustment ?? {}) as Record<string, any>;
  const usesCbs = String(commercial.tariffBasis ?? "").toLowerCase() === "cbs";
  const items = (doc.items ?? []) as Array<Record<string, any>>;
  const history = (doc.history ?? []) as Array<Record<string, any>>;

  return (
    <SfShell>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ color: "#5c5c5c", fontSize: 12, fontWeight: 700 }}>
              PÓS-CONTRATO · {String(data.kind).toUpperCase()}
            </div>
            <h1 style={{ margin: "5px 0 0", fontSize: 24 }}>{data.title}</h1>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 13 }}>
              {data.opportunity && (
                <Link to="/opportunities/$id" params={{ id: data.opportunity.id }} style={{ color: "#0176d3" }}>
                  Oportunidade: {data.opportunity.name}
                </Link>
              )}
              {data.baseContract && (
                <Link to="/netlex/contracts/$id" params={{ id: data.baseContract.id }} style={{ color: "#0176d3" }}>
                  Contrato-base Nº {data.baseContract.netlex_number} · {data.baseContract.status}
                </Link>
              )}
            </div>
          </div>
          <PostContractStatus status={status} />
        </div>

        {isOrder ? (
          <SfPath
            label="Etapas da ordem de vendas"
            steps={[
              { label: "Enviada ao cliente", hint: fmtDate(doc.sentAt) },
              {
                label: "Aceite no portal",
                hint: expired ? "Expirada" : approved ? "Concluído" : days !== null ? `${Math.max(days, 0)} dia(s) restantes` : "",
              },
              { label: "Aprovada pelo cliente", hint: doc.approvedAt ? fmtDate(doc.approvedAt) : "Libera o fechamento" },
            ]}
            currentIndex={approved ? 2 : 1}
            done={approved}
            blocked={expired}
            actions={
              !approved && !expired ? (
                <a className="sf-btn sf-btn--brand" href={`/portal/sales-orders/${data.id}`} target="_blank" rel="noreferrer">
                  Abrir portal do cliente ↗
                </a>
              ) : undefined
            }
            message={
              approved
                ? `Aprovada por ${doc.approvedBy ?? doc.contact?.name ?? "cliente"}. A Oportunidade pode ser fechada.`
                : expired
                  ? "A semana de validade passou sem aprovação. Reenvie pela Oportunidade."
                  : `Com ${doc.contact?.name ?? "o contato aprovador"} até ${fmtDate(doc.expiresAt)}. Simulação: aprove pelo portal.`
            }
          />
        ) : (
          <SfPath
            label="Etapas da curva de ajuste"
            steps={[{ label: "Negociada" }, { label: "Registrada", hint: fmtDate(doc.registeredAt) }]}
            currentIndex={1}
            done
            message="Registro operacional: o contrato-base continua igual. Para mudança permanente, use Aditivo."
          />
        )}

        <div className="sf-netlex-notice">
          <strong>{isOrder ? "Contrato simplificado — ambiente de simulação" : "Registro operacional — ambiente de simulação"}</strong>
          <span>{doc.notice}</span>
        </div>

        <article className="sf-netlex-document">
          <header className="sf-netlex-document-header">
            <div>
              <div className="sf-netlex-document-eyebrow">Documento · {data.kind}</div>
              <h2>{data.title}</h2>
              <div className="sf-netlex-document-meta">
                Nº <strong>{data.netlex_number}</strong>
                <span>·</span>
                Criado em {fmtDate(data.created_at)}
              </div>
            </div>
            <div className={"sf-netlex-stamp" + (approved || !isOrder ? " is-signed" : "")}>
              {isOrder ? (approved ? "APROVADA" : expired ? "EXPIRADA" : "AGUARDANDO CLIENTE") : "REGISTRADA"}
            </div>
          </header>

          <section className="sf-netlex-clause">
            <h3>1. Referência ao contrato</h3>
            <p>
              {isOrder ? "Ordem de vendas" : "Curva de ajuste"} emitida sobre o contrato{" "}
              <strong>Nº {doc.baseContract?.netlexNumber ?? data.baseContract?.netlex_number ?? "—"}</strong>
              {doc.baseContract?.title ? ` (${doc.baseContract.title})` : ""}. As condições do contrato-base
              permanecem válidas e seus itens <strong>não são alterados</strong> por este documento.
            </p>
          </section>

          {isOrder ? (
            <>
              <section className="sf-netlex-clause">
                <h3>2. Partes</h3>
                <dl className="sf-netlex-parties">
                  <div><dt>Conta de gestão</dt><dd>{parties.customerAccount || "—"}</dd></div>
                  <div><dt>Contratante(s)</dt><dd>{Array.isArray(parties.contractingParties) ? parties.contractingParties.join(", ") : "—"}</dd></div>
                  <div><dt>Contratada VLI</dt><dd>{parties.contractedEntity || "—"}</dd></div>
                  <div><dt>Contato aprovador</dt><dd>{doc.contact ? `${doc.contact.name} · ${doc.contact.email}` : "—"}</dd></div>
                </dl>
              </section>
              <section className="sf-netlex-clause">
                <h3>3. Vigência e condições herdadas</h3>
                <div className="sf-netlex-facts">
                  <Fact label="Vigência (contrato-base)" value={`${fmtDate(doc.term?.start)} a ${fmtDate(doc.term?.end)}`} />
                  <Fact label="Tarifa" value={String(commercial.tariffBasis ?? "—")} />
                  <Fact
                    label="Reajuste"
                    value={`Diesel ${Number(readjustment.dieselPct ?? 0)}% · IGP-M ${Number(readjustment.igpmPct ?? 0)}% · IPCA ${Number(readjustment.ipcaPct ?? 0)}%`}
                  />
                  <Fact label="Take or Pay" value={doc.takeOrPay?.enabled ? "Herdado do contrato-base" : "Não se aplica"} />
                </div>
              </section>
              <section className="sf-netlex-clause">
                <h3>4. Volumes e tarifas</h3>
                <div className="sf-netlex-table-wrap">
                  <table className="sf-netlex-table">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Fluxo / trecho</th>
                        <th>Serviço</th>
                        <th>Volume</th>
                        <th>Tarifa {usesCbs ? "CBS" : "líquida"}</th>
                        <th>Data Base Diesel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.flatMap((item) =>
                        (item.schedules ?? []).map((schedule: Record<string, any>, index: number) => (
                          <tr key={`${item.flowCode}-${schedule.key}-${schedule.service}-${index}`}>
                            <td>{periodLabel(schedule.year, schedule.month)}</td>
                            <td>
                              {item.flowCode} · {item.origin} → {item.destination}
                              <div style={{ color: "#5c5c5c", fontSize: 12 }}>{item.merchandise}</div>
                            </td>
                            <td>{schedule.service}</td>
                            <td>
                              {fmtVolume(schedule.volume)} {item.unit}
                            </td>
                            <td>{fmtTariff(usesCbs ? schedule.tariffCbs : schedule.tariffNet)}</td>
                            <td>{schedule.dieselBaseDate ?? "—"}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
                <p style={{ color: "#5c5c5c" }}>
                  Volume total {fmtVolume(doc.totals?.volume)} · receita estimada {fmtMoney(Number(doc.totals?.revenue ?? 0))} ·
                  Cotação {commercial.quoteNumber ?? "—"} · preço {commercial.priceApproval ?? "—"}
                  {commercial.alcadaLevel && commercial.alcadaLevel !== "Sem alçada" ? ` (${commercial.alcadaLevel})` : ""}
                </p>
              </section>
              <section className="sf-netlex-clause">
                <h3>5. Validade e aceite</h3>
                <p>
                  Proposta enviada em <strong>{fmtDate(doc.sentAt)}</strong> e válida por {doc.validityDays ?? 7} dias
                  (até <strong>{fmtDate(doc.expiresAt)}</strong>). O aceite ocorre no portal do cliente em Gestão de
                  Contratos → Ordem de vendas.
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="sf-netlex-clause">
                <h3>2. Deslocamentos de volume</h3>
                <div className="sf-netlex-table-wrap">
                  <table className="sf-netlex-table">
                    <thead>
                      <tr>
                        <th>Fluxo</th>
                        <th>De</th>
                        <th>Para</th>
                        <th>Volume</th>
                        <th>Justificativa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(doc.moves ?? []).map((move: Record<string, any>) => (
                        <tr key={move.id}>
                          <td>{move.flowCode}</td>
                          <td>{periodLabel(move.from.year, move.from.month)}</td>
                          <td>{periodLabel(move.to.year, move.to.month)}</td>
                          <td>
                            {fmtVolume(move.volume)} {move.unit ?? ""}
                          </td>
                          <td>
                            {move.reason}
                            {move.note ? ` — ${move.note}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="sf-netlex-clause">
                <h3>3. Resultado por fluxo</h3>
                {(doc.flows ?? []).map((flow: Record<string, any>) => (
                  <div key={flow.flowCode} style={{ marginBottom: 12 }}>
                    <strong>
                      {flow.flowCode} · total {fmtVolume(flow.baseTotal)} → {fmtVolume(flow.newTotal)} {flow.unit ?? ""}{" "}
                      {flow.balanced ? "✓" : "⚠"}
                    </strong>
                    <div className="sf-netlex-table-wrap">
                      <table className="sf-netlex-table sf-netlex-table--compact">
                        <thead>
                          <tr>
                            <th>Período</th>
                            <th>Contrato</th>
                            <th>Curva</th>
                            <th>Diferença</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(flow.periods ?? [])
                            .filter((period: Record<string, any>) => period.delta !== 0)
                            .map((period: Record<string, any>) => (
                              <tr key={period.key}>
                                <td>{periodLabel(period.year, period.month)}</td>
                                <td>{fmtVolume(period.before)}</td>
                                <td>{fmtVolume(period.after)}</td>
                                <td style={{ color: period.delta > 0 ? "#2e844a" : "#ba0517", fontWeight: 700 }}>
                                  {period.delta > 0 ? "+" : "−"}
                                  {fmtVolume(Math.abs(period.delta))}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                <p style={{ color: "#5c5c5c" }}>
                  {fmtVolume(doc.moved)} deslocados · preços, Base Diesel e rateio do contrato mantidos · Cotação{" "}
                  {doc.quote?.number ?? "—"}.
                </p>
              </section>
            </>
          )}

          {history.length > 0 && (
            <section className="sf-netlex-clause">
              <h3>Histórico</h3>
              <ol className="sf-clause-list">
                {history.map((entry, index) => (
                  <li key={index}>
                    <strong>{entry.event}</strong> {fmtDate(entry.at)}
                    {entry.by ? ` · ${entry.by}` : ""}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </article>
      </main>
    </SfShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
