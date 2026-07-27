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

function checkUsage(packs) {
  const base = packs[FALLBACK];
  if (!base) return;
  [["app.js", "ui"], ["settings.js", "settings"]].forEach(([file, kind]) => {
    const src = read(file);
    // settings.js uses a short alias T(...) for tSet(...) — cover both.
    const used = kind === "ui"
      ? collect(src, /\bt\(\s*"([^"]+)"/g)
      : collect(src, /\b(?:tSet|T)\(\s*"([^"]+)"/g);
    const have = keysOf(base, kind);
    used.filter((k) => have.indexOf(k) === -1)
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
