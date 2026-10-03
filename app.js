let AutoTokenizer = null;
const loadTokenizerLib = async () => {
  if (!AutoTokenizer) ({ AutoTokenizer } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers"));
};

const MODELS = {
  instruct: {
    repo: "Squeal-Studio/drakon_28m-instruct",
    url: "https://huggingface.co/Squeal-Studio/drakon_28m-instruct/resolve/main/model.safetensors",
    chat: true, special: false,
    chips: ["Объясни, что такое фотосинтез.", "Расскажи короткую историю про лису.", "Где живут рыбы?", "Что такое Солнце?"],
  },
  base: {
    repo: "Squeal-Studio/drakon_28m-base",
    url: "https://huggingface.co/Squeal-Studio/drakon_28m-base/resolve/main/model.safetensors",
    chat: false, special: true,
    chips: ["Однажды в лесу", "Москва — столица", "В далёкой галактике"],
  },
};

const C = { D: 448, L: 12, H: 8, HD: 56, FF: 896, V: 24001, K: 4, MAX: 1024, BOS: 2, EOS: 3 };
const $ = id => document.getElementById(id);
const logoAv = avatar(false); logoAv.classList.add("mini"); $("logo").prepend(logoAv);
const DEF = { mx: 200, tp: 0.7, tk: 50, rp: 1.1, hist: false, sound: true, vol: 0.6, lang: "en", model: "instruct" };
let S = { ...DEF };
try { Object.assign(S, JSON.parse(localStorage.getItem("drakon_chat") || "{}")); } catch {}
if (!MODELS[S.model]) S.model = "instruct";
if (S.lang !== "en" && S.lang !== "ru") S.lang = "en";
const save = () => { try { localStorage.setItem("drakon_chat", JSON.stringify(S)); } catch {} };

function syncSettings() {
  for (const k of ["mx", "tp", "tk", "rp", "vol"]) { $(k).value = S[k]; $(k + "o").textContent = S[k]; }
  $("hist").checked = S.hist; $("model").value = S.model;
}
for (const k of ["mx", "tp", "tk", "rp", "vol"]) $(k).oninput = e => { S[k] = +e.target.value; $(k + "o").textContent = S[k]; save(); };
$("hist").onchange = e => { S.hist = e.target.checked; save(); };
$("reset").onclick = () => { S = { ...DEF, model: S.model, lang: S.lang }; syncSettings(); save(); paintSnd(); };
const SND = {on: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>', off: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5zM22 9l-6 6M16 9l6 6"/></svg>'};
const paintSnd = () => { $("snd").innerHTML = S.sound ? SND.on : SND.off; };
$("snd").onclick = () => { S.sound = !S.sound; save(); paintSnd(); if (S.sound) { sfx.unlock(); sfx.click(); } };
$("vol").addEventListener("change", () => sfx.click());
paintSnd();
for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, () => sfx.unlock(), { once: true, capture: true });
document.addEventListener("pointerover", e => {
  const b = e.target.closest && e.target.closest("button, select, .chip");
  if (!b || b.id === "send" || b.id === "model" || b.disabled || (e.relatedTarget && b.contains(e.relatedTarget))) return;
  sfx.hover();
});
$("lang").onchange = e => { S.lang = e.target.value; save(); applyLang(); };
$("cfg").onclick = () => $("dlg").showModal();
$("dx").onclick = $("dok").onclick = () => $("dlg").close();
$("dlg").addEventListener("click", e => { if (e.target === $("dlg")) $("dlg").close(); });

function applyLang() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = tr(el.dataset.i18nTitle); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", tr(el.dataset.i18nAria)); });
  $("lang").value = S.lang;
  uiTexts(); render();
}

const cache = new Map();
let tok, busy = false, running = false, msgs = [], genId = 0, onW = null;
const setStatus = (t) => $("st").textContent = t;
const setBar = p => $("bar").firstElementChild.style.width = (p * 100) + "%";

const worker = new Worker(URL.createObjectURL(new Blob([window.SQUEAL_WORKER_SRC], { type: "text/javascript" })));
worker.onmessage = e => {
  if (e.data.type === "cleared") { setStatus(tr("cleared")); return; }
  if (onW) onW(e.data);
};
worker.onerror = e => { if (e.preventDefault) e.preventDefault(); if (onW) onW({ type: "error", message: e.message || "worker error" }); };
$("cclear").onclick = () => worker.postMessage({ type: "clear" });
const wErr = m => m.startsWith("DL_FAIL ") ? tr("dl_fail") + m.slice(8) : m.startsWith("DTYPE ") ? tr("dtype") + m.slice(6) : m;

