import type { Generator } from "./core";
const LOCATIONS = [
  ["Pátio PPN", "PPN", "Paulínia", "SP"],
  ["Terminal QPM", "QPM", "Químicos", "SP"],
  ["Terminal EYU", "EYU", "Aracruz", "ES"],
  ["Pátio VGV", "VGV", "Vitória", "ES"],
];
export const locationsGenerator: Generator = (f) => {
  const [name, code, city, state] = f.helpers.arrayElement(LOCATIONS);
  return {
    name,
    code,
    city,
    state,
    microregion: state === "ES" ? "Litoral" : "Campinas",
    location_type: name.startsWith("Pátio") ? "Pátio" : "Terminal",
  };
};
