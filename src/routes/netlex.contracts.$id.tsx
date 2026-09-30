import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createAddendumOpportunity,
  createPostContractFromContract,
  getNetlexContractFull,
  moveNetlexContractToSignature,
} from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfPath } from "@/components/SfPath";
import { FIELD_LABELS, summaryText } from "@/lib/addendum";
import { fmtDate, fmtMoney } from "@/lib/format";
import { PostContractHub } from "@/components/PostContract";
import { SALES_ORDER, isPostContractInstrument } from "@/lib/post-contract";

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
  const [creatingKind, setCreatingKind] = useState("");
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

  const createPostContract = async (kind: string) => {
    if (kind === "Aditivo") return newAddendum();
    setCreatingKind(kind);
    try {
      const result = await createPostContractFromContract({ data: { contractId: id, kind } });
      await qc.invalidateQueries({ queryKey: ["opportunities"] });
      toast.success(kind === SALES_ORDER ? "Ordem de vendas criada" : "Curva de ajuste criada");
      await navigate({ to: "/quotes/$id", params: { id: result.quoteId } });
    } catch (error) {
      toast.error("Não foi possível criar", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCreatingKind("");
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
  const postContract = ((data as any).postContract ?? []) as any[];
  const kind = String(contract.kind || doc.kind || "Contrato");
  if (isPostContractInstrument(kind))
    return (
      <SfShell>
        <div style={{ padding: 32 }}>
          {kind} não é um documento do NetLex.{" "}
          <Link to="/post-contract/$id" params={{ id }} style={{ color: "#0176d3" }}>
            Abrir {kind === SALES_ORDER ? "a ordem de vendas" : "o registro da curva"}
          </Link>
        </div>
      </SfShell>
    );
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
  const scheduleGroups = new Set(
    schedules.map((schedule) => `${schedule.item.flowCode}|${schedule.period}|${schedule.plaza}|${schedule.division}`),
  );
  const projectedAmount = schedules.reduce(
    (sum, schedule) => sum + Number(schedule.volume ?? 0) * Number(serviceTariff(schedule) ?? 0),
    0,
  );
  const dieselEntries = [
    ...new Map(
      schedules
        .filter((schedule) => schedule.dieselBaseDate)
        .map((schedule) => [
          `${schedule.item.flowCode}|${schedule.period}|${schedule.dieselBaseDate}`,
          schedule,
        ]),
    ).values(),
  ];

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
            { label: "Análise jurídica", hint: "Aguardando retorno da NetLex" },
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

        {signed && kind === "Contrato" && (
          <div style={{ margin: "0 -16px 16px" }}>
            <PostContractHub
              contract={contract}
              addenda={addenda as any[]}
              postContract={postContract}
              busyKind={busy === "addendum" ? "Aditivo" : creatingKind}
              onCreate={(entry) => void createPostContract(entry)}
            />
          </div>
        )}

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
              {readjustment.byModal && Object.keys(readjustment.byModal).length > 0 ? (
                // Reajuste por modal: ferro (Diesel + IGP-M + IPCA) e porto (IGP-M + IPCA, sem diesel).
                Object.entries(readjustment.byModal as Record<string, any>).map(([modal, values]) => (
                  <div key={modal} style={{ marginBottom: 8 }}>
                    <strong>
                      {modal === "Portuário" ? "⚓ Porto" : "🚂 Ferro"}
                    </strong>
                    <div className="sf-netlex-facts">
                      {modal === "Portuário" ? (
                        <Fact label="Diesel" value="Não se aplica" />
                      ) : (
                        <Fact label="Diesel" value={`${Number(values.dieselPct ?? 0)}%`} />
                      )}
                      <Fact label="IGP-M" value={`${Number(values.igpmPct ?? 0)}%`} />
                      <Fact label="IPCA" value={`${Number(values.ipcaPct ?? 0)}%`} />
                      {modal !== "Portuário" && (
                        <Fact label="Dia de aplicação" value={String(values.applicationDay ?? term.applicationDay ?? "—")} />
                      )}
                    </div>
                    {values.notice && <p style={{ margin: "4px 0 0", fontSize: 12 }}>{values.notice}</p>}
                  </div>
                ))
              ) : (
                <div className="sf-netlex-facts">
                  <Fact label="Diesel" value={`${Number(readjustment.dieselPct ?? 0)}%`} />
                  <Fact label="IGP-M" value={`${Number(readjustment.igpmPct ?? 0)}%`} />
                  <Fact label="IPCA" value={`${Number(readjustment.ipcaPct ?? 0)}%`} />
                  <Fact label="Dia de aplicação" value={String(term.applicationDay ?? "—")} />
                </div>
              )}
              <div className="sf-netlex-facts">
                <Fact
                  label="Primeiro reajuste"
                  value={readjustment.firstReadjustmentDate
                    ? fmtDate(readjustment.firstReadjustmentDate)
                    : "Não informado"}
                />
              </div>
              {doc.portTerms && (
                <div className="sf-netlex-facts">
                  <Fact label="Armazenagem · dias livres" value={String(doc.portTerms.freeTimeDays)} />
                  <Fact label="Armazenagem · período adicional" value={`${doc.portTerms.extraPeriodDays} dias`} />
                </div>
              )}
            </section>

            <section className="sf-netlex-clause">
              <h3>6. Take or Pay</h3>
              <p>
                {takeOrPay.enabled
                  ? "Aplicável conforme os compromissos e tolerâncias registrados nas Agendas."
                  : "Não configurado para esta Oportunidade."}
              </p>
              {takeOrPay.enabled && Array.isArray(takeOrPay.records) && takeOrPay.records.length > 0 && (
                <p>
                  Registros separados por modal:{" "}
                  {takeOrPay.records
                    .map((record: any) => `${record.label} (${record.flowIds.length} fluxo${record.flowIds.length === 1 ? "" : "s"})`)
                    .join(" · ")}
                  .
                </p>
              )}
              {takeOrPay.enabled && (
                <>
                {takeOrPay.config && <div className="sf-fields">
                  <Fact label="Data de apuração" value={takeOrPay.config.auditDate ? fmtDate(takeOrPay.config.auditDate) : "Não informada"} />
                  <Fact label="Data de faturamento" value={takeOrPay.config.billingDate ? fmtDate(takeOrPay.config.billingDate) : "Não informada"} />
                  <Fact label="Compensação" value={({ individual: "Fluxos individuais", "all-flows": "Todos os fluxos", "flow-pairs": "Pares de fluxos", groups: "Grupos de fluxos" } as Record<string, string>)[takeOrPay.config.compensationMode] ?? "—"} />
                  <Fact label="Base" value={({ volume: "Volume", tariff: "Tarifa", both: "Volume e tarifa" } as Record<string, string>)[takeOrPay.config.calculationBasis] ?? "—"} />
                  {takeOrPay.config.pairs?.map((pair: any, index: number) => <Fact key={`pair-${index}`} label={`Par ${index + 1}`} value={`${flowLabel(pair.compensatedFlowId, items)} → ${flowLabel(pair.compensatingFlowId, items)} (${pair.ratioFrom}:${pair.ratioTo})`} />)}
                  {takeOrPay.config.groups?.map((group: any, index: number) => <Fact key={`group-${index}`} label={`Grupo ${group.name || index + 1}`} value={group.flowIds.map((flowId: string) => flowLabel(flowId, items)).join(", ")} />)}
                </div>}
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
                <p>Registro dos parâmetros comerciais. A apuração operacional e financeira ocorre fora do aplicativo.</p>
                </>
              )}
            </section>

            <section className="sf-netlex-clause">
              <h3>7. Identificação da operação contratada</h3>
              <p>
                Esta minuta registra a oportunidade <strong>{doc.opportunity?.name ?? "—"}</strong>,
                instrumento <strong>{doc.opportunity?.instrumentType ?? kind}</strong>, do segmento
                <strong> {doc.opportunity?.segment ?? "—"}</strong>, vinculada à Conta de gestão
                <strong> {parties.customerAccount ?? "—"}</strong> e à Cotação
                <strong> {commercial.quoteNumber ?? "—"}</strong>. As partes indicadas na cláusula
                1 e os fluxos ferroviários listados nesta minuta formam o escopo comercial desta
                versão.
              </p>
            </section>

            <section className="sf-netlex-clause">
              <h3>8. Composição tarifária e referência de volume</h3>
              <p>
                A Cotação usa a base tarifária <strong>{commercial.tariffBasis ?? "—"}</strong> e
                registra <strong>{scheduleGroups.size}</strong> grupos de Agenda em
                <strong> {schedules.length}</strong> linhas de serviço. A soma de referência de
                volume multiplicado pela tarifa unitária das linhas é
                <strong> {fmtMoney(projectedAmount)}</strong>, calculada a partir dos períodos,
                serviços e valores apresentados na cláusula 4. Esse total resume os dados da
                Cotação e não acrescenta condições de faturamento ausentes do cadastro.
              </p>
            </section>

            <section className="sf-netlex-clause">
              <h3>9. Data Base Diesel por fluxo</h3>
              <p>
                Para os grupos abaixo, a Data Base Diesel registrada acompanha o dia de aplicação
                <strong> {term.applicationDay ?? "—"}</strong> e o período de cada Agenda. A data
                aplicável a cada fluxo é:
              </p>
              <ul className="sf-clause-list">
                {dieselEntries.map((schedule, index) => (
                  <li key={`diesel-${index}`}>
                    <strong>
                      {schedule.item.origin} → {schedule.item.destination} · {schedule.item.merchandise} · {schedule.period}
                    </strong>
                    Serviço {schedule.service}, praça {schedule.plaza}: Data Base Diesel
                    {" "}<strong>{schedule.dieselBaseDate}</strong>.
                  </li>
                ))}
              </ul>
              {!dieselEntries.length && <p className="sf-netlex-empty">Nenhuma data-base registrada na Cotação.</p>}
            </section>

            <section className="sf-netlex-clause">
              <h3>10. Registro das condições e alterações</h3>
              <p>
                As condições comerciais desta versão foram extraídas da Cotação
                <strong> {commercial.quoteNumber ?? "—"}</strong> e da oportunidade
                <strong> {doc.opportunity?.name ?? "—"}</strong>, com vigência de
                <strong> {fmtDate(term.start)}</strong> a <strong>{fmtDate(term.end)}</strong>.
                Alterações posteriores de fluxo, período, volume, tarifa, reajuste ou tolerância
                devem ser formalizadas em uma nova Cotação e, quando aplicável, em aditivo
                vinculado ao contrato. Assuntos jurídicos não representados pelos dados da
                Oportunidade e da Cotação permanecem para complementação no NetLex.
              </p>
            </section>

            </>
          )}

          <section className="sf-netlex-clause">
            <h3>{isAddendum ? "6" : "11"}. Complementos jurídicos</h3>
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

        {kind === "Contrato" && postContract.length > 0 && (
          <section className="sf-card" style={{ marginTop: 20 }}>
            <div className="sf-card-header">Pós-contrato · ordens de vendas e curvas de ajuste</div>
            <div className="sf-card-body">
              <table className="sf-netlex-table sf-netlex-table--compact">
                <thead>
                  <tr>
                    <th>Instrumento</th>
                    <th>Oportunidade</th>
                    <th>Etapa</th>
                    <th>Documento</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {postContract.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.instrument_type}</td>
                      <td>
                        <Link to="/opportunities/$id" params={{ id: entry.id }} style={{ color: "#0176d3" }}>
                          {entry.name}
                        </Link>
                      </td>
                      <td>{entry.stage}</td>
                      <td>
                        {entry.document ? (
                          <Link to="/post-contract/$id" params={{ id: entry.document.id }} style={{ color: "#0176d3" }}>
                            Nº {entry.document.netlex_number}
                          </Link>
                        ) : (
                          "Em negociação"
                        )}
                      </td>
                      <td>{entry.document?.status ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: "8px 0 0", color: "#5c5c5c", fontSize: 12 }}>
                Nenhum desses registros altera este contrato. Mudança permanente de preço, prazo ou agenda é Aditivo.
              </p>
            </div>
          </section>
        )}

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

function flowLabel(flowId: string, items: Array<Record<string, any>>) {
  const item = items.find((row) => row.plannedFlowId === flowId);
  return item ? `${item.flowCode} · ${item.origin} → ${item.destination}` : flowId;
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
