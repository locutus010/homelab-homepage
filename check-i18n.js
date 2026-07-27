#!/usr/bin/env node
/* =============================================================================
 *  HOMELAB START PAGE — LANGUAGE PACK CHECK
 *  Run with `node check-i18n.js`. No dependencies.
 *
 *  1. Key parity   — every pack carries the same keys as the English one.
 *  2. Usage covered — every t("…") / tSet("…") literal exists in English.
 *  3. Markup covered — every data-i18n key in index.html exists in English.
 *
 *  Exits 1 on findings so it can be wired into CI later.
 * ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const FALLBACK = "en";
const problems = [];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

/* Run lang.js in a bare sandbox — it only assigns to `window`. */
function loadPacks() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read("lang.js"), sandbox, { filename: "lang.js" });
  const packs = sandbox.window.LANGUAGES;
  if (!packs || typeof packs !== "object") {
    problems.push("lang.js did not set window.LANGUAGES");
    return {};
  }
  return packs;
}

function keysOf(pack, kind) {
  return Object.keys((pack && pack[kind]) || {});
}

/* ----- 1. key parity ----- */
function checkParity(packs) {
  const base = packs[FALLBACK];
  if (!base) { problems.push(`no "${FALLBACK}" pack in lang.js`); return; }

  Object.keys(packs).forEach((code) => {
    const pack = packs[code];
    if (!pack.name) problems.push(`${code}: missing "name"`);
    if (!pack.locale) problems.push(`${code}: missing "locale"`);
    if (code === FALLBACK) return;

    ["ui", "settings"].forEach((kind) => {
      const want = keysOf(base, kind);
      const have = keysOf(pack, kind);
      want.filter((k) => have.indexOf(k) === -1)
        .forEach((k) => problems.push(`${code}.${kind}: missing key "${k}"`));
      have.filter((k) => want.indexOf(k) === -1)
        .forEach((k) => problems.push(`${code}.${kind}: unknown key "${k}" (not in ${FALLBACK})`));
    });
  });
}

/* ----- 2. usage covered ----- */
function collect(text, re) {
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/* Shape of an i18n key literal, e.g. "greeting.morning". */
const KEY_LITERAL = /"([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)"/g;

/* Starting at src[openParen] === "(", walk forward tracking paren depth
 * (skipping over string/template contents so parens inside them don't
 * confuse the count) and return the index just past the matching ")". */
function findCallEnd(src, openParen) {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (c === "\"" || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

/* Collect every key-shaped string literal that appears anywhere inside a
 * call to one of `names` (e.g. t(...) / tSet(...) / T(...)) — not just the
 * literal directly after the opening paren. That also catches key literals
 * buried inside a multi-line ternary passed as the argument. */
function collectCallKeys(src, names) {
  const used = new Set();
  const callRe = new RegExp("\\b(?:" + names.join("|") + ")\\(", "g");
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = findCallEnd(src, openParen);
    const span = src.slice(openParen + 1, closeParen - 1);
    KEY_LITERAL.lastIndex = 0;
    let k;
    while ((k = KEY_LITERAL.exec(span)) !== null) used.add(k[1]);
  }
  return used;
}

function checkUsage(packs) {
  const base = packs[FALLBACK];
  if (!base) return;
  [["app.js", "ui", ["t"]], ["settings.js", "settings", ["tSet", "T"]]].forEach(([file, kind, names]) => {
    const src = read(file);
    // settings.js uses a short alias T(...) for tSet(...) — cover both.
    const used = collectCallKeys(src, names);
    const have = keysOf(base, kind);
    Array.from(used).filter((k) => have.indexOf(k) === -1)
      .forEach((k) => problems.push(`${file}: uses "${k}" which is not in ${FALLBACK}.${kind}`));
  });
}

/* ----- 3. markup covered ----- */
function checkMarkup(packs) {
  const base = packs[FALLBACK];
  if (!base) return;
  const html = read("index.html");
  const have = keysOf(base, "ui");

  collect(html, /data-i18n="([^"]+)"/g).forEach((key) => {
    if (have.indexOf(key) === -1) problems.push(`index.html: data-i18n="${key}" is not in ${FALLBACK}.ui`);
  });

  collect(html, /data-i18n-attr="([^"]+)"/g).forEach((value) => {
    value.split(",").forEach((pair) => {
      const key = (pair.split(":")[1] || "").trim();
      if (!key) { problems.push(`index.html: malformed data-i18n-attr "${value}"`); return; }
      if (have.indexOf(key) === -1) problems.push(`index.html: data-i18n-attr key "${key}" is not in ${FALLBACK}.ui`);
    });
  });
}

const packs = loadPacks();
checkParity(packs);
checkUsage(packs);
checkMarkup(packs);

if (problems.length) {
  console.error(`check-i18n: ${problems.length} problem(s)`);
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
console.log(`check-i18n: ok (${Object.keys(packs).join(", ")})`);
