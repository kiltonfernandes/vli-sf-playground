import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createAddendumOpportunity,
  getNetlexContractFull,
  moveNetlexContractToSignature,
} from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfPath } from "@/components/SfPath";
import { FIELD_LABELS, summaryText } from "@/lib/addendum";
import { fmtDate, fmtMoney } from "@/lib/format";

const SIGNATURE = "Assinatura";

export const Route = createFileRoute("/netlex/contracts/$id")({
  head: () => ({
    meta: [
      { title: "Contrato NetLex | VLI" },
      { name: "description", content: "Minuta contratual simulada no Playground." },
    ],
  }),
  component: NetlexContractPage,
});

function NetlexContractPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"" | "sign" | "addendum">("");
  const { data, isLoading } = useQuery({
    queryKey: ["netlex-contract", id],
    queryFn: () => getNetlexContractFull({ data: { id } }),
  });

  const moveToSignature = async () => {
    setBusy("sign");
    try {
      await moveNetlexContractToSignature({ data: { id } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["netlex-contract"] }),
        qc.invalidateQueries({ queryKey: ["opportunity"] }),
        qc.invalidateQueries({ queryKey: ["opportunities"] }),
      ]);
      toast.success("Documento em Assinatura", {
        description:
          data?.contract.kind === "Aditivo"
            ? "As mudanças do aditivo passaram a valer no contrato original."
            : "A Oportunidade já pode ser fechada.",
      });
    } catch (error) {
      toast.error("Não foi possível mudar o status", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  };

  const newAddendum = async () => {
    setBusy("addendum");
    try {
      const result = await createAddendumOpportunity({ data: { contractId: id } });
      await qc.invalidateQueries({ queryKey: ["opportunities"] });
      toast.success("Oportunidade de aditivo criada");
      await navigate({ to: "/opportunities/$id", params: { id: result.id } });
    } catch (error) {
      toast.error("Não foi possível criar o aditivo", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  };

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
          Contrato não encontrado. <Link to="/opportunities">Voltar às oportunidades</Link>
        </div>
      </SfShell>
    );

  const { contract, document: doc, opportunity, baseContract, addenda } = data;
  const kind = String(contract.kind || doc.kind || "Contrato");
  const isAddendum = kind === "Aditivo";
  const signed = contract.status === SIGNATURE;
  const versions = (doc.versions ?? []) as Array<Record<string, any>>;
  const changes = (doc.changes ?? []) as Array<Record<string, any>>;
  const clauses = (doc.clauses ?? []) as Array<Record<string, any>>;
  const baseTerm = (doc.baseTerm ?? {}) as Record<string, any>;
  const parties = (doc.parties ?? {}) as Record<string, any>;
  const term = (doc.term ?? {}) as Record<string, any>;
  const commercial = (doc.commercialConditions ?? {}) as Record<string, any>;
  const readjustment = (doc.readjustment ?? {}) as Record<string, any>;
  const takeOrPay = (doc.takeOrPay ?? {}) as Record<string, any>;
  const items = (doc.items ?? []) as Array<Record<string, any>>;
  const schedules = items.flatMap((item) =>
    (item.schedules ?? []).map((schedule: Record<string, any>) => ({ ...schedule, item })),
  );
  const usesCbs = String(commercial.tariffBasis ?? "").toLowerCase() === "cbs";

  const groupTariff = (schedule: Record<string, any>) =>
    usesCbs ? schedule.tariffCbs : schedule.tariffNet;
  const serviceTariff = (schedule: Record<string, any>) =>
    (usesCbs ? schedule.accessoryCbs : schedule.accessoryNet) ?? groupTariff(schedule);

  return (
    <SfShell>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ color: "#5c5c5c", fontSize: 12, fontWeight: 700 }}>
              NETLEX · VLI · {kind.toUpperCase()}
            </div>
            <h1 style={{ margin: "5px 0 0", fontSize: 24 }}>{contract.title}</h1>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 13 }}>
              {opportunity && (
                <Link to="/opportunities/$id" params={{ id: opportunity.id }} style={{ color: "#0176d3" }}>
                  Oportunidade: {opportunity.name}
                </Link>
              )}
              {baseContract && (
                <Link
                  to="/netlex/contracts/$id"
                  params={{ id: baseContract.id }}
                  style={{ color: "#0176d3" }}
                >
                  Contrato original Nº {baseContract.netlex_number} · {baseContract.status}
                </Link>
              )}
            </div>
          </div>
          <span className={"sf-netlex-status" + (signed ? " is-signed" : "")}>{contract.status}</span>
        </div>

        <SfPath
          label="Etapas do documento no NetLex"
          steps={[
            { label: "Enviado", hint: fmtDate(contract.created_at) },
            { label: "Aguardando retorno da NetLex", hint: "Análise jurídica" },
            {
              label: "Assinatura",
              hint: contract.signed_at ? fmtDate(contract.signed_at) : "Libera o fechamento",
            },
          ]}
          currentIndex={signed ? 2 : 1}
          done={signed}
          actions={
            <>
              {!signed && (
                <button className="sf-btn sf-btn--brand" disabled={!!busy} onClick={moveToSignature}>
                  {busy === "sign" ? "Atualizando…" : "Mover para Assinatura"}
                </button>
              )}
              {signed && kind === "Contrato" && (
                <button className="sf-btn sf-btn--brand" disabled={!!busy} onClick={newAddendum}>
                  {busy === "addendum" ? "Criando…" : "+ Nova oportunidade de aditivo"}
                </button>
              )}
            </>
          }
          message={
            signed
              ? isAddendum
                ? "Aditivo em Assinatura: as mudanças já valem no contrato original (nova versão)."
                : kind === "ACS"
                  ? "ACS em Assinatura. A Oportunidade pode ser fechada. ACS não recebe aditivo."
                  : "Contrato em Assinatura. A Oportunidade pode ser fechada e o contrato pode receber aditivos."
              : "Simulação: no NetLex real o analista jurídico muda o status. Aqui use “Mover para Assinatura”."
          }
        />

        <div className="sf-netlex-notice">
          <strong>Minuta demonstrativa — ambiente de simulação</strong>
          <span>
            Os dados comerciais abaixo vêm da Oportunidade e da Cotação aprovada. A integração
            externa, os campos jurídicos complementares e a validade jurídica dependem do NetLex.
          </span>
        </div>

        <article className="sf-netlex-document">
          <header className="sf-netlex-document-header">
            <div>
              <div className="sf-netlex-document-eyebrow">Documento · {kind}</div>
              <h2>{doc.title ?? contract.title}</h2>
              <div className="sf-netlex-document-meta">
                Nº NetLex <strong>{contract.netlex_number}</strong>
                <span>·</span>
                Criado em {fmtDate(contract.created_at)}
              </div>
            </div>
            <div className={"sf-netlex-stamp" + (signed ? " is-signed" : "")}>
              {signed ? "ASSINATURA" : "AGUARDANDO RETORNO"}
            </div>
          </header>

          <section className="sf-netlex-clause">
            <h3>1. Partes</h3>
            <dl className="sf-netlex-parties">
              <div>
                <dt>Conta de gestão</dt>
                <dd>{parties.customerAccount || "—"}</dd>
              </div>
              <div>
                <dt>Contratante(s)</dt>
                <dd>{Array.isArray(parties.contractingParties) ? parties.contractingParties.join(", ") : "—"}</dd>
              </div>
              <div>
                <dt>Contratada VLI</dt>
                <dd>{parties.contractedEntity || "—"}</dd>
              </div>
              <div>
                <dt>Devedor solidário</dt>
                <dd>{parties.jointDebtor || "Não informado"}</dd>
              </div>
            </dl>
          </section>

          {isAddendum ? (
            <>
              <section className="sf-netlex-clause">
                <h3>2. Objeto do aditivo</h3>
                <p>
                  Aditamento ao contrato{" "}
                  <strong>Nº {doc.baseContract?.netlexNumber ?? baseContract?.netlex_number ?? "—"}</strong>
                  , conforme a Cotação <strong>{commercial.quoteNumber ?? "—"}</strong>. Este
                  documento traz somente as mudanças; as demais condições do contrato
                  permanecem inalteradas.
                </p>
                {summaryText(doc.summary) && (
                  <p style={{ color: "#5c5c5c" }}>Mudanças: {summaryText(doc.summary)}</p>
                )}
              </section>

              <section className="sf-netlex-clause">
                <h3>3. Vigência</h3>
                <p>
                  Contrato original: <strong>{fmtDate(baseTerm.start)}</strong> a{" "}
                  <strong>{fmtDate(baseTerm.end)}</strong>
                  {baseTerm.end !== term.end || baseTerm.start !== term.start ? (
                    <>
                      {" "}→ com o aditivo: <strong>{fmtDate(term.start)}</strong> a{" "}
                      <strong>{fmtDate(term.end)}</strong>
                    </>
                  ) : (
                    " · sem alteração de prazo"
                  )}
                </p>
              </section>

              <section className="sf-netlex-clause">
                <h3>4. Mudanças nas Agendas</h3>
                <div className="sf-netlex-table-wrap">
                  <table className="sf-netlex-table">
                    <thead>
                      <tr>
                        <th>Operação</th>
                        <th>Período</th>
                        <th>Fluxo / trecho</th>
                        <th>Mercadoria</th>
                        <th>Serviço</th>
                        <th>O que muda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((change, index) => (
                        <tr key={`${change.flowCode}-${change.service}-${change.year}-${change.month}-${index}`}>
                          <td>
                            <span className={`sf-op-chip sf-op-chip--${change.operation}`}>
                              {change.operation}
                            </span>
                          </td>
                          <td>
                            {String(change.month).padStart(2, "0")}/{change.year}
                          </td>
                          <td>
                            {change.origin} → {change.destination}
                          </td>
                          <td>{change.merchandise}</td>
                          <td>{change.service}</td>
                          <td>{describeChange(change)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!changes.length && <p className="sf-netlex-empty">Nenhuma mudança registrada.</p>}
              </section>

              <section className="sf-netlex-clause">
                <h3>5. Cláusulas do aditivo</h3>
                <ol className="sf-clause-list">
                  {clauses.map((clause) => (
                    <li key={clause.number}>
                      <strong>
                        Cláusula {clause.number} · {clause.title}
                      </strong>
                      {clause.text}
                    </li>
                  ))}
                </ol>
                {!clauses.length && <p className="sf-netlex-empty">Sem cláusulas geradas.</p>}
              </section>
            </>
          ) : (
            <>
            <section className="sf-netlex-clause">
              <h3>2. Objeto e escopo operacional</h3>
              <p>
                Prestação dos serviços de transporte descritos nos Itens e Agendas comerciais
                vinculados à Cotação <strong>{commercial.quoteNumber ?? "—"}</strong>, para o
                segmento {doc.opportunity?.segment ?? "—"}. Os fluxos, mercadorias, períodos,
                volumes e tarifas são reproduzidos abaixo a partir da Cotação sincronizada.
              </p>
            </section>

            <section className="sf-netlex-clause">
              <h3>3. Vigência</h3>
              <p>
                Início: <strong>{fmtDate(term.start)}</strong> · Término:{" "}
                <strong>{fmtDate(term.end)}</strong>
              </p>
            </section>

            <section className="sf-netlex-clause">
              <h3>4. Condições comerciais e agendas</h3>
              <p>
                Base tarifária: <strong>{commercial.tariffBasis ?? "Líquida"}</strong> · Status
                da aprovação de preço: <strong>{commercial.priceApproval ?? "—"}</strong>
              </p>
              <div className="sf-netlex-table-wrap">
                <table className="sf-netlex-table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Fluxo / trecho</th>
                      <th>Mercadoria</th>
                      <th>Serviço</th>
                      <th>Praça</th>
                      <th>Volume</th>
                      <th>Tarifa total do grupo / un.</th>
                      <th>Tarifa do serviço / un.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((schedule, index) => (
                      <tr key={`${schedule.item.flowCode}-${schedule.item.service}-${schedule.period}-${index}`}>
                        <td>{schedule.period}</td>
                        <td>
                          {schedule.item.origin} → {schedule.item.destination}
                        </td>
                        <td>{schedule.item.merchandise}</td>
                        <td>{schedule.item.service}</td>
                        <td>{schedule.plaza}</td>
                        <td>
                          {Number(schedule.volume).toLocaleString("pt-BR")} {schedule.item.unit}
                        </td>
                        <td>{fmtMoney(Number(groupTariff(schedule) ?? 0))}</td>
                        <td>{fmtMoney(Number(serviceTariff(schedule) ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!schedules.length && (
                <p className="sf-netlex-empty">A Cotação não possui agendas nesta minuta.</p>
              )}
            </section>

            <section className="sf-netlex-clause">
              <h3>5. Reajuste</h3>
              <div className="sf-netlex-facts">
                <Fact label="Diesel" value={`${Number(readjustment.dieselPct ?? 0)}%`} />
                <Fact label="IGP-M" value={`${Number(readjustment.igpmPct ?? 0)}%`} />
                <Fact label="IPCA" value={`${Number(readjustment.ipcaPct ?? 0)}%`} />
                <Fact label="Dia de aplicação" value={String(term.applicationDay ?? "—")} />
                <Fact
                  label="Primeiro reajuste"
                  value={readjustment.firstReadjustmentDate
                    ? fmtDate(readjustment.firstReadjustmentDate)
                    : "Não informado"}
                />
              </div>
            </section>

            <section className="sf-netlex-clause">
              <h3>6. Take or Pay</h3>
              <p>
                {takeOrPay.enabled
                  ? "Aplicável conforme os compromissos e tolerâncias registrados nas Agendas."
                  : "Não configurado para esta Oportunidade."}
              </p>
              {takeOrPay.enabled && (
                <div className="sf-netlex-table-wrap">
                  <table className="sf-netlex-table sf-netlex-table--compact">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Trecho</th>
                        <th>Tolerância volume VLI</th>
                        <th>Tolerância volume cliente</th>
                        <th>Tolerância tarifa VLI</th>
                        <th>Tolerância tarifa cliente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules
                        .filter((schedule) =>
                          Object.values(schedule.tolerance ?? {}).some((value) => Number(value) > 0),
                        )
                        .map((schedule, index) => (
                          <tr key={`top-${schedule.period}-${index}`}>
                            <td>{schedule.period}</td>
                            <td>
                              {schedule.item.origin} → {schedule.item.destination}
                            </td>
                            <td>{toleranceValue(schedule.tolerance?.vliVolume)}</td>
                            <td>{toleranceValue(schedule.tolerance?.clientVolume)}</td>
                            <td>{toleranceValue(schedule.tolerance?.vliTariff)}</td>
                            <td>{toleranceValue(schedule.tolerance?.clientTariff)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            </>
          )}

          <section className="sf-netlex-clause">
            <h3>{isAddendum ? "6" : "7"}. Complementos jurídicos</h3>
            <p>{String(doc.manualCompletionNote ?? "Campos complementares não informados.")}</p>
          </section>

          <section className="sf-netlex-signature">
            <div>
              <div className="sf-netlex-document-eyebrow">Status no NetLex</div>
              <strong>{contract.status}</strong>
              <p>
                {signed
                  ? `Em Assinatura desde ${fmtDate(contract.signed_at)}.`
                  : "Documento enviado; aguardando o retorno jurídico do NetLex."}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="sf-netlex-document-eyebrow">Assinaturas</div>
              <span>{signed ? "Em coleta de assinaturas" : "Aguardando etapas jurídicas no NetLex"}</span>
            </div>
          </section>
        </article>

        {!isAddendum && (versions.length > 0 || addenda.length > 0) && (
          <section className="sf-card" style={{ marginTop: 20 }}>
            <div className="sf-card-header">Versões e aditivos</div>
            <div className="sf-card-body">
              {versions.length > 0 && (
                <ol className="sf-clause-list">
                  {versions.map((version) => (
                    <li key={version.version}>
                      <strong>
                        Versão {version.version} · {version.label} · desde {fmtDate(version.effectiveAt)}
                      </strong>
                      Vigência {fmtDate(version.term?.start)} a {fmtDate(version.term?.end)}
                      {summaryText(version.summary) ? ` · ${summaryText(version.summary)}` : ""}
                      {Array.isArray(version.clauses) && version.clauses.length > 0
                        ? ` · Cláusulas: ${version.clauses.join(", ")}`
                        : ""}
                    </li>
                  ))}
                </ol>
              )}
              {addenda.length > 0 && (
                <table className="sf-netlex-table sf-netlex-table--compact" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Oportunidade de aditivo</th>
                      <th>Etapa</th>
                      <th>Documento NetLex</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addenda.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <Link to="/opportunities/$id" params={{ id: entry.id }} style={{ color: "#0176d3" }}>
                            {entry.name}
                          </Link>
                        </td>
                        <td>{entry.stage}</td>
                        <td>
                          {entry.document ? (
                            <Link
                              to="/netlex/contracts/$id"
                              params={{ id: entry.document.id }}
                              style={{ color: "#0176d3" }}
                            >
                              Nº {entry.document.netlex_number}
                            </Link>
                          ) : (
                            "Ainda não enviado"
                          )}
                        </td>
                        <td>{entry.document?.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link to="/opportunities">Voltar às oportunidades</Link>
        </div>
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

function toleranceValue(value: unknown) {
  return Number(value) > 0 ? `${Number(value)}%` : "—";
}

function fmtField(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "diesel_base_date") return fmtDate(String(value));
  if (field === "volume") return Number(value).toLocaleString("pt-BR");
  if (field.endsWith("_pct") || field.startsWith("tolerance_")) return `${Number(value)}%`;
  return fmtMoney(Number(value));
}

function describeChange(change: Record<string, any>) {
  const after = (change.after ?? {}) as Record<string, unknown>;
  const before = (change.before ?? {}) as Record<string, unknown>;
  if (change.operation === "Incluir")
    return `Nova agenda · volume ${fmtField("volume", after.volume)} · tarifa ${fmtField(
      "tariff_net",
      after.tariff_cbs ?? after.tariff_net,
    )}`;
  if (change.operation === "Excluir")
    return `Agenda retirada (volume ${fmtField("volume", before.volume)})`;
  const fields = (change.fields ?? []) as string[];
  return fields
    .map(
      (field) =>
        `${FIELD_LABELS[field] ?? field}: ${fmtField(field, before[field])} → ${fmtField(field, after[field])}`,
    )
    .join(" · ");
}
