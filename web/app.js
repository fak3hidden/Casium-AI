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

const clock = () => new Date().toLocaleTimeString([], { hour12: false });

// ---------- state ----------

const THEMES = {
  paper:    { label: "Paper",    bg: "#F2F3F5", surface: "#FFFFFF", accent: "#2F3541" },
  volt:     { label: "Volt",     bg: "#0B0910", surface: "#130F1C", accent: "#8B5CF6" },
  ember:    { label: "Ember",    bg: "#141210", surface: "#1B1815", accent: "#F59E0B" },
  graphite: { label: "Graphite", bg: "#151618", surface: "#1C1D20", accent: "#E6E7EA" },
  nord:     { label: "Nord",     bg: "#242933", surface: "#2E3440", accent: "#88C0D0" },
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
  view: "start",          // start | chat | settings
  activeChatId: null,
  activeChat: null,
  sending: false,
  filter: "",
  consoleTab: "console",
  consoleOpen: true,
  logs: [],               // {t, msg, cls}
  activity: [],
  pullProgress: {},       // model name -> {completed, total, status}
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

// ---------- console ----------

function addLog(msg, cls = "") {
  state.logs.push({ t: clock(), msg, cls });
  if (state.logs.length > 800) state.logs.shift();
  renderConsole();
}

function addActivity(msg, cls = "") {
  state.activity.push({ t: clock(), msg, cls });
  if (state.activity.length > 400) state.activity.shift();
  if (state.consoleTab === "activity") renderConsole();
}

function renderConsole() {
  const body = state.consoleTab === "console" ? $("#consoleBody") : $("#activityBody");
  if (!body) return;
  const lines = (state.consoleTab === "console" ? state.logs : state.activity).slice(-300);
  body.innerHTML = lines.map((l) =>
    `<div class="log-line ${esc(l.cls)}"><span class="lt">${esc(l.t)}</span><span class="lm">${esc(l.msg)}</span></div>`
  ).join("");
  body.scrollTop = body.scrollHeight;
}

// ---------- theme ----------

function applyTheme(name) {
  document.documentElement.dataset.theme = THEMES[name] ? name : "paper";
  $("#sbTheme").textContent = THEMES[name] ? THEMES[name].label : "Paper";
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
  // lists
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
  // paragraphs
  s = s.split(/\n{2,}/).map((chunk) => {
    const c = chunk.trim();
    if (!c) return "";
    if (/^<(pre|ul|ol|h3)/.test(c)) return c;
    return `<p>${c.replace(/\n/g, "<br>")}</p>`;
  }).join("");
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
  return s;
}

// ---------- status polling ----------

let lastStatusKey = "";

async function poll() {
  let st;
  try {
    st = await api("/api/status");
  } catch {
    state.ollamaOnline = false;
    renderStatusbar();
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

  const key = JSON.stringify([
    state.ollamaOnline,
    state.models.map((m) => m.name),
    state.mcp.map((m) => [m.name, m.state, m.tools]),
    state.skills.map((s) => [s.dir, s.enabled]),
  ]);
  const structural = key !== lastStatusKey;
  if (structural) lastStatusKey = key;

  if (structural || !wasOnline !== !state.ollamaOnline) {
    if (!wasOnline && state.ollamaOnline) addLog(`Ollama online (v${state.ollamaVersion})`, "ok");
    if (wasOnline && !state.ollamaOnline) addLog("Ollama went offline", "warn");
  }
  renderStatusbar();
  renderStart();
  renderSidebar();
  renderTabs();
  renderModelSelect();
  renderSettings();
}

// ---------- status bar / start ----------

function renderStatusbar() {
  const viewName = state.view === "start" ? "Start"
    : state.view === "settings" ? "Settings"
    : (state.activeChat?.title || "Chat");
  $("#sbView").textContent = viewName;
  const model = state.activeChat?.model || state.settings.default_model || "";
  $("#sbModel").textContent = model ? `· ${model}` : "";
  const dot = $("#sbDot");
  dot.className = "dot " + (state.ollamaOnline ? "ok" : "err");
  $("#sbStatus").textContent = state.ollamaOnline
    ? `Ollama online · ${state.models.length} model${state.models.length === 1 ? "" : "s"}`
    : "Ollama offline";
}

function renderStart() {
  const sub = $("#startSub");
  if (state.ollamaOnline) {
    sub.innerHTML = `Ollama <b>online</b> · ${state.models.length} model${state.models.length === 1 ? "" : "s"} · `
      + `${state.skills.filter((s) => s.enabled).length} skill${state.skills.filter((s) => s.enabled).length === 1 ? "" : "s"} · `
      + `${state.mcp.filter((m) => m.state === "running").length} MCP app${state.mcp.filter((m) => m.state === "running").length === 1 ? "" : "s"} running`;
  } else {
    sub.innerHTML = `<b>Ollama is offline</b> — start it with <code class="mono">ollama serve</code>, everything else works without it.`;
  }

  const list = $("#recentList");
  list.innerHTML = "";
  const empty = $("#recentEmpty");
  const chats = state.chats.slice(0, 8);
  if (!chats.length) empty.style.display = "";
  else empty.style.display = "none";
  for (const c of chats) {
    const when = new Date((c.updated || 0) * 1000).toLocaleDateString([], { month: "short", day: "numeric" });
    list.append(h("button", { class: "recent-item", onclick: () => openChat(c.id) },
      h("svg", { class: "ic" }, h("use", { href: "#i-chat" })),
      h("span", { class: "ri-title", text: c.title }),
      h("span", { class: "ri-meta", text: when })
    ));
  }
}

// ---------- sidebar ----------

function humanSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(1) + " GB";
}

function renderSidebar() {
  const f = state.filter.toLowerCase();
  renderModelsSection(f);
  renderMcpSection(f);
  renderSkillsSection(f);
  applySectionFilter();
}

function applySectionFilter() {
  $$(".side-section").forEach((sec) => {
    const name = sec.dataset.section;
    const visible = $(`#${name === "models" ? "modelsList" : name === "mcp" ? "mcpList" : "skillsList"}`)
      ?.children.length > 0;
    sec.classList.toggle("filtered-out", !visible);
  });
}

function sideRow({ icon, dot, name, meta, disabled, onclick, onctx, actions }) {
  const row = h("button", {
    class: "side-row" + (disabled ? " disabled-row" : ""),
    onclick,
    oncontextmenu: (e) => { e.preventDefault(); onctx && onctx(e); },
  });
  if (dot) row.append(h("span", { class: "dot " + dot }));
  row.append(h("span", { class: "row-name", text: name, title: name }));
  if (meta) row.append(h("span", { class: "row-meta", text: meta }));
  for (const a of actions || []) {
    row.append(h("span", {
      class: "ibtn ibtn-sm ibtn-dim", title: a.title,
      onclick: (e) => { e.stopPropagation(); a.fn(); },
    }, h("svg", { class: "ic" }, h("use", { href: a.icon }))));
  }
  return row;
}

function renderModelsSection(f) {
  const list = $("#modelsList");
  list.innerHTML = "";
  const models = state.models.filter((m) => !f || m.name.toLowerCase().includes(f));
  const pulls = Object.entries(state.pullProgress)
    .filter(([n]) => !f || n.toLowerCase().includes(f));
  $("#modelsEmpty").style.display = (!models.length && !pulls.length) ? "" : "none";

  for (const [name, p] of pulls) {
    const pct = p.total ? Math.min(100, (p.completed / p.total) * 100) : 0;
    const row = h("button", { class: "side-row" },
      h("span", { class: "dot warn" }),
      h("span", { class: "row-name", text: name }),
      h("span", { class: "progress" }, h("i", { style: `width:${pct.toFixed(0)}%` }))
    );
    list.append(row);
  }

  for (const m of models) {
    list.append(sideRow({
      dot: state.ollamaOnline ? "ok" : "",
      name: m.name,
      meta: humanSize(m.size),
      onclick: () => selectModel(m.name),
      onctx: (e) => showCtx(e.clientX, e.clientY, [
        { label: "Set as chat model", icon: "#i-box", fn: () => selectModel(m.name) },
        { sep: true },
        { label: "Delete model", icon: "#i-trash", danger: true, fn: () => deleteModel(m.name) },
      ]),
      actions: [{ icon: "#i-trash", title: "Delete model", fn: () => deleteModel(m.name) }],
    }));
  }
}

function renderMcpSection(f) {
  const list = $("#mcpList");
  list.innerHTML = "";
  const servers = state.mcp.filter((m) => !f || m.name.toLowerCase().includes(f));
  $("#mcpEmpty").style.display = servers.length ? "none" : "";
  for (const m of servers) {
    const dot = m.state === "running" ? "ok" : m.state === "starting" ? "warn" : m.state === "error" ? "err" : "";
    const meta = m.state === "running" ? `${m.tools} tools`
      : m.state === "starting" ? "starting…"
      : m.state === "error" ? (m.error || "error")
      : "stopped";
    list.append(sideRow({
      dot,
      name: m.name,
      meta,
      onclick: () => toggleMcp(m.name),
      onctx: (e) => showCtx(e.clientX, e.clientY, [
        { label: m.state === "running" ? "Stop" : "Start", icon: "#i-power", fn: () => toggleMcp(m.name) },
        { label: "View tools", icon: "#i-book", fn: () => viewMcpTools(m.name) },
        { sep: true },
        { label: "Delete app", icon: "#i-trash", danger: true, fn: () => deleteMcp(m.name) },
      ]),
      actions: [{
        icon: m.state === "running" ? "#i-close" : "#i-power",
        title: m.state === "running" ? "Stop" : "Start",
        fn: () => toggleMcp(m.name),
      }],
    }));
  }
}

function renderSkillsSection(f) {
  const list = $("#skillsList");
  list.innerHTML = "";
  const skills = state.skills.filter((s) => !f ||
    (s.name + " " + s.description).toLowerCase().includes(f));
  $("#skillsEmpty").style.display = skills.length ? "none" : "";
  for (const s of skills) {
    list.append(sideRow({
      dot: s.enabled ? "ok" : "",
      name: s.name,
      meta: humanSize(s.size),
      disabled: !s.enabled,
      onclick: () => toggleSkill(s.dir, !s.enabled),
      onctx: (e) => showCtx(e.clientX, e.clientY, [
        { label: s.enabled ? "Disable" : "Enable", icon: "#i-power", fn: () => toggleSkill(s.dir, !s.enabled) },
        { sep: true },
        { label: "Delete skill", icon: "#i-trash", danger: true, fn: () => deleteSkill(s.dir) },
      ]),
      actions: [{ icon: "#i-trash", title: "Delete skill", fn: () => deleteSkill(s.dir) }],
    }));
  }
}

// ---------- tabs ----------

function renderTabs() {
  const strip = $("#tabstrip");
  strip.innerHTML = "";
  for (const c of state.chats) {
    const active = c.id === state.activeChatId && state.view === "chat";
    const tab = h("div", {
      class: "tab" + (active ? " active" : ""),
      onclick: () => openChat(c.id),
      ondblclick: (e) => { e.preventDefault(); renameChat(c.id); },
      oncontextmenu: (e) => { e.preventDefault(); showCtx(e.clientX, e.clientY, [
        { label: "Close tab", icon: "#i-close", fn: () => closeChat(c.id) },
        { sep: true },
        { label: "Delete chat", icon: "#i-trash", danger: true, fn: () => deleteChat(c.id) },
      ]); },
    },
      h("span", { class: "tab-title", text: c.title, title: c.title }),
      h("span", {
        class: "ibtn ibtn-dim", title: "Close",
        onclick: (e) => { e.stopPropagation(); closeChat(c.id); },
      }, h("svg", { class: "ic" }, h("use", { href: "#i-close" }))));
    strip.append(tab);
  }
}

// ---------- views ----------

function switchView(view) {
  state.view = view;
  $("#startView").style.display = view === "start" ? "" : "none";
  $("#chatView").style.display = view === "chat" ? "flex" : "none";
  $("#settingsView").style.display = view === "settings" ? "" : "none";
  if (view === "settings") renderSettings();
  renderStatusbar();
  renderTabs();
}

// ---------- chat ----------

function selectModel(name) {
  const sel = $("#modelSelect");
  if (![...sel.options].some((o) => o.value === name)) return;
  sel.value = name;
  if (state.activeChat) state.activeChat.model = name;
  addLog(`Model: ${name}`, "accent");
}

function renderModelSelect() {
  const sel = $("#modelSelect");
  const keep = sel.value;
  sel.innerHTML = "";
  if (!state.models.length) {
    sel.append(h("option", { value: "", disabled: true, selected: true, text: "no models — pull one" }));
    sel.disabled = true;
    $("#chatModelLabel").textContent = "no model";
    return;
  }
  sel.disabled = false;
  for (const m of state.models) {
    sel.append(h("option", { value: m.name, text: m.name }));
  }
  const want = keep && state.models.some((m) => m.name === keep)
    ? keep
    : (state.settings.default_model && state.models.some((m) => m.name === state.settings.default_model)
      ? state.settings.default_model
      : state.models[0].name);
  sel.value = want;
  $("#chatModelLabel").textContent = want;
}

function emptyHint() {
  return h("div", { class: "caption", style: "padding:24px 4px" },
    "Say something — or put the AI to work:",
    h("div", { class: "mono", style: "margin-top:6px; color:var(--accent-text)" },
      "Install this skill for me https://github.com/nvidia/skills"));
}

function renderChatMessages(chat) {
  const inner = $("#chatInner");
  inner.innerHTML = "";
  if (!chat.messages.length) {
    inner.append(emptyHint());
    return;
  }
  for (const m of chat.messages) appendMessageEl(m, false);
  scrollToBottom(true);
}

function appendMessageEl(m, live) {
  const inner = $("#chatInner");
  const hint = inner.querySelector(".caption");
  if (hint) hint.remove();

  const wrap = h("div", { class: "msg " + (m.role === "user" ? "user" : "ai"), "data-role": m.role });
  const who = m.role === "user" ? "You" : "Casium";
  wrap.append(h("div", { class: "who", text: who }));

  if (m.role === "user") {
    wrap.append(h("div", { class: "bubble", text: m.content }));
  } else {
    const content = h("div", { class: "content" });
    content.innerHTML = md(m.content);
    wrap.append(content);
    for (const a of m.actions || []) {
      wrap.append(toolChip(`install ${a.url || a.name}`, a.installed ? `installed ${a.installed.join(", ")}` : a.error || "working…",
        a.installed ? "ok" : a.error ? "err" : ""));
    }
    for (const tc of m.tool_calls || []) {
      wrap.append(toolChip(`${tc.server}.${tc.tool}(${jsonShort(tc.args)})`,
        tc.ok == null ? "running…" : tc.ok ? "done" : "failed", tc.ok == null ? "" : tc.ok ? "ok" : "err"));
    }
    if (live && state.sending) content.append(h("span", { class: "caret" }));
  }
  inner.append(wrap);
  return wrap;
}

function toolChip(title, detail, cls) {
  const el = h("div", { class: "toolchip " + cls });
  el.append(h("span", { class: "tc-mark", text: cls === "err" ? "✗" : cls === "ok" ? "✓" : "›" }));
  el.append(h("span", { text: `${title} — ${detail}` }));
  return el;
}

function jsonShort(obj) {
  try {
    const s = JSON.stringify(obj || {});
    return s.length > 90 ? s.slice(0, 87) + "…" : s;
  } catch { return ""; }
}

function scrollToBottom(force) {
  const sc = $("#chatScroll");
  if (force || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 80) sc.scrollTop = sc.scrollHeight;
}

async function newChat() {
  let chat;
  try {
    chat = (await api("/api/chats/new", { body: {} })).chat;
  } catch (e) {
    addLog("new chat failed: " + e.message, "err");
    return;
  }
  state.chats.unshift(chat);
  state.activeChatId = chat.id;
  state.activeChat = { ...chat, messages: [], model: "" };
  state.activity = [];
  switchView("chat");
  renderChatMessages(state.activeChat);
  renderTabs();
  renderStart();
  $("#chatInput").focus();
}

async function openChat(id) {
  try {
    const data = await api(`/api/chats/${encodeURIComponent(id)}`);
    state.activeChat = data.chat;
    state.activeChatId = id;
    state.activity = [];
    switchView("chat");
    renderChatMessages(data.chat);
    renderTabs();
    renderStatusbar();
    $("#chatInput").focus();
  } catch (e) {
    addLog("open chat failed: " + e.message, "err");
  }
}

function closeChat(id) {
  if (state.view === "chat" && state.activeChatId === id) {
    state.activeChat = null;
    state.activeChatId = null;
    switchView("start");
  }
  renderTabs();
}

async function deleteChat(id) {
  try {
    await api("/api/chats/delete", { body: { id } });
  } catch (e) {
    addLog("delete chat failed: " + e.message, "err");
  }
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.activeChatId === id) {
    state.activeChat = null;
    state.activeChatId = null;
    switchView("start");
  }
  renderTabs();
  renderStart();
}

