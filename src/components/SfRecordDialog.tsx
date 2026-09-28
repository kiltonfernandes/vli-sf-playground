import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generators, generateRecord, randomSeed } from "@/lib/generators";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  options?: string[];
  required?: boolean;
  placeholder?: string;
};

type Props = {
  title: string;
  table: string;
  fields: FieldDef[];
  defaults: Record<string, any>;
  onClose: () => void;
  onSaved?: () => void;
  /** Called right before insert/update to derive extra/computed fields. */
  transform?: (form: Record<string, any>) => Record<string, any>;
  /** When provided, the dialog updates this record instead of inserting a new one. */
  recordId?: string;
};

export function SfRecordDialog({
  title,
  table,
  fields,
  defaults,
  onClose,
  onSaved,
  transform,
  recordId,
}: Props) {
  const [form, setForm] = useState<Record<string, any>>(defaults);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seed, setSeed] = useState<number>(() => randomSeed());

  function set(name: string, value: any) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function save() {
    for (const f of fields) {
      if (f.required && !String(form[f.name] ?? "").trim()) {
        setErr(`${f.label} é obrigatório`);
        return;
      }
    }
    setErr(null);
    setSaving(true);
    const payload = transform ? transform(form) : form;
    const { error } = recordId
      ? await (supabase
          .from(table as any)
          .update(payload)
          .eq("id", recordId) as any)
      : await (supabase.from(table as any).insert(payload) as any);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved?.();
    onClose();
  }

  const canGenerate = !recordId && !!generators[table];
  function generate() {
    const rec = generateRecord(table, seed, fields);
    if (rec) setForm((f) => ({ ...f, ...rec }));
    setSeed((s) => s + 1);
  }

  return (
    <div className="sf-modal-backdrop" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sf-modal-header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ flex: 1 }}>{title}</h2>
          {canGenerate && (
            <>
              <label style={{ fontSize: 11, color: "#706e6b" }}>Seed</label>
              <input
                className="sf-input"
                type="number"
                style={{ width: 100 }}
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 1)}
              />
              <button className="sf-btn sf-btn--brand" onClick={generate}>
                Gerar
              </button>
            </>
          )}
          <button className="sf-icon-btn" onClick={onClose}></button>
        </div>
        <div className="sf-modal-body">
          {fields.map((f) => (
            <div key={f.name} style={{ marginBottom: 12 }}>
              {f.type !== "checkbox" && (
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#444",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {f.label}
                  {f.required && " *"}
                </label>
              )}
              {f.type === "select" ? (
                <select
                  className="sf-input"
                  value={form[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                >
                  <option value="">— Selecionar —</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  className="sf-input"
                  rows={3}
                  value={form[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                />
              ) : f.type === "checkbox" ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "#16325c",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!form[f.name]}
                    onChange={(e) => set(f.name, e.target.checked)}
                  />
                  {f.label}
                </label>
              ) : (
                <input
                  className="sf-input"
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={form[f.name] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    set(f.name, f.type === "number" ? Number(e.target.value) : e.target.value)
                  }
                />
              )}
            </div>
          ))}
          {err && <div style={{ color: "#ba0517", fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="sf-btn sf-btn--brand" disabled={saving} onClick={save}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DeleteProps = {
  table: string;
  id: string;
  label?: string;
  redirectTo?: string;
  onDeleted?: () => void;
};

export function SfDeleteButton({
  table,
  id,
  label = "Excluir",
  redirectTo,
  onDeleted,
}: DeleteProps) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!confirm("Excluir este registro? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    const { error } = await (supabase
      .from(table as any)
      .delete()
      .eq("id", id) as any);
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    onDeleted?.();
    if (redirectTo) window.location.href = redirectTo;
  }
  return (
    <button
      className="sf-btn"
      style={{ color: "#ba0517", borderColor: "#ba0517" }}
      disabled={busy}
      onClick={go}
    >
      {busy ? "Excluindo…" : label}
    </button>
  );
}
