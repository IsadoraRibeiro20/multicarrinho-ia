// Ferramentas do agente Montador. Cada ferramenta lê o catálogo real;
// o agente nunca recebe o cardápio inteiro de uma vez e nunca calcula preço sozinho.
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { indexStores, itemOf, priceLines, servings } from "../../shared/catalog.js";

const CATEGORIAS = ["mar", "japonesa", "pizza", "burger", "massa"];

export function buildTools(stores) {
  const byId = indexStores(stores);

  const buscarLojas = betaTool({
    name: "buscar_lojas",
    description:
      "Lista as lojas disponíveis com id, culinária, categorias, taxa de entrega, tempo de entrega (min) e nota. " +
      "Use primeiro, para descobrir quais lojas combinam com o pedido. O filtro de categoria é opcional.",
    inputSchema: {
      type: "object",
      properties: {
        categoria: { type: "string", enum: CATEGORIAS, description: "Filtra por categoria de comida." },
      },
      additionalProperties: false,
    },
    run: async ({ categoria }) => {
      const list = stores
        .filter((s) => !categoria || s.cats.includes(categoria) || s.itens.some((i) => i.tags.includes(categoria)))
        .map(({ id, nome, culinaria, cats, taxa, tempo, nota }) => ({ id, nome, culinaria, cats, taxa, tempo_min: tempo, nota }));
      return JSON.stringify(list);
    },
  });

  const verCardapio = betaTool({
    name: "ver_cardapio",
    description:
      "Retorna o cardápio de uma loja: id, nome, preço, tipo (prato, acomp, bebida, doce) e quantas pessoas cada item serve. " +
      "Use para escolher itens que existem de verdade naquela loja.",
    inputSchema: {
      type: "object",
      properties: { loja_id: { type: "string", description: "id da loja, vindo de buscar_lojas" } },
      required: ["loja_id"],
      additionalProperties: false,
    },
    run: async ({ loja_id }) => {
      const store = byId[loja_id];
      if (!store) return `Erro: a loja "${loja_id}" não existe. Use buscar_lojas para ver os ids válidos.`;
      return JSON.stringify(
        store.itens.map(({ id, nome, preco, tipo, serve }) => ({ id, nome, preco, tipo, serve })),
      );
    },
  });

  const calcularPedido = betaTool({
    name: "calcular_pedido",
    description:
      "Calcula subtotal, taxa de entrega e total de uma montagem numa loja, e quantas pessoas os pratos servem. " +
      "Use antes de sugerir uma montagem, para conferir orçamento e quantidade de comida. Itens inexistentes são informados.",
    inputSchema: {
      type: "object",
      properties: {
        loja_id: { type: "string" },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, qtd: { type: "integer", minimum: 1, maximum: 8 } },
            required: ["id", "qtd"],
            additionalProperties: false,
          },
        },
      },
      required: ["loja_id", "itens"],
      additionalProperties: false,
    },
    run: async ({ loja_id, itens }) => {
      const store = byId[loja_id];
      if (!store) return `Erro: a loja "${loja_id}" não existe.`;
      const invalidos = [];
      const lines = [];
      for (const it of itens ?? []) {
        if (!itemOf(store, String(it.id))) invalidos.push(it.id);
        else lines.push({ id: String(it.id), qty: Math.min(Math.max(Number(it.qtd) || 1, 1), 8) });
      }
      const { sub, total } = priceLines(store, lines);
      return JSON.stringify({
        loja: store.nome,
        subtotal: sub,
        taxa_entrega: store.taxa,
        total,
        pratos_servem_pessoas: servings(store, lines),
        itens_invalidos: invalidos,
      });
    },
  });

  return [buscarLojas, verCardapio, calcularPedido];
}
