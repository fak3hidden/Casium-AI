"use strict";

/* ============================================================
   Casium AI — frontend
   ============================================================ */

// ---------- tiny dom helpers ----------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

const humanSize = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(1) + " GB";
};
const whenShort = (ts) => new Date((ts || 0) * 1000).toLocaleString([],
  { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

// ---------- state ----------

const THEMES = {
  dark:  { label: "Dark",  bg: "#131318", surface: "#1b1b22", accent: "#6466f3" },
  paper: { label: "Paper", bg: "#f4f5f7", surface: "#ffffff", accent: "#5b5ce2" },
  nord:  { label: "Nord",  bg: "#242933", surface: "#2e3440", accent: "#88c0d0" },
};

const state = {
  settings: {},
  version: "",
  dataDir: "",
  ollamaOnline: false,
  ollamaVersion: "",
  models: [],
  mcp: [],
  skills: [],
  chats: [],
  view: "chat",
  activeChatId: null,
  activeChat: null,
  sending: false,
  selectedModel: null,   // current chat model
  cfgOpen: false,
  chips: { mcp: true, skills: true },
  pulling: {},           // name -> {completed,total,status}
  pickedModel: null,     // selection in the Models view
};

// ---------- api ----------

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function streamNDJSON(path, body, onEvent) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (JSON.parse(await res.text()) || {}).error || msg; } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onEvent(JSON.parse(line)); } catch {}
    }
  }
}

// ---------- markdown (tiny, safe) ----------

