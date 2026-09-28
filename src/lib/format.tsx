export const fmtMoney = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
};

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

export type Health = "Verde" | "Amarelo" | "Vermelho";

export function HealthPill({ health }: { health: Health }) {
  const map: Record<string, { bg: string; fg: string; dot: string }> = {
    Verde: { bg: "#cdefc4", fg: "#194e2c", dot: "#2e844a" },
    Amarelo: { bg: "#fef0c3", fg: "#5c4204", dot: "#fe9339" },
    Vermelho: { bg: "#feded2", fg: "#8e030f", dot: "#ea001e" },
  };
  const s = map[health] ?? { bg: "#ecebea", fg: "#3e3e3c", dot: "#969492" };
  return (
    <span className="sf-pill" style={{ background: s.bg, color: s.fg }}>
      <span className="sf-dot" style={{ background: s.dot }} /> {health}
    </span>
  );
}

export function RiskPill({ value }: { value: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    Baixo: { bg: "#e5f5e0", fg: "#194e2c" },
    Médio: { bg: "#fef0c3", fg: "#5c4204" },
    Alto: { bg: "#feded2", fg: "#8e030f" },
  };
  const s = map[value] ?? { bg: "#ecebea", fg: "#3e3e3c" };
  return (
    <span className="sf-pill" style={{ background: s.bg, color: s.fg }}>
      {value}
    </span>
  );
}

export function StatusPill({ value }: { value: string }) {
  return (
    <span className="sf-pill" style={{ background: "#e5f3fe", color: "#014486" }}>
      {value}
    </span>
  );
}
