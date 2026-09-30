import { useState, type ReactNode } from "react";

export type SfPathStep = {
  label: string;
  /** Texto curto abaixo do rótulo (ex.: "Pendente alçada"). */
  hint?: string;
};

/**
 * Path no estilo Salesforce Lightning, reutilizado por Oportunidade, Cotação e
 * NetLex. As etapas antes de `currentIndex` aparecem concluídas; se `done` for
 * verdadeiro, todas aparecem concluídas.
 */
export function SfPath({
  label,
  steps,
  currentIndex,
  done = false,
  blocked = false,
  actions,
  children,
  message,
}: {
  label: string;
  steps: SfPathStep[];
  currentIndex: number;
  done?: boolean;
  /** Etapa atual com impedimento (ex.: preço rejeitado): pinta de vermelho. */
  blocked?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  message?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="sf-path-card" aria-label={label}>
      <button
        className="sf-path-collapse"
        aria-label={open ? "Recolher caminho" : "Expandir caminho"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? "⌃" : "⌄"}
      </button>
      <div className="sf-path-main">
        <div className="sf-path-steps" role="list" aria-label="Etapas">
          {steps.map((step, index) => {
            const complete = done || index < currentIndex;
            const current = !done && index === currentIndex;
            return (
              <div
                key={step.label}
                role="listitem"
                aria-current={current ? "step" : undefined}
                title={step.hint ? `${step.label} · ${step.hint}` : step.label}
                className={
                  "sf-path-step" +
                  (complete ? " is-complete" : "") +
                  (current ? " is-current" : "") +
                  (current && blocked ? " is-blocked" : "")
                }
              >
                <span className="sf-path-check">{complete ? "✓" : ""}</span>
                <span className="sf-path-step-text">
                  <span>{step.label}</span>
                  {step.hint && <small>{step.hint}</small>}
                </span>
              </div>
            );
          })}
        </div>
        {actions && <div className="sf-path-actions">{actions}</div>}
      </div>
      {open && children && <div className="sf-path-panels">{children}</div>}
      {open && message && (
        <div className="sf-path-message" role="status">
          {message}
        </div>
      )}
    </section>
  );
}
