window.SQUEAL_WORKER_SRC = "(" + (function () {
"use strict";
const C = { D: 448, L: 12, H: 8, HD: 56, FF: 896, V: 24001, K: 4, MAX: 1024, BOS: 2, EOS: 3 };
const post = m => self.postMessage(m);
const models = new Map();
let curId = -1, cancelled = false;

const F16 = new Float32Array(65536);
for (let h = 0; h < 65536; h++) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
  F16[h] = e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
}

const yieldNow = (() => {
  const mc = new MessageChannel(); let res = null;
  mc.port1.onmessage = () => { const r = res; res = null; if (r) r(); };
  return () => new Promise(r => { res = r; mc.port2.postMessage(0); });
})();

const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open("squeal-chat", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("w");
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const idbDo = async (mode, fn) => {
  const db = await idb();
  try {
    return await new Promise((res, rej) => {
      const tx = db.transaction("w", mode), q = fn(tx.objectStore("w"));
      tx.oncomplete = () => res(q && q.result);
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  } finally { db.close(); }
};
const cacheGet = async url => { try { return (await idbDo("readonly", s => s.get(url))) || null; } catch { return null; } };
const cachePut = async (url, buf) => { try { await idbDo("readwrite", s => s.put({ buf, t: Date.now() }, url)); } catch (e) {  } };
const cacheDel = async url => { try { await idbDo("readwrite", s => s.delete(url)); } catch {} };
const cacheClear = async () => { try { await idbDo("readwrite", s => s.clear()); } catch {} };

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("DL_FAIL " + r.status);
  const total = +r.headers.get("content-length") || 0, rd = r.body.getReader(), parts = [];
  let got = 0, last = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    parts.push(value); got += value.length;
    const now = Date.now();
    if (now - last > 80) { last = now; post({ type: "progress", phase: "net", got, total }); }
  }
  post({ type: "progress", phase: "net", got, total });
  const u8 = new Uint8Array(got); let o = 0;
  for (const p of parts) { u8.set(p, o); o += p.length; }
  return u8.buffer;
}

function parse(buf) {
  const u8 = new Uint8Array(buf);
  const n = Number(new DataView(buf).getBigUint64(0, true));
  const hdr = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n)));
  const base = 8 + n, out = {};
  for (const [k, v] of Object.entries(hdr)) {
    if (k === "__metadata__" || k === "lm_head.weight") continue;
    const [s, e] = v.data_offsets, raw = buf.slice(base + s, base + e);
    if (v.dtype === "F32") out[k] = new Float32Array(raw);
    else if (v.dtype === "F16") { const h = new Uint16Array(raw), f = new Float32Array(h.length); for (let i = 0; i < h.length; i++) f[i] = F16[h[i]]; out[k] = f; }
    else throw new Error("DTYPE " + v.dtype);
  }
  if (!out["embedding.weight"]) throw new Error("bad weights file");
  return out;
}

async function load(m) {
  if (models.has(m.key)) { post({ type: "loaded", key: m.key, cached: true }); return; }
  let cached = false, Wn = null;
  const rec = await cacheGet(m.url);
  if (rec && rec.buf) {
    post({ type: "progress", phase: "cache" });
    try { Wn = parse(rec.buf); cached = true; } catch { await cacheDel(m.url); }
  }
  if (!Wn) {
    const buf = await download(m.url);
    post({ type: "progress", phase: "parse" });
    Wn = parse(buf);
    await cachePut(m.url, buf);
  }
  models.set(m.key, Wn);
  post({ type: "loaded", key: m.key, cached });
}

let W;
const { D, H, HD, FF, V, K, MAX } = C;
const x = new Float32Array(D), n = new Float32Array(D), y = new Float32Array(D), t2 = new Float32Array(2 * D),
  t3 = new Float32Array(3 * D), f = new Float32Array(FF), ao = new Float32Array(D), sc = new Float32Array(MAX),
  logits = new Float32Array(V);

