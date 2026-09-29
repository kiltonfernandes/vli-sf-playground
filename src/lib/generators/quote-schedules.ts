import type { Generator } from "./core";
export const quoteSchedulesGenerator: Generator = (f) => ({
  year: 2027 + f.number.int({ min: 0, max: 2 }),
  month: f.number.int({ min: 1, max: 12 }),
  frequency: "Mensal",
  period_window: "Mês",
  division: "Todas",
  plaza: "TODAS_PRACAS_NACIONAL",
  volume: f.number.int({ min: 1000, max: 9000 }),
  tariff_cbs: "",
  tariff_net: Number(f.number.float({ min: 180, max: 520, fractionDigits: 2 }).toFixed(2)),
  diesel_label: "ELDORADO",
  accessory_net: 0,
  accessory_net_pct: 0,
  tolerance_vli_tariff: 0,
  tolerance_client_tariff: 0,
  tolerance_vli_volume: 0,
  tolerance_client_volume: 0,
});