async function renameChat(id) {
  const chat = state.chats.find((c) => c.id === id);
  const title = prompt("Rename chat:", chat?.title || "");
  if (!title || title === chat.title) return;
  try {
    await api("/api/chats/rename", { body: { id, title } });
    if (chat) chat.title = title.slice(0, 48);
    if (state.activeChat?.id === id) state.activeChat.title = title.slice(0, 48);
    renderTabs();
    renderStart();
  } catch (e) {
    addLog("rename failed: " + e.message, "err");
  }
}

async function send() {
  if (state.sending) return;
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  const model = $("#modelSelect").value;
  if (!model && state.models.length) return;

  if (!state.activeChat) {
    const chat = (await api("/api/chats/new", { body: {} })).chat;
    state.chats.unshift(chat);
    state.activeChat = { ...chat, messages: [] };
    state.activeChatId = chat.id;
  }
  switchView("chat");

  const userMsg = { role: "user", content: text };
  state.activeChat.messages.push(userMsg);
  appendMessageEl(userMsg, false);

  const aiMsg = { role: "assistant", content: "" };
  state.activeChat.messages.push(aiMsg);
  const wrap = appendMessageEl(aiMsg, true);

  state.sending = true;
  $("#sendBtn").disabled = true;
  input.value = "";
  input.style.height = "auto";
  scrollToBottom(true);

  const contentEl = wrap.querySelector(".content");
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
      model,
      message: text,
      mcp: $("#mcpSwitch").checked,
      skills: $("#skillsSwitch").checked,
    }, (ev) => {
      switch (ev.type) {
        case "token":
          pending += ev.text;
          if (!raf) raf = requestAnimationFrame(flush);
          break;
        case "action":
          addActivity(`app action: ${ev.name} ${jsonShort(ev.args)}`, "accent");
          break;
        case "action_step": {
          const detail = `${ev.name}: ${ev.step}${ev.detail ? " — " + ev.detail : ""}`;
          addLog(detail, ev.step === "error" ? "err" : ev.step === "done" ? "ok" : "");
          addActivity(detail, ev.step === "error" ? "err" : ev.step === "done" ? "ok" : "accent");
          break;
        }
        case "action_done":
          break;
        case "tool":
          addActivity(`mcp call: ${ev.server}.${ev.tool} ${jsonShort(ev.args)}`, "accent");
          break;
        case "tool_done":
          addActivity(`mcp result: ${ev.ok ? "ok" : "error"} ${(ev.preview || "").slice(0, 120)}`, ev.ok ? "ok" : "err");
          break;
        case "offline":
          addLog(ev.message, "warn");
          break;
        case "error":
          addLog(ev.message, "err");
          aiMsg.content += `\n\n[error] ${ev.message}`;
          if (!raf) raf = requestAnimationFrame(flush);
          break;
        case "done": {
          if (!raf) raf = requestAnimationFrame(flush);
          state.activeChat.model = ev.model || model;
          state.activeChat.title = ev.title || state.activeChat.title;
          if (ev.model) $("#chatModelLabel").textContent = ev.model;
          const meta = state.chats.find((c) => c.id === state.activeChatId);
          if (meta) { meta.title = ev.title || meta.title; meta.model = ev.model || model; }
          renderTabs();
          renderStart();
          break;
        }
      }
    });
  } catch (e) {
    addLog("chat failed: " + e.message, "err");
    aiMsg.content += `\n\n[error] ${e.message}`;
    if (!raf) raf = requestAnimationFrame(flush);
  } finally {
    state.sending = false;
    $("#sendBtn").disabled = false;
    wrap.querySelector(".caret")?.remove();
    contentEl.innerHTML = md(aiMsg.content);
    scrollToBottom(true);
    poll();
  }
}

