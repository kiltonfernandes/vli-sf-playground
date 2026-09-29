import { toast } from "sonner";

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
        {rules.map((rule) => (

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
                  <button
                    className="sf-business-rule-help"
                    type="button"
                    aria-label={`Explicação da regra: ${rule.label}`}
                    onClick={() =>
                      toast(`Regra: ${rule.label}`, {
                        description: rule.explanation,
                        duration: Infinity,
                        action: {
                          label: "Entendi",
                          onClick: () => {},
                        },
                      })
                    }
                  >
                    i
                  </button>
                )}
              </span>
              {rule.detail && <small>{rule.detail}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
