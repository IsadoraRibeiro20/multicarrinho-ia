import { indexStores, itemOf } from "./catalog.js";

/**
 * Valida a resposta da IA contra o catálogo real.
 * Descarta lojas e itens inexistentes, limita quantidades e no máximo 3 lojas diferentes.
 * Assim, mesmo uma resposta errada da IA nunca vira um item ou preço inventado na tela.
 *
 * @param {unknown} raw  {sugestoes: [{loja, itens: [{id, qtd}], porque}]}
 * @param {object[]} stores catálogo
 * @returns {{storeId: string, lines: {id: string, qty: number}[], porque: string}[]}
 */
export function normalizeSuggestions(raw, stores) {
  const byId = indexStores(stores);
  const out = [];
  const seen = new Set();
  const list = Array.isArray(raw?.sugestoes) ? raw.sugestoes : [];

  for (const s of list) {
    const store = byId[String(s?.loja)];
    if (!store || seen.has(store.id)) continue;

    const counts = {};
    for (const it of Array.isArray(s.itens) ? s.itens : []) {
      const item = itemOf(store, String(it?.id));
      if (!item) continue;
      const qty = Math.min(Math.max(Math.round(Number(it.qtd) || 1), 1), 8);
      counts[item.id] = (counts[item.id] || 0) + qty;
    }

    const lines = Object.entries(counts).map(([id, qty]) => ({ id, qty }));
    if (!lines.length) continue;

    seen.add(store.id);
    out.push({ storeId: store.id, lines, porque: String(s.porque || "").slice(0, 120) });
    if (out.length === 3) break;
  }
  return out;
}