// ---------- models ----------

function openPullModal() {
  openModal({
    title: "Pull a model",
    fields: [
      { key: "name", label: "Model name", placeholder: "llama3.2, qwen3:4b, mistral-nemo…" },
    ],
    hint: "Names come from the Ollama library (ollama.com/library).",
    ok: async (vals) => {
      const name = vals.name.trim();
      if (!name) throw new Error("enter a model name");
      state.pullProgress[name] = { completed: 0, total: 0, status: "starting" };
      renderSidebar();
      addLog(`pulling ${name}…`);
      try {
        await streamNDJSON("/api/models/pull", { name }, (ev) => {
          if (ev.status && ev.status !== "success") {
            state.pullProgress[name] = { completed: ev.completed || 0, total: ev.total || 0, status: ev.status };
            addLog(`${name}: ${ev.status} ${Math.round((ev.completed || 0) / 1048576)} / ${Math.round((ev.total || 0) / 1048576)} MB`);
            renderSidebar();
          }
          if (ev.status === "success") {
            addLog(`${name} installed`, "ok");
            delete state.pullProgress[name];
            renderSidebar();
          }
        });
        await poll();
      } catch (e) {
        addLog(`pull failed: ${e.message}`, "err");
        delete state.pullProgress[name];
        renderSidebar();
      }
    },
  });
}

