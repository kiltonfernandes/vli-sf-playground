import { useState } from "react";
import { saveRecord } from "@/lib/crud";
import { generateRecord, randomSeed } from "@/lib/generators";
import type { FieldDef } from "./SfRecordDialog";

type Props = {
  table: string;
  fields: FieldDef[];
  defaults: Record<string, any>;
  rows?: any[];
  transform?: (form: Record<string, any>) => Record<string, any>;
  onClose: () => void;
  onSaved: () => void;
};

export function SfBulkRecordDialog({ table, fields, defaults, rows = [], transform, onClose, onSaved }: Props) {
  const editing = rows.length > 0;
  const [form, setForm] = useState<Record<string, any>>(defaults);
  const [apply, setApply] = useState<Record<string, boolean>>({});
  const [seed, setSeed] = useState(randomSeed);
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (editing) {
        const chosen = fields.filter((field) => apply[field.name]);
        if (!chosen.length) throw new Error("Selecione ao menos um campo para atualizar.");
        for (const field of chosen) {
          if (field.required && !String(form[field.name] ?? "").trim()) {
            throw new Error(field.label + " é obrigatório.");
          }
        }
        for (const row of rows) {
          const patch = Object.fromEntries(chosen.map((field) => [field.name, form[field.name]]));
          const merged = { ...row, ...patch };
          await saveRecord({ data: { table, recordId: row.id, data: transform ? transform(merged) : patch } });
        }
      } else {
        const amount = Math.max(1, Math.min(100, Math.floor(count) || 1));
        for (let i = 0; i < amount; i++) {
          const generated = generateRecord(table, seed + i, fields);
          if (!generated) throw new Error("Este objeto ainda não tem um gerador registrado.");
          for (const field of fields) {
            if (field.required && !String(generated[field.name] ?? "").trim()) {
              throw new Error("O gerador não preencheu o campo obrigatório: " + field.label);
            }
          }
          await saveRecord({ data: { table, recordId: null, data: transform ? transform({ ...defaults, ...generated }) : generated } });
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sf-modal-backdrop" onClick={onClose}>
      <div className="sf-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sf-modal-header">
          <h2>{editing ? `Atualizar ${rows.length} registros` : "Criar registros em lote"}</h2>
        </div>
        <div className="sf-modal-body">
          {editing ? (
            <>
              <p>Marque os campos que deseja substituir nos {rows.length} registros selecionados.</p>
              {fields.map((field) => (
                <label key={field.name} style={{ display: "grid", gridTemplateColumns: "24px 150px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <input type="checkbox" checked={!!apply[field.name]} onChange={(event) => setApply((state) => ({ ...state, [field.name]: event.target.checked }))} />
                  <span>{field.label}</span>
                  {field.type === "select" ? (
                    <select className="sf-input" disabled={!apply[field.name]} value={form[field.name] ?? ""} onChange={(event) => setForm((state) => ({ ...state, [field.name]: event.target.value }))}>
                      <option value="">— Selecionar —</option>
                      {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea className="sf-input" disabled={!apply[field.name]} value={form[field.name] ?? ""} onChange={(event) => setForm((state) => ({ ...state, [field.name]: event.target.value }))} />
                  ) : (
                    <input className="sf-input" disabled={!apply[field.name]} type={field.type === "number" ? "number" : "text"} value={form[field.name] ?? ""} onChange={(event) => setForm((state) => ({ ...state, [field.name]: field.type === "number" ? Number(event.target.value) : event.target.value }))} />
                  )}
                </label>
              ))}
            </>
          ) : (
            <>
              <p>Os registros serão gerados com Faker usando seeds consecutivas. O mesmo conjunto de seeds gera os mesmos dados.</p>
              <label style={{ display: "block", marginBottom: 12 }}>Quantidade (1–100)
                <input className="sf-input" type="number" min={1} max={100} value={count} onChange={(event) => setCount(Number(event.target.value))} />
              </label>
              <label style={{ display: "block" }}>Seed inicial
                <input className="sf-input" type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value) || 1)} />
              </label>
            </>
          )}
          {error && <div role="alert" style={{ color: "#ba0517", marginTop: 12 }}>{error}</div>}
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="sf-btn sf-btn--brand" disabled={busy} onClick={submit}>{busy ? "Processando…" : editing ? "Atualizar selecionados" : "Gerar e salvar"}</button>
        </div>
      </div>
    </div>
  );
}
