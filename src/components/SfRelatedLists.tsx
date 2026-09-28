import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteRecord } from "@/lib/crud";
import { SfListView, type Column } from "@/components/SfListView";
import { SfRecordDialog, type FieldDef } from "@/components/SfRecordDialog";
import { SfBulkRecordDialog } from "@/components/SfBulkRecordDialog";
import { exportCsv } from "@/lib/csv";

export type RelatedListDefinition = {
  key: string;
  label: string;
  table: string;
  load: (parentId: string) => Promise<any[]>;
  columns: Column<any>[];
  fields: FieldDef[];
  createDefaults: (parentId: string) => Record<string, any>;
  rowDefaults: (row: any, parentId: string) => Record<string, any>;
  transform?: (form: Record<string, any>, parentId: string) => Record<string, any>;
  refreshKeys?: (parentId: string) => unknown[][];
  defaultVisible?: boolean;
};

type RelatedListItem = { id: string; definitionKey: string };

type Props = {
  objectType: string;
  parentId: string;
  definitions: RelatedListDefinition[];
};

export function SfRelatedLists({ objectType, parentId, definitions }: Props) {
  const storageKey = `sf-related-lists:${objectType}`;
  const [items, setItems] = useState<RelatedListItem[]>(() =>
    definitions.filter((definition) => definition.defaultVisible).map((definition, index) => ({
      id: `default-${definition.key}-${index}`,
      definitionKey: definition.key,
    })),
  );
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as RelatedListItem[] | null;
      if (Array.isArray(saved)) {
        setItems(saved.filter((item) => definitions.some((definition) => definition.key === item.definitionKey)));
      }
    } catch { /* Use defaults if browser storage is invalid. */ }
    setStorageReady(true);
  }, [storageKey]);

  const [manageOpen, setManageOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [fullScreen, setFullScreen] = useState<string | null>(null);

  useEffect(() => {
    if (storageReady) localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey, storageReady]);

  const activeItems = items.map((item) => ({
    ...item,
    definition: definitions.find((definition) => definition.key === item.definitionKey),
  })).filter((item) => item.definition);

  function addList() {
    if (!choice) return;
    setItems((current) => [...current, { id: `related-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, definitionKey: choice }]);
    setChoice("");
  }

  function move(index: number, offset: number) {
    setItems((current) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Listas relacionadas</h2>
        <button className="sf-btn" onClick={() => setManageOpen(true)}>+ Listas</button>
      </div>

      {activeItems.map((item, index) => (
        <RelatedListSection
          key={item.id}
          listId={item.id}
          definition={item.definition!}
          parentId={parentId}
          onManage={() => setManageOpen(true)}
          onFullScreen={() => setFullScreen(item.id)}
        />
      ))}

      {activeItems.length === 0 && (
        <div className="sf-card" style={{ padding: 16, color: "#706e6b", fontSize: 13 }}>
          Nenhuma lista relacionada configurada. Use “+ Listas” para adicionar uma relação disponível.
        </div>
      )}

      {manageOpen && (
        <div className="sf-modal-backdrop" onClick={() => setManageOpen(false)}>
          <div className="sf-modal" role="dialog" aria-modal="true" aria-label="Gerenciar listas relacionadas" onClick={(event) => event.stopPropagation()}>
            <div className="sf-modal-header"><h2>Gerenciar listas relacionadas</h2></div>
            <div className="sf-modal-body">
              <p>Adicione uma relação e ajuste a ordem em que as listas aparecem nesta página.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <select className="sf-input" value={choice} onChange={(event) => setChoice(event.target.value)} disabled={definitions.length === 0}>
                  <option value="">— Escolher objeto relacionado —</option>
                  {definitions.map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
                </select>
                <button className="sf-btn sf-btn--brand" disabled={!choice} onClick={addList}>Adicionar</button>
              </div>
              {definitions.length === 0 && (
                <p style={{ color: "#706e6b", fontSize: 13, marginTop: 12 }}>
                  Ainda não há relações cadastradas para este objeto. Novos relacionamentos podem ser adicionados ao registro de relações do CRM.
                </p>
              )}
              <div style={{ marginTop: 20 }}>
                {activeItems.map((item, index) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #eee" }}>
                    <strong style={{ flex: 1 }}>{item.definition!.label}</strong>
                    <button className="sf-btn" aria-label="Mover para cima" title="Mover para cima" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                    <button className="sf-btn" aria-label="Mover para baixo" title="Mover para baixo" disabled={index === activeItems.length - 1} onClick={() => move(index, 1)}>↓</button>
                    <button className="sf-btn" onClick={() => remove(item.id)}>Remover</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="sf-modal-footer"><button className="sf-btn sf-btn--brand" onClick={() => setManageOpen(false)}>Concluído</button></div>
          </div>
        </div>
      )}

      {fullScreen && (() => {
        const item = activeItems.find((entry) => entry.id === fullScreen);
        if (!item) return null;
        return (
          <div className="sf-modal-backdrop" style={{ padding: 16 }} onClick={() => setFullScreen(null)}>
            <div style={{ background: "#f3f3f3", width: "100%", height: "100%", overflow: "auto", borderRadius: 8, padding: 20 }} onClick={(event) => event.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>{item.definition!.label}</h2>
                <button className="sf-btn" onClick={() => setFullScreen(null)}>Fechar tela cheia</button>
              </div>
              <RelatedListSection listId={item.id + "-full"} definition={item.definition!} parentId={parentId} onManage={() => setManageOpen(true)} onFullScreen={() => setFullScreen(null)} fullScreen />
            </div>
          </div>
        );
      })()}
    </section>
  );
}

function RelatedListSection({ listId, definition, parentId, onManage, onFullScreen, fullScreen = false }: {
  listId: string;
  definition: RelatedListDefinition;
  parentId: string;
  onManage: () => void;
  onFullScreen: () => void;
  fullScreen?: boolean;
}) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [bulkRows, setBulkRows] = useState<any[] | null>(null);
  const queryKey = ["related-list", parentId, definition.key];
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => definition.load(parentId),
  });

  async function refresh() {
    await qc.invalidateQueries({ queryKey });
    for (const key of definition.refreshKeys?.(parentId) ?? []) {
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  async function removeRow(row: any) {
    const title = row.name ?? row.id;
    if (!confirm(`Excluir “${title}” desta lista? A exclusão remove o registro do objeto.`)) return;
    await deleteRecord({ data: { table: definition.table, id: row.id } });
    await refresh();
  }

  const content = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 14px" }}>
        <span style={{ fontSize: 13, color: "#444" }}>{isLoading ? "Carregando…" : `${rows.length} registros`}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {!fullScreen && <button className="sf-btn" title="Abrir em tela cheia" onClick={onFullScreen}>⛶ Tela cheia</button>}
          <button className="sf-btn" onClick={() => setBulkCreateOpen(true)}>Criar em lote</button>
          <button className="sf-btn sf-btn--brand" onClick={() => setCreateOpen(true)}>Novo</button>
        </div>
      </div>
      <SfListView
        rows={rows}
        columns={definition.columns}
        rowKey={(row) => String(row.id)}
        itemLabel={definition.label.toLowerCase()}
        bulkActions={[
          { label: "Editar selecionados", onRun: (selectedRows) => setBulkRows(selectedRows) },
          { label: "Exportar CSV", onRun: (selectedRows) => exportCsv(selectedRows, definition.fields) },
          { label: "Excluir selecionados", variant: "danger", onRun: async (selectedRows) => {
            if (!confirm(`Excluir ${selectedRows.length} registros selecionados? Esta ação não pode ser desfeita.`)) return;
            await Promise.all(selectedRows.map((row) => deleteRecord({ data: { table: definition.table, id: row.id } })));
            await refresh();
          } },
        ]}
        rowActions={[
          { label: "Editar", onRun: (row) => setEditRow(row) },
          { label: "Excluir", onRun: removeRow },
        ]}
      />
      {createOpen && <SfRecordDialog title={`Novo: ${definition.label}`} table={definition.table} fields={definition.fields} defaults={definition.createDefaults(parentId)} transform={definition.transform ? (form) => definition.transform!(form, parentId) : undefined} onClose={() => setCreateOpen(false)} onSaved={refresh} />}
      {editRow && <SfRecordDialog title={`Editar: ${editRow.name ?? definition.label}`} table={definition.table} recordId={editRow.id} fields={definition.fields} defaults={definition.rowDefaults(editRow, parentId)} transform={definition.transform ? (form) => definition.transform!(form, parentId) : undefined} onClose={() => setEditRow(null)} onSaved={refresh} />}
      {bulkRows && <SfBulkRecordDialog table={definition.table} fields={definition.fields} defaults={definition.createDefaults(parentId)} rows={bulkRows} transform={definition.transform ? (form) => definition.transform!(form, parentId) : undefined} onClose={() => setBulkRows(null)} onSaved={refresh} />}
      {bulkCreateOpen && <SfBulkRecordDialog table={definition.table} fields={definition.fields} defaults={definition.createDefaults(parentId)} transform={definition.transform ? (form) => definition.transform!(form, parentId) : undefined} onClose={() => setBulkCreateOpen(false)} onSaved={refresh} />}
    </>
  );

  return (
    <div className="sf-card">
      <div className="sf-card-header" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{definition.label} ({rows.length})</span>
        {!fullScreen && <button className="sf-link" onClick={onManage}>Configurar</button>}
      </div>
      {content}
    </div>
  );
}