async function deleteModel(name) {
  if (!confirm(`Delete model ${name}?`)) return;
  try {
    await api("/api/models/delete", { body: { name } });
    addLog(`deleted ${name}`, "ok");
    await poll();
  } catch (e) {
    addLog("delete failed: " + e.message, "err");
  }
}

// ---------- mcp ----------

const MCP_PRESETS = {
  github: {
    label: "GitHub",
    command: "npx",
    args: "-y @modelcontextprotocol/server-github",
    env: "GITHUB_PERSONAL_ACCESS_TOKEN=",
    note: "Repositories, issues, pull requests. Needs a GitHub token (fine-grained, contents+issues).",
  },
  filesystem: {
    label: "Filesystem",
    command: "npx",
    args: "-y @modelcontextprotocol/server-filesystem",
    env: "ALLOWED_DIR=",
    note: "Read/write files in one allowed directory. Set ALLOWED_DIR to the path.",
  },
  fetch: {
    label: "Fetch",
    command: "uvx",
    args: "mcp-server-fetch",
    env: "",
    note: "Fetch a URL and read it as markdown. Needs uv (pipx works too: pipx run mcp-server-fetch).",
  },
  time: {
    label: "Time",
    command: "uvx",
    args: "mcp-server-time",
    env: "",
    note: "Current time and timezone lookups.",
  },
};

