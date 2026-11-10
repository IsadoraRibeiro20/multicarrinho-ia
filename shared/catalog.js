// Funções puras sobre o catálogo de lojas. Usadas pelo front-end e pelo servidor.
// Regra central do produto: quem calcula preço é o código, nunca a IA.

/** Índice de lojas por id. */
export function indexStores(stores) {
  return Object.fromEntries(stores.map((s) => [s.id, s]));
}

export function itemOf(store, itemId) {
  return store.itens.find((i) => i.id === itemId);
}

/**
 * Soma itens + taxa de entrega.
 * @param {object} store loja do catálogo
 * @param {{id: string, qty: number}[]} lines itens escolhidos
 */
export function priceLines(store, lines) {
  const sub = lines.reduce((acc, l) => acc + itemOf(store, l.id).preco * l.qty, 0);
  return { sub: round2(sub), total: round2(sub + store.taxa) };
}

/** Quantas pessoas a combinação de pratos alimenta. */
export function servings(store, lines) {
  return lines.reduce((acc, l) => {
    const item = itemOf(store, l.id);
    return item.tipo === "prato" ? acc + item.serve * l.qty : acc;
  }, 0);
}

export const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const round2 = (n) => Math.round(n * 100) / 100;
