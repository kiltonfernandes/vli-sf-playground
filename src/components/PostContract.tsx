import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { moveCurveVolume, resetCurveToBaseline } from "@/lib/crud";
import { fmtDate } from "@/lib/format";
import {
  ADJUSTMENT_CURVE,
  CURVE_REASONS,
  CURVE_STATUS,
  POST_CONTRACT_GUIDE,
  SALES_ORDER,
  SALES_ORDER_STATUS,
  SALES_ORDER_VALIDITY_DAYS,
  daysUntil,
  periodLabel,
  type CurveFlowBalance,
  type CurveMove,
} from "@/lib/post-contract";

type Child = {
  id: string;
  name: string;
  stage: string;
  instrument_type?: string;
  document?: { id: string; netlex_number: string; status: string } | null;
};

const fmtVolume = (value: number) => Number(value ?? 0).toLocaleString("pt-BR");

/** Chip de status padronizado dos documentos pós-contrato. */
export function PostContractStatus({ status }: { status: string }) {
  const tone =
    status === SALES_ORDER_STATUS.approved || status === CURVE_STATUS.registered || status === "Assinatura" || status === "Fechado"
      ? "success"
      : status === SALES_ORDER_STATUS.expired
        ? "danger"
        : status === SALES_ORDER_STATUS.sent || status === "Análise jurídica"
          ? "warning"
          : "neutral";
  return <span className={`sf-status-chip sf-status-chip--${tone}`}>{status}</span>;
}

/**
 * Hub único de pós-contrato: a pergunta certa leva ao instrumento certo.
 * Aditivo muda o contrato; ordem de vendas e curva de ajuste nunca mudam.
 */
