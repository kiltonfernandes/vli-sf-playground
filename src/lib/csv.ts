import type { FieldDef } from "@/components/SfRecordDialog";

export function exportCsv(rows: Array<Record<string, unknown>>, fields: FieldDef[]) {
  if (!rows.length) return;
  const columns = fields.filter((field) => field.name in rows[0]);
  const cell = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = [columns.map((field) => cell(field.label)).join(","), ...rows.map((row) => columns.map((field) => cell(row[field.name])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "registros-selecionados.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
