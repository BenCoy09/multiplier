const fs = require("fs");
let a = fs.readFileSync("app.js", "utf8"), h = fs.readFileSync("index.html", "utf8");
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the original file?)"); return s.slice(0, i) + to + s.slice(i + from.length); }

// 1. Patient, paced RPC client
const i1 = a.indexOf("async function rpc(method, params) {"), i2 = a.indexOf("const call = (to, data");
if (i1 < 0 || i2 < 0) throw new Error("anchor not found: rpc");
const newRpc = `const GAP = Number(process.env.RPC_GAP_MS || 150); let nextT = 0;
async function rpc(method, params) {
  let why = "";
  for (let i = 0; i < 8; i++) {
    const t = Math.max(Date.now(), nextT); nextT = t + GAP; if (t > Date.now()) await sleep(t - Date.now());
    let r;
    try {
      r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
    } catch (e) { why = e.message; await sleep(500 * 2 ** Math.min(i, 4)); continue; }
    if (r.status === 429 || r.status >= 500) { why = "HTTP " + r.status; const ra = Number(r.headers.get("retry-after")) * 1000; await sleep(ra > 0 ? Math.min(ra, 15000) : 700 * 2 ** Math.min(i, 4)); continue; }
    const j = await r.json();
    if (j.error) {
      if (/rate.?limit|too many requests|throttl/i.test(j.error.message || "")) { why = j.error.message; await sleep(700 * 2 ** Math.min(i, 4)); continue; }
      const e = new Error(j.error.message || "RPC error"); e.rpc = true; throw e;
    }
    return j.result;
  }
  throw new Error("RPC unavailable or rate limited (" + why + ")");
}
`;
a = a.slice(0, i1) + newRpc + a.slice(i2);
a = rep(a, "Array.from({ length: 6 }", "Array.from({ length: 3 }", "concurrency");

// 2. Explorer transfer history, accepted only if it reconciles with balanceOf today
const exp = `const EXPLORER = process.env.EXPLORER_URL || "https://robinhoodchain.blockscout.com";
async function explorerTransfers(tk, w) {
  const out = []; let extra = "";
  for (let p = 0; p < 80; p++) {
    const r = await fetch(EXPLORER + "/api/v2/addresses/" + w + "/token-transfers?token=" + tk + extra, { headers: { accept: "application/json", "user-agent": "multiplier-explorer/1.0" } });
    if (!r.ok) throw new Error("explorer HTTP " + r.status);
    const j = await r.json();
    out.push(...(j.items || []));
    const np = j.next_page_params;
    if (!np) return out;
    extra = "&" + new URLSearchParams(Object.entries(np).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)])).toString();
  }
  throw new Error("too many explorer pages");
}
function explorerSum(items, w, block, dedupe) {
  const me = w.toLowerCase(), seen = new Set(); let s = 0n;
  for (const it of items) {
    if (Number(it.block_number) > block) continue;
    const v = it.total && it.total.value; if (v === undefined || v === null) throw new Error("unexpected explorer format");
    const f = ((it.from && it.from.hash) || "").toLowerCase(), t = ((it.to && it.to.hash) || "").toLowerCase();
    if (dedupe) { const k = (it.transaction_hash || it.tx_hash) + f + t + v; if (seen.has(k)) continue; seen.add(k); }
    if (t === me) s += BigInt(v);
    if (f === me) s -= BigInt(v);
  }
  return s;
}
async function viaExplorer(tk, w, block, balNow) {
  const items = await explorerTransfers(tk, w);
  for (const d of [true, false]) if (explorerSum(items, w, Infinity, d) === balNow) return explorerSum(items, w, block, d);
  return null; // explorer history does not reconcile with balanceOf today: not used
}
const bc = {};
`;
a = rep(a, "async function lookup(", exp + "async function lookup(", "lookup");
a = rep(a, "const block = await blockAt(e.eff, latest);", "const block = bc[e.eff] ?? (bc[e.eff] = await blockAt(e.eff, latest));", "block cache");
a = rep(a, "if (raw === null) raw = await sumBalance(tk, w, block, Date.now() + 90000);",
 'if (raw === null) { try { raw = await viaExplorer(tk, w, block, BigInt(balanceNow)); if (raw !== null) method = "explorer transfer history, reconciled with balanceOf today"; } catch (_) { raw = null; } }\n      if (raw === null) raw = await sumBalance(tk, w, block, Date.now() + 90000);', "explorer path");
a = rep(a, '"Reading the historical balance failed: " + err.message', '"Reading the historical balance failed: " + err.message + "."', "message");

// 3. Show how the balance was obtained
h = rep(h, "the last block at or before the effective time. Balance today:", "the last block at or before the effective time. Method: ${esc(a.method)}. Balance today:", "ui method");
fs.writeFileSync("app.js", a); fs.writeFileSync("index.html", h);
console.log("patched app.js and index.html");