export function PostContractHub({
  contract,
  addenda,
  postContract,
  busyKind,
  onCreate,
}: {
  contract: { id: string; netlex_number: string; status: string };
  addenda: Child[];
  postContract: Child[];
  busyKind: string;
  onCreate: (kind: string) => void;
}) {
  const children = (kind: string) =>
    kind === "Aditivo" ? addenda : postContract.filter((entry) => entry.instrument_type === kind);
  return (
    <section className="sf-pc-hub" aria-label="Pós-contrato">
      <header className="sf-pc-hub-header">
        <div>
          <div className="sf-next-step-eyebrow">Pós-contrato · Contrato Nº {contract.netlex_number}</div>
          <div className="sf-pc-hub-title">O que o cliente precisa agora?</div>
          <div className="sf-next-step-detail">
            Tudo nasce deste contrato em Assinatura. Só o Aditivo altera o contrato; ordem de vendas e curva de
            ajuste reutilizam as condições vigentes.
          </div>
        </div>
        <a className="sf-btn" href={`/netlex/contracts/${contract.id}`} target="_blank" rel="noreferrer">
          Contrato no NetLex ↗
        </a>
      </header>
      <div className="sf-pc-grid">
        {POST_CONTRACT_GUIDE.map((option) => {
          const list = children(option.kind);
          const busy = busyKind === option.kind;
          return (
            <article key={option.kind} className="sf-pc-option">
              <div className="sf-pc-option-top">
                <span className="sf-pc-option-icon" aria-hidden>
                  {option.icon}
                </span>
                <span className={"sf-pc-impact" + (option.changesContract ? " is-changes" : "")}>
                  {option.changesContract ? "Altera o contrato" : "Contrato intacto"}
                </span>
              </div>
              <div className="sf-pc-question">{option.question}</div>
              <div className="sf-pc-kind">{option.kind}</div>
              <p className="sf-pc-summary">{option.summary}</p>
              <p className="sf-pc-example">Ex.: {option.example}</p>
              <button
                className={"sf-btn" + (option.kind === SALES_ORDER ? " sf-btn--brand" : "")}
                disabled={!!busyKind}
                onClick={() => onCreate(option.kind)}
              >
                {busy
                  ? "Criando…"
                  : option.kind === "Aditivo"
                    ? "+ Novo aditivo"
                    : option.kind === SALES_ORDER
                      ? "+ Nova ordem de vendas"
                      : "+ Nova curva de ajuste"}
              </button>
              {list.length > 0 && (
                <ul className="sf-pc-children">
                  {list.slice(-4).map((entry) => (
                    <li key={entry.id}>
                      <Link to="/opportunities/$id" params={{ id: entry.id }}>
                        {entry.document?.netlex_number ? `Nº ${entry.document.netlex_number}` : entry.name}
                      </Link>
                      <PostContractStatus status={entry.document?.status ?? entry.stage} />
                    </li>
                  ))}
                  {list.length > 4 && <li className="sf-pc-more">+{list.length - 4} anteriores</li>}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Condições herdadas do contrato-base, sempre somente leitura. */
export function InheritedChips({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <ul className="sf-pc-chips" aria-label="Condições herdadas do contrato">
      {items.map((item) => (
        <li key={item.label} className="sf-pc-chip" title="Herdado do contrato-base (somente leitura)">
          <span aria-hidden>🔒</span>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </li>
      ))}
    </ul>
  );
}

export function inheritedItems(context: {
  term?: { start?: string | null; end?: string | null } | null;
  inherited?: { tariffBasis?: string; readjustment?: any; takeOrPay?: any } | null;
}) {
  const readjustment = context.inherited?.readjustment;
  const top = context.inherited?.takeOrPay;
  const mix = readjustment
    ? [
        Number(readjustment.dieselPct ?? readjustment.diesel ?? 0) ? `Diesel ${Number(readjustment.dieselPct ?? readjustment.diesel)}%` : "",
        Number(readjustment.igpmPct ?? readjustment.igpm ?? 0) ? `IGP-M ${Number(readjustment.igpmPct ?? readjustment.igpm)}%` : "",
        Number(readjustment.ipcaPct ?? readjustment.ipca ?? 0) ? `IPCA ${Number(readjustment.ipcaPct ?? readjustment.ipca)}%` : "",
      ].filter(Boolean).join(" · ")
    : "";
  return [
    { label: "Vigência", value: `${fmtDate(context.term?.start)} a ${fmtDate(context.term?.end)}` },
    { label: "Tarifa", value: String(context.inherited?.tariffBasis ?? "—") },
    { label: "Reajuste", value: mix || "Conforme contrato" },
    { label: "Take or Pay", value: top?.enabled || top?.config ? "Herdado do contrato" : "Não se aplica" },
  ];
}

/** Formalização da ordem de vendas (portal do cliente) ou registro da curva de ajuste. */
export function PostContractFormalization({
  instrument,
  stage,
  baseContract,
  document,
  contacts,
  busy,
  onSend,
  onRegister,
  onClose,
}: {
  instrument: string;
  stage: string;
  baseContract: { id: string; netlex_number: string; status: string } | null;
  document: { id: string; netlex_number: string; status: string; document: any } | null;
  contacts: Array<{ id: string; name: string; email?: string | null; title?: string | null; decision_role?: string | null }>;
  busy: boolean;
  onSend: (contactId: string) => void;
  onRegister: () => void;
  onClose: () => void;
}) {
  const isOrder = instrument === SALES_ORDER;
  const [contactId, setContactId] = useState(
    () => document?.document?.contact?.id ?? contacts.find((contact) => contact.email)?.id ?? "",
  );
  const baseLink = baseContract && (
    <a href={`/netlex/contracts/${baseContract.id}`} target="_blank" rel="noreferrer" style={{ color: "#0176d3" }}>
      contrato Nº {baseContract.netlex_number}
    </a>
  );
  const inFormalization = stage === "Formalização";
  if (!inFormalization && !document) {
    return (
      <div className="sf-next-step">
        <div>
          <div className="sf-next-step-eyebrow">{instrument} · sobre o {baseLink ?? "contrato"}</div>
          <div className="sf-next-step-title">
            {isOrder ? "Venda pontual com as condições do contrato" : "Redistribuir volumes sem mudar o contrato"}
          </div>
          <div className="sf-next-step-detail">
            {isOrder
              ? `Monte a Cotação (preço recomendado Jetsons e alçada valem normalmente). Na Formalização, o contato aprovador recebe a ordem e tem ${SALES_ORDER_VALIDITY_DAYS} dias para aprovar no portal.`
              : "Na Cotação, use “Mover volume” entre períodos da vigência. Preços ficam travados e o total de cada fluxo precisa se manter."}
          </div>
        </div>
      </div>
    );
  }
  if (!document) {
    if (!isOrder)
      return (
        <div className="sf-next-step">
          <div>
            <div className="sf-next-step-eyebrow">Formalização · próximo passo</div>
            <div className="sf-next-step-title">Registrar a curva de ajuste</div>
            <div className="sf-next-step-detail">
              Gera o registro operacional vinculado ao {baseLink}. Os itens do contrato não mudam.
            </div>
          </div>
          <div className="sf-next-step-actions">
            <button className="sf-btn sf-btn--brand" disabled={busy} onClick={onRegister}>
              {busy ? "Registrando…" : "Registrar curva"}
            </button>
          </div>
        </div>
      );
    return (
      <SalesOrderSendBox
        title="Enviar a ordem de vendas ao cliente"
        detail={<>Gera o contrato simplificado com referência ao {baseLink} e abre o aceite no portal por {SALES_ORDER_VALIDITY_DAYS} dias.</>}
        contacts={contacts}
        contactId={contactId}
        setContactId={setContactId}
        busy={busy}
        label="Enviar ordem ao cliente"
        onSend={() => onSend(contactId)}
      />
    );
  }
  const doc = document.document ?? {};
  const status = document.status;
  const approved = status === SALES_ORDER_STATUS.approved || status === CURVE_STATUS.registered;
  const expired = status === SALES_ORDER_STATUS.expired;
  const days = daysUntil(doc.expiresAt);
  const docLink = (
    <Link className="sf-btn" to="/post-contract/$id" params={{ id: document.id }}>
      {isOrder ? "Ver ordem de vendas" : "Ver registro"}
    </Link>
  );
  if (expired)
    return (
      <SalesOrderSendBox
        warning
        title={`Nº ${document.netlex_number} · proposta expirada`}
        detail={<>O cliente não aprovou em {SALES_ORDER_VALIDITY_DAYS} dias (expirou em {fmtDate(doc.expiresAt)}). Reenvie para abrir um novo prazo.</>}
        contacts={contacts}
        contactId={contactId}
        setContactId={setContactId}
        busy={busy}
        label="Reenviar ao cliente"
        onSend={() => onSend(contactId)}
        extra={docLink}
      />
    );
  return (
    <div className={"sf-next-step" + (approved ? " is-success" : " is-warning")}>
      <div>
        <div className="sf-next-step-eyebrow">
          {instrument} · {baseLink}
        </div>
        <div className="sf-next-step-title" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          Nº {document.netlex_number} <PostContractStatus status={status} />
        </div>
        <div className="sf-next-step-detail">
          {isOrder
            ? approved
              ? `Aprovada no portal por ${doc.approvedBy ?? doc.contact?.name ?? "cliente"} em ${fmtDate(doc.approvedAt)}.${stage === "Formalização" ? " Feche a Oportunidade para concluir." : ""}`
              : `Com ${doc.contact?.name ?? "o cliente"} (${doc.contact?.email ?? "sem e-mail"}) · ${days !== null && days > 0 ? `expira em ${days} dia${days === 1 ? "" : "s"} (${fmtDate(doc.expiresAt)})` : "expira hoje"}.`
            : `Registrada em ${fmtDate(doc.registeredAt)} · ${fmtVolume(doc.moved)} deslocados. O contrato continua igual.${stage === "Formalização" ? " Feche a Oportunidade para concluir." : ""}`}
        </div>
      </div>
      <div className="sf-next-step-actions">
        {docLink}
        {isOrder && !approved && (
          <a className="sf-btn sf-btn--brand" href={`/portal/sales-orders/${document.id}`} target="_blank" rel="noreferrer">
            Abrir portal do cliente ↗
          </a>
        )}
        {approved && stage === "Formalização" && (
          <button className="sf-btn sf-btn--brand" disabled={busy} onClick={onClose}>
            ✓ Fechar oportunidade
          </button>
        )}
      </div>
    </div>
  );
}

function SalesOrderSendBox({
  title,
  detail,
  contacts,
  contactId,
  setContactId,
  busy,
  label,
  onSend,
  warning = false,
  extra,
}: {
  title: string;
  detail: React.ReactNode;
  contacts: Array<{ id: string; name: string; email?: string | null; title?: string | null }>;
  contactId: string;
  setContactId: (value: string) => void;
  busy: boolean;
  label: string;
  onSend: () => void;
  warning?: boolean;
  extra?: React.ReactNode;
}) {
  const selected = contacts.find((contact) => contact.id === contactId);
  const withEmail = contacts.filter((contact) => contact.email?.trim());
  return (
    <div className={"sf-next-step" + (warning ? " is-warning" : "")}>
      <div style={{ flex: "1 1 360px" }}>
        <div className="sf-next-step-eyebrow">Formalização · próximo passo</div>
        <div className="sf-next-step-title">{title}</div>
        <div className="sf-next-step-detail">{detail}</div>
        <label className="sf-pc-contact">
          Contato aprovador
          {withEmail.length ? (
            <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">— Selecione —</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id} disabled={!contact.email?.trim()}>
                  {contact.name}
                  {contact.title ? ` · ${contact.title}` : ""}
                  {contact.email?.trim() ? ` · ${contact.email}` : " · sem e-mail"}
                </option>
              ))}
            </select>
          ) : (
            <span className="sf-pc-warning">Cadastre na Conta um contato com e-mail para receber a proposta.</span>
          )}
        </label>
        {selected && (
          <div className="sf-next-step-detail">
            {selected.name} recebe o e-mail com o link do portal (Gestão de Contratos → Ordem de vendas).
          </div>
        )}
      </div>
      <div className="sf-next-step-actions">
        {extra}
        <button className="sf-btn sf-btn--brand" disabled={busy || !selected?.email} onClick={onSend}>
          {busy ? "Enviando…" : label}
        </button>
      </div>
    </div>
  );
}

function monthsInTerm(start?: string | null, end?: string | null) {
  if (!start || !end) return [] as Array<{ year: number; month: number }>;
  const result = [] as Array<{ year: number; month: number }>;
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const last = Number(end.slice(0, 4)) * 100 + Number(end.slice(5, 7));
  while (year * 100 + month <= last && result.length < 240) {
    result.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}

/** Painel da curva de ajuste: saldo, linha do tempo antes/depois, deslocamento e histórico. */
export function AdjustmentCurvePanel({
  quoteId,
  curve,
  term,
  editable,
  stage,
  onChanged,
}: {
  quoteId: string;
  curve: { flows: CurveFlowBalance[]; balanced: boolean; changed: boolean; moved: number; log: CurveMove[] };
  term: { start?: string | null; end?: string | null };
  editable: boolean;
  stage: string;
  onChanged: () => Promise<void> | void;
}) {
  const flows = curve.flows;
  const [flowCode, setFlowCode] = useState(flows[0]?.flowCode ?? "");
  const flow = flows.find((entry) => entry.flowCode === flowCode) ?? flows[0];
  const origins = (flow?.periods ?? []).filter((period) => period.after > 0);
  const [fromKey, setFromKey] = useState("");
  const origin = origins.find((period) => period.key === fromKey) ?? null;
  const months = useMemo(() => monthsInTerm(term.start, term.end), [term.start, term.end]);
  const [toPeriod, setToPeriod] = useState("");
  const [volume, setVolume] = useState("");
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "move" | "reset">("");
  const canMove = editable && stage === "Negociação";
  const numericVolume = Number(volume);
  const [toYear, toMonth] = toPeriod ? toPeriod.split("-").map(Number) : [0, 0];
  const destinationNow = flow
    ? flow.periods.filter((period) => period.year === toYear && period.month === toMonth).reduce((sum, period) => sum + period.after, 0)
    : 0;
  const volumeValid = Number.isInteger(numericVolume) && numericVolume > 0 && !!origin && numericVolume <= origin.after;
  const ready = canMove && !!origin && !!toPeriod && volumeValid && !!reason;
  const unit = flow?.unit ? ` ${flow.unit}` : "";
  const multiplePlazas = new Set(origins.map((period) => `${period.year}-${period.month}`)).size !== origins.length;
  const originLabel = (period: { key: string; year: number; month: number; after: number }) =>
    `${periodLabel(period.year, period.month)}${multiplePlazas ? ` · ${period.key.split("|")[3] ?? ""}` : ""} · ${fmtVolume(period.after)}${unit}`;

  const submit = async () => {
    if (!origin || !ready) return;
    setBusy("move");
    try {
      const result = await moveCurveVolume({
        data: { quoteId, fromKey: origin.key, toYear, toMonth, volume: numericVolume, reason, note },
      });
      toast.success("Volume deslocado", { description: `${fmtVolume(numericVolume)}${unit} · ${result.label}` });
      setVolume("");
      setNote("");
      setFromKey("");
      setToPeriod("");
      await onChanged();
    } catch (error) {
      toast.error("Não foi possível mover o volume", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  };
  const reset = async () => {
    if (!confirm("Descartar todos os deslocamentos e voltar às Agendas do contrato?")) return;
    setBusy("reset");
    try {
      await resetCurveToBaseline({ data: { quoteId } });
      toast.success("Curva restaurada para a linha de base do contrato");
      await onChanged();
    } catch (error) {
      toast.error("Não foi possível restaurar", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy("");
    }
  };

  return (
    <section id="curve-volume" className="sf-card sf-curve" aria-label="Curva de ajuste">
      <div className="sf-card-header sf-curve-header">
        <span>📈 Curva de ajuste · redistribuição de volumes</span>
        <span className={"sf-status-chip sf-status-chip--" + (curve.changed && curve.balanced ? "success" : curve.changed ? "danger" : "neutral")}>
          {!curve.changed ? "Sem deslocamentos" : curve.balanced ? `Saldo zerado · ${fmtVolume(curve.moved)} deslocados` : "Saldo diferente de zero"}
        </span>
      </div>
      <div className="sf-card-body" style={{ display: "grid", gap: 16 }}>
        <p className="sf-curve-lede">
          Os preços e as demais condições vêm travados do contrato. A curva só troca volume de mês: o total de cada fluxo
          precisa continuar igual ao contratado.
        </p>

        <div className="sf-table-wrap">
          <table className="sf-table sf-curve-balance">
            <thead>
              <tr>
                <th>Fluxo</th>
                <th>Contratado</th>
                <th>Na curva</th>
                <th>Deslocado</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((entry) => (
                <tr key={entry.flowCode}>
                  <td>
                    <strong>{entry.flowCode}</strong>
                    {entry.route && <div className="sf-curve-muted">{entry.route}</div>}
                  </td>
                  <td>{fmtVolume(entry.baseTotal)}{entry.unit ? ` ${entry.unit}` : ""}</td>
                  <td>{fmtVolume(entry.newTotal)}{entry.unit ? ` ${entry.unit}` : ""}</td>
                  <td>{entry.moved ? fmtVolume(entry.moved) : "—"}</td>
                  <td>
                    {entry.balanced ? (
                      <span className="sf-curve-ok">✓ Zerado</span>
                    ) : (
                      <span className="sf-curve-bad">⚠ {entry.delta > 0 ? "+" : ""}{fmtVolume(entry.delta)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sf-curve-layout">
          <div className="sf-curve-move" aria-label="Mover volume">
            <strong>Mover volume</strong>
            {!canMove && (
              <div className="sf-curve-muted">
                {stage !== "Negociação"
                  ? "Deslocamentos só em Negociação."
                  : "A Cotação não está em Rascunho. Deslocamentos bloqueados."}
              </div>
            )}
            <label>
              Fluxo
              <select value={flow?.flowCode ?? ""} disabled={!canMove} onChange={(event) => { setFlowCode(event.target.value); setFromKey(""); }}>
                {flows.map((entry) => (
                  <option key={entry.flowCode} value={entry.flowCode}>
                    {entry.flowCode}{entry.route ? ` · ${entry.route}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="sf-curve-move-pair">
              <label>
                De (período)
                <select value={fromKey} disabled={!canMove} onChange={(event) => setFromKey(event.target.value)}>
                  <option value="">— Origem —</option>
                  {origins.map((period) => (
                    <option key={period.key} value={period.key}>
                      {originLabel(period)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="sf-curve-arrow" aria-hidden>→</span>
              <label>
                Para (período)
                <select value={toPeriod} disabled={!canMove} onChange={(event) => setToPeriod(event.target.value)}>
                  <option value="">— Destino —</option>
                  {months
                    .filter((entry) => !origin || entry.year !== origin.year || entry.month !== origin.month)
                    .map((entry) => (
                      <option key={`${entry.year}-${entry.month}`} value={`${entry.year}-${entry.month}`}>
                        {periodLabel(entry.year, entry.month)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Volume{unit}
              <input
                type="number"
                min={1}
                step={1}
                max={origin?.after}
                value={volume}
                disabled={!canMove || !origin}
                placeholder={origin ? `até ${fmtVolume(origin.after)}` : "Escolha a origem"}
                onChange={(event) => setVolume(event.target.value)}
              />
            </label>
            {origin && volume !== "" && !volumeValid && (
              <div className="sf-curve-bad" role="alert">
                Use um inteiro entre 1 e {fmtVolume(origin.after)} (volume disponível na origem).
              </div>
            )}
            <label>
              Justificativa operacional
              <select value={reason} disabled={!canMove} onChange={(event) => setReason(event.target.value)}>
                <option value="">— Selecione —</option>
                {CURVE_REASONS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observação (opcional)
              <input value={note} disabled={!canMove} maxLength={240} placeholder="Ex.: colheita atrasada no MT" onChange={(event) => setNote(event.target.value)} />
            </label>
            {origin && toPeriod && volumeValid && (
              <div className="sf-curve-preview" role="status">
                <div>
                  <span>{periodLabel(origin.year, origin.month)}</span>
                  <strong>
                    {fmtVolume(origin.after)} → {fmtVolume(origin.after - numericVolume)}
                  </strong>
                  <em className="is-down">−{fmtVolume(numericVolume)}</em>
                </div>
                <div>
                  <span>{periodLabel(toYear, toMonth)}</span>
                  <strong>
                    {fmtVolume(destinationNow)} → {fmtVolume(destinationNow + numericVolume)}
                  </strong>
                  <em className="is-up">+{fmtVolume(numericVolume)}</em>
                </div>
                <small>Saldo do fluxo permanece {flow?.balanced ? "zerado" : "igual"} · preços do contrato mantidos</small>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="sf-btn sf-btn--brand" disabled={!ready || !!busy} onClick={submit}>
                {busy === "move" ? "Movendo…" : "Mover volume"}
              </button>
              <button className="sf-btn" disabled={!canMove || !curve.changed || !!busy} onClick={reset}>
                {busy === "reset" ? "Restaurando…" : "Restaurar linha de base"}
              </button>
            </div>
          </div>

          <div className="sf-curve-timeline" aria-label="Volumes por período">
            {flow && (
              <>
                <div className="sf-curve-legend">
                  <strong>{flow.flowCode}</strong>
                  <span><i className="is-before" /> Contrato</span>
                  <span><i className="is-after" /> Curva</span>
                </div>
                {(() => {
                  const max = Math.max(1, ...flow.periods.map((period) => Math.max(period.before, period.after)));
                  return flow.periods.map((period) => (
                    <div key={period.key} className={"sf-curve-row" + (period.delta ? " is-changed" : "")}>
                      <span className="sf-curve-period">{periodLabel(period.year, period.month)}</span>
                      <div className="sf-curve-bars">
                        <div className="sf-curve-bar is-before" style={{ width: `${(period.before / max) * 100}%` }} />
                        <div className="sf-curve-bar is-after" style={{ width: `${(period.after / max) * 100}%` }} />
                      </div>
                      <span className="sf-curve-values">
                        {period.delta ? `${fmtVolume(period.before)} → ${fmtVolume(period.after)}` : fmtVolume(period.after)}
                      </span>
                      <span className={"sf-curve-delta" + (period.delta > 0 ? " is-up" : period.delta < 0 ? " is-down" : "")}>
                        {period.delta ? `${period.delta > 0 ? "+" : "−"}${fmtVolume(Math.abs(period.delta))}` : ""}
                      </span>
                    </div>
                  ));
                })()}
              </>
            )}
          </div>
        </div>

        <div>
          <strong style={{ fontSize: 13 }}>Deslocamentos registrados ({curve.log.length})</strong>
          {curve.log.length ? (
            <ol className="sf-curve-log">
              {curve.log.map((move) => (
                <li key={move.id}>
                  <strong>
                    {fmtVolume(move.volume)}
                    {move.unit ? ` ${move.unit}` : ""} · {move.flowCode} · {periodLabel(move.from.year, move.from.month)} →{" "}
                    {periodLabel(move.to.year, move.to.month)}
                  </strong>
                  <span>
                    {move.reason}
                    {move.note ? ` — ${move.note}` : ""} · {fmtDate(move.at)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="sf-curve-muted" style={{ margin: "6px 0 0" }}>
              Nenhum deslocamento ainda. Exemplo: 7.000 t de novembro para dezembro por quebra de safra.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export { ADJUSTMENT_CURVE, SALES_ORDER };
