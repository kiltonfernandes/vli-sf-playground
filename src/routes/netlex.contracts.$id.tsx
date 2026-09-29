import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getNetlexContractFull } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { fmtDate, fmtMoney } from "@/lib/format";

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
  const { data, isLoading } = useQuery({
    queryKey: ["netlex-contract", id],
    queryFn: () => getNetlexContractFull({ data: { id } }),
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
          Contrato não encontrado. <Link to="/opportunities">Voltar às oportunidades</Link>
        </div>
      </SfShell>
    );

  const { contract, document: doc } = data;
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
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ color: "#5c5c5c", fontSize: 12, fontWeight: 700 }}>NETLEX · VLI</div>
            <h1 style={{ margin: "5px 0 0", fontSize: 24 }}>{contract.title}</h1>
          </div>
          <span
            style={{
              background: "#fff7e6",
              border: "1px solid #f2cc60",
              borderRadius: 20,
              color: "#5c4000",
              fontSize: 13,
              fontWeight: 700,
              padding: "8px 14px",
            }}
          >
            {contract.status}
          </span>
        </div>

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
              <div className="sf-netlex-document-eyebrow">Documento · Contrato</div>
              <h2>{doc.title ?? contract.title}</h2>
              <div className="sf-netlex-document-meta">
                Nº NetLex <strong>{contract.netlex_number}</strong>
                <span>·</span>
                Criado em {fmtDate(contract.created_at)}
              </div>
            </div>
            <div className="sf-netlex-stamp">AGUARDANDO RETORNO</div>
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

          <section className="sf-netlex-clause">
            <h3>7. Complementos jurídicos</h3>
            <p>{String(doc.manualCompletionNote ?? "Campos complementares não informados.")}</p>
          </section>

          <section className="sf-netlex-signature">
            <div>
              <div className="sf-netlex-document-eyebrow">Status inicial</div>
              <strong>{contract.status}</strong>
              <p>O documento permanece na etapa inicial até receber atualização do NetLex.</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="sf-netlex-document-eyebrow">Assinaturas</div>
              <span>Aguardando etapas jurídicas no NetLex</span>
            </div>
          </section>
        </article>
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