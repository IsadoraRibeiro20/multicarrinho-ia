// Motor local de sugestões: regras simples, sem IA.
// Serve de fallback quando a API do Claude não está configurada ou falha,
// e de linha de base para comparar a qualidade das sugestões da IA.
import { brl, indexStores, priceLines } from "./catalog.js";

const WANTS = [
  { re: /frutos? do mar|camar|peixe|salm|poke|marisc|lula/, tag: "mar" },
  { re: /sushi|japon|temaki|hot ?roll|combinado/, tag: "japonesa" },
  { re: /pizza/, tag: "pizza" },
  { re: /hamb|burger|lanche|smash/, tag: "burger" },
  { re: /massa|macarr|espaguete|lasanha|nhoque|risoto|italian/, tag: "massa" },
  { re: /doce|sobremesa|brigadeiro|chocolate|mousse/, tag: "doce", extra: true },
  { re: /refri|bebida|suco|soda|refrigerante/, tag: "bebida", extra: true },
  { re: /batata|fritas/, tag: "batata", extra: true },
];

/** Lê do texto: tipos de comida, extras, número de pessoas e orçamento. */
export function parseWant(text) {
  const t = text.toLowerCase();
  const mains = [];
  const extras = [];
  WANTS.forEach((w) => {
    if (w.re.test(t)) (w.extra ? extras : mains).push(w.tag);
  });

  let people = 1;
  const n = t.match(/(\d+)\s*(pessoas?|pax)/);
  if (n) people = Number(n[1]);
  else if (/\b(quatro)\b/.test(t)) people = 4;
  else if (/\b(tr[eê]s)\b/.test(t)) people = 3;
  else if (/\b(duas|dois|casal|a dois|n[oó]s dois)\b/.test(t)) people = 2;

  const b = t.match(/(?:at[eé]|m[aá]ximo|r\$)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/);
  const budget = b ? parseFloat(b[1].replace(",", ".")) : null;

  return { mains, extras, people: Math.min(Math.max(people, 1), 8), budget };
}

/** Melhor combinação de uma loja para o pedido (até 3 pratos + extras pedidos). */
export function bestForStore(store, want, budget) {
  const mains = store.itens.filter(
    (i) => i.tipo === "prato" && (!want.mains.length || i.tags.some((t) => want.mains.includes(t))),
  );
  if (!mains.length) return null;

  const combos = [];
  (function walk(start, picked) {
    if (picked.length) combos.push(picked.slice());
    if (picked.length === 3) return;
    for (let i = start; i < mains.length; i++) {
      picked.push(mains[i]);
      walk(i, picked);
      picked.pop();
    }
  })(0, []);

  let best = null;
  let cheapest = null;
  for (const combo of combos) {
    const serves = combo.reduce((a, i) => a + i.serve, 0);
    if (serves < want.people || serves > want.people + 2) continue;

    const counts = {};
    combo.forEach((i) => (counts[i.id] = (counts[i.id] || 0) + 1));
    const hasBatata = combo.some((i) => i.tags.includes("batata"));
    want.extras.forEach((tag) => {
      if (tag === "batata" && hasBatata) return;
      const cand = store.itens
        .filter((i) => i.tipo !== "prato" && i.tags.includes(tag))
        .sort((a, b) => a.preco - b.preco)[0];
      if (cand) counts[cand.id] = (counts[cand.id] || 0) + Math.ceil(want.people / cand.serve);
    });

    const lines = Object.entries(counts).map(([id, qty]) => ({ id, qty }));
    const { total } = priceLines(store, lines);
    const distinct = new Set(combo.map((i) => i.id)).size;
    const score = distinct * 4 - (serves - want.people) * 6 - total / 20;
    const opt = { storeId: store.id, lines, total, score };
    if ((budget == null || total <= budget) && (!best || score > best.score)) best = opt;
    if (!cheapest || total < cheapest.total) cheapest = opt;
  }
  return best || cheapest;
}

/**
 * Sugestões para um pedido em linguagem natural.
 * @param {string} text pedido da pessoa
 * @param {object[]} stores catálogo
 * @param {number|null} lastBudget orçamento da mensagem anterior, para pedidos de continuação
 */
export function localSuggest(text, stores, lastBudget = null) {
  const byId = indexStores(stores);
  const want = parseWant(text);
  const budget = want.budget ?? lastBudget;

  const opts = stores
    .map((s) => bestForStore(s, want, budget))
    .filter(Boolean)
    .sort((a, b) => {
      const ia = budget == null || a.total <= budget;
      const ib = budget == null || b.total <= budget;
      return ia !== ib ? (ia ? -1 : 1) : b.score - a.score;
    })
    .slice(0, 3);

  const within = opts.filter((o) => budget == null || o.total <= budget).length;
  const quem = want.people === 1 ? "1 pessoa" : `${want.people} pessoas`;
  let mensagem;
  if (!opts.length) {
    mensagem = "Não encontrei lojas com o que você descreveu. Tente citar o tipo de comida, por exemplo pizza, japonês ou lanche.";
  } else if (budget != null && !within) {
    mensagem = `Nada coube em ${brl(budget)} com a entrega. Estas são as opções mais próximas para ${quem}.`;
  } else if (budget != null && within < opts.length) {
    mensagem = `${within} ${within > 1 ? "opções cabem" : "opção cabe"} em ${brl(budget)} com entrega para ${quem}. Também mostro ${opts.length - within > 1 ? "outras próximas" : "uma próxima"}, acima do orçamento.`;
  } else {
    mensagem = `Montei ${opts.length} ${opts.length > 1 ? "opções" : "opção"} para ${quem}${budget != null ? `, até ${brl(budget)} com entrega` : ""}. Escolha uma para virar carrinho.`;
  }

  const sugestoes = opts.map((o) => {
    const s = byId[o.storeId];
    return {
      storeId: o.storeId,
      lines: o.lines,
      porque: `${s.culinaria}, ${s.tempo[0]}–${s.tempo[1]} min, nota ${s.nota.toFixed(1).replace(".", ",")}`,
    };
  });
  return { mensagem, sugestoes, budget };
}