function loadWeightsW(key, url) {
  return new Promise((resolve, reject) => {
    onW = d => {
      if (d.type === "progress") {
        if (d.phase === "net") {
          setBar(d.total ? d.got / d.total : 0);
          setStatus(tr("dl") + (d.total ? Math.round(d.got / d.total * 100) + "% (" + (d.total / 1e6 | 0) + tr("mb") + ")" : (d.got / 1e6 | 0) + tr("mb")));
        } else if (d.phase === "cache") { setBar(1); setStatus(tr("cache_load")); }
        else setStatus(tr("parse"));
      } else if (d.type === "loaded") { onW = null; resolve(d); }
      else if (d.type === "error") { onW = null; reject(new Error(wErr(d.message))); }
    };
    worker.postMessage({ type: "load", key, url });
  });
}

async function ensureModel(key) {
  const m = MODELS[key];
  if (!cache.has(key)) {
    $("logo").className = "logo load";
    setStatus(tr("load_tok"));
    await loadTokenizerLib();
    const t = await AutoTokenizer.from_pretrained(m.repo);
    await loadWeightsW(key, m.url);
    cache.set(key, t); sfx.ready(); setBar(0);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  }
  tok = cache.get(key);
  $("logo").className = "logo ready";
}

const enc = (m, s) => Array.from(tok.encode(s, m.special ? undefined : { add_special_tokens: false }));
const fmt = (q, a) => `Вопрос:\n${q}\n\nОтвет:\n${a}`;

function buildPrompt(key, upto) {
  const m = MODELS[key], text = msgs[upto].text, maxNew = S.mx;
  const limit = Math.max(C.MAX - maxNew, 128);
  if (!m.chat) {
    let ids = enc(m, text);
    if (!ids.length) ids = [C.BOS];
    return ids.slice(-limit);
  }
  let q = text, cur = enc(m, fmt(q, ""));
  while (cur.length > limit && q.length > 1) { q = q.slice(Math.ceil(q.length * 0.15)); cur = enc(m, fmt(q, "")); }
  let out = cur;
  if (S.hist) {
    for (let i = upto - 2; i >= 0; i -= 2) {
      if (msgs[i].role !== "user" || !msgs[i + 1] || !msgs[i + 1].text) break;
      const pi = enc(m, fmt(msgs[i].text, msgs[i + 1].text));
      if (pi.length + 1 + out.length > limit) break;
      out = [...pi, C.EOS, ...out];
    }
  }
  return out;
}

const chat = $("chat");
const nearBottom = () => chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
const toBottom = () => { chat.style.scrollBehavior = "auto"; chat.scrollTop = chat.scrollHeight; chat.style.scrollBehavior = ""; };

function render() {
  chat.textContent = "";
  if (!msgs.length) {
    const m = MODELS[S.model], d = document.createElement("div");
    d.className = "empty";
    d.append(avatar(false, true));
    d.insertAdjacentHTML("beforeend", `<h2>Drakon 28M</h2><p>${m.chat ? tr("empty_chat") : tr("empty_base")}</p>`);
    const c = document.createElement("div"); c.className = "chips";
    for (const t of m.chips) { const b = document.createElement("button"); b.className = "chip"; b.textContent = t; b.onclick = () => send(t); c.append(b); }
    d.append(c); chat.append(d); return;
  }
  msgs.forEach((m, i) => chat.append(msgNode(m, i)));
  toBottom();
}

function msgNode(m, i) {
  const w = document.createElement("div"); w.className = "msg " + m.role;
  const b = document.createElement("div"); b.className = "bub" + (m.err ? " err" : "");
  if (m.role === "user" || m.err) b.textContent = m.text;
  else if (m.pending && !m.text) b.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
  else { b.innerHTML = renderMd(m.text); if (m.pending) placeCursor(b); }
  if (m.role === "bot") { const r = document.createElement("div"); r.className = "brow"; r.append(avatar(m.pending), b); w.append(r); } else w.append(b);
  if (m.role === "bot") {
    const meta = document.createElement("div"); meta.className = "meta";
    if (m.n != null) meta.append(Object.assign(document.createElement("span"), { textContent: m.n + tr("tok_u") + m.tps + tr("tps") }));
    if (!m.pending && m.text) {
      const cp = document.createElement("button"); cp.textContent = tr("copy");
      cp.onclick = async () => { try { await navigator.clipboard.writeText(m.text); cp.textContent = tr("copied"); setTimeout(() => cp.textContent = tr("copy"), 1200); } catch {} };
      meta.append(cp);
    }
    if (!m.pending && i === msgs.length - 1) {
      const rg = document.createElement("button"); rg.textContent = tr("regen"); rg.onclick = regenerate; meta.append(rg);
    }
    w.append(meta); m.node = b; m.meta = meta;
  }
  return w;
}

