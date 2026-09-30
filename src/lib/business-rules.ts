/** Shared business-rule checks used by the Quote UI and server mutations. */
export type ReadjustmentInput = {
  contractStart: string;
  contractEnd: string;
  dieselPct: number;
  igpmPct: number;
  ipcaPct: number;
  firstReadjustmentDate: string | null | undefined;
};

const DAY_MS = 86_400_000;

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function contractDurationDays(start: string, end: string) {
  if (!validIsoDate(start) || !validIsoDate(end)) return null;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
  return Math.round((endTime - startTime) / DAY_MS);
}

/** Returns a readable validation error, or null when the readjustment is valid. */
export function readjustmentRuleError(input: ReadjustmentInput) {
  const days = contractDurationDays(input.contractStart, input.contractEnd);
  if (days === null) return "Informe uma vigência válida antes de ajustar o reajuste anual.";
  const pcts = [input.dieselPct, input.igpmPct, input.ipcaPct];
  if (pcts.some((value) => !Number.isFinite(value) || value < 0 || value > 100))
    return "Cada percentual de reajuste deve ficar entre 0% e 100%.";
  const first = String(input.firstReadjustmentDate ?? "").trim();
  if (first) {
    const date = Date.parse(`${first}T00:00:00Z`);
    if (!validIsoDate(first) || !Number.isFinite(date))
      return "Informe a data do primeiro reajuste em formato válido.";
    if (first < input.contractStart || first > input.contractEnd)
      return "A data do primeiro reajuste precisa estar dentro da vigência do contrato.";
  }
  if (days > 365) {
    if (Math.abs(pcts.reduce((sum, value) => sum + value, 0) - 100) > 0.001)
      return "Para vigência superior a 365 dias, Diesel + IGP-M + IPCA precisam somar 100%.";
    if (!first) return "Informe a data do primeiro reajuste na Oportunidade.";
  }
  return null;
}

function periodOrdinal(year: number, month: number) {
  return year * 12 + month - 1;
}

/** A diesel base date may be in its Schedule month or the immediately previous month. */
export function isDieselBaseDateApplicable(
  raw: unknown,
  applicationDay: number,
  scheduleMonth: number,
  scheduleYear: number,
) {
  const value = String(raw ?? "").trim();
  let day = applicationDay;
  let month: number;
  let year: number;
  const full = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const monthYear = /^(\d{2})\/(\d{4})$/.exec(value);
  if (full) {
    day = Number(full[1]);
    month = Number(full[2]);
    year = Number(full[3]);
  } else if (monthYear) {
    month = Number(monthYear[1]);
    year = Number(monthYear[2]);
  } else return false;
  if (![1, 10, 20].includes(applicationDay) || day !== applicationDay || month < 1 || month > 12)
    return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month) return false;
  const delta = periodOrdinal(scheduleYear, scheduleMonth) - periodOrdinal(year, month);
  return delta === 0 || delta === 1;
}

/** Rebuild a Schedule group's tariff and percentages after editing one service price. */
export function reallocateScheduleGroup(
  currentAmounts: number[],
  changedIndex: number,
  changedAmount: number,
) {
  if (
    !currentAmounts.length ||
    !Number.isInteger(changedIndex) ||
    changedIndex < 0 ||
    changedIndex >= currentAmounts.length ||
    !Number.isFinite(changedAmount) ||
    changedAmount <= 0
  )
    throw new Error("Informe um preço válido para uma linha do grupo.");
  const sharesCents = currentAmounts.map((amount, index) => {
    const value = index === changedIndex ? changedAmount : amount;
    if (!Number.isFinite(value) || value < 0) throw new Error("O rateio contém um valor inválido.");
    return Math.round(value * 100);
  });
  const totalCents = sharesCents.reduce((sum, value) => sum + value, 0);
  if (totalCents <= 0) throw new Error("O rateio do grupo precisa ter um valor maior que zero.");
  const percentUnits = sharesCents.map((value) => Math.floor((value / totalCents) * 10_000));
  const residual = 10_000 - percentUnits.reduce((sum, value) => sum + value, 0);
  const residualTarget = sharesCents.indexOf(Math.max(...sharesCents));
  percentUnits[residualTarget] += residual;
  return { sharesCents, totalCents, percentUnits };
}