function md(src) {
  if (!src) return "";
  const blocks = [];
  let s = String(src).replace(/```[\w-]*\n?([\s\S]*?)```/g, (m, code) => {
    blocks.push(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|\n)#+ (.+)$/g, (m, pre, t) => `${pre}<h3>${t}</h3>`);
  s = s.replace(/((?:^[\t ]*[-*] .+(?:\n|$))+)/gm, (m) => {
    const items = m.trim().split("\n").map((l) =>
      `<li>${l.replace(/^[\t ]*[-*] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  s = s.replace(/((?:^[\t ]*\d+\. .+(?:\n|$))+)/gm, (m) => {
    const items = m.trim().split("\n").map((l) =>
      `<li>${l.replace(/^[\t ]*\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  s = s.split(/\n{2,}/).map((chunk) => {
    const c = chunk.trim();
    if (!c) return "";
    if (/^<(pre|ul|ol|h3)/.test(c)) return c;
    return `<p>${c.replace(/\n/g, "<br>")}</p>`;
  }).join("");
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
  return s;
}

// ---------- theme ----------

function applyTheme(name) {
  document.documentElement.dataset.theme = THEMES[name] ? name : "dark";
  if (state.view === "settings") renderSettings();
}

// ---------- polling ----------

let lastKey = "";

async function poll() {
  let st;
  try {
    st = await api("/api/status");
  } catch {
    return;
  }
  const wasOnline = state.ollamaOnline;
  state.version = st.version;
  state.dataDir = st.data_dir || "";
  state.settings = { ...state.settings, ...st.settings };
  state.ollamaOnline = !!st.ollama?.online;
  state.ollamaVersion = st.ollama?.version || "";
  state.models = st.models || [];
  state.mcp = st.mcp || [];
  state.skills = st.skills || [];
  state.chats = st.chats || [];

  if (!state.selectedModel || !state.models.some((m) => m.name === state.selectedModel)) {
    state.selectedModel = state.models[0]?.name || null;
  }
  if (!state.pickedModel) {
    state.pickedModel = state.models[0]?.name || null;
  }

  const key = JSON.stringify([
    state.ollamaOnline,
    state.models.map((m) => m.name),
    state.mcp.map((m) => [m.name, m.state, m.tools]),
    state.skills.map((s) => [s.dir, s.enabled]),
    state.chats.map((c) => [c.id, c.updated]),
  ]);
  const structural = key !== lastKey;
  lastKey = key;

  if (wasOnline !== state.ollamaOnline) {
    if (state.ollamaOnline) flashStatus(`Ollama online (v${state.ollamaVersion})`);
  }

  renderAll(structural);
}

function flashStatus(msg) {
  $("#sbOllama").textContent = msg;
}

function renderAll(structural) {
  renderStatusbar();
  if (structural || true) {
    if (state.view === "chat") { renderSessions(); renderModelPicker(); }
    if (state.view === "models") { renderModels(); }
    if (state.view === "mcp") renderMcp();
    if (state.view === "skills") renderSkills();
    if (state.view === "settings") renderSettings();
  }
}

// ---------- status bar ----------

function renderStatusbar() {
  $("#tbVer").textContent = state.version ? " — v" + state.version : "";
  $("#sbVer").textContent = state.version ? " v" + state.version : "";
  const dot = $("#sbDot");
  dot.className = "dot " + (state.ollamaOnline ? "ok" : "err");
  $("#sbOllama").textContent = state.ollamaOnline
    ? `Ollama online · v${state.ollamaVersion}`
    : "Ollama offline";
  $("#sbStartOllama").style.display = state.ollamaOnline ? "none" : "";
  const run = state.mcp.filter((m) => m.state === "running").length;
  const sk = state.skills.filter((s) => s.enabled).length;
  $("#sbCounts").textContent = `${state.models.length} models · ${sk} skills · ${run}/${state.mcp.length} MCP`;
}

// ---------- views ----------

function switchView(v) {
  state.view = v;
  $$("#rail .rail-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $("#view-chat").hidden = v !== "chat";
  $("#view-models").hidden = v !== "models";
  $("#view-mcp").hidden = v !== "mcp";
  $("#view-skills").hidden = v !== "skills";
  $("#view-settings").hidden = v !== "settings";
  closeModelDrop();
  if (v === "chat") { renderSessions(); renderModelPicker(); renderChat(); }
  if (v === "models") { renderModels(); }
  if (v === "mcp") renderMcp();
  if (v === "skills") renderSkills();
  if (v === "settings") renderSettings();
}

// ---------- chat: sessions ----------

function renderSessions() {
  const list = $("#sessionList");
  list.innerHTML = "";
  if (!state.chats.length) {
    list.append(h("div", { class: "session-empty", text: "No conversations yet.\nStart one above." }));
    return;
  }
  for (const c of state.chats) {
    const item = h("button", {
      class: "session-item" + (c.id === state.activeChatId ? " active" : ""),
      onclick: () => openChat(c.id),
      ondblclick: (e) => { e.preventDefault(); renameChat(c.id); },
      oncontextmenu: (e) => {
        e.preventDefault();
        showCtx(e.clientX, e.clientY, [
          { label: "Rename", icon: "#i-copy", fn: () => renameChat(c.id) },
          { sep: true },
          { label: "Delete", icon: "#i-trash", danger: true, fn: () => deleteChat(c.id) },
        ]);
      },
    },
      h("div", { class: "si-title", text: c.title, title: c.title }),
      h("div", { class: "si-meta", text: whenShort(c.updated) }));
    list.append(item);
  }
}

// ---------- chat: model picker ----------

function renderModelPicker() {
  const name = $("#mpName");
  const picker = $("#modelPicker");
  if (state.selectedModel) {
    name.textContent = state.selectedModel;
    picker.classList.remove("empty");
  } else {
    name.textContent = state.ollamaOnline ? "No model selected" : "Ollama offline";
    picker.classList.add("empty");
  }
}

function openModelDrop() {
  const drop = $("#modelDrop");
  drop.innerHTML = "";
  if (state.models.length) {
    for (const m of state.models) {
      drop.append(h("button", {
        class: "md-item",
        onclick: () => { state.selectedModel = m.name; closeModelDrop(); renderModelPicker(); renderStatusbar(); },
      },
        h("svg", { class: "ic" }, h("use", { href: "#i-chip" })),
        h("span", { text: m.name }),
        h("span", { class: "md-size", text: humanSize(m.size) })));
    }
  } else {
    drop.append(h("div", { class: "md-item", style: "cursor:default;color:var(--text-3)" },
      state.ollamaOnline ? "No models installed yet" : "Ollama is offline"));
  }
  drop.append(h("div", { class: "md-sep" }));
  drop.append(h("button", {
    class: "md-item pull",
    onclick: () => { closeModelDrop(); switchView("models"); setTimeout(() => $("#pullSearch").focus(), 60); },
  }, h("svg", { class: "ic" }, h("use", { href: "#i-download" })), "Pull a model…"));
  drop.classList.add("open");
}

function closeModelDrop() { $("#modelDrop").classList.remove("open"); }

// ---------- chat: messages ----------

function renderChat() {
  const empty = $("#emptyChat");
  const inner = $("#chatInner");
  const has = state.activeChat && state.activeChat.messages.length;
  empty.style.display = has ? "none" : "flex";
  inner.style.display = has ? "" : "none";
  if (has) fillMessages();
  $("#chatHeadTitle").textContent = state.activeChat?.title && state.activeChat.title !== "New chat"
    ? state.activeChat.title : "";
  loadCfgPanel();
}

function fillMessages() {
  const inner = $("#chatInner");
  inner.innerHTML = "";
  for (const m of state.activeChat.messages) inner.append(messageEl(m));
  scrollToBottom(true);
}

function messageEl(m) {
  if (m.role === "user") {
    return h("div", { class: "msg user" },
      h("div", { class: "bubble", text: m.content }));
  }
  const wrap = h("div", { class: "msg ai" });
  wrap.append(h("div", { class: "who" },
    h("svg", { class: "ic" }, h("use", { href: "#i-bolt" })),
    h("span", { text: "Casium AI" })));
  const content = h("div", { class: "content" });
  content.innerHTML = md(m.content);
  wrap.append(content);
  if (state.chips.tools !== false) {
    for (const a of m.actions || []) {
      const ok = a.installed ? "ok" : a.error ? "err" : "";
      wrap.append(chip(`install ${a.url || a.name}`,
        a.installed ? "installed " + a.installed.join(", ") : a.error || "working…", ok));
    }
    for (const tc of m.tool_calls || []) {
      wrap.append(chip(`${tc.server}.${tc.tool}(${jsonShort(tc.args)})`,
        tc.ok == null ? "running…" : tc.ok ? "done" : "failed",
        tc.ok == null ? "" : tc.ok ? "ok" : "err"));
    }
  }
  return wrap;
}

function chip(title, detail, cls) {
  const el = h("div", { class: "toolchip " + cls });
  el.append(h("span", { class: "tc-mark", text: cls === "err" ? "✗" : cls === "ok" ? "✓" : "›" }));
  el.append(h("span", { text: `${title} — ${detail}` }));
  return el;
}

function jsonShort(obj) {
  try {
    const s = JSON.stringify(obj || {});
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  } catch { return ""; }
}

function scrollToBottom(force) {
  const sc = $("#chatScroll");
  if (force || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 90) sc.scrollTop = sc.scrollHeight;
}

// ---------- chat: sessions api ----------

async function newChat() {
  let chat;
  try {
    chat = (await api("/api/chats/new", { body: {} })).chat;
  } catch (e) { return; }
  state.chats.unshift(chat);
  state.activeChat = { ...chat, messages: [] };
  state.activeChatId = chat.id;
  switchView("chat");
  renderChat();
  renderSessions();
  $("#chatInput").focus();
}

async function openChat(id) {
  try {
    const data = await api(`/api/chats/${encodeURIComponent(id)}`);
    state.activeChat = data.chat;
    state.activeChatId = id;
    if (data.chat.model) state.selectedModel = data.chat.model;
    switchView("chat");
    renderChat();
    renderSessions();
  } catch (e) {}
}

async function deleteChat(id) {
  try { await api("/api/chats/delete", { body: { id } }); } catch {}
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.activeChatId === id) {
    state.activeChat = null;
    state.activeChatId = null;
    renderChat();
  }
  renderSessions();
}

async function renameChat(id) {
  const chat = state.chats.find((c) => c.id === id);
  const title = prompt("Rename chat:", chat?.title || "");
  if (!title || title === chat.title) return;
  try {
    await api("/api/chats/rename", { body: { id, title } });
    if (chat) chat.title = title.slice(0, 48);
    if (state.activeChat?.id === id) state.activeChat.title = title.slice(0, 48);
    renderSessions();
    renderChat();
  } catch (e) {}
}

// ---------- chat: send ----------

async function send() {
  if (state.sending) return;
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;

  if (!state.activeChat) {
    const chat = (await api("/api/chats/new", { body: {} })).chat;
    state.chats.unshift(chat);
    state.activeChat = { ...chat, messages: [] };
    state.activeChatId = chat.id;
  }
  switchView("chat");

  const cfg = readCfg();
  state.activeChat.messages.push({ role: "user", content: text });
  const aiMsg = { role: "assistant", content: "" };
  state.activeChat.messages.push(aiMsg);

  renderChat();
  const inner = $("#chatInner");
  const wrap = h("div", { class: "msg ai" });
  wrap.append(h("div", { class: "who" },
    h("svg", { class: "ic" }, h("use", { href: "#i-bolt" })),
    h("span", { text: "Casium AI" })));
  const contentEl = h("div", { class: "content" });
  contentEl.innerHTML = '<span class="caret"></span>';
  wrap.append(contentEl);
  inner.append(wrap);
  scrollToBottom(true);

  state.sending = true;
  $("#sendBtn").disabled = true;
  input.value = "";
  input.style.height = "auto";

  let pending = "";
  let raf = 0;
  const flush = () => {
    raf = 0;
    contentEl.innerHTML = md(aiMsg.content + pending) + '<span class="caret"></span>';
    scrollToBottom();
  };

  try {
    await streamNDJSON("/api/chat", {
      chat_id: state.activeChatId,
      model: state.selectedModel || "",
      message: text,
      mcp: state.chips.mcp,
      skills: state.chips.skills,
      system_prompt: cfg.system,
      temperature: cfg.temperature,
      max_tokens: cfg.maxOn ? cfg.max : null,
    }, (ev) => {
      switch (ev.type) {
        case "token":
          pending += ev.text;
          if (!raf) raf = requestAnimationFrame(flush);
          break;
        case "tool":
          if (state.chips.tools !== false) {
            contentEl.querySelector(".caret")?.remove();
            wrap.append(chip(`${ev.server}.${ev.tool}(${jsonShort(ev.args)})`, "running…", ""));
          }
          break;
        case "tool_done": {
          if (state.chips.tools !== false) {
            const chips = wrap.querySelectorAll(".toolchip");
            const last = chips[chips.length - 1];
            if (last) {
              last.className = "toolchip " + (ev.ok ? "ok" : "err");
              last.querySelector(".tc-mark").textContent = ev.ok ? "✓" : "✗";
              last.children[1].textContent = (ev.preview || "").slice(0, 120) || (ev.ok ? "done" : "failed");
            }
          }
          break;
        }
        case "action":
        case "action_step":
          break;
        case "offline":
          break;
        case "error":
          aiMsg.content += `\n\n[error] ${ev.message}`;
          if (!raf) raf = requestAnimationFrame(flush);
          break;
        case "done":
          if (!raf) raf = requestAnimationFrame(flush);
          if (ev.model) state.selectedModel = ev.model;
          if (ev.title) {
            state.activeChat.title = ev.title;
            const meta = state.chats.find((c) => c.id === state.activeChatId);
            if (meta) meta.title = ev.title;
          }
          renderModelPicker();
          renderSessions();
          break;
      }
    });
  } catch (e) {
    aiMsg.content += `\n\n[error] ${e.message}`;
    if (!raf) raf = requestAnimationFrame(flush);
  } finally {
    state.sending = false;
    $("#sendBtn").disabled = false;
    contentEl.innerHTML = md(aiMsg.content);
    scrollToBottom(true);
    renderChat();
    poll();
  }
}

// ---------- chat: config panel ----------

const CFG_DEFAULT = { system: "", temperature: 0.8, maxOn: false, max: 2048, tools: true };

function readCfg() {
  const c = { ...CFG_DEFAULT };
  const chatCfg = state.activeChat?.cfg || {};
  c.system = chatCfg.system ?? c.system;
  c.temperature = chatCfg.temperature ?? c.temperature;
  c.maxOn = chatCfg.max_on ?? c.maxOn;
  c.max = chatCfg.max_tokens ?? c.max;
  c.tools = chatCfg.tools ?? c.tools;
  return c;
}

function loadCfgPanel() {
  const c = readCfg();
  $("#cfgSystem").value = c.system;
  $("#cfgTemp").value = c.temperature;
  $("#cfgTempVal").textContent = Number(c.temperature).toFixed(2).replace(/0$/, "");
  $("#cfgMaxOn").checked = c.maxOn;
  $("#cfgMax").value = c.max;
  $("#cfgMax").disabled = !c.maxOn;
  $("#cfgMaxVal").textContent = String(c.max);
  $("#cfgTools").checked = c.tools;
  state.chips.tools = c.tools;
  state.chips.mcp = $("#chipMcp").classList.contains("on");
  state.chips.skills = $("#chipSkills").classList.contains("on");
}

function saveCfg() {
  const cfg = {
    system: $("#cfgSystem").value,
    temperature: parseFloat($("#cfgTemp").value),
    max_on: $("#cfgMaxOn").checked,
    max_tokens: parseInt($("#cfgMax").value, 10),
    tools: $("#cfgTools").checked,
  };
  if (state.activeChat) {
    state.activeChat.cfg = cfg;
    api("/api/chats/cfg", { body: { id: state.activeChatId, cfg } }).catch(() => {});
  }
}

// ---------- models view ----------

function renderModels() {
  $("#modelCount").textContent = state.models.length ? `${state.models.length} installed` : "";
  const list = $("#modelList");
  list.innerHTML = "";

  const pulls = Object.entries(state.pulling).filter(([n]) => !state.models.some((m) => m.name === n));
  for (const [name, p] of pulls) list.append(modelRow(name, p, null, true));
  for (const m of state.models) list.append(modelRow(m.name, state.pulling[m.name], m, false));

  if (!state.models.length && !pulls.length) {
    list.append(h("div", { class: "session-empty", style: "padding:10px 6px" },
      state.ollamaOnline
        ? "Nothing here yet. Type a model name above and press Enter to pull it."
        : "Ollama is offline. Start it (bottom-left) to pull models."));
  }
  renderModelDetail();
}

function modelRow(name, pull, m, isPull) {
  const active = state.pickedModel === name;
  const sub = isPull
    ? (pull.status === "starting" ? "contacting Ollama…" : `downloading ${humanSize(pull.completed)} / ${humanSize(pull.total || 0)}`)
    : `${m.details.quantization || ""} ${m.details.parameter_size ? "· " + m.details.parameter_size : ""} · ${humanSize(m.size)}`.replace(/\s+/g, " ").trim();
  const row = h("button", {
    class: "model-row" + (active ? " active" : ""),
    onclick: () => { state.pickedModel = name; renderModels(); },
  },
    h("svg", { class: "ic" }, h("use", { href: "#i-chip" })),
    h("div", { class: "mr-body" },
      h("div", { class: "mr-name", text: name }),
      h("div", { class: "mr-sub", text: sub }),
      isPull && pull.total
        ? h("div", { class: "mr-progress" }, h("i", { style: `width:${Math.min(100, (pull.completed / pull.total) * 100).toFixed(0)}%` }))
        : null),
    !isPull && !pull
      ? h("span", { class: "mr-actions" },
          h("button", {
            class: "icon-btn danger", title: "Delete",
            onclick: (e) => { e.stopPropagation(); deleteModel(name); },
          }, h("svg", { class: "ic" }, h("use", { href: "#i-trash" }))))
      : null);
  return row;
}

function renderModelDetail() {
  const pane = $("#modelDetail");
  pane.innerHTML = "";

  if (!state.ollamaOnline) {
    pane.append(onboardCard());
    return;
  }

  const name = state.pickedModel && (state.models.some((m) => m.name === state.pickedModel) || state.pulling[state.pickedModel])
    ? state.pickedModel : (state.models[0]?.name || null);
  if (!name) {
    pane.append(h("div", { class: "empty-pane" },
      h("svg", { class: "ic big" }, h("use", { href: "#i-chip" })),
      h("div", { class: "t1", text: "No models yet" }),
      h("div", { class: "t2", text: "Search above for a model from the Ollama library — llama3.2, qwen3:4b, mistral-nemo, gemma3 — and pull it." })));
    return;
  }

  const m = state.models.find((x) => x.name === name);
  const pull = state.pulling[name];
  const wrap = h("div", { class: "detail-wrap" });

  const badges = [];
  if (m) {
    if (m.details.quantization) badges.push(h("span", { class: "badge b-amber", text: m.details.quantization }));
    if (m.details.parameter_size) badges.push(h("span", { class: "badge b-blue", text: m.details.parameter_size + " params" }));
    if (m.details.family) badges.push(h("span", { class: "badge b-neutral", text: m.details.family }));
  }

  wrap.append(h("div", { class: "detail-head" }, h("h2", { text: name }), ...badges));

  const stats = h("div", { class: "detail-stats" });
  stats.append(
    h("div", { class: "ds-item" }, h("div", { class: "k", text: "Size on disk" }), h("div", { class: "v", text: m ? humanSize(m.size) : "—" })),
    h("div", { class: "ds-item" }, h("div", { class: "k", text: "Architecture" }), h("div", { class: "v", text: m?.details.family || "—" })),
    h("div", { class: "ds-item" }, h("div", { class: "k", text: "Quantization" }), h("div", { class: "v", text: m?.details.quantization || "—" })),
  );
  wrap.append(stats);

  const actions = h("div", { class: "detail-actions" });
  if (pull) {
    actions.append(h("span", { class: "muted", text: pull.status === "starting" ? "Starting download…" : "Downloading…" }));
  } else {
    actions.append(h("button", {
      class: "btn btn-accent",
      onclick: () => { state.selectedModel = name; switchView("chat"); $("#chatInput").focus(); },
    }, h("svg", { class: "ic" }, h("use", { href: "#i-chat" })), "Chat with this model"));
    actions.append(h("button", {
      class: "btn btn-danger",
      onclick: () => deleteModel(name),
    }, h("svg", { class: "ic" }, h("use", { href: "#i-trash" })), "Delete"));
  }
  wrap.append(actions);

  if (pull) {
    const prog = h("div", { class: "detail-progress on" },
      h("div", { class: "dp-bar" }, h("i", { style: `width:${pull.total ? Math.min(100, (pull.completed / pull.total) * 100).toFixed(0) : 0}%` })),
      h("div", { class: "dp-text", text: pull.status === "starting" ? "contacting Ollama…" : `${humanSize(pull.completed)} / ${humanSize(pull.total || 0)} — ${pull.status}` }));
    wrap.append(prog);
  }

  pane.append(wrap);
}

function onboardCard() {
  return h("div", { style: "flex:1; display:flex; align-items:center; justify-content:center; padding:40px" },
    h("div", { class: "onboard" },
      h("h3", { text: "Ollama isn't running" }),
      h("p", { text: "Ollama is the engine that runs your local models. Casium AI can start it for you, or do it manually:" }),
      h("ol", { class: "steps" },
        h("li", { text: "Install Ollama from " }),
        (function () {
          const el = document.createElement("li");
          el.innerHTML = "Install from <a href=\"https://ollama.com/download\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent)\">ollama.com/download</a>";
          return el;
        })(),
        h("li", { html: "run <span class=\"mono\">ollama serve</span> in a terminal — or just press the button below" })),
      h("div", { class: "actions" },
        h("button", { class: "btn btn-accent", onclick: startOllama },
          h("svg", { class: "ic" }, h("use", { href: "#i-bolt" })), "Start Ollama"),
        h("button", { class: "btn btn-ghost", onclick: poll },
          h("svg", { class: "ic" }, h("use", { href: "#i-search" })), "Check again"))));
}

async function startPull(name) {
  name = name.trim();
  if (!name) return;
  if (!state.ollamaOnline) { switchView("models"); return; }
  state.pulling[name] = { completed: 0, total: 0, status: "starting" };
  state.pickedModel = name;
  renderModels();
  try {
    await streamNDJSON("/api/models/pull", { name }, (ev) => {
      if (ev.status && ev.status !== "success") {
        state.pulling[name] = { completed: ev.completed || 0, total: ev.total || 0, status: ev.status };
      }
      if (ev.status === "success") {
        delete state.pulling[name];
      }
      renderModels();
    });
    await poll();
  } catch (e) {
    delete state.pulling[name];
    alert("Pull failed: " + e.message);
    renderModels();
  }
}

async function deleteModel(name) {
  if (!confirm(`Delete model ${name}?`)) return;
  try {
    await api("/api/models/delete", { body: { name } });
    if (state.selectedModel === name) state.selectedModel = null;
    await poll();
    renderModels();
  } catch (e) {
    alert("Delete failed: " + e.message);
  }
}

// ---------- mcp ----------

const MCP_PRESETS = {
  github: { label: "GitHub", command: "npx", args: "-y @modelcontextprotocol/server-github", env: "GITHUB_PERSONAL_ACCESS_TOKEN=" },
  filesystem: { label: "Filesystem", command: "npx", args: "-y @modelcontextprotocol/server-filesystem", env: "ALLOWED_DIR=" },
  fetch: { label: "Fetch", command: "uvx", args: "mcp-server-fetch", env: "" },
  time: { label: "Time", command: "uvx", args: "mcp-server-time", env: "" },
};

function renderMcp() {
  const list = $("#mcpList");
  list.innerHTML = "";
  if (!state.mcp.length) {
    list.append(h("div", { class: "empty-pane", style: "border:1px dashed var(--border-strong); border-radius:14px" },
      h("svg", { class: "ic big" }, h("use", { href: "#i-plug" })),
      h("div", { class: "t1", text: "No apps connected" }),
      h("div", { class: "t2", text: "Add GitHub to let the AI open repos and issues, Filesystem to read and write files, Fetch to browse the web…" })));
    return;
  }
  for (const m of state.mcp) {
    const running = m.state === "running";
    const pill = running ? h("span", { class: "status-pill sp-running" }, h("span", { class: "dot ok" }), "Running")
      : m.state === "starting" ? h("span", { class: "status-pill sp-stopped" }, h("span", { class: "dot warn" }), "Starting…")
      : m.state === "error" ? h("span", { class: "status-pill sp-error" }, h("span", { class: "dot err" }), m.error || "Error")
      : h("span", { class: "status-pill sp-stopped" }, h("span", { class: "dot" }), "Stopped");
    const cmd = [m.command, ...(m.args || [])].join(" ");
    const card = h("div", { class: "mcp-card" },
      h("div", { class: "mcp-ic" + (running ? " on" : "") }, h("svg", { class: "ic" }, h("use", { href: "#i-plug" }))),
      h("div", { class: "mcp-body" },
        h("div", { class: "mcp-name" }, h("span", { text: m.name }), pill),
        h("div", { class: "mcp-cmd", text: cmd }),
        running && m.tools ? h("div", { class: "mcp-note", text: `${m.tools} tools available in chat` }) : null),
      h("div", { class: "mcp-actions" },
        h("button", {
          class: "btn " + (running ? "btn-ghost" : "btn-accent") + " btn-xs",
          onclick: () => toggleMcp(m.name),
        }, h("svg", { class: "ic" }, h("use", { href: "#i-power" })), running ? "Stop" : "Start"),
        h("button", { class: "icon-btn danger", title: "Delete", onclick: () => deleteMcp(m.name) },
          h("svg", { class: "ic" }, h("use", { href: "#i-trash" }))
          )
      ));
    list.append(card);
  }
}

async function toggleMcp(name) {
  const m = state.mcp.find((x) => x.name === name);
  if (!m) return;
  try {
    if (m.state === "running") await api("/api/mcp/stop", { body: { name } });
    else await api("/api/mcp/start", { body: { name } });
  } catch (e) { alert(e.message); }
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    await poll();
    if (state.view !== "mcp") break;
    const cur = state.mcp.find((x) => x.name === name);
    if (cur && (cur.state === "running" || cur.state === "error")) break;
  }
  renderMcp();
}

function openMcpModal() {
  const presetSel = h("select", { class: "field", id: "mcpPreset" },
    h("option", { value: "", selected: true, text: "Custom…" }),
    ...Object.entries(MCP_PRESETS).map(([k, p]) => h("option", { value: k, text: p.label })));
  presetSel.onchange = () => {
    const p = MCP_PRESETS[presetSel.value];
    if (!p) return;
    $("#mcpF_name").value = presetSel.value;
    $("#mcpF_command").value = p.command;
    $("#mcpF_args").value = p.args;
    $("#mcpF_env").value = p.env;
  };

  openModal({
    title: "Add an MCP app",
    fields: [
      { key: "_preset", label: "Start from a preset", node: presetSel },
      { key: "name", label: "Name", placeholder: "github" },
      { key: "command", label: "Command", placeholder: "npx", hint: "The executable that starts the server. npx needs Node.js, uvx needs uv." },
      { key: "args", label: "Arguments", placeholder: "-y @modelcontextprotocol/server-github" },
      { key: "env", label: "Environment (one KEY=VALUE per line)", placeholder: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_…", textarea: true },
    ],
    ok: async (vals) => {
      const env = {};
      (vals.env || "").split("\n").forEach((line) => {
        const i = line.indexOf("=");
        if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      await api("/api/mcp/add", { body: { name: vals.name, command: vals.command, args: vals.args || "", env } });
      await api("/api/mcp/start", { body: { name: vals.name } });
      await poll();
      renderMcp();
    },
  });
}

async function deleteMcp(name) {
  if (!confirm(`Delete app '${name}'?`)) return;
  try {
    await api("/api/mcp/stop", { body: { name } });
    await api("/api/mcp/delete", { body: { name } });
    await poll();
    renderMcp();
  } catch (e) { alert(e.message); }
}

// ---------- skills ----------

function renderSkills() {
  const grid = $("#skillGrid");
  grid.innerHTML = "";
  if (!state.skills.length) {
    grid.append(h("div", { class: "empty-pane", style: "border:1px dashed var(--border-strong); border-radius:14px; grid-column:1/-1" },
      h("svg", { class: "ic big" }, h("use", { href: "#i-book" })),
      h("div", { class: "t1", text: "No skills installed" }),
      h("div", { class: "t2", text: "Install a pack from a repo link, or just ask in a chat: “Install this skill for me https://github.com/nvidia/skills”" })));
    return;
  }
  for (const s of state.skills) {
    const src = (s.source && s.source !== "bundled")
      ? s.source.replace(/^https?:\/\//, "") : (s.source === "bundled" ? "bundled" : "");
    const card = h("div", { class: "skill-card" + (s.enabled ? "" : " off") },
      h("div", { class: "sc-top" },
        h("svg", { class: "ic" }, h("use", { href: "#i-book" })),
        h("span", { class: "sc-name", text: s.name, title: s.name }),
        h("span", { class: "badge " + (s.enabled ? "b-green" : "b-neutral"), text: s.enabled ? "on" : "off" })),
      h("div", { class: "sc-desc", text: s.description || "No description." }),
      h("div", { class: "sc-foot" },
        h("span", { class: "sc-source", text: src || humanSize(s.size), title: s.source }),
        h("button", { class: "icon-btn danger", title: "Delete", onclick: () => deleteSkill(s.dir) },
          h("svg", { class: "ic" }, h("use", { href: "#i-trash" }))),
        h("label", { class: "toggle", title: s.enabled ? "Disable" : "Enable" },
          h("input", { type: "checkbox", checked: s.enabled, onchange: (e) => toggleSkill(s.dir, e.target.checked) }),
          h("span", { class: "tr" }, h("span", { class: "th" })))));
    grid.append(card);
  }
}

function openSkillModal() {
  openModal({
    title: "Install skills from a link",
    fields: [
      { key: "url", label: "Repository URL", placeholder: "https://github.com/nvidia/skills",
        hint: "Anything git can clone. Every SKILL.md in the repo becomes a skill. You can also just paste this into a chat and ask the AI to do it." },
    ],
    ok: async (vals) => {
      const url = vals.url.trim();
      if (!url) throw new Error("Enter a URL");
      try {
        await streamNDJSON("/api/skills/install", { url }, (ev) => {
          if (ev.type === "action_step" && ev.step === "error") {
            alert("Install failed: " + ev.detail);
          }
        });
        await poll();
        renderSkills();
      } catch (e) {
        throw new Error(e.message);
      }
    },
  });
}

async function toggleSkill(dir, enabled) {
  try {
    await api("/api/skills/toggle", { body: { name: dir, enabled } });
    await poll();
    renderSkills();
  } catch (e) { alert(e.message); }
}

async function deleteSkill(dir) {
  if (!confirm(`Delete skill '${dir}'?`)) return;
  try {
    await api("/api/skills/delete", { body: { name: dir } });
    await poll();
    renderSkills();
  } catch (e) { alert(e.message); }
}

// ---------- settings ----------

function renderSettings() {
  const panel = $("#themePanel");
  if (!panel.childElementCount) {
    for (const [key, t] of Object.entries(THEMES)) {
      panel.append(h("button", {
        class: "theme-tile", "data-theme": key, title: t.label,
        onclick: () => setTheme(key),
      },
        h("div", { class: "tt-swatch" },
          h("i", { style: `top:0; height:15px; background:${t.bg}` }),
          h("i", { style: `top:15px; height:14px; background:${t.surface}` }),
          h("i", { style: `top:29px; height:9px; background:${t.accent}` })),
        h("div", { class: "tt-name", text: t.label })));
    }
  }
  $$("#themePanel .theme-tile").forEach((t) =>
    t.classList.toggle("active", t.dataset.theme === (state.settings.theme || "dark")));

  if (document.activeElement !== $("#ollamaHost"))
    $("#ollamaHost").value = state.settings.ollama_host || "";
  if (document.activeElement !== $("#mcpTimeout"))
    $("#mcpTimeout").value = state.settings.mcp_timeout ?? 60;
  $("#dataDirText").textContent = state.dataDir || "…";
  $("#sysCounts").textContent = `Casium AI v${state.version} — ${state.models.length} models · ${state.skills.length} skills · ${state.mcp.length} MCP apps`;
  $("#ollamaState").textContent = state.ollamaOnline
    ? `online · v${state.ollamaVersion}`
    : "offline";
}

async function setTheme(name) {
  applyTheme(name);
  try {
    const r = await api("/api/settings", { body: { theme: name } });
    state.settings = r.settings;
  } catch {}
}

async function startOllama() {
  const btn = $("#startOllamaBtn");
  if (btn) btn.disabled = true;
  $("#ollamaState").textContent = "starting…";
  try {
    const r = await api("/api/ollama/start", { body: {} });
    if (!r.ok) $("#ollamaState").textContent = r.detail;
    else $("#ollamaState").textContent = "starting…";
  } catch (e) {
    $("#ollamaState").textContent = e.message;
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    await poll();
    if (state.ollamaOnline) break;
  }
  if (btn) btn.disabled = false;
  if (state.view === "models") renderModels();
}

// ---------- modal ----------

let modalOkHandler = null;

function openModal({ title, fields, ok }) {
  $("#modalTitle").textContent = title;
  const body = $("#modalBody");
  body.innerHTML = "";
  modalOkHandler = null;
  for (const f of fields) {
    if (f.label) body.append(h("div", { class: "f-label", text: f.label }));
    if (f.node) { body.append(f.node); continue; }
    const id = "mcpF_" + f.key;
    if (f.textarea) {
      body.append(h("textarea", { class: "field", id, rows: "3", placeholder: f.placeholder || "", spellcheck: "false" }));
    } else {
      body.append(h("input", { class: "field", id, type: "text", placeholder: f.placeholder || "", spellcheck: "false" }));
    }
    if (f.hint) body.append(h("div", { class: "f-hint", text: f.hint }));
  }
  const vals = () => Object.fromEntries(fields
    .filter((f) => !f.node)
    .map((f) => [f.key, $("#mcpF_" + f.key)?.value ?? ""]));
  modalOkHandler = async () => {
    try {
      await ok(vals());
      closeModal();
    } catch (e) {
      alert(e.message || String(e));
    }
  };
  $("#scrim").style.display = "";
  $("#modal").style.display = "";
  setTimeout(() => { const f = body.querySelector("input, textarea, select"); f?.focus(); }, 30);
}

function closeModal() {
  $("#scrim").style.display = "none";
  $("#modal").style.display = "none";
}

// ---------- context menu ----------

function showCtx(x, y, items) {
  const ctx = $("#ctx");
  ctx.innerHTML = "";
  for (const it of items) {
    if (it.sep) { ctx.append(h("div", { class: "ctx-sep" })); continue; }
    ctx.append(h("button", {
      class: "ctx-item" + (it.danger ? " danger" : ""),
      onclick: () => { hideCtx(); it.fn(); },
    }, h("svg", { class: "ic" }, h("use", { href: it.icon || "#i-chev-r" })), h("span", { text: it.label })));
  }
  ctx.style.display = "";
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
  ctx.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
}
function hideCtx() { $("#ctx").style.display = "none"; }

// ---------- wiring ----------

function wire() {
  $$("#rail .rail-btn").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));

  $("#newChatBtn").onclick = newChat;
  $("#sendBtn").onclick = send;

  const input = $("#chatInput");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  });

  $("#chipMcp").classList.add("on");
  $("#chipSkills").classList.add("on");
  $("#chipMcp").onclick = () => {
    const on = $("#chipMcp").classList.toggle("on");
    state.chips.mcp = on;
  };
  $("#chipSkills").onclick = () => {
    const on = $("#chipSkills").classList.toggle("on");
    state.chips.skills = on;
  };

  // model picker
  $("#modelPicker").onclick = (e) => {
    e.stopPropagation();
    if ($("#modelDrop").classList.contains("open")) closeModelDrop();
    else openModelDrop();
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#modelDrop") && !e.target.closest("#modelPicker")) closeModelDrop();
    hideCtx();
  });

  // config panel
  $("#cfgToggle").onclick = () => {
    state.cfgOpen = !state.cfgOpen;
    $("#cfgPanel").hidden = !state.cfgOpen;
    $("#cfgToggle").classList.toggle("active", state.cfgOpen);
    if (state.cfgOpen) loadCfgPanel();
  };
  $("#cfgClose").onclick = () => {
    state.cfgOpen = false;
    $("#cfgPanel").hidden = true;
    $("#cfgToggle").classList.remove("active");
  };
  $("#cfgTemp").addEventListener("input", () => {
    $("#cfgTempVal").textContent = Number($("#cfgTemp").value).toFixed(2).replace(/0$/, "");
    saveCfg();
  });
  $("#cfgMaxOn").addEventListener("change", () => {
    $("#cfgMax").disabled = !$("#cfgMaxOn").checked;
    saveCfg();
  });
  $("#cfgMax").addEventListener("input", () => {
    $("#cfgMaxVal").textContent = $("#cfgMax").value;
    saveCfg();
  });
  $("#cfgSystem").addEventListener("change", saveCfg);
  $("#cfgTools").addEventListener("change", saveCfg);

  // models
  $("#pullSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const v = e.target.value;
      e.target.value = "";
      startPull(v);
    }
  });

  // mcp / skills
  $("#addMcpBtn").onclick = openMcpModal;
  $("#addSkillBtn").onclick = openSkillModal;

  // settings
  $("#saveOllama").onclick = async () => {
    try {
      const r = await api("/api/settings", { body: { ollama_host: $("#ollamaHost").value.trim() } });
      state.settings = r.settings;
      renderSettings();
    } catch (e) { alert(e.message); }
  };
  $("#testOllama").onclick = async () => {
    $("#ollamaState").textContent = "testing…";
    await poll();
  };
  $("#startOllamaBtn").onclick = startOllama;
  $("#sbStartOllama").onclick = startOllama;
  $("#mcpTimeout").addEventListener("change", async () => {
    const v = Math.max(5, Math.min(600, parseInt($("#mcpTimeout").value || "60", 10)));
    const r = await api("/api/settings", { body: { mcp_timeout: v } });
    state.settings = r.settings;
  });
  $("#copyDataDir").onclick = async () => {
    try { await navigator.clipboard.writeText(state.dataDir); } catch {}
  };

  // modal
  $("#modalOk").onclick = () => modalOkHandler && modalOkHandler();
  $("#modalCancel").onclick = closeModal;
  $("#scrim").onclick = closeModal;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hideCtx(); if ($("#modal").style.display !== "none") closeModal(); }
  });
}

// ---------- boot ----------

async function boot() {
  wire();
  try {
    const st = await api("/api/status");
    state.settings = { ...state.settings, ...st.settings };
  } catch {}
  applyTheme(state.settings.theme || "dark");
  await poll();
  setInterval(poll, 3000);
}

boot();
