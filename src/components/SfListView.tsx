import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  searchValue?: (row: T) => string | null | undefined;
  filterOptions?: string[];
  filterValue?: (row: T) => string | null | undefined;
  align?: "left" | "right";
  width?: string | number;
};

type BulkAction<T> = {
  label: string;
  onRun: (rows: T[]) => void | Promise<void>;
  variant?: "default" | "danger" | "brand";
};
type RowAction<T> = {
  label: string;
  onRun: (row: T) => void | Promise<void>;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  searchPlaceholder?: string;
  rightToolbar?: ReactNode;
  /** Plural noun shown in header, e.g. "accounts" */
  itemLabel?: string;
  pageSize?: number;
  bulkActions?: BulkAction<T>[];
  rowActions?: RowAction<T>[];
};

export function SfListView<T>({
  rows,
  columns,
  rowKey,
  defaultSortKey,
  defaultSortDir = "asc",
  searchPlaceholder = "Pesquisar nesta lista...",
  rightToolbar,
  itemLabel = "itens",
  pageSize: initialPageSize = 25,
  bulkActions = [],
  rowActions = [],
}: Props<T>) {
  const [q, setQ] = useState("");
  const [sorts, setSorts] = useState<{ key: string; dir: "asc" | "desc" }[]>(
    defaultSortKey
      ? [{ key: defaultSortKey, dir: defaultSortDir }]
      : columns[0]
        ? [{ key: columns[0].key, dir: defaultSortDir }]
        : [],
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterPanel, setFilterPanel] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updatedAt] = useState(() => new Date());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let out = rows;
    for (const col of columns) {
      if (!col.filterOptions || !filters[col.key]) continue;
      const want = filters[col.key];
      out = out.filter((r) => {
        const v = col.filterValue ? col.filterValue(r) : (col.sortValue?.(r) as string | undefined);
        return String(v ?? "") === want;
      });
    }
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => {
          const v = c.searchValue ? c.searchValue(r) : c.sortValue ? c.sortValue(r) : "";
          return String(v ?? "")
            .toLowerCase()
            .includes(needle);
        }),
      );
    }
    if (sorts.length) {
      const resolved = sorts
        .map((s) => ({ s, col: columns.find((c) => c.key === s.key) }))
        .filter((x) => x.col);
      out = [...out].sort((a, b) => {
        for (const { s, col } of resolved) {
          const sv = col!.sortValue ?? ((r: T) => String((col!.searchValue?.(r) as string) ?? ""));
          const va = sv(a) ?? "";
          const vb = sv(b) ?? "";
          let cmp = 0;
          if (typeof va === "number" && typeof vb === "number") {
            cmp = va - vb;
          } else {
            const sa = String(va).toLowerCase();
            const sb = String(vb).toLowerCase();
            cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
          }
          if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }
    return out;
  }, [rows, columns, q, sorts, filters]);

  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  const filterableCols = columns.filter((c) => c.filterOptions && c.filterOptions.length > 0);
  const sortedColLabel = sorts.length
    ? sorts
        .map((s) => columns.find((c) => c.key === s.key)?.label)
        .filter(Boolean)
        .join(", ")
    : undefined;

  function toggleSort(key: string, additive: boolean) {
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (additive) {
        if (idx === -1) return [...prev, { key, dir: "asc" }];
        const next = [...prev];
        if (next[idx].dir === "asc") next[idx] = { key, dir: "desc" };
        else next.splice(idx, 1);
        return next;
      }
      if (idx !== -1 && prev.length === 1) {
        return [{ key, dir: prev[idx].dir === "asc" ? "desc" : "asc" }];
      }
      return [{ key, dir: "asc" }];
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  function toggleAllOnPage() {
    const ids = pageRows.map((r) => rowKey(r));
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function runBulk(action: BulkAction<T>) {
    const chosen = filtered.filter((r) => selected.has(rowKey(r)));
    if (chosen.length === 0) return;
    try {
      await action.onRun(chosen);
      setSelected(new Set());
    } catch (error) {
      alert(error instanceof Error ? error.message : "A ação em lote falhou. Os itens continuam selecionados.");
    }
  }

  const updatedLabel = (() => {
    const s = Math.round((Date.now() - updatedAt.getTime()) / 1000);
    if (s < 60) return "há poucos segundos";
    const m = Math.round(s / 60);
    return `há ${m} minuto${m === 1 ? "" : "s"}`;
  })();

  return (
    <div className="slds-listview">
      {/* Sub-header strip: counts • sorted by • filtered • updated */}
      <div className="slds-lv-meta">
        <span>
          <b>{filtered.length}</b> {itemLabel}
        </span>
        {sortedColLabel && (
          <>
            <span className="slds-lv-dot">•</span>
            <span>Ordenado por {sortedColLabel}</span>
          </>
        )}
        {activeFilters.length > 0 && (
          <>
            <span className="slds-lv-dot">•</span>
            <span>
              Filtrado por {activeFilters.length} campo{activeFilters.length > 1 ? "s" : ""}
            </span>
          </>
        )}
        <span className="slds-lv-dot">•</span>
        <span>Atualizado {updatedLabel}</span>

        <div className="slds-lv-meta-right">
          <div className="slds-lv-search">
            <span className="slds-lv-search-icon">⌕</span>
            <input
              className="slds-lv-search-input"
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="slds-icon-btn" title="Exibir como tabela" aria-label="Exibir como">
            ▤
          </button>
          <button className="slds-icon-btn" title="Atualizar" onClick={() => location.reload()}>
            ⟳
          </button>
          <button className="slds-icon-btn" title="Editar"></button>
          <button className="slds-icon-btn" title="Gráficos"></button>
          <button
            className={`slds-icon-btn ${filterPanel ? "is-active" : ""}`}
            title="Mostrar filtros"
            onClick={() => setFilterPanel((v) => !v)}
          >
            ▽
          </button>
          {rightToolbar}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && bulkActions.length > 0 && (
        <div
          className="slds-lv-bulkbar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            background: "#eef4ff",
            borderTop: "1px solid #c9d6f0",
            borderBottom: "1px solid #c9d6f0",
            fontSize: 13,
          }}
        >
          <strong>{selected.size}</strong>
          <span>selecionado(s)</span>
          <button className="slds-link" onClick={() => setSelected(new Set())}>
            Limpar
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {bulkActions.map((a) => (
              <button
                key={a.label}
                className={`sf-btn ${a.variant === "brand" ? "sf-btn--brand" : ""}`}
                style={
                  a.variant === "danger" ? { color: "#b91c1c", borderColor: "#fca5a5" } : undefined
                }
                onClick={() => runBulk(a)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="slds-lv-body">
        {/* Main panel */}
        <div className="slds-lv-main">
          <div className="slds-lv-table-wrap">
            <table className="slds-lv-table">
              <thead>
                <tr>
                  <th className="slds-lv-th-check">
                    <input
                      type="checkbox"
                      checked={
                        pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)))
                      }
                      onChange={toggleAllOnPage}
                    />
                  </th>
                  <th className="slds-lv-th-num">#</th>
                  {columns.map((c) => {
                    const sIdx = sorts.findIndex((s) => s.key === c.key);
                    const isSort = sIdx !== -1;
                    const dir = isSort ? sorts[sIdx].dir : null;
                    return (
                      <th
                        key={c.key}
                        className={`slds-lv-th ${isSort ? "is-sorted" : ""}`}
                        onClick={(e) => toggleSort(c.key, e.shiftKey)}
                        title="Clique para ordenar. Shift+clique para adicionar outra coluna."
                        style={{ textAlign: c.align ?? "left", width: c.width }}
                      >
                        <span className="slds-lv-th-inner">
                          <span>{c.label}</span>
                          <span className="slds-lv-sort-ind">
                            {isSort ? (dir === "asc" ? "▲" : "▼") : "↕"}
                            {isSort && sorts.length > 1 && (
                              <sup style={{ marginLeft: 2, fontSize: 9 }}>{sIdx + 1}</sup>
                            )}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                  <th className="slds-lv-th-menu"></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const id = rowKey(r);
                  const isSel = selected.has(id);
                  return (
                    <tr key={id} className={isSel ? "is-selected" : ""}>
                      <td className="slds-lv-td-check">
                        <input type="checkbox" checked={isSel} onChange={() => toggleRow(id)} />
                      </td>
                      <td className="slds-lv-td-num">{(safePage - 1) * pageSize + i + 1}</td>
                      {columns.map((c) => (
                        <td key={c.key} style={{ textAlign: c.align ?? "left" }}>
                          {c.render(r)}
                        </td>
                      ))}
                      <td className="slds-lv-td-menu" style={{ position: "relative" }}>
                        <button
                          className="slds-row-menu"
                          title="Mostrar ações"
                          onClick={() => setOpenMenu(openMenu === id ? null : id)}
                        >
                          ▾
                        </button>
                        {openMenu === id && rowActions.length > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              right: 8,
                              top: "100%",
                              zIndex: 10,
                              background: "#fff",
                              border: "1px solid #d8dde6",
                              borderRadius: 4,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                              minWidth: 160,
                            }}
                          >
                            {rowActions.map((a) => (
                              <button
                                key={a.label}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "8px 12px",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: 13,
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={async () => {
                                  setOpenMenu(null);
                                  await a.onRun(r);
                                }}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 3} className="slds-lv-empty">
                      Nenhum item para exibir.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {filtered.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderTop: "1px solid #e5e7eb",
                fontSize: 13,
                background: "#fafafa",
              }}
            >
              <span>
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} de{" "}
                {filtered.length}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ color: "#555" }}>
                  Linhas por página:&nbsp;
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    style={{ padding: "2px 6px" }}
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="sf-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>
                  «
                </button>
                <button
                  className="sf-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                <span>
                  Página {safePage} / {totalPages}
                </span>
                <button
                  className="sf-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ›
                </button>
                <button
                  className="sf-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filter drawer */}
        {filterPanel && (
          <aside className="slds-lv-filters">
            <div className="slds-lv-filters-head">
              <h3>Filtros</h3>
              <button
                className="slds-icon-btn"
                onClick={() => setFilterPanel(false)}
                title="Fechar"
              >
                →
              </button>
            </div>
            <div className="slds-lv-filters-sub">Filtrar por responsável</div>
            <div className="slds-lv-filter-pill">Todos os {itemLabel}</div>

            <div className="slds-lv-filters-sub" style={{ marginTop: 16 }}>
              Correspondendo a todos estes filtros
            </div>

            {filterableCols.length === 0 && (
              <div style={{ fontSize: 12, color: "#706e6b", padding: "8px 0" }}>
                Nenhum campo filtrável nesta lista.
              </div>
            )}

            {filterableCols.map((c) => {
              const value = filters[c.key] ?? "";
              return (
                <div key={c.key} className={`slds-lv-filter-card ${value ? "is-set" : ""}`}>
                  <div className="slds-lv-filter-card-head">
                    <span className="slds-lv-filter-label">{c.label}</span>
                    {value && (
                      <button
                        className="slds-lv-filter-clear"
                        onClick={() => setFilters((f) => ({ ...f, [c.key]: "" }))}
                      ></button>
                    )}
                  </div>
                  {value ? (
                    <div className="slds-lv-filter-value">
                      igual a <b>{value}</b>
                    </div>
                  ) : (
                    <select
                      className="slds-lv-filter-select"
                      value=""
                      onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                    >
                      <option value="">— Selecionar —</option>
                      {c.filterOptions!.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}

            {activeFilters.length > 0 && (
              <div className="slds-lv-filters-foot">
                <button className="slds-link" onClick={() => setFilters({})}>
                  Remover tudo
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