function mv(w, b, v, out, no, ni) {
  const n4 = ni - 3;
  for (let o = 0, r = 0; o < no; o++, r += ni) {
    let s0 = b ? b[o] : 0, s1 = 0, s2 = 0, s3 = 0, i = 0;
    for (; i < n4; i += 4) {
      s0 += w[r + i] * v[i]; s1 += w[r + i + 1] * v[i + 1];
      s2 += w[r + i + 2] * v[i + 2]; s3 += w[r + i + 3] * v[i + 3];
    }
    for (; i < ni; i++) s0 += w[r + i] * v[i];
    out[o] = (s0 + s1) + (s2 + s3);
  }
}
function rms(v, w, out) {
  let s = 0; for (let i = 0; i < D; i++) s += v[i] * v[i];
  const r = 1 / Math.sqrt(s / D + 1e-6); for (let i = 0; i < D; i++) out[i] = v[i] * r * w[i];
}
function erf(v) {
  const s = v < 0 ? -1 : 1; v = Math.abs(v); const t = 1 / (1 + 0.3275911 * v);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-v * v));
}
function newState() {
  return Array.from({ length: C.L }, (_, i) => (i + 1) % 3 === 0
    ? { k: new Float32Array(MAX * D), v: new Float32Array(MAX * D) }
    : { h: new Float32Array(D), hist: new Float32Array((K - 1) * D) });
}
function ffn(p, nrm) {
  rms(x, W[p + nrm], n);
  mv(W[p + "ffn.up.weight"], W[p + "ffn.up.bias"], n, f, FF, D);
  for (let i = 0; i < FF; i++) { const v = f[i]; f[i] = 0.5 * v * (1 + erf(v * Math.SQRT1_2)); }
  mv(W[p + "ffn.down.weight"], W[p + "ffn.down.bias"], f, y, D, FF);
  for (let d = 0; d < D; d++) x[d] += y[d];
}
function step(tok, pos, st, needLogits) {
  x.set(W["embedding.weight"].subarray(tok * D, tok * D + D));
  for (let i = 0; i < C.L; i++) {
    const p = `blocks.${i}.`, s = st[i];
    if ((i + 1) % 3) {
      rms(x, W[p + "norm1.weight"], n);
      const cw = W[p + "conv.conv.weight"], cb = W[p + "conv.conv.bias"];
      for (let d = 0; d < D; d++) {
        let a = cb[d]; for (let j = 0; j < K - 1; j++) a += cw[d * K + j] * s.hist[j * D + d];
        y[d] = a + cw[d * K + K - 1] * n[d];
      }
      s.hist.copyWithin(0, D); s.hist.set(n, (K - 2) * D);
      for (let d = 0; d < D; d++) x[d] += y[d];
      rms(x, W[p + "norm2.weight"], n);
      mv(W[p + "mingru.proj.weight"], W[p + "mingru.proj.bias"], n, t2, 2 * D, D);
      for (let d = 0; d < D; d++) { const z = 1 / (1 + Math.exp(-t2[d])); s.h[d] = (1 - z) * s.h[d] + z * t2[D + d]; }
      mv(W[p + "mingru.out_proj.weight"], W[p + "mingru.out_proj.bias"], s.h, y, D, D);
      for (let d = 0; d < D; d++) x[d] += y[d];
      ffn(p, "norm3.weight");
    } else {
      rms(x, W[p + "norm1.weight"], n);
      mv(W[p + "attn.qkv.weight"], W[p + "attn.qkv.bias"], n, t3, 3 * D, D);
      for (let h = 0; h < H; h++) for (let j = 0; j < HD / 2; j++) {
        const fr = pos * Math.pow(10000, -2 * j / HD), c = Math.cos(fr), sn = Math.sin(fr);
        for (const b of [0, D]) {
          const a = t3[b + h * HD + j], bb = t3[b + h * HD + j + HD / 2];
          t3[b + h * HD + j] = a * c - bb * sn; t3[b + h * HD + j + HD / 2] = bb * c + a * sn;
        }
      }
      s.k.set(t3.subarray(D, 2 * D), pos * D); s.v.set(t3.subarray(2 * D, 3 * D), pos * D);
      const scale = 1 / Math.sqrt(HD);
      for (let h = 0; h < H; h++) {
        const o = h * HD; let mx = -Infinity;
        for (let j = 0; j <= pos; j++) { let d = 0; for (let e = 0; e < HD; e++) d += t3[o + e] * s.k[j * D + o + e]; sc[j] = d * scale; if (sc[j] > mx) mx = sc[j]; }
        let sum = 0; for (let j = 0; j <= pos; j++) { sc[j] = Math.exp(sc[j] - mx); sum += sc[j]; }
        for (let e = 0; e < HD; e++) ao[o + e] = 0;
        for (let j = 0; j <= pos; j++) { const w = sc[j] / sum; for (let e = 0; e < HD; e++) ao[o + e] += w * s.v[j * D + o + e]; }
      }
      mv(W[p + "attn.out_proj.weight"], W[p + "attn.out_proj.bias"], ao, y, D, D);
      for (let d = 0; d < D; d++) x[d] += y[d];
      ffn(p, "norm2.weight");
    }
  }
  if (needLogits) { rms(x, W["final_norm.weight"], n); mv(W["embedding.weight"], null, n, logits, V, D); }
}

function sample(ids, temp, topk, rp) {
  for (const t of new Set(ids)) logits[t] = logits[t] > 0 ? logits[t] / rp : logits[t] * rp;
  if (temp <= 0) { let b = 0; for (let i = 1; i < V; i++) if (logits[i] > logits[b]) b = i; return b; }
  const thr = Float32Array.from(logits).sort()[V - Math.min(topk, V)];
  let mx = -Infinity; for (let i = 0; i < V; i++) if (logits[i] >= thr && logits[i] > mx) mx = logits[i];
  const pr = new Float32Array(V); let sum = 0;
  for (let i = 0; i < V; i++) if (logits[i] >= thr) { pr[i] = Math.exp((logits[i] - mx) / temp); sum += pr[i]; }
  let r = Math.random() * sum;
  for (let i = 0; i < V; i++) { r -= pr[i]; if (r <= 0) return i; }
  return 0;
}

async function generate(m) {
  W = models.get(m.key);
  if (!W) throw new Error("model not loaded");
  curId = m.id; cancelled = false;
  const ids = m.ids, st = newState();
  for (let i = 0; i < ids.length && !cancelled; i++) {
    step(ids[i], i, st, i === ids.length - 1);
    if (i % 8 === 7) await yieldNow();
  }
  post({ type: "start", id: m.id });
  const all = ids.slice();
  let n = 0, reason = "max";
  for (let k = 0; k < m.maxNew; k++) {
    if (cancelled) { reason = "stop"; break; }
    if (all.length >= C.MAX) { reason = "ctx"; break; }
    const t = sample(all, m.temp, m.topk, m.rp);
    if (t === C.EOS) { reason = "eos"; break; }
    all.push(t); n++;
    post({ type: "token", id: m.id, t });
    step(t, all.length - 1, st, true);
    await yieldNow();
  }
  post({ type: "done", id: m.id, n, reason });
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "stop") { if (m.id === curId) cancelled = true; return; }
    if (m.type === "load") await load(m);
    else if (m.type === "generate") await generate(m);
    else if (m.type === "clear") { await cacheClear(); post({ type: "cleared" }); }
  } catch (err) {
    post({ type: "error", id: m.type === "generate" ? m.id : undefined, message: String((err && err.message) || err) });
  }
};
}).toString() + ")()";
