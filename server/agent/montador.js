// Agente Montador: recebe o pedido em linguagem natural e devolve montagens por loja.
// O loop de ferramentas é feito pelo Tool Runner do SDK da Anthropic.
import { SYSTEM_PROMPT } from "./prompt.js";
import { buildTools } from "./tools.js";
import { normalizeSuggestions } from "../../shared/normalize.js";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

export class AgentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {object} opts
 * @param {import("@anthropic-ai/sdk").default} opts.client cliente da Anthropic
 * @param {object[]} opts.stores catálogo
 * @param {string} opts.mensagem pedido atual
 * @param {{role: "user"|"assistant", content: string}[]} opts.historico conversa anterior (curta)
 */
export async function montarPedido({ client, stores, mensagem, historico = [] }) {
  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 8,
    system: SYSTEM_PROMPT,
    tools: buildTools(stores),
    output_config: { effort: "medium" },
    // Se o modelo recusar por política, a própria API tenta de novo num modelo de reserva.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [...historico, { role: "user", content: mensagem }],
  });

  if (finalMessage.stop_reason === "refusal") {
    throw new AgentError("recusado", "O modelo não respondeu a este pedido.");
  }

  const text = finalMessage.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const raw = parseJson(text);
  if (!raw) throw new AgentError("resposta_invalida", "A resposta do agente não veio em JSON.");

  return {
    mensagem: String(raw.mensagem || "Aqui estão algumas montagens."),
    sugestoes: normalizeSuggestions(raw, stores),
  };
}

/** Lê o JSON da resposta final, tolerando um bloco de código ou texto em volta. */
export function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
