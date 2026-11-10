// Interface do Multicarrinho (JS puro + Vite).
// Estado da tela, renderização das 5 abas e chamadas ao agente em /api/suggest.
import "./styles.css";
import STORES from "../data/stores.json";
import { brl, indexStores, itemOf, priceLines } from "../shared/catalog.js";
import { localSuggest, parseWant } from "../shared/local-engine.js";
import { suggestWithAI, fetchHealth } from "./api.js";

const CATS = [["todos","Todos"],["mar","Frutos do mar"],["japonesa","Japonesa"],["pizza","Pizza"],["burger","Lanches"],["massa","Massas"]];
const TIPO_LABEL = {prato:"Pratos", acomp:"Acompanhamentos", bebida:"Bebidas", doce:"Sobremesas"};
const SEED_CARTS = {"burger-x":{bx1:1,bx7:1,bx5:1,bx8:1}, "sushi-cwb":{sc1:1,sc3:1,sc6:1}, "pizza-boa":{pb1:1,pb5:1}};
const EXAMPLE_PROMPT = "Quero refeição para duas, estamos com vontade de comer frutos do mar até 90 reais";
const PROMPT_CHIPS = ["Jantar para duas com refri até R$ 90","Almoço para 1 pessoa até R$ 45","Jantar para duas pessoas com sobremesa até R$ 100"];
const STORE_KEY = "multicarrinho:carts:v1";

const byId = indexStores(STORES);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const initials = n => n.split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w)).slice(0,2).map(w => w[0]).join("").toUpperCase();

function cartLines(storeId){
  return Object.entries(state.carts[storeId] || {}).filter(([,q]) => q > 0).map(([id,qty]) => ({id, qty}));
}
function activeCarts(){ return STORES.filter(s => cartLines(s.id).length); }

const state = {tab:"chat", store:null, cat:"todos", carts:loadCarts(), chat:[], busy:false, ia:undefined, lastBudget:null, ctl:null};

function loadCarts(){
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch(e){}
  return JSON.parse(JSON.stringify(SEED_CARTS));
}
function saveCarts(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(state.carts)); } catch(e){} }
function loadJSON(k, fb){ try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e){ return fb; } }
function saveJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
state.cart = loadJSON("multicarrinho:cart:v1", null);        // {storeId, items:{id:qty}}: uma loja por vez
state.orders = loadJSON("multicarrinho:orders:v1", []);
state.pay = "pix";
const saveCart = () => saveJSON("multicarrinho:cart:v1", state.cart);
const saveOrders = () => saveJSON("multicarrinho:orders:v1", state.orders);
function cartItemLines(){
  if (!state.cart) return [];
  return Object.entries(state.cart.items).filter(([,q]) => q > 0).map(([id,qty]) => ({id, qty}));
}
const STEPS = ["Confirmado","Em preparo","A caminho","Entregue"];
const stepOf = o => Math.min(STEPS.length - 1, Math.floor((Date.now() - o.at) / 20000));

/* ---------- Envio do pedido: agente com IA, ou motor local como reserva ---------- */
async function send(text){
  text = text.trim();
  if (!text || state.busy) return;
  state.chat = state.chat.filter(m => !m.example);
  const history = state.chat.map(m => ({role: m.role, content: m.role === "user" ? m.text
    : JSON.stringify({mensagem: m.text, sugestoes: (m.sugs || []).map(s => ({loja: s.storeId, itens: s.lines.map(l => ({id: l.id, qtd: l.qty}))}))})}));
  state.chat.push({role:"user", text});
  const want = parseWant(text);
  if (want.budget != null) state.lastBudget = want.budget;
  state.busy = true; render();

  let reply = null;
  if (state.ia){
    state.ctl = new AbortController();
    try {
      const r = await suggestWithAI(text, history, state.ctl.signal);
      reply = {role:"assistant", source:"ia", text:r.mensagem, sugs:r.sugestoes, budget:state.lastBudget};
    } catch(e){
      if (e?.name === "AbortError"){ state.chat.pop(); state.busy = false; state.ctl = null; render(); return; }
      const r = localSuggest(text, STORES, state.lastBudget);
      reply = {role:"assistant", source:"local", text:r.mensagem, sugs:r.sugestoes, budget:r.budget,
        note: e?.code === "limite" ? "Limite de uso da IA atingido. Usei o motor local." : "A IA não respondeu agora. Usei o motor local."};
    }
  } else {
    await new Promise(r => setTimeout(r, 450));
    const r = localSuggest(text, STORES, state.lastBudget);
    reply = {role:"assistant", source:"local", text:r.mensagem, sugs:r.sugestoes, budget:r.budget};
  }
  state.chat.push(reply);
  state.busy = false; state.ctl = null;
  render(true);
}