function openMcpModal() {
  const presetSel = h("select", { class: "field", id: "mcpPreset" },
    h("option", { value: "", selected: true, text: "Custom…" }),
    ...Object.entries(MCP_PRESETS).map(([k, p]) => h("option", { value: k, text: p.label })));
  presetSel.onchange = () => {
    const p = MCP_PRESETS[presetSel.value];
    if (!p) return;
    $("#mcpF_name").value = k0(presetSel.value);
    $("#mcpF_command").value = p.command;
    $("#mcpF_args").value = p.args;
    $("#mcpF_env").value = p.env;
  };
  function k0(v) { return { github: "github", filesystem: "filesystem", fetch: "fetch", time: "time" }[v] || v; }

  openModal({
    title: "Add an MCP app",
    fields: [
      { key: "_preset", label: "Start from a preset", node: presetSel },
      { key: "name", label: "Name", placeholder: "github" },
      { key: "command", label: "Command", placeholder: "npx", hint: "The executable that starts the server." },
      { key: "args", label: "Arguments", placeholder: "-y @modelcontextprotocol/server-github" },
      { key: "env", label: "Environment (one KEY=VALUE per line)", placeholder: "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_…", textarea: true },
    ],
    ok: async (vals) => {
      const env = {};
      (vals.env || "").split("\n").forEach((line) => {
        const i = line.indexOf("=");
        if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      await api("/api/mcp/add", { body: {
        name: vals.name,
        command: vals.command,
        args: vals.args || "",
        env,
      }});
      addLog(`MCP app '${vals.name}' added — starting…`);
      await api("/api/mcp/start", { body: { name: vals.name } });
      await poll();
    },
  });
}

async function toggleMcp(name) {
  const m = state.mcp.find((x) => x.name === name);
  if (!m) return;
  try {
    if (m.state === "running") {
      await api("/api/mcp/stop", { body: { name } });
      addLog(`stopped ${name}`, "ok");
    } else {
      addLog(`starting ${name}…`);
      await api("/api/mcp/start", { body: { name } });
    }
  } catch (e) {
    addLog(`${name}: ${e.message}`, "err");
  }
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    await poll();
    const cur = state.mcp.find((x) => x.name === name);
    if (cur && (cur.state === "running" || cur.state === "error")) break;
  }
}

async function viewMcpTools(name) {
  const m = state.mcp.find((x) => x.name === name);
  if (!m || m.state !== "running") {
    addLog(`${name} is not running`, "warn");
    return;
  }
  addLog(`${name}: ${m.tools} tools available (used automatically in chat when MCP is on)`, "accent");
}

async function deleteMcp(name) {
  if (!confirm(`Delete MCP app '${name}'?`)) return;
  try {
    await api("/api/mcp/stop", { body: { name } });
    await api("/api/mcp/delete", { body: { name } });
    addLog(`deleted MCP app ${name}`, "ok");
    await poll();
  } catch (e) {
    addLog("delete failed: " + e.message, "err");
  }
}

// ---------- skills ----------

function openSkillModal() {
  openModal({
    title: "Install a skill from a link",
    fields: [
      { key: "url", label: "Repository URL", placeholder: "https://github.com/nvidia/skills", hint: "Anything git can clone. Every SKILL.md in the repo becomes a skill. You can also just ask the AI in a chat: 'Install this skill for me [link]'." },
    ],
    ok: async (vals) => {
      const url = vals.url.trim();
      if (!url) throw new Error("enter a URL");
      addLog(`installing skill(s) from ${url}…`);
      try {
        await streamNDJSON("/api/skills/install", { url }, (ev) => {
          if (ev.type === "action_step") {
            addLog(`skill: ${ev.step}${ev.detail ? " — " + ev.detail : ""}`,
              ev.step === "error" ? "err" : ev.step === "done" ? "ok" : "");
          }
        });
        await poll();
      } catch (e) {
        addLog("install failed: " + e.message, "err");
      }
    },
  });
}

async function toggleSkill(dir, enabled) {
  try {
    await api("/api/skills/toggle", { body: { name: dir, enabled } });
    addLog(`skill ${dir} ${enabled ? "enabled" : "disabled"}`, "ok");
    await poll();
  } catch (e) {
    addLog(e.message, "err");
  }
}

async function deleteSkill(dir) {
  if (!confirm(`Delete skill '${dir}'?`)) return;
  try {
    await api("/api/skills/delete", { body: { name: dir } });
    addLog(`deleted skill ${dir}`, "ok");
    await poll();
  } catch (e) {
    addLog(e.message, "err");
  }
}

// ---------- settings ----------

function renderSettings() {
  const panel = $("#themePanel");
  if (!panel.childElementCount) {
    for (const [key, t] of Object.entries(THEMES)) {
      const tile = h("button", { class: "theme-tile", "data-theme": key, title: t.label,
        onclick: () => setTheme(key) },
        h("div", { class: "tt-swatch" },
          h("i", { style: `top:0; height:14px; background:${t.bg}` }),
          h("i", { style: `top:14px; height:12px; background:${t.surface}` }),
          h("i", { style: `top:26px; height:8px; background:${t.accent}` })),
        h("div", { class: "tt-name", text: t.label }));
      panel.append(tile);
    }
  }
  $$(".theme-tile", panel).forEach((t) =>
    t.classList.toggle("active", t.dataset.theme === state.settings.theme));

  // don't clobber fields the user is currently typing in
  if (document.activeElement !== $("#ollamaHost"))
    $("#ollamaHost").value = state.settings.ollama_host || "";
  if (document.activeElement !== $("#mcpTimeout"))
    $("#mcpTimeout").value = state.settings.mcp_timeout ?? 60;
  $("#dataDirText").textContent = state.dataDir || "…";
  $("#sysVersion").textContent = `Casium AI v${state.version}`;
  $("#sysCounts").textContent = `${state.models.length} models · ${state.skills.length} skills · ${state.mcp.length} MCP apps`;
}

async function setTheme(name) {
  applyTheme(name);
  try {
    await api("/api/settings", { body: { theme: name } });
    state.settings.theme = name;
    $$("#themePanel .theme-tile").forEach((t) =>
      t.classList.toggle("active", t.dataset.theme === name));
  } catch (e) {
    addLog("save theme failed: " + e.message, "err");
  }
}

// ---------- modal ----------

let modalOkHandler = null;

function openModal({ title, fields, hint, ok }) {
  $("#modalTitle").textContent = title;
  const body = $("#modalBody");
  body.innerHTML = "";
  modalOkHandler = null;

  for (const f of fields) {
    if (f.label) body.append(h("div", { class: "f-label", text: f.label }));
    if (f.node) {
      body.append(f.node);
      continue;
    }
    const id = "mcpF_" + f.key;
    if (f.textarea) {
      const ta = h("textarea", { class: "field", id, rows: "3", placeholder: f.placeholder || "", spellcheck: "false" });
      body.append(ta);
    } else {
      body.append(h("input", { class: "field", id, type: "text", placeholder: f.placeholder || "", spellcheck: "false" }));
    }
  }
  if (hint) body.append(h("div", { class: "f-hint", text: hint }));

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
  setTimeout(() => { const first = body.querySelector("input, textarea, select"); first?.focus(); }, 30);
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
    }, h("svg", { class: "ic" }, h("use", { href: it.icon || "#i-chevron-r" })), h("span", { text: it.label })));
  }
  ctx.style.display = "";
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
  ctx.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
}

