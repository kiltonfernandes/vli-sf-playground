export type BusinessRule = {
  label: string;
  passed: boolean;
  detail?: string;
};

export function BusinessRulesChecklist({
  rules,
  title = "Regras de negócio",
}: {
  rules: BusinessRule[];
  title?: string;
}) {
  const completed = rules.filter((rule) => rule.passed).length;

  return (
    <section className="sf-card sf-business-rules" aria-live="polite">
      <div className="sf-card-header sf-business-rules-header">
        <strong>{title}</strong>
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
              <strong>{rule.label}</strong>
              {rule.detail && <small>{rule.detail}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