/* ---------- Render ---------- */
const view = document.getElementById("view");

function render(scrollChat){
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-current", b.dataset.tab === state.tab ? "page" : "false"));
  const setBadge = (id, n) => { const b = document.getElementById(id); b.hidden = !n; b.textContent = n; };
  setBadge("cardBadge", activeCarts().length);
  setBadge("cartBadge", cartItemLines().reduce((a,l) => a + l.qty, 0));
  setBadge("ordBadge", state.orders.filter(o => stepOf(o) < STEPS.length - 1).length);
  view.classList.toggle("is-chat", state.tab === "chat");
  const keepScroll = view.scrollTop;
  if (state.tab === "lojas") view.innerHTML = state.store ? renderStore(byId[state.store]) : renderLojas();
  else if (state.tab === "cardapios") view.innerHTML = renderCarts();
  else if (state.tab === "carrinho") view.innerHTML = renderCart();
  else if (state.tab === "pedidos") view.innerHTML = renderOrders();
  else view.innerHTML = renderChat();
  if (state.tab !== "chat") view.scrollTop = keepScroll;
  const msgs = view.querySelector(".msgs");
  if (msgs && scrollChat !== false) msgs.scrollTop = msgs.scrollHeight;
}

function renderLojas(){
  const list = STORES.filter(s => state.cat === "todos" || s.cats.includes(state.cat) || s.itens.some(i => i.tags.includes(state.cat)));
  return `<div class="section">
    <h2 class="h">Lojas perto de você</h2>
    <p class="sub">Monte um carrinho em cada loja. Nenhum deles é apagado quando você troca de loja.</p>
    <div class="chips">${CATS.map(([id,l]) => `<button class="chip" type="button" data-cat="${id}" aria-pressed="${state.cat===id}">${l}</button>`).join("")}</div>
    ${list.map(s => { const c = cartLines(s.id).reduce((a,l) => a + l.qty, 0); return `
      <button class="store-row" type="button" data-open="${s.id}">
        <span class="avatar">${initials(s.nome)}</span>
        <span><span class="name">${s.nome}</span><br><span class="meta num">${s.culinaria} · ★ ${s.nota.toFixed(1).replace(".",",")} · ${s.tempo[0]}–${s.tempo[1]} min · entrega ${brl(s.taxa)}</span></span>
        ${c ? `<span class="incart num">${c} no carrinho</span>` : "<span></span>"}
      </button>`; }).join("")}
  </div>`;
}