function hideCtx() { $("#ctx").style.display = "none"; }

// ---------- console commands ----------

async function handleCommand(raw) {
  const cmd = raw.trim();
  if (!cmd) return;
  addLog(`› ${cmd}`, "accent");
  if (!cmd.startsWith("/")) {
    addLog("commands start with / — try /help", "warn");
    return;
  }
  const [name, ...rest] = cmd.slice(1).split(/\s+/);
  const arg = rest.join(" ");
  switch (name) {
    case "help":
      addLog("/models            list installed models");
      addLog("/pull <name>       pull a model from the Ollama library");
      addLog("/rm <name>         delete a model");
      addLog("/skills            list skills");
      addLog("/install <url>     install skills from a git URL");
      addLog("/mcp               list MCP apps");
      addLog("/theme <name>      paper, volt, ember, graphite, nord");
      addLog("/settings          open settings");
      addLog("/status            app + ollama status");
      break;
    case "status":
      addLog(`Casium AI v${state.version} · ollama ${state.ollamaOnline ? "online" + (state.ollamaVersion ? " v" + state.ollamaVersion : "") : "offline"} · ${state.models.length} models · ${state.skills.length} skills · ${state.mcp.length} mcp`, "ok");
      break;
    case "models": {
      if (!state.models.length) addLog("no models installed — /pull llama3.2", "warn");
      for (const m of state.models) addLog(`  ${m.name}  (${humanSize(m.size)})`);
      break;
    }
    case "pull": {
      if (!arg) { addLog("usage: /pull <name>", "warn"); break; }
      state.pullProgress[arg] = { completed: 0, total: 0, status: "starting" };
      renderSidebar();
      try {
        await streamNDJSON("/api/models/pull", { name: arg }, (ev) => {
          if (ev.status && ev.status !== "success") {
            state.pullProgress[arg] = { completed: ev.completed || 0, total: ev.total || 0, status: ev.status };
            addLog(`${arg}: ${ev.status} ${Math.round((ev.completed || 0) / 1048576)}/${Math.round((ev.total || 0) / 1048576)} MB`);
            renderSidebar();
          }
          if (ev.status === "success") { addLog(`${arg} installed`, "ok"); delete state.pullProgress[arg]; renderSidebar(); }
        });
        await poll();
      } catch (e) {
        addLog("pull failed: " + e.message, "err");
        delete state.pullProgress[arg];
        renderSidebar();
      }
      break;
    }
    case "rm":
      if (!arg) { addLog("usage: /rm <name>", "warn"); break; }
      deleteModel(arg);
      break;
    case "skills": {
      if (!state.skills.length) addLog("no skills installed", "warn");
      for (const s of state.skills) addLog(`  ${s.enabled ? "•" : "○"} ${s.name} — ${s.description.slice(0, 70)}`);
      break;
    }
    case "install": {
      if (!arg) { addLog("usage: /install <git url>", "warn"); break; }
      try {
        await streamNDJSON("/api/skills/install", { url: arg }, (ev) => {
          if (ev.type === "action_step") addLog(`skill: ${ev.step}${ev.detail ? " — " + ev.detail : ""}`,
            ev.step === "error" ? "err" : ev.step === "done" ? "ok" : "");
        });
        await poll();
      } catch (e) {
        addLog("install failed: " + e.message, "err");
      }
      break;
    }
    case "mcp": {
      if (!state.mcp.length) addLog("no MCP apps — use the + in the sidebar", "warn");
      for (const m of state.mcp) addLog(`  ${m.state === "running" ? "•" : m.state === "starting" ? "…" : "○"} ${m.name} — ${m.state}${m.state === "running" ? ` (${m.tools} tools)` : ""}`);
      break;
    }
    case "theme": {
      const t = (arg || "").toLowerCase();
      if (!THEMES[t]) { addLog("themes: " + Object.keys(THEMES).join(", "), "warn"); break; }
      setTheme(t);
      addLog(`theme: ${THEMES[t].label}`, "ok");
      break;
    }
    case "settings":
      switchView("settings");
      break;
    default:
      addLog(`unknown command /${name} — try /help`, "warn");
  }
}

