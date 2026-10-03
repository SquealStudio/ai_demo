const sfx = (() => {
  let ac = null, out = null, last = 0, idx = 2;
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
  const init = () => {
    if (ac) { if (ac.state === "suspended") ac.resume(); return true; }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return false;
    ac = new A();
    out = ac.createGain();
    const comp = ac.createDynamicsCompressor(), dly = ac.createDelay(), fb = ac.createGain(), lp = ac.createBiquadFilter();
    dly.delayTime.value = 0.13; fb.gain.value = 0.32; lp.type = "lowpass"; lp.frequency.value = 2800;
    out.connect(comp); comp.connect(ac.destination);
    out.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(comp);
    return true;
  };
  const ok = () => S.sound && S.vol > 0 && init();
  const note = (f, t, d, g, type = "sine", glide = 0) => {
    const T = ac.currentTime + t, v = Math.max(g * S.vol, 0.0001);
    const o = ac.createOscillator(), o2 = ac.createOscillator(), e = ac.createGain(), g2 = ac.createGain();
    o.type = type; o2.type = "sine"; g2.gain.value = 0.25;
    o.frequency.setValueAtTime(f, T); o2.frequency.setValueAtTime(f * 2, T);
    if (glide) { o.frequency.exponentialRampToValueAtTime(f * glide, T + d); o2.frequency.exponentialRampToValueAtTime(f * 2 * glide, T + d); }
    o.connect(e); o2.connect(g2); g2.connect(e); e.connect(out);
    e.gain.setValueAtTime(0.0001, T);
    e.gain.exponentialRampToValueAtTime(v, T + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, T + d);
    o.start(T); o2.start(T); o.stop(T + d + 0.02); o2.stop(T + d + 0.02);
  };
  let nbuf = null;
  const noise = () => {
    if (!nbuf) { nbuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.12), ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return nbuf;
  };
  const clack = (t, f, d, g, thump = 170, tg = 0.3) => {
    const T = ac.currentTime + t, v = Math.max(g * 3 * S.vol, 0.0001);
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), e = ac.createGain();
    src.buffer = noise(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 0.7;
    src.connect(bp); bp.connect(e); e.connect(out);
    e.gain.setValueAtTime(v, T); e.gain.exponentialRampToValueAtTime(0.0001, T + d);
    src.start(T, Math.random() * 0.05); src.stop(T + d + 0.02);
    const o = ac.createOscillator(), oe = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(thump, T); o.frequency.exponentialRampToValueAtTime(thump * 0.4, T + d * 1.6);
    o.connect(oe); oe.connect(out);
    oe.gain.setValueAtTime(Math.max(tg * 1.5 * S.vol, 0.0001), T); oe.gain.exponentialRampToValueAtTime(0.0001, T + d * 1.6);
    o.start(T); o.stop(T + d * 1.6 + 0.02);
    const k = ac.createOscillator(), ke = ac.createGain();
    k.type = "triangle"; k.frequency.value = Math.min(f * 0.8, 3000);
    k.connect(ke); ke.connect(out);
    ke.gain.setValueAtTime(Math.max(g * 0.25 * S.vol, 0.0001), T); ke.gain.exponentialRampToValueAtTime(0.0001, T + 0.012);
    k.start(T); k.stop(T + 0.03);
  };
  let lastHover = 0;
  let typing = false, typeTimer = 0;
  const press = () => {
    const r = () => 0.85 + Math.random() * 0.3, x = Math.random();
    if (x < 0.14) clack(0, 1700 * r(), 0.07, 1, 130, 0.5);
    else if (x < 0.17) { clack(0, 1500, 0.08, 1.1, 110, 0.6); clack(0.06, 3000, 0.03, 0.4, 200, 0.2); }
    else clack(0, 3400 * r(), 0.04, 0.9, 200 * r(), 0.35);
  };

  return {
    unlock() { if (S.sound) init(); },
    click() { if (ok()) note(900, 0, 0.05, 0.12, "triangle"); },
    send() { if (ok()) { note(440, 0, 0.12, 0.22, "triangle", 1.5); note(660, 0.06, 0.14, 0.2, "triangle"); } },
    typeStart() {
      if (typing) return; typing = true;
      const loop = () => {
        if (!typing) return;
        if (ok()) press();
        typeTimer = setTimeout(loop, 45 + Math.random() * 85 + (Math.random() < 0.1 ? 160 : 0));
      };
      loop();
    },
    typeStop() { typing = false; clearTimeout(typeTimer); },
    hover() {
      const now = performance.now();
      if (!ac || !S.sound || S.vol <= 0 || now - lastHover < 70) return; lastHover = now;
      if (ac.state === "suspended") ac.resume();
      clack(0, 3800, 0.022, 0.3, 240, 0.18); clack(0.05, 5200, 0.015, 0.14, 300, 0.06);
    },
    ready() { if (ok()) [880, 1174.66, 1567.98].forEach((f, i) => note(f, i * 0.06, 0.35, 0.12)); },
    done() { if (ok()) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.075, 0.5, 0.18, "triangle")); note(261.63, 0, 0.45, 0.14); } },
    stop() { if (ok()) { note(520, 0, 0.15, 0.18, "sine", 0.7); note(390, 0.08, 0.2, 0.16, "sine", 0.7); } },
    error() { if (ok()) note(160, 0, 0.3, 0.3, "triangle", 0.6); },
  };
})();