function renderStore(s){
  const lines = cartLines(s.id), cart = state.carts[s.id] || {};
  const groups = ["prato","acomp","bebida","doce"].map(t => [t, s.itens.filter(i => i.tipo === t)]).filter(([,a]) => a.length);
  const others = activeCarts().filter(o => o.id !== s.id).length;
  const {total} = priceLines(s, lines);
  return `<button class="back" type="button" data-back>← Lojas</button>
  <div class="section" style="padding-top:6px">
    <h2 class="h">${s.nome}</h2>
    <p class="sub num">${s.culinaria} · ★ ${s.nota.toFixed(1).replace(".",",")} · ${s.tempo[0]}–${s.tempo[1]} min · entrega ${brl(s.taxa)}</p>
    ${groups.map(([t,items]) => `<div class="menu-group">${TIPO_LABEL[t]}</div>` + items.map(i => `
      <div class="item">
        <div><div class="n">${i.nome}</div><div class="d">${i.desc}</div>
          <div class="p num">${brl(i.preco)} <span class="serve">· serve ${i.serve}</span></div></div>
        <div class="stepper">
          ${cart[i.id] ? `<button type="button" aria-label="Remover ${i.nome}" data-dec="${s.id}|${i.id}">−</button><span class="num">${cart[i.id]}</span>` : ""}
          <button type="button" aria-label="Adicionar ${i.nome}" data-inc="${s.id}|${i.id}">+</button>
        </div>
      </div>`).join("")).join("")}
  </div>
  <div class="store-bar">
    <div><b class="num">${lines.length ? brl(total) : "Cardápio vazio"}</b><div class="keep-note">${others ? `+ ${others} ${others>1?"outros cardápios salvos":"outro cardápio salvo"}` : "Inclui a taxa de entrega"}</div></div>
    <div style="display:flex;gap:6px">
      <button class="btn ghost small" type="button" data-tab="cardapios">Comparar</button>
      <button class="btn small" type="button" data-choose="${s.id}" ${lines.length ? "" : "disabled"}>Pedir este</button>
    </div>
  </div>`;
}