// ---------- wiring ----------

function wire() {
  $("#newChatBtn").onclick = newChat;
  $("#settingsBtn").onclick = () => switchView("settings");
  $("#sendBtn").onclick = send;

  const input = $("#chatInput");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  });

  const cmd = $("#cmdInput");
  cmd.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const v = cmd.value; cmd.value = ""; handleCommand(v); }
  });

  $("#filterBox").addEventListener("input", (e) => {
    state.filter = e.target.value;
    renderSidebar();
  });

  $$(".section-head").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = btn.closest(".side-section");
      const open = btn.dataset.open === "1";
      btn.dataset.open = open ? "0" : "1";
      sec.dataset.closed = open ? "1" : "0";
    });
  });

  // hover actions in section heads
  $$(".row-actions button").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = b.dataset.act;
      if (act === "pull") openPullModal();
      if (act === "mcp-add") openMcpModal();
      if (act === "skill-install") openSkillModal();
    });
  });

  $$(".start-card").forEach((c) => {
    c.addEventListener("click", () => {
      const act = c.dataset.act;
      if (act === "new-chat") newChat();
      if (act === "pull") openPullModal();
      if (act === "mcp-add") openMcpModal();
      if (act === "skill-install") openSkillModal();
    });
  });

  $("#collapseSidebar").onclick = () => {
    $("#sidebar").classList.add("collapsed");
    $("#expandSidebar").style.display = "";
  };
  $("#expandSidebar").onclick = () => {
    $("#sidebar").classList.remove("collapsed");
    $("#expandSidebar").style.display = "none";
  };

  // console
  $$(".seg").forEach((b) => b.addEventListener("click", () => {
    state.consoleTab = b.dataset.tab;
    $$(".seg").forEach((x) => x.classList.toggle("seg-active", x === b));
    $("#consoleBody").style.display = state.consoleTab === "console" ? "" : "none";
    $("#activityBody").style.display = state.consoleTab === "activity" ? "" : "none";
    renderConsole();
  }));
  $("#clearConsole").onclick = () => { state.logs = []; state.activity = []; renderConsole(); };
  $("#consoleToggle").onclick = () => {
    state.consoleOpen = !state.consoleOpen;
    $("#console").classList.toggle("collapsed", !state.consoleOpen);
    $("#consoleChev use").setAttribute("href", state.consoleOpen ? "#i-chevron-u" : "#i-chevron-d");
  };

  // settings
  $("#saveOllama").onclick = async () => {
    const host = $("#ollamaHost").value.trim();
    try {
      const r = await api("/api/settings", { body: { ollama_host: host } });
      state.settings = r.settings;
      $("#ollamaTestResult").textContent = "Saved.";
      addLog(`ollama host: ${host}`, "ok");
      poll();
    } catch (e) {
      $("#ollamaTestResult").textContent = e.message;
    }
  };
  $("#testOllama").onclick = async () => {
    $("#ollamaTestResult").textContent = "Testing…";
    try {
      const st = await api("/api/status");
      $("#ollamaTestResult").textContent = st.ollama.online
        ? `Online — v${st.ollama.version}, ${st.models.length} models.`
        : "Offline — is Ollama running? (ollama serve)";
    } catch (e) {
      $("#ollamaTestResult").textContent = "Unreachable: " + e.message;
    }
  };
  $("#mcpTimeout").addEventListener("change", async () => {
    const v = Math.max(5, Math.min(600, parseInt($("#mcpTimeout").value || "60", 10)));
    const r = await api("/api/settings", { body: { mcp_timeout: v } });
    state.settings = r.settings;
  });
  $("#copyDataDir").onclick = async () => {
    try { await navigator.clipboard.writeText(state.dataDir); addLog("data dir copied to clipboard", "ok"); }
    catch { addLog(state.dataDir); }
  };
  $("#refreshAll").onclick = () => poll();

  // modal
  $("#modalOk").onclick = () => modalOkHandler && modalOkHandler();
  $("#modalCancel").onclick = closeModal;
  $("#scrim").onclick = closeModal;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hideCtx(); if ($("#modal").style.display !== "none") closeModal(); }
  });

  document.addEventListener("click", hideCtx);
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".ctx")) return;
  });

  // title bar drag = no-op in a browser (it's a local app, not a window)
}

// ---------- boot ----------

async function boot() {
  wire();
  // remember theme before first paint of settings
  try {
    const st = await api("/api/status");
    state.settings = { ...state.settings, ...st.settings };
  } catch {}
  applyTheme(state.settings.theme || "paper");
  await poll();
  addLog(`Casium AI v${state.version} ready — data in ${state.dataDir}`, "ok");
  addLog(state.ollamaOnline ? `Ollama online (v${state.ollamaVersion})` : "Ollama offline — start it to pull models and chat",
    state.ollamaOnline ? "ok" : "warn");
  setInterval(poll, 3000);
}

boot();
