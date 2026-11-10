// Chamadas do front-end ao servidor. O navegador nunca fala direto com a API da Anthropic.

/** true se o servidor tem a chave configurada. */
export async function fetchHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return false;
    return Boolean((await res.json()).ia);
  } catch {
    return false;
  }
}

/**
 * Pede ao agente Montador as montagens para o pedido.
 * @returns {Promise<{mensagem: string, sugestoes: {storeId: string, lines: {id: string, qty: number}[], porque: string}[]}>}
 */
export async function suggestWithAI(mensagem, historico, signal) {
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensagem, historico }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.erro || `HTTP ${res.status}`);
    err.code = body.erro;
    throw err;
  }
  return body;
}