function renderCarts(){
  const carts = activeCarts().map(s => ({s, lines:cartLines(s.id), ...priceLines(s, cartLines(s.id))}));
  if (!carts.length) return `<div class="section"><h2 class="h">Cardápios montados</h2>
    <div class="empty">Nenhum cardápio montado ainda.<br>Monte um em "Lojas" ou peça sugestões em "Monte pra mim".<br><br><button class="btn small" type="button" data-tab="chat">Pedir sugestões</button></div></div>`;
  const minT = Math.min(...carts.map(c => c.total)), minTime = Math.min(...carts.map(c => c.s.tempo[0]));
  return `<div class="section">
    <h2 class="h">Cardápios montados</h2>
    <p class="sub">${carts.length} ${carts.length>1?"cardápios salvos":"cardápio salvo"}, um por loja. Compare e mande o escolhido para o carrinho.</p>
    <div class="cmp-wrap"><table class="cmp">
      <thead><tr><th>Loja</th><th class="r">Total</th><th class="r">Min</th></tr></thead>
      <tbody>${carts.map(c => `<tr>
        <td>${c.s.nome}${c.total===minT && carts.length>1 ? '<span class="pill good">menor preço</span>' : ""}${c.s.tempo[0]===minTime && carts.length>1 ? '<span class="pill acc">mais rápido</span>' : ""}</td>
        <td class="r num"><b>${brl(c.total)}</b></td><td class="r num">${c.s.tempo[0]}–${c.s.tempo[1]}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="cart-rail">${carts.map(c => `
      <section class="cart" aria-label="Cardápio ${c.s.nome}">
        <h3>${c.s.nome}</h3>
        <ul class="lines num">${c.lines.map(l => { const i = itemOf(c.s,l.id); return `<li><span>${l.qty}× ${i.nome}</span><span>${brl(i.preco*l.qty)}</span></li>`; }).join("")}</ul>
        <div class="sums num"><div><span>Itens</span><span>${brl(c.sub)}</span></div><div><span>Entrega</span><span>${brl(c.s.taxa)}</span></div><div class="tot"><span>Total</span><span>${brl(c.total)}</span></div></div>
        <div class="actions"><button class="btn small" type="button" data-choose="${c.s.id}">Escolher este</button><button class="btn small ghost" type="button" data-open="${c.s.id}">Editar</button><button class="btn small ghost" type="button" data-clear="${c.s.id}">Esvaziar</button></div>
      </section>`).join("")}</div>
  </div>`;
}

function sugCard(sg, budget, mi, si){
  const s = byId[sg.storeId], {sub, total} = priceLines(s, sg.lines);
  const over = budget != null && total > budget;
  return `<div class="sug">
    <div class="sug-head"><b>${s.nome}</b><span class="meta num">${s.tempo[0]}–${s.tempo[1]} min</span></div>
    <ul class="lines num">${sg.lines.map(l => { const i = itemOf(s,l.id); return `<li><span>${l.qty}× ${i.nome}</span><span>${brl(i.preco*l.qty)}</span></li>`; }).join("")}</ul>
    ${sg.porque ? `<div class="why">${esc(sg.porque)}</div>` : ""}
    <div class="sums num"><div><span>Itens + entrega (${brl(s.taxa)})</span><span>${brl(sub)} + ${brl(s.taxa)}</span></div></div>
    <div class="sug-foot"><span><span class="tot num">${brl(total)}</span>${budget != null ? (over ? '<span class="pill warn">acima do orçamento</span>' : '<span class="pill good">no orçamento</span>') : ""}</span>
      <span style="display:flex;gap:6px"><button class="btn small ghost" type="button" data-addsug="${mi}|${si}">Salvar cardápio</button><button class="btn small" type="button" data-cartsug="${mi}|${si}">Pedir este</button></span></div>
  </div>`;
}

function renderChat(){
  const mode = state.ia ? `<span class="mode on">IA ativa</span>` : state.ia === undefined ? `<span class="mode">conectando…</span>` : `<span class="mode">motor local</span>`;
  const msgs = state.chat.map((m, mi) => {
    if (m.role === "user") return (m.example ? `<div class="example-tag">Exemplo · envie sua própria mensagem</div>` : "") + `<div class="bubble me">${esc(m.text)}</div>`;
    return `<div class="bubble bot">${esc(m.text)}</div>`
      + (m.note ? `<div class="meta">${esc(m.note)}</div>` : "")
      + (m.sugs || []).map((sg, si) => sugCard(sg, m.budget, mi, si)).join("");
  }).join("");
  return `<div class="chat-head"><h2 class="h">Monte pra mim</h2><div style="display:flex;gap:8px;align-items:center">${mode}<button class="btn small ghost" type="button" data-resetchat ${state.busy ? "disabled" : ""}>Limpar conversa</button></div></div>
  <div class="msgs" aria-live="polite">
    <div class="bubble bot">Olá! Qual a vontade de hoje?</div>
    ${msgs}
    ${state.busy ? `<div class="thinking"><span class="dots"><i></i><i></i><i></i></span>Montando opções nas lojas…${state.ctl ? ' <button class="btn small ghost" type="button" data-stop>Parar</button>' : ""}</div>` : ""}
  </div>
  <div class="composer">
    <div class="chips">${PROMPT_CHIPS.map(p => `<button class="chip" type="button" data-prompt="${esc(p)}">${esc(p)}</button>`).join("")}</div>
    <form id="chatForm"><textarea id="chatInput" rows="1" placeholder="Ex.: jantar para duas até R$ 80" aria-label="Descreva o que você quer comer"></textarea>
      <button class="btn" type="submit" ${state.busy ? "disabled" : ""}>Enviar</button></form>
  </div>`;
}

/* ---------- Toast & sheet ---------- */
let toastTimer;
function toast(msg, actionLabel, actionTab){
  const host = document.getElementById("toastHost");
  host.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${actionLabel ? `<button type="button" data-tab="${actionTab}">${actionLabel}</button>` : ""}</div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => host.innerHTML = "", 3600);
}
/* Manda um cardápio para o carrinho. Se o carrinho tem outra loja, pede confirmação antes de trocar. */
function toCart(storeId, items){
  const cur = cartItemLines().length ? state.cart : null;
  if (cur && cur.storeId !== storeId){
    state.pendingCart = {storeId, items};
    document.getElementById("toastHost").innerHTML = `<div class="sheet-bg" data-closesheet><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetT">
      <h3 id="sheetT">Trocar o carrinho?</h3>
      <p>Seu carrinho tem itens de <b>${byId[cur.storeId].nome}</b>. O carrinho aceita uma loja por vez.</p>
      <p class="meta">Os itens de ${byId[cur.storeId].nome} continuam salvos em Cardápios.</p>
      <div class="row"><button class="btn ghost" type="button" data-closesheet>Manter atual</button><button class="btn" type="button" data-confirmcart>Trocar por ${byId[storeId].nome}</button></div>
    </div></div>`;
    return;
  }
  commitCart(storeId, items);
}
function commitCart(storeId, items){
  const cur = cartItemLines().length ? state.cart : null;
  if (cur) state.carts[cur.storeId] = {...cur.items};          // o carrinho anterior volta para Cardápios
  state.cart = {storeId, items:{...items}};
  saveCart(); saveCarts();
  document.getElementById("toastHost").innerHTML = "";
  state.tab = "carrinho"; state.store = null;
  render(); view.scrollTop = 0;
}

function renderCart(){
  const lines = cartItemLines();
  if (!lines.length) return `<div class="section"><h2 class="h">Carrinho</h2>
    <div class="empty">Seu carrinho está vazio.<br>Escolha um dos seus cardápios para pedir.<br><br><button class="btn small" type="button" data-tab="cardapios">Ver cardápios</button></div></div>`;
  const s = byId[state.cart.storeId], {sub, total} = priceLines(s, lines);
  const opts = [["pix","Pix","aprovação na hora"],["credito","Cartão de crédito","•••• 4242"],["vr","Vale-refeição","•••• 1180"]];
  return `<div class="section">
    <h2 class="h">Carrinho</h2>
    <div class="cart-store"><span class="avatar">${initials(s.nome)}</span><div><b>${s.nome}</b><div class="meta num">${s.culinaria} · ${s.tempo[0]}–${s.tempo[1]} min</div></div></div>
    ${lines.map(l => { const i = itemOf(s, l.id); return `<div class="item">
      <div><div class="n">${i.nome}</div><div class="p num">${brl(i.preco * l.qty)}</div></div>
      <div class="stepper"><button type="button" aria-label="Remover ${i.nome}" data-cdec="${i.id}">−</button><span class="num">${l.qty}</span><button type="button" aria-label="Adicionar ${i.nome}" data-cinc="${i.id}">+</button></div>
    </div>`; }).join("")}
    <button class="btn ghost small" type="button" data-open="${s.id}" style="margin-top:10px">Adicionar mais itens de ${s.nome}</button>
    <div class="sums num" style="margin-top:12px"><div><span>Itens</span><span>${brl(sub)}</span></div><div><span>Entrega</span><span>${brl(s.taxa)}</span></div><div class="tot"><span>Total</span><span>${brl(total)}</span></div></div>
    <div class="rule-note">Um pedido, uma loja: o carrinho aceita itens de uma loja por vez. Para comparar outras lojas, use Cardápios.</div>
    <div class="menu-group">Pagamento</div>
    <div class="pay" role="radiogroup">${opts.map(([v,l,h]) => `<label><input type="radio" name="pay" value="${v}" ${state.pay===v?"checked":""}> ${l}<small class="num">${h}</small></label>`).join("")}</div>
  </div>
  <div class="pay-bar"><button class="btn" type="button" data-pay>Pagar ${brl(total)}</button></div>`;
}

function renderOrders(){
  if (!state.orders.length) return `<div class="section"><h2 class="h">Pedidos</h2>
    <div class="empty">Nenhum pedido ainda.<br>Quando você pagar um carrinho, o pedido aparece aqui.<br><br><button class="btn small" type="button" data-tab="carrinho">Ir para o carrinho</button></div></div>`;
  return `<div class="section"><h2 class="h">Pedidos</h2><p class="sub">Acompanhe o status de cada pedido pago.</p>
    ${state.orders.slice().reverse().map(o => { const s = byId[o.storeId], st = stepOf(o), when = new Date(o.at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); return `
    <section class="order">
      <div class="order-head"><b>${s.nome}</b><span class="pill ${st === STEPS.length-1 ? "good" : "acc"}">${st === 0 ? "Pedido confirmado" : STEPS[st]}</span></div>
      <div class="meta num">Pedido nº ${o.num} · hoje, ${when} · ${o.payLabel}</div>
      <ul class="lines num">${o.lines.map(l => { const i = itemOf(s, l.id); return `<li><span>${l.qty}× ${i.nome}</span><span>${brl(i.preco*l.qty)}</span></li>`; }).join("")}</ul>
      <div class="sums num"><div class="tot"><span>Total pago</span><span>${brl(o.total)}</span></div></div>
      <ol class="steps">${STEPS.map((x,i) => `<li class="${i <= st ? "done" : ""}">${x}</li>`).join("")}</ol>
    </section>`; }).join("")}
  </div>`;
}

function pay(){
  const lines = cartItemLines(); if (!lines.length) return;
  const s = byId[state.cart.storeId], {total} = priceLines(s, lines);
  const labels = {pix:"Pix", credito:"Cartão de crédito", vr:"Vale-refeição"};
  state.orders.push({num: 4800 + state.orders.length + 1 + Math.floor(Math.random()*90), storeId:s.id, lines, total, payLabel:labels[state.pay], at:Date.now()});
  delete state.carts[s.id];                                     // o cardápio pedido sai da comparação
  state.cart = null;
  saveOrders(); saveCart(); saveCarts();
  state.tab = "pedidos"; render();
  toast(`Pagamento aprovado. Pedido em ${s.nome} confirmado.`);
}
setInterval(() => { if (state.tab === "pedidos" && state.orders.some(o => stepOf(o) < STEPS.length - 1)) render(false); }, 5000);
document.addEventListener("change", e => { if (e.target.name === "pay") state.pay = e.target.value; });

/* ---------- Events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, .sheet-bg");
  if (!t) return;
  const d = t.dataset;
  if (t.classList.contains("sheet-bg") && e.target !== t) return;
  if (d.closesheet !== undefined){ document.getElementById("toastHost").innerHTML = ""; return; }
  if (d.tab){ state.tab = d.tab; if (d.tab === "lojas") state.store = null; document.getElementById("toastHost").innerHTML = ""; render(); view.scrollTop = 0; return; }
  if (d.cat){ state.cat = d.cat; render(); return; }
  if (d.open){ state.tab = "lojas"; state.store = d.open; render(); view.scrollTop = 0; return; }
  if (d.back !== undefined){ state.store = null; render(); return; }
  if (d.inc || d.dec){
    const [sid, iid] = (d.inc || d.dec).split("|");
    const c = state.carts[sid] = state.carts[sid] || {};
    c[iid] = Math.max(0, (c[iid] || 0) + (d.inc ? 1 : -1));
    if (!c[iid]) delete c[iid];
    saveCarts(); render(); return;
  }
  if (d.clear){ delete state.carts[d.clear]; saveCarts(); render(); toast(`Cardápio de ${byId[d.clear].nome} removido`); return; }
  if (d.choose){ toCart(d.choose, state.carts[d.choose] || {}); return; }
  if (d.confirmcart !== undefined){ const p = state.pendingCart; state.pendingCart = null; if (p) commitCart(p.storeId, p.items); return; }
  if (d.cinc || d.cdec){
    const it = state.cart.items, id = d.cinc || d.cdec;
    it[id] = Math.max(0, (it[id] || 0) + (d.cinc ? 1 : -1));
    if (!it[id]) delete it[id];
    if (!Object.keys(it).length) state.cart = null;
    saveCart(); render(); return;
  }
  if (d.pay !== undefined){ pay(); return; }
  if (d.addsug || d.cartsug){
    const [mi, si] = (d.addsug || d.cartsug).split("|").map(Number);
    const sg = state.chat[mi].sugs[si];
    const items = Object.fromEntries(sg.lines.map(l => [l.id, l.qty]));
    if (d.cartsug){ toCart(sg.storeId, items); return; }
    const had = cartLines(sg.storeId).length;
    state.carts[sg.storeId] = items;
    saveCarts(); render(false);
    toast(`${had ? "Cardápio atualizado" : "Cardápio salvo"}: ${byId[sg.storeId].nome}`, "Comparar", "cardapios");
    return;
  }
  if (d.prompt){ send(d.prompt); return; }
  if (d.stop !== undefined){ state.ctl?.abort(); return; }
  if (d.resetchat !== undefined){ if (!state.busy){ seedChat(); render(); } return; }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "chatForm") return;
  e.preventDefault();
  const v = document.getElementById("chatInput").value;
  send(v);
});
document.addEventListener("keydown", e => {
  if (e.target.id === "chatInput" && e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(e.target.value); }
  if (e.key === "Escape") { const bg = document.querySelector(".sheet-bg"); if (bg) document.getElementById("toastHost").innerHTML = ""; }
});

/* ---------- Arrastar para rolar (mouse) ---------- */
(function dragScroll(){
  let drag = null, moved = false;
  const SEL = ".cart-rail, .chips, .cmp-wrap, .studies, .msgs, #view";
  document.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (e.target.closest("textarea, input")) return;
    let el = e.target.closest(SEL);
    while (el && el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) el = el.parentElement?.closest(SEL);
    if (!el) return;
    drag = {el, x:e.clientX, y:e.clientY, l:el.scrollLeft, t:el.scrollTop, snap:el.style.scrollSnapType};
    moved = false;
  });
  document.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    if (!moved){ moved = true; drag.el.style.scrollSnapType = "none"; drag.el.classList.add("dragging"); }
    const horiz = drag.el.scrollWidth > drag.el.clientWidth;
    if (horiz) drag.el.scrollLeft = drag.l - dx;
    // arrastar na vertical rola a tela do app, mesmo em cima de um trilho horizontal
    const vEl = drag.el.scrollHeight > drag.el.clientHeight ? drag.el : drag.el.closest(".msgs, #view");
    if (vEl) { if (drag.vt === undefined){ drag.vEl = vEl; drag.vt = vEl.scrollTop; } drag.vEl.scrollTop = drag.vt - dy; }
  });
  const end = () => {
    if (!drag) return;
    const el = drag.el;
    el.classList.remove("dragging");
    el.style.scrollSnapType = drag.snap;
    drag = null;
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  // um arrasto não dispara o clique do botão onde ele terminou
  document.addEventListener("click", e => { if (moved){ e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  document.addEventListener("dragstart", e => { if (e.target.closest?.(SEL)) e.preventDefault(); });
  // roda do mouse rola os trilhos na horizontal enquanto houver conteúdo para o lado
  document.addEventListener("wheel", e => {
    const rail = e.target.closest(".cart-rail, .chips, .cmp-wrap, .studies");
    if (!rail || rail.scrollWidth <= rail.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const max = rail.scrollWidth - rail.clientWidth;
    if ((e.deltaY > 0 && rail.scrollLeft < max - 1) || (e.deltaY < 0 && rail.scrollLeft > 0)){
      e.preventDefault(); rail.scrollLeft += e.deltaY;
    }
  }, {passive:false});
})();

/* ---------- Boot ---------- */
function seedChat(){
  const r = localSuggest(EXAMPLE_PROMPT, STORES);
  state.chat = [{role:"user", text:EXAMPLE_PROMPT, example:true},
    {role:"assistant", source:"local", text:r.mensagem, sugs:r.sugestoes, budget:r.budget, example:true}];
  state.lastBudget = null;
}
seedChat();
render();
fetchHealth().then(ok => { state.ia = ok; if (state.tab === "chat") render(false); });