function setBusy(v) {
  busy = v;
  logoAv.classList.toggle("gen", v); if (v) startWave();
  if (v) $("logo").setAttribute("data-busy", ""); else $("logo").removeAttribute("data-busy");
  $("model").disabled = v; $("clear").disabled = v;
  $("send").classList.toggle("stop", v);
  $("send").innerHTML = v
    ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  $("send").title = tr(v ? "stop" : "send");
}

function stopGen() { running = false; worker.postMessage({ type: "stop", id: genId }); }

async function respond(upto) {
  const key = S.model, bot = { role: "bot", text: "", pending: true };
  msgs.length = upto + 1; msgs.push(bot);
  sfx.unlock(); sfx.send();
  setBusy(true); running = true; render();
  const id = ++genId;
  try {
    await ensureModel(key);
    if (running) {
      const m = MODELS[key], ids = buildPrompt(key, upto), gen = [];
      setStatus(tr("read_pre") + ids.length + tr("read_suf"));
      let t0 = performance.now(), raf = 0, cutDone = false;
      const sync = () => {
        const text = tok.decode(gen, { skip_special_tokens: true }).replace(/<newline>/g, "\n");
        const cut = m.chat ? text.search(/\n\s*Вопрос:/) : -1;
        if (cut >= 0) { bot.text = text.slice(0, cut).trimEnd(); if (!cutDone) { cutDone = true; worker.postMessage({ type: "stop", id }); } }
        else bot.text = m.chat ? text.trimStart() : text;
      };
      const paint = () => {
        raf = 0; sync();
        const stick = nearBottom();
        bot.node.innerHTML = renderMd(bot.text); placeCursor(bot.node);
        if (stick) toBottom();
        setStatus(tr("gen") + (gen.length / Math.max((performance.now() - t0) / 1000, 0.001)).toFixed(1) + tr("tps"));
      };
      await new Promise((resolve, reject) => {
        onW = d => {
          if (d.id !== undefined && d.id !== id) return;
          if (d.type === "start") { t0 = performance.now(); sfx.typeStart(); }
          else if (d.type === "token") { if (!cutDone) { gen.push(d.t); if (!raf) raf = setTimeout(paint, 70); } }
          else if (d.type === "done") resolve(d);
          else if (d.type === "error") reject(new Error(wErr(d.message)));
        };
        worker.postMessage({ type: "generate", id, key, ids, maxNew: S.mx, temp: S.tp, topk: S.tk, rp: S.rp });
      });
      onW = null; if (raf) clearTimeout(raf); sync();
      sfx.typeStop();
      bot.n = gen.length; bot.tps = (gen.length / Math.max((performance.now() - t0) / 1000, 0.001)).toFixed(1);
      if (!bot.text) bot.text = tr("empty");
    }
    setStatus(tr(running ? "done" : "stopped"));
    if (running) sfx.done(); else sfx.stop();
  } catch (e) {
    console.error(e); sfx.typeStop(); onW = null;
    bot.text = tr("error") + e.message; bot.err = true; sfx.error();
    $("logo").className = "logo"; setBar(0); setStatus(tr("err_status"));
  }
  bot.pending = false; running = false; setBusy(false); render(); $("in").focus();
}

function send(text) {
  text = (text ?? $("in").value).trim();
  if (!text || busy) return;
  $("in").value = ""; autosize();
  msgs.push({ role: "user", text });
  respond(msgs.length - 1);
}
function regenerate() {
  if (busy) return;
  let u = msgs.length - 1; while (u >= 0 && msgs[u].role !== "user") u--;
  if (u >= 0) respond(u);
}

chat.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest(".cc"); if (!b) return;
  const code = b.closest(".cb").querySelector("code");
  try { await navigator.clipboard.writeText(code.textContent); b.textContent = tr("copied"); setTimeout(() => { b.textContent = tr("copy"); }, 1200); } catch {}
});
function autosize() { const t = $("in"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 180) + "px"; }
$("in").addEventListener("input", autosize);
$("in").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$("send").onclick = () => busy ? stopGen() : send();
$("clear").onclick = () => { if (busy) return; msgs = []; render(); $("in").focus(); };
function uiTexts() {
  const c = MODELS[S.model].chat;
  $("hint").textContent = tr(c ? "hint_chat" : "hint_base");
  $("in").placeholder = tr(c ? "ph_chat" : "ph_base");
  $("send").title = tr(busy ? "stop" : "send");
  if (!busy) setStatus(tr(cache.has(S.model) ? "st_loaded" : "st_idle"));
}
$("model").onchange = e => {
  S.model = e.target.value; save(); msgs = [];
  $("logo").className = cache.has(S.model) ? "logo ready" : "logo";
  uiTexts(); render();
};

syncSettings(); $("model").dispatchEvent(new Event("change")); applyLang();
