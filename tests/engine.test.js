import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexStores, priceLines } from "../shared/catalog.js";
import { localSuggest, parseWant } from "../shared/local-engine.js";
import { normalizeSuggestions } from "../shared/normalize.js";
import { parseJson } from "../server/agent/montador.js";

const stores = JSON.parse(readFileSync(new URL("../data/stores.json", import.meta.url), "utf8"));
const byId = indexStores(stores);

test("catálogo: ids de loja e de item são únicos", () => {
  const lojas = new Set(stores.map((s) => s.id));
  const itens = new Set(stores.flatMap((s) => s.itens.map((i) => i.id)));
  assert.equal(lojas.size, stores.length);
  assert.equal(itens.size, stores.reduce((a, s) => a + s.itens.length, 0));
});

test("priceLines soma itens e taxa de entrega", () => {
  const { sub, total } = priceLines(byId["sushi-cwb"], [{ id: "sc1", qty: 2 }]);
  assert.equal(sub, 53.8);
  assert.equal(total, 59.79);
});

test("parseWant entende pessoas, orçamento e tipo de comida", () => {
  const w = parseWant("Quero refeição para duas, frutos do mar até 70 reais");
  assert.equal(w.people, 2);
  assert.equal(w.budget, 70);
  assert.deepEqual(w.mains, ["mar"]);
});

test("motor local respeita o orçamento quando há opção possível", () => {
  const r = localSuggest("frutos do mar para duas até 70 reais", stores);
  assert.ok(r.sugestoes.length > 0);
  const first = r.sugestoes[0];
  assert.ok(priceLines(byId[first.storeId], first.lines).total <= 70);
});

test("normalizeSuggestions descarta lojas e itens inventados", () => {
  const out = normalizeSuggestions(
    {
      sugestoes: [
        { loja: "loja-fantasma", itens: [{ id: "x", qtd: 1 }] },
        { loja: "pizza-boa", itens: [{ id: "pb1", qtd: 99 }, { id: "inventado", qtd: 1 }] },
        { loja: "pizza-boa", itens: [{ id: "pb2", qtd: 1 }] },
      ],
    },
    stores,
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].lines, [{ id: "pb1", qty: 8 }]);
});

test("parseJson aceita bloco de código e texto em volta", () => {
  assert.deepEqual(parseJson('Pronto:\n```json\n{"mensagem":"ok","sugestoes":[]}\n```'), { mensagem: "ok", sugestoes: [] });
  assert.equal(parseJson("sem json aqui"), null);
});
