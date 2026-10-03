const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KW = "as|async|await|break|case|catch|class|const|continue|def|default|del|do|elif|else|enum|except|export|extends|false|finally|fn|for|from|func|function|if|impl|import|in|interface|is|lambda|let|match|new|nil|none|null|pass|pub|raise|return|self|static|struct|super|switch|this|throw|true|try|type|undefined|use|var|void|while|with|yield|int|float|bool|string|str|char|double|long|True|False|None";
const RE_HASH = new RegExp("(#.*)|(\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`)|(\\b\\d+(?:\\.\\d+)?\\b)|(\\b(?:" + KW + ")\\b)", "g");
const RE_SLASH = new RegExp("(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/)|(\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`)|(\\b\\d+(?:\\.\\d+)?\\b)|(\\b(?:" + KW + ")\\b)", "g");
function hl(code, lang) {
  const re = new RegExp((/^(py|python|sh|bash|shell|zsh|yaml|yml|rb|ruby|toml|r|pl|perl|dockerfile|ini|conf)$/i.test(lang) ? RE_HASH : RE_SLASH).source, "g");
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    out += '<span class="tk-' + (m[1] ? "c" : m[2] ? "s" : m[3] ? "n" : "k") + '">' + esc(m[0]) + "</span>";
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function codeBlock(lang, code) {
  return '<div class="cb"><div class="ch"><span>' + esc(lang || "") + '</span><button class="cc" type="button">' + tr("copy") + "</button></div><pre><code>" +
    (lang ? hl(code, lang) : esc(code)) + "</code></pre></div>";
}
function inl(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => "\u0000" + (codes.push(c) - 1) + "\u0001");
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  s = s.replace(/\*\*([^\s*](?:[^*\n]*[^\s*])?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^\s_](?:[^_\n]*[^\s_])?)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_([^\s_](?:[^_\n]*[^\s_])?)_(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/~~([^\s~](?:[^~\n]*[^\s~])?)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0001/g, (_, i) => "<code>" + esc(codes[+i]) + "</code>");
}
const LI = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const indent = s => s.replace(/\t/g, "    ").length;
const isFence = l => /^\s*```/.test(l);
const isHr = l => /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(l);
const isHead = l => /^#{1,6}\s+\S/.test(l);
const isSep = l => l.includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
function list(L, i, base) {
  const first = L[i].match(LI), ordered = /\d/.test(first[2]), tag = ordered ? "ol" : "ul", st = parseInt(first[2], 10);
  let html = "<" + tag + (ordered && st !== 1 ? ' start="' + st + '"' : "") + ">";
  while (i < L.length) {
    const m = L[i].match(LI);
    if (!m || indent(m[1]) !== base || /\d/.test(m[2]) !== ordered) break;
    const item = [m[3]]; let sub = ""; i++;
    while (i < L.length) {
      const l = L[i], mm = l.match(LI);
      if (mm) { const i2 = indent(mm[1]); if (i2 > base) { const r = list(L, i, i2); sub += r[0]; i = r[1]; continue; } break; }
      if (!l.trim() || !/^\s/.test(l) || isFence(l)) break;
      item.push(l.trim()); i++;
    }
    const tl = item[0].match(/^\[( |x|X)\]\s+/);
    if (tl) item[0] = item[0].slice(tl[0].length);
    html += "<li" + (tl ? ' class="task"' : "") + ">" + (tl ? '<input type="checkbox" disabled' + (tl[1] !== " " ? " checked" : "") + "> " : "") + inl(item.join(" ")) + sub + "</li>";
    if (i < L.length && !L[i].trim()) {
      let j = i; while (j < L.length && !L[j].trim()) j++;
      const mm = j < L.length && L[j].match(LI);
      if (mm && indent(mm[1]) >= base) i = j; else break;
    }
  }
  return [html + "</" + tag + ">", i];
}
function renderMd(src) {
  const L = src.replace(/\r/g, "").split("\n"), out = [];
  const starts = (l, n) => isFence(l) || isHead(l) || isHr(l) || LI.test(l) || /^\s*>/.test(l) || (l.includes("|") && n !== undefined && isSep(n));
  let i = 0;
  while (i < L.length) {
    const ln = L[i];
    if (isFence(ln)) {
      const lang = ln.replace(/^\s*```\s*/, "").trim().split(/\s+/)[0], buf = []; i++;
      while (i < L.length && !/^\s*```\s*$/.test(L[i])) buf.push(L[i++]);
      i++; out.push(codeBlock(lang, buf.join("\n"))); continue;
    }
    if (!ln.trim()) { i++; continue; }
    let m = ln.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) { out.push("<h" + m[1].length + ">" + inl(m[2]) + "</h" + m[1].length + ">"); i++; continue; }
    if (isHr(ln)) { out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(ln)) {
      const q = []; while (i < L.length && /^\s*>/.test(L[i])) q.push(L[i++].replace(/^\s*>\s?/, ""));
      out.push("<blockquote>" + renderMd(q.join("\n")) + "</blockquote>"); continue;
    }
    if (ln.includes("|") && i + 1 < L.length && isSep(L[i + 1])) {
      const head = cells(ln), al = cells(L[i + 1]).map(c => /^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : /^:-/.test(c) ? "left" : "");
      i += 2; const rows = [];
      while (i < L.length && L[i].trim() && L[i].includes("|")) rows.push(cells(L[i++]));
      const cell = (t, c, k) => "<" + t + (al[k] ? ' style="text-align:' + al[k] + '"' : "") + ">" + inl(c) + "</" + t + ">";
      out.push('<div class="tw"><table><thead><tr>' + head.map((c, k) => cell("th", c, k)).join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + r.map((c, k) => cell("td", c, k)).join("") + "</tr>").join("") + "</tbody></table></div>");
      continue;
    }
    m = ln.match(LI);
    if (m) { const r = list(L, i, indent(m[1])); out.push(r[0]); i = r[1]; continue; }
    const p = [ln]; i++;
    while (i < L.length && L[i].trim() && !starts(L[i], L[i + 1])) p.push(L[i++]);
    out.push("<p>" + p.map(inl).join("<br>") + "</p>");
  }
  return out.join("");
}
const BLOCKS = new Set(["P", "UL", "OL", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "TBODY", "TR", "TD", "TH", "DIV", "PRE"]);
function placeCursor(root) {
  let el = root;
  while (el.lastElementChild && BLOCKS.has(el.lastElementChild.tagName)) {
    el = el.lastElementChild;
    if (el.tagName === "PRE") { el = el.querySelector("code") || el; break; }
  }
  const c = document.createElement("span"); c.className = "cur"; el.append(c);
}
