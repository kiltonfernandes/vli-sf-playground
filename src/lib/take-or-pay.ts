export type TakeOrPayPair = {
  compensatedFlowId: string;
  compensatingFlowId: string;
  ratioFrom: number;
  ratioTo: number;
};

export type TakeOrPayGroup = { name: string; flowIds: string[] };

export type TakeOrPayConfig = {
  auditDate: string;
  billingDate: string;
  compensationMode: "individual" | "all-flows" | "flow-pairs" | "groups";
  calculationBasis: "volume" | "tariff" | "both";
  pairs: TakeOrPayPair[];
  groups: TakeOrPayGroup[];
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Validates the saved TOP record against the flows in the opportunity's quote. */
export function takeOrPayRuleError(
  config: TakeOrPayConfig | null | undefined,
  hasTolerances: boolean,
  allowedFlowIds: Set<string>,
) {
  if (!hasTolerances) return config ? "Remova a configuração Take or Pay: não há tolerâncias nas Agendas." : null;
  if (!config) return "As Agendas têm tolerâncias; configure Take or Pay antes de avançar.";
  if (!validDate(config.auditDate) || !validDate(config.billingDate))
    return "Informe datas válidas para apuração e faturamento do Take or Pay.";
  if (!(["individual", "all-flows", "flow-pairs", "groups"] as string[]).includes(config.compensationMode))
    return "Selecione um modelo de compensação válido.";
  if (!( ["volume", "tariff", "both"] as string[]).includes(config.calculationBasis))
    return "Selecione se a compensação considera volume, tarifa ou ambos.";
  if (config.compensationMode === "flow-pairs") {
    if (!config.pairs.length) return "Adicione ao menos uma relação de fluxo compensado e compensador.";
    for (const pair of config.pairs) {
      if (!pair || typeof pair.compensatedFlowId !== "string" || typeof pair.compensatingFlowId !== "string")
        return "Complete os dois fluxos de cada relação de compensação.";
      if (!allowedFlowIds.has(pair.compensatedFlowId) || !allowedFlowIds.has(pair.compensatingFlowId))
        return "Cada fluxo de compensação precisa pertencer à Cotação desta Oportunidade.";
      if (pair.compensatedFlowId === pair.compensatingFlowId)
        return "O fluxo compensado e o compensador precisam ser diferentes.";
      if (!Number.isFinite(pair.ratioFrom) || pair.ratioFrom <= 0 || !Number.isFinite(pair.ratioTo) || pair.ratioTo <= 0)
        return "A proporcionalidade precisa usar valores maiores que zero.";
    }
  }
  if (config.compensationMode === "groups") {
    if (!config.groups.length) return "Crie ao menos um grupo de compensação.";
    const assigned = new Set<string>();
    for (const group of config.groups) {
      if (!group || typeof group.name !== "string" || !Array.isArray(group.flowIds))
        return "Revise os dados dos grupos de compensação.";
      if (!group.name.trim() || group.flowIds.length < 2)
        return "Cada grupo precisa de um nome e pelo menos dois fluxos.";
      for (const flowId of group.flowIds) {
        if (!allowedFlowIds.has(flowId)) return "Os fluxos dos grupos precisam pertencer à Cotação desta Oportunidade.";
        if (assigned.has(flowId)) return "Um fluxo só pode pertencer a um grupo de compensação.";
        assigned.add(flowId);
      }
    }
  }
  if (config.compensationMode === "individual" && (config.pairs.length || config.groups.length))
    return "O modelo sem compensação não aceita pares nem grupos.";
  if (config.compensationMode === "all-flows" && (config.pairs.length || config.groups.length))
    return "O modelo de compensação entre todos os fluxos não aceita pares nem grupos.";
  return null;
}

export function parseTakeOrPayConfig(raw: string | null | undefined): TakeOrPayConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TakeOrPayConfig>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      auditDate: String(parsed.auditDate ?? ""),
      billingDate: String(parsed.billingDate ?? ""),
      compensationMode: parsed.compensationMode as TakeOrPayConfig["compensationMode"],
      calculationBasis: parsed.calculationBasis as TakeOrPayConfig["calculationBasis"],
      pairs: Array.isArray(parsed.pairs) ? parsed.pairs : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
  } catch {
    return null;
  }
}

export function takeOrPayConfigRuleError(config: TakeOrPayConfig | null | undefined, allowedFlowIds: Set<string>) {
  if (!config) return "Configure datas, modelo e base de compensação do Take or Pay.";
  return takeOrPayRuleError(config, true, allowedFlowIds);
}
