// Servidor do Multicarrinho: expõe /api/suggest (agente com Claude) e, em produção, serve o front-end.
// A chave da API fica só aqui, em variável de ambiente. O navegador nunca a vê.
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { montarPedido, AgentError, MODEL } from "./agent/montador.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const stores = JSON.parse(readFileSync(path.join(root, "data/stores.json"), "utf8"));

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;

const app = express();
app.use(express.json({ limit: "20kb" }));

// Limite simples por IP para proteger a chave de uso abusivo (em memória; suficiente para um protótipo).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQ = Number(process.env.RATE_LIMIT_MAX || 20);
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > MAX_REQ;
}

app.get("/api/health", (_req, res) => {
  res.json({ ia: hasKey, modelo: hasKey ? MODEL : null });
});

app.post("/api/suggest", async (req, res) => {
  if (!client) return res.status(503).json({ erro: "ia_indisponivel" });
  if (rateLimited(req.ip)) return res.status(429).json({ erro: "limite" });

  const mensagem = typeof req.body?.mensagem === "string" ? req.body.mensagem.trim() : "";
  if (!mensagem || mensagem.length > 500) return res.status(400).json({ erro: "mensagem_invalida" });

  const historico = (Array.isArray(req.body.historico) ? req.body.historico : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content)
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (historico.length && historico[0].role !== "user") historico.shift();

  try {
    const result = await montarPedido({ client, stores, mensagem, historico });
    res.json({ ...result, fonte: "ia" });
  } catch (err) {
    if (err instanceof AgentError) return res.status(502).json({ erro: err.code });
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ erro: "limite" });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ erro: "chave_invalida" });
    if (err instanceof Anthropic.APIError) {
      console.error(`Erro da API ${err.status}:`, err.message);
      return res.status(502).json({ erro: "api" });
    }
    console.error(err);
    res.status(500).json({ erro: "interno" });
  }
});

// Em produção, serve o build do Vite.
const dist = path.join(root, "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Multicarrinho em http://localhost:${port} · IA ${hasKey ? `ativa (${MODEL})` : "desligada: usando motor local"}`);
});
