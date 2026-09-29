import { useId, useState } from "react";

export type BusinessRule = {
  label: string;
  passed: boolean;
  detail?: string;
  explanation?: string;
};

export function BusinessRulesChecklist({
  rules,
  title = "Regras de negócio",
  description,
}: {
  rules: BusinessRule[];
  title?: string;
  description?: string;
}) {
  const completed = rules.filter((rule) => rule.passed).length;
  const instanceId = useId();
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  return (
    <section className="sf-card sf-business-rules" aria-live="polite">
      <div className="sf-card-header sf-business-rules-header">
        <div className="sf-business-rules-heading">
          <strong>{title}</strong>
          {description && <small>{description}</small>}
        </div>
        <span>
          {completed}/{rules.length} concluídas
        </span>
      </div>
      <ul className="sf-business-rules-list">
        {rules.map((rule, index) => {
          const tooltipId = `${instanceId}-business-rule-tip-${index}`;
          return (
          <li
            className={rule.passed ? "is-passed" : "is-pending"}
            key={rule.label}
            aria-label={`${rule.passed ? "Atendida" : "Pendente"}: ${rule.label}`}
          >
            <span className="sf-business-rules-icon" aria-hidden="true">
              {rule.passed ? "✓" : "!"}
            </span>
            <span className="sf-business-rules-copy">
              <span className="sf-business-rules-title">
                <strong>{rule.label}</strong>
                {rule.explanation && (
                  <span className="sf-business-rule-help-wrap">
                    <button
                      className="sf-business-rule-help"
                      type="button"
                      aria-label={`Explicação da regra: ${rule.label}`}
                      aria-describedby={tooltipId}
                      aria-expanded={openTooltip === tooltipId}
                      onClick={() =>
                        setOpenTooltip((current) => (current === tooltipId ? null : tooltipId))
                      }
                    >
                      i
                    </button>
                    <span
                      className={`sf-business-rule-tooltip${openTooltip === tooltipId ? " is-open" : ""}`}
                      id={tooltipId}
                      role="tooltip"
                    >
                      {rule.explanation}
                    </span>
                  </span>
                )}
              </span>
              {rule.detail && <small>{rule.detail}</small>}
            </span>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
