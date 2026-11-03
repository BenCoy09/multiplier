// Stock token multiplier explorer. Node 18+, no dependencies.
//   node app.js           start the app on http://localhost:3000
//   node app.js verify    print the engineering evidence report
const http = require("http");
const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const PORT = process.env.PORT || 3000;
const ARCHIVE = process.env.ARCHIVE === "1"; // only after `verify` shows historical eth_call matches log sums
const CHAIN = 4663;
const TOK = {
  SPY: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  GLD: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e",
  CRCL: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
  SPCX: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
};
const T_UI = "0x2205df4534432b2f60654a3fdb48737ffdaf3e9edb1a498bd985bc026b15b055"; // UIMultiplierUpdated(uint256,uint256,uint256)
const T_TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
const SEL = { decimals: "0x313ce567", balanceOf: "0x70a08231", newUI: "0xdc767007", effAt: "0x97a4064f", ui: "0xa60bf13d" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => "0x" + n.toString(16);
const pad32 = (a) => a.slice(2).toLowerCase().padStart(64, "0");
let rid = 0;

const GAP = Number(process.env.RPC_GAP_MS || 150); let nextT = 0;
async function rpc(method, params) {
  let why = "";
  for (let i = 0; i < 8; i++) {
    const t = Math.max(Date.now(), nextT); nextT = t + GAP; if (t > Date.now()) await sleep(t - Date.now());
    let r;
    try {
      r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
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
const call = (to, data, block = "latest") => rpc("eth_call", [{ to, data }, block]);

// eth_getLogs over [from,to]. Shrinks the window until the node accepts it, then sweeps. Never hides a failure.
async function getLogs(base, from, to, deadline) {
  // Splits any window the node refuses (too many blocks, or more than 10,000 results) and retries both halves. Never hides a failure.
  const q = (a, b) => rpc("eth_getLogs", [{ ...base, fromBlock: hex(a), toBlock: hex(b) }]);
  const SPAN = 6000000, logs = [], ranges = []; let partial = false, calls = 0, i = 0;
  for (let a = from; a <= to; a += SPAN) ranges.push([a, Math.min(to, a + SPAN - 1)]);
  async function walk(a, b) {
    if (Date.now() > deadline) { partial = true; return; }
    try { calls++; logs.push(...(await q(a, b))); }
    catch (e) { if (!e.rpc || a >= b) throw e; const m = Math.floor((a + b) / 2); await walk(a, m); await walk(m + 1, b); }
  }
  await Promise.all(Array.from({ length: 3 }, async () => { while (i < ranges.length) { const [a, b] = ranges[i++]; await walk(a, b); } }));
  return { logs, partial, size: SPAN, calls };
}

const hcache = {};
async function history(sym, latest, deadline) {
  const c = hcache[sym]; if (c && Date.now() - c.t < 120000 && c.latest >= latest - 5000) return c.v;
  const r = await getLogs({ address: TOK[sym], topics: [T_UI] }, 0, latest, deadline);
  const events = r.logs.map((l) => {
    const d = l.data.slice(2);
    return { o: BigInt("0x" + d.slice(0, 64)).toString(), n: BigInt("0x" + d.slice(64, 128)).toString(), eff: Number(BigInt("0x" + d.slice(128, 192))), tx: l.transactionHash, block: parseInt(l.blockNumber, 16) };
  }).sort((a, b) => a.eff - b.eff);
  const v = { events, partial: r.partial, size: r.size, calls: r.calls };
  if (!r.partial) hcache[sym] = { t: Date.now(), latest, v };
  return v;
}

async function blockAt(ts, latest) { // last block with timestamp <= ts
  let lo = 0, hi = latest;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2), b = await rpc("eth_getBlockByNumber", [hex(mid), false]);
    if (parseInt(b.timestamp, 16) <= ts) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// Raw balance at `block` = sum of Transfer logs in minus out. Transfer only (TransferWithScaledUI repeats the same transfer).
async function sumBalance(token, w, block, deadline) {
  const p = "0x" + pad32(w);
  const [i, o] = await Promise.all([
    getLogs({ address: token, topics: [T_TR, null, p] }, 0, block, deadline),
    getLogs({ address: token, topics: [T_TR, p] }, 0, block, deadline),
  ]);
  if (i.partial || o.partial) return null;
  let s = 0n;
  for (const l of i.logs) if (l.topics.length === 3) s += BigInt(l.data);
  for (const l of o.logs) if (l.topics.length === 3) s -= BigInt(l.data);
  return s;
}

const EXPLORER = process.env.EXPLORER_URL || "https://robinhoodchain.blockscout.com";
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
async function lookup(sym, w, pro) {
  const tk = TOK[sym];
  const cid = parseInt(await rpc("eth_chainId", []), 16);
  if (cid !== CHAIN) throw new Error("RPC reports chain " + cid + ", expected " + CHAIN);
  const lb = await rpc("eth_getBlockByNumber", ["latest", false]);
  const latest = parseInt(lb.number, 16), now = parseInt(lb.timestamp, 16);
  const H = await history(sym, latest, Date.now() + 60000);
  const decimals = parseInt(await call(tk, SEL.decimals), 16);
  const balanceNow = BigInt(await call(tk, SEL.balanceOf + pad32(w))).toString();
  const events = H.events.filter((e) => e.eff <= now), scheduled = H.events.filter((e) => e.eff > now);
  let pending = { status: "unavailable" };
  try {
    const nm = BigInt(await call(tk, SEL.newUI)), ea = Number(BigInt(await call(tk, SEL.effAt)));
    pending = { status: nm > 0n && ea > now ? "pending" : "none", newMultiplier: nm.toString(), effectiveAt: ea };
  } catch (e) { /* getter missing or reverted: reported as unavailable, never as "none" */ }
  let atUpdate = null;
  if (events.length) {
    const e = events[events.length - 1];
    try {
      const block = bc[e.eff] ?? (bc[e.eff] = await blockAt(e.eff, latest));
      let raw = null, method = "transfer-logs";
      if (ARCHIVE) { try { raw = BigInt(await call(tk, SEL.balanceOf + pad32(w), hex(block))); method = "historical-eth_call"; } catch (_) { raw = null; } }
      if (raw === null) { try { raw = await viaExplorer(tk, w, block, BigInt(balanceNow)); if (raw !== null) method = "explorer transfer history, reconciled with balanceOf today"; } catch (_) { raw = null; } }
      if (raw === null) raw = await sumBalance(tk, w, block, Date.now() + 90000);
      atUpdate = raw === null ? { raw: null, reason: "The transfer history could not be read completely within the time limit." } : { raw: raw.toString(), block, method };
    } catch (err) { atUpdate = { raw: null, reason: "Reading the historical balance failed: " + err.message + "." }; }
  }
  let mult = null; try { mult = BigInt(await call(tk, SEL.ui)).toString(); } catch (_) {}
  let perEvent;
  if (pro && events.length) { // Pro: balance at every update
    perEvent = [];
    const blocks = [];
    for (const e of events) blocks.push(bc[e.eff] ?? (bc[e.eff] = await blockAt(e.eff, latest)));
    let items = null; try { items = await explorerTransfers(tk, w); } catch (_) {}
    const bn = BigInt(balanceNow), dd = items ? [true, false].find((d) => explorerSum(items, w, Infinity, d) === bn) : undefined;
    for (let i = 0; i < events.length; i++) {
      let raw = null;
      if (dd !== undefined) raw = explorerSum(items, w, blocks[i], dd);
      else { try { raw = await sumBalance(tk, w, blocks[i], Date.now() + 90000); } catch (_) { raw = null; } }
      perEvent.push({ eff: events[i].eff, block: blocks[i], raw: raw === null ? null : raw.toString() });
    }
  }
  return { token: sym, chainId: cid, latestBlock: latest, decimals, balanceNow, events, scheduled, pending, partialHistory: H.partial, atUpdate, perEvent, mult };
}

async function verify() {
  const log = console.log, W = "0x9f736F87E6293AC1Bd9142E257dbfAC8b7AcF1ae";
  log("== RPC", RPC);
  log("eth_chainId:", parseInt(await rpc("eth_chainId", []), 16), "(expected " + CHAIN + ")");
  const lb = await rpc("eth_getBlockByNumber", ["latest", false]), latest = parseInt(lb.number, 16);
  log("latest block:", latest, "timestamp:", new Date(parseInt(lb.timestamp, 16) * 1000).toISOString());
  log("\n== eth_getLogs window test (SPY, UIMultiplierUpdated)");
  for (const s of [latest + 1, 1e7, 1e6, 1e5, 1e4, 1e3]) {
    const t = Date.now();
    try { const r = await rpc("eth_getLogs", [{ address: TOK.SPY, topics: [T_UI], fromBlock: hex(Math.max(0, latest - s + 1)), toBlock: hex(latest) }]); log(" window", s, "ok,", r.length, "logs,", Date.now() - t, "ms"); }
    catch (e) { log(" window", s, "FAILED:", e.message); }
  }
  log("\n== multiplier events per token (60s limit each)");
  for (const s of Object.keys(TOK)) {
    try {
      const h = await history(s, latest, Date.now() + 60000);
      log(s, "events:", h.events.length, "| partial:", h.partial, "| window used:", h.size, "| calls:", h.calls);
      for (const e of h.events) log("   old", e.o, "new", e.n, "effective", new Date(e.eff * 1000).toISOString(), "block", e.block, "tx", e.tx);
    } catch (e) { log(s, "FAILED:", e.message); }
  }
  log("\n== contract getters (raw eth_call results; reverts are shown)");
  for (const s of Object.keys(TOK)) {
    const out = [];
    for (const [k, d] of [["decimals", SEL.decimals], ["uiMultiplier", SEL.ui], ["newUIMultiplier", SEL.newUI], ["effectiveAt", SEL.effAt]]) {
      try { out.push(k + "=" + BigInt(await call(TOK[s], d)).toString()); } catch (e) { out.push(k + "=ERR(" + e.message + ")"); }
    }
    log(s, out.join("  "));
  }
  log("\n== balance semantics, SPY, demo wallet", W);
  const now = BigInt(await call(TOK.SPY, SEL.balanceOf + pad32(W)));
  const sum = await sumBalance(TOK.SPY, W, latest, Date.now() + 120000);
  log("balanceOf(latest):", now.toString(), "| sum of Transfer logs:", sum === null ? "INCOMPLETE" : sum.toString(), "| match:", sum !== null && sum === now);
  const h = await history("SPY", latest, Date.now() + 60000);
  if (h.events.length) {
    const e = h.events[h.events.length - 1], b = await blockAt(e.eff, latest);
    log("SPY update effective", new Date(e.eff * 1000).toISOString(), "-> last block at or before:", b);
    const s2 = await sumBalance(TOK.SPY, W, b, Date.now() + 120000);
    log("log-sum balance at that block:", s2 === null ? "INCOMPLETE" : s2.toString());
    try { const hv = BigInt(await call(TOK.SPY, SEL.balanceOf + pad32(W), hex(b))); log("historical eth_call at that block:", hv.toString(), "| archive usable:", s2 !== null && hv === s2); }
    catch (e2) { log("historical eth_call FAILED (no archive state):", e2.message); }
  }
  log("\n== $WIF token", WIF);
  try { log("decimals:", parseInt(await call(WIF, SEL.decimals), 16), "| totalSupply:", BigInt(await call(WIF, "0x18160ddd")).toString(), "| code present:", (await rpc("eth_getCode", [WIF, "latest"])).length > 2); } catch (e) { log("WIF read FAILED:", e.message); }
  log("\nDone. Paste this whole report back.");
}

// ---- $WIF burn pass: burn $WIF (send to the dead address), server verifies it on-chain ----
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const WIF = "0x5173b8eA6923c2d40267890D45C46a3480954773"; // confirmed on worldisflat.fun
const DEAD = "0x000000000000000000000000000000000000dEaD";
const PRICE = process.env.PRICE_WIF || "100", DAYS = 30;
const DB = path.join(__dirname, "passes.json"), busy = new Set();
let db = { passes: {}, burns: [] };
try { db = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (_) {}
const save = () => { try { fs.writeFileSync(DB, JSON.stringify(db)); } catch (_) {} storeSave(); };
const wifDec = async () => parseInt(await call(WIF, SEL.decimals), 16);
const toUnits = (s, d) => { const [a, b = ""] = String(s).split("."); return BigInt(a + (b + "0".repeat(d)).slice(0, d)); };
const okPass = (p) => !!(p && db.passes[p] && db.passes[p].exp > Date.now());
async function redeem(tx, sid) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("That is not a transaction hash.");
  if (db.burns.some((b) => b.tx.toLowerCase() === tx.toLowerCase())) throw new Error("This transaction has already been used.");
  const r = await rpc("eth_getTransactionReceipt", [tx]);
  if (!r) throw new Error("Transaction not found yet. Wait a moment and try again.");
  if (r.status !== "0x1") throw new Error("That transaction failed on-chain.");
  const dec = await wifDec(), need = toUnits(PRICE, dec), dead = "0x" + pad32(DEAD);
  let paid = 0n, from = null;
  for (const l of r.logs) if (l.address.toLowerCase() === WIF.toLowerCase() && l.topics.length === 3 && l.topics[0] === T_TR && l.topics[2].toLowerCase() === dead) { paid += BigInt(l.data); from = "0x" + l.topics[1].slice(26); }
  if (paid < need) throw new Error("No transfer of at least " + PRICE + " $WIF to the dead address was found in that transaction.");
  if (sid) { const s = sessions.get(sid); if (!s) throw new Error("Your wallet session expired. Connect again."); if (s.a !== from.toLowerCase()) throw new Error("That burn came from a different wallet than the one you signed in with."); }
  const pass = crypto.randomBytes(16).toString("hex"), exp = Date.now() + DAYS * 864e5;
  db.passes[pass] = { exp, from, tx }; db.burns.push({ tx, from, amount: paid.toString(), t: Date.now() }); save();
  return { pass, exp, from, amount: paid.toString(), decimals: dec };
}
async function stats() {
  let dec = null; try { dec = await wifDec(); } catch (_) {}
  let tot = 0n; for (const b of db.burns) tot += BigInt(b.amount);
  return { burned: tot.toString(), decimals: dec, count: db.burns.length, recent: db.burns.slice(-5).reverse().map((b) => ({ tx: b.tx, amount: b.amount, t: b.t })) };
}

// ---- live radar + Telegram alerts ----
const BOT = process.env.TELEGRAM_BOT_TOKEN || "", BOT_NAME = process.env.BOT_USERNAME || "", TG = process.env.TG_API || "https://api.telegram.org";
const APP_URL = (process.env.APP_URL || "").replace(/\/$/, ""), TICK = Number(process.env.TICK_MS || 60000), ONE18 = 10n ** 18n;
db.sent = db.sent || {};
const radar = { ev: {}, seen: {}, full: {}, now: 0, nowAt: 0, err: null };
const SEED = { // verified on-chain events (from the evidence report); the watcher adds anything new
  SPY: [{ o: "1000000000000000000", n: "1001717991187472003", eff: 1789690233, tx: "0x2fe45ab24d1b3fa87883f8b08daf29dae969c5b43d0afe9ccca299c11a641025", block: 65779981 }],
  NVDA: [{ o: "1000000000000000000", n: "1000775159164630595", eff: 1788998430, tx: "0x4ac23f2e58e2c4962dcd701c2beff581e87f3995152a29d527c07a3afd67d956", block: 58952659 }],
};
for (const s of Object.keys(TOK)) radar.ev[s] = [...(SEED[s] || [])];
const parseEv = (logs) => logs.map((l) => { const d = l.data.slice(2); return { o: BigInt("0x" + d.slice(0, 64)).toString(), n: BigInt("0x" + d.slice(64, 128)).toString(), eff: Number(BigInt("0x" + d.slice(128, 192))), tx: l.transactionHash, block: parseInt(l.blockNumber, 16) }; });
function addEvent(s, e) { const L = radar.ev[s]; if (!L.some((x) => x.tx === e.tx && x.eff === e.eff)) { L.push(e); L.sort((a, b) => a.eff - b.eff); } }
const fxs = (b, d, s = 4) => { s = Math.min(s, d); const ng = b < 0n; if (ng) b = -b; const q = 10n ** BigInt(d - s); b = (b + q / 2n) / q; const t = b.toString().padStart(s + 1, "0"); return (ng ? "-" : "") + t.slice(0, t.length - s).replace(/\B(?=(\d{3})+$)/g, ",") + (s ? "." + t.slice(-s) : ""); };
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4), decC = {};
const decOf = async (s) => decC[s] ?? (decC[s] = parseInt(await call(TOK[s], SEL.decimals), 16));
const radarJson = () => ({ now: radar.now ? radar.now + Math.round((Date.now() - radar.nowAt) / 1000) : null, error: radar.err, tokens: Object.keys(TOK).map((s) => ({ sym: s, complete: !!radar.full[s], events: radar.ev[s] })) });

function alertText(s, e, kind, wallet, bal, dec) {
  const ch = (bal * (BigInt(e.n) - BigInt(e.o))) / ONE18, when = new Date(e.eff * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const head = kind === "pre" ? "Scheduled: " : kind === "live" ? "Now effective: " : "Example from a past update: ";
  return head + s + " multiplier " + fxs(BigInt(e.o), 18, 9) + " → " + fxs(BigInt(e.n), 18, 9) + ", effective " + when + ".\nWallet " + short(wallet) + " holds " + fxs(bal, dec) + " " + s + " tokens, which corresponds to " + (ch < 0n ? "" : "+") + fxs(ch, dec) + " underlying shares represented.\n" + (APP_URL ? APP_URL + "/app?t=" + s + "&w=" + wallet + "\n" : "") + "Transaction: https://robinhoodchain.blockscout.com/tx/" + e.tx;
}
async function tg(method, body) { const r = await fetch(TG + "/bot" + BOT + "/" + method, { method: "POST", headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify(body) }); return r.json(); }
const say = (chat, text) => tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true }).catch(() => {});
async function sendExample(p, chat) {
  for (const s of Object.keys(TOK)) {
    const L = radar.ev[s].filter((e) => e.eff * 1 <= (radar.now || Infinity)); if (!L.length) continue;
    const bal = BigInt(await call(TOK[s], SEL.balanceOf + pad32(p.from)));
    if (bal > 0n) return say(chat, alertText(s, L[L.length - 1], "past", p.from, bal, await decOf(s)));
  }
  return say(chat, "This wallet holds none of the five stock tokens right now, so there is nothing to alert on yet.");
}
async function onMsg(m) {
  if (!m || !m.text) return;
  const t = m.text.trim(), chat = m.chat.id, mm = /^\/start\s+([0-9a-f]{32})$/i.exec(t);
  if (mm) {
    const p = db.passes[mm[1]];
    if (!p || p.exp < Date.now()) return say(chat, "That pass is invalid or has expired.");
    p.chat = chat; save();
    await say(chat, "Alerts are on for wallet " + short(p.from) + " until " + new Date(p.exp).toISOString().slice(0, 10) + ". You will be told when a multiplier update is scheduled and when it takes effect, only for stock tokens this wallet holds. Send /stop to turn them off.");
    return sendExample2(p, chat);
  }
  if (t === "/stop") { for (const k in db.passes) if (db.passes[k].chat === chat) delete db.passes[k].chat; save(); return say(chat, "Alerts stopped."); }
  return say(chat, "Open the website, unlock Pro, and use the Telegram link there to turn alerts on. Send /stop to turn them off.");
}
async function pollTg() {
  let off = 0;
  for (;;) {
    try { const j = await tg("getUpdates", { offset: off, timeout: 25, allowed_updates: ["message"] }); for (const u of j.result || []) { off = u.update_id + 1; await onMsg(u.message); } }
    catch (e) { await sleep(5000); }
  }
}
async function notifyDue(now) {
  for (const [pk, p] of Object.entries(db.passes)) {
    if (!p.chat || p.exp < Date.now()) continue;
    for (const s of Object.keys(TOK)) for (const e of radar.ev[s]) {
      const kind = e.eff > now ? "pre" : now - e.eff < 900 ? "live" : null; if (!kind) continue;
      const key = pk + ":" + s + ":" + e.tx + ":" + kind; if (db.sent[key]) continue;
      const bal = BigInt(await call(TOK[s], SEL.balanceOf + pad32(p.from)));
      db.sent[key] = 1; save();
      if (bal > 0n) await say(p.chat, alertText(s, e, kind, p.from, bal, await decOf(s)));
    }
  }
}
async function tick() {
  try {
    const lb = await rpc("eth_getBlockByNumber", ["latest", false]), latest = parseInt(lb.number, 16), now = parseInt(lb.timestamp, 16);
    radar.now = now; radar.nowAt = Date.now();
    for (const s of Object.keys(TOK)) {
      const from = (radar.seen[s] ?? latest - 1) + 1; if (from > latest) continue;
      const r = await getLogs({ address: TOK[s], topics: [T_UI] }, from, latest, Date.now() + 20000);
      if (r.partial) continue; // try the same range again next time
      radar.seen[s] = latest; for (const e of parseEv(r.logs)) addEvent(s, e);
    }
    radar.err = null; await notifyDue2(now);
  } catch (e) { radar.err = e.message; }
}
async function bootScan() {
  try {
    const lb = await rpc("eth_getBlockByNumber", ["latest", false]), latest = parseInt(lb.number, 16);
    for (const s of Object.keys(TOK)) { const H = await history(s, latest, Date.now() + 90000); for (const e of H.events) addEvent(s, e); radar.full[s] = !H.partial; }
  } catch (e) { radar.err = e.message; }
}
function startBackground() { tick(); setInterval(tick, TICK); bootScan(); if (BOT) pollTg(); else console.log("Telegram alerts off (set TELEGRAM_BOT_TOKEN and BOT_USERNAME to enable)."); }

// ---- rooms: live chat. Anyone reads; posting needs a Pro pass (a $WIF burn) ----
const EE = new (require("events"))(); EE.setMaxListeners(0);
db.chat = db.chat || { id: 0, msgs: {} };
const ROOMS = [...Object.keys(TOK), "GENERAL"], lastPost = {}, hourly = {}, holdC = {};
const URLISH = /(https?:|www\.|t\.me|[a-z0-9-]{2,}\.(com|io|xyz|fun|app|org|net|co|gg|me|ly|eth|win|finance|dev|ai)\b)/i;
const clean = (t) => String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const who = (pass) => crypto.createHash("sha256").update(pass).digest("hex").slice(0, 10);
const pub = (m) => ({ id: m.id, t: m.t, n: m.n || "", w: m.w, holder: m.holder, text: m.text, by: m.by });
async function holds(room, wallet) {
  if (!TOK[room]) return false;
  const k = room + wallet, c = holdC[k]; if (c && Date.now() - c.t < 300000) return c.v;
  let v = false; try { v = BigInt(await call(TOK[room], SEL.balanceOf + pad32(wallet))) > 0n; } catch (_) {}
  holdC[k] = { t: Date.now(), v }; return v;
}
async function postMsg(pass, room, text) {
  if (!okPass(pass)) throw new Error("Pro pass missing or expired.");
  if (!ROOMS.includes(room)) throw new Error("Unknown room.");
  if (!db.passes[pass].name) throw new Error("Pick a username first.");
  text = clean(text);
  if (!text) throw new Error("Write something first.");
  if (text.length > 240) throw new Error("Keep it under 240 characters.");
  if (URLISH.test(text)) throw new Error("Links are not allowed in rooms.");
  const now = Date.now(), p = db.passes[pass];
  if (lastPost[pass] && now - lastPost[pass] < 4000) throw new Error("Slow down a little.");
  const h = (hourly[pass] = (hourly[pass] || []).filter((t) => now - t < 3600000));
  if (h.length >= 30) throw new Error("Hourly limit reached.");
  h.push(now); lastPost[pass] = now;
  const m = { id: ++db.chat.id, t: Math.floor(now / 1000), n: p.name, w: short(p.from), holder: await holds(room, p.from), text, by: who(pass), rep: [] };
  const L = (db.chat.msgs[room] = db.chat.msgs[room] || []); L.push(m); if (L.length > 200) L.shift(); save();
  EE.emit(room, { type: "msg", m: pub(m) }); return m;
}
async function reportMsg(pass, room, id) {
  if (!okPass(pass)) throw new Error("Pro pass missing or expired.");
  const m = (db.chat.msgs[room] || []).find((x) => x.id === id); if (!m) throw new Error("Message not found.");
  const me = who(pass); if (m.by === me || m.rep.includes(me)) return;
  m.rep.push(me); if (m.rep.length >= 3 && !m.hidden) { m.hidden = true; EE.emit(room, { type: "hide", id }); }
  save();
}

// ---- renewals, extra wallets, health check, optional persistent store ----
const PRICE_WALLET = process.env.PRICE_WALLET_WIF || PRICE, MAXW = 4;
const UP = process.env.UPSTASH_REDIS_REST_URL || "", UPT = process.env.UPSTASH_REDIS_REST_TOKEN || "";
let storeOk = false, saveT = null;
const up = async (cmd) => { const r = await fetch(UP, { method: "POST", headers: { authorization: "Bearer " + UPT, "content-type": "application/json" }, body: JSON.stringify(cmd) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j.result; };
async function loadStore() {
  if (!UP) return;
  try {
    const v = await up(["GET", "mx_db"]);
    if (v) { Object.assign(db, JSON.parse(v)); db.sent = db.sent || {}; db.chat = db.chat || { id: 0, msgs: {} }; }
    storeOk = true; console.log("Store: loaded " + Object.keys(db.passes).length + " passes");
  } catch (e) { console.log("Store load failed (saving to it is disabled):", e.message); }
}
function storeSave() { // only writes after a successful load, so an outage can never overwrite saved data with an empty copy
  if (!UP || !storeOk || saveT) return;
  saveT = setTimeout(async () => { saveT = null; try { await up(["SET", "mx_db", JSON.stringify(db)]); } catch (e) { console.log("Store save failed:", e.message); } }, 1500);
}
const walletsOf = (p) => [p.from, ...(p.wallets || [])];
async function verifyBurn(tx, price) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("That is not a transaction hash.");
  if (db.burns.some((b) => b.tx.toLowerCase() === tx.toLowerCase())) throw new Error("This transaction has already been used.");
  const r = await rpc("eth_getTransactionReceipt", [tx]);
  if (!r) throw new Error("Transaction not found yet. Wait a moment and try again.");
  if (r.status !== "0x1") throw new Error("That transaction failed on-chain.");
  const dec = await wifDec(), need = toUnits(price, dec), dead = "0x" + pad32(DEAD);
  let paid = 0n, from = null;
  for (const l of r.logs) if (l.address.toLowerCase() === WIF.toLowerCase() && l.topics.length === 3 && l.topics[0] === T_TR && l.topics[2].toLowerCase() === dead) { paid += BigInt(l.data); from = "0x" + l.topics[1].slice(26); }
  if (paid < need) throw new Error("No transfer of at least " + price + " $WIF to the dead address was found in that transaction.");
  return { from, paid };
}
async function renew(pass, tx) {
  const p = db.passes[pass]; if (!p) throw new Error("Pro pass not found.");
  const v = await verifyBurn(tx, PRICE);
  p.exp = Math.max(p.exp, Date.now()) + DAYS * 864e5; delete p.reminded;
  db.burns.push({ tx, from: v.from, amount: v.paid.toString(), t: Date.now() }); save();
  return { exp: p.exp };
}
async function addWallet(pass, tx, wallet) {
  if (!okPass(pass)) throw new Error("Pro pass missing or expired.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new Error("Enter a 42-character wallet address starting with 0x.");
  const p = db.passes[pass], w = wallet.toLowerCase();
  if (walletsOf(p).some((x) => x.toLowerCase() === w)) throw new Error("That wallet is already watched.");
  if ((p.wallets || []).length >= MAXW) throw new Error("A pass can watch up to " + (MAXW + 1) + " wallets.");
  const v = await verifyBurn(tx, PRICE_WALLET);
  (p.wallets = p.wallets || []).push(wallet); db.burns.push({ tx, from: v.from, amount: v.paid.toString(), t: Date.now() }); save();
  return { wallets: walletsOf(p) };
}
async function sendExample2(p, chat) {
  for (const w of walletsOf(p)) for (const s of Object.keys(TOK)) {
    const L = radar.ev[s].filter((e) => e.eff <= (radar.now || Infinity)); if (!L.length) continue;
    const bal = BigInt(await call(TOK[s], SEL.balanceOf + pad32(w)));
    if (bal > 0n) return say(chat, alertText(s, L[L.length - 1], "past", w, bal, await decOf(s)));
  }
  return say(chat, "None of your watched wallets holds the five stock tokens right now, so there is nothing to alert on yet.");
}
async function notifyDue2(now) {
  for (const [pk, p] of Object.entries(db.passes)) {
    if (!p.chat || p.exp < Date.now()) continue;
    if (p.exp - Date.now() < 3 * 864e5 && !p.reminded) {
      p.reminded = true; save();
      await say(p.chat, "Your Pro pass ends on " + new Date(p.exp).toISOString().slice(0, 10) + ". To keep your alerts, renew at " + (APP_URL || "the website") + "/app#pro: burn " + PRICE + " $WIF, then paste the hash under Manage your pass.");
    }
    for (const w of walletsOf(p)) for (const s of Object.keys(TOK)) for (const e of radar.ev[s]) {
      const kind = e.eff > now ? "pre" : now - e.eff < 900 ? "live" : null; if (!kind) continue;
      const key = pk + ":" + w + ":" + s + ":" + e.tx + ":" + kind; if (db.sent[key]) continue;
      const bal = BigInt(await call(TOK[s], SEL.balanceOf + pad32(w)));
      db.sent[key] = 1; save();
      if (bal > 0n) await say(p.chat, alertText(s, e, kind, w, bal, await decOf(s)));
    }
  }
}
async function tgCheck() {
  if (!BOT) return { ok: false, why: "TELEGRAM_BOT_TOKEN is not set" };
  try {
    const j = await tg("getMe", {});
    if (!j.ok) return { ok: false, why: "Telegram rejected the token: " + (j.description || "unknown") };
    const same = !BOT_NAME || j.result.username.toLowerCase() === BOT_NAME.toLowerCase();
    return { ok: same, username: j.result.username, why: same ? undefined : "BOT_USERNAME is " + BOT_NAME + " but the token belongs to " + j.result.username };
  } catch (e) { return { ok: false, why: "Could not reach Telegram: " + e.message }; }
}

// ---- usernames for the rooms ----
db.names = db.names || {};
const RESERVED = /(admin|moderator|robinhood|official|support|staff)/i, RESERVED_EXACT = /^(mod|wif|root|system|team)$/i;
function setName(pass, raw) {
  if (!okPass(pass)) throw new Error("Pro pass missing or expired.");
  const n = String(raw || "").trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) throw new Error("Use 3 to 16 letters, numbers or underscores.");
  if (RESERVED.test(n) || RESERVED_EXACT.test(n)) throw new Error("That name is reserved.");
  const p = db.passes[pass], k = n.toLowerCase();
  if (db.names[k] && db.names[k] !== pass) throw new Error("That name is taken.");
  if (p.name && p.name.toLowerCase() !== k && p.nameAt && Date.now() - p.nameAt < 7 * 864e5) throw new Error("You can change your name once every 7 days.");
  if (p.name) delete db.names[p.name.toLowerCase()];
  p.name = n; p.nameAt = Date.now(); db.names[k] = pass; save();
  return n;
}

// ---- wallet sign-in: proves ownership of an address, restores a pass, binds a burn claim to its sender ----
const eth = require("./eth.js"), SECRET = crypto.randomBytes(32), sessions = new Map();
const mac = (ts) => crypto.createHmac("sha256", SECRET).update(String(ts)).digest("hex").slice(0, 24);
const loginMessage = () => { const ts = Date.now(); return "Multiplier Explorer sign-in\nThis only proves you own this wallet. It sends no transaction and costs nothing.\nTime: " + ts + "\nCode: " + mac(ts); };
function login(addr, message, sig) {
  const m = /Time: (\d+)\nCode: ([0-9a-f]{24})$/.exec(String(message || ""));
  if (!m || !message.startsWith("Multiplier Explorer sign-in\n") || m[2] !== mac(m[1])) throw new Error("The sign-in message was not recognised. Try again.");
  if (Date.now() - Number(m[1]) > 10 * 60000) throw new Error("The sign-in message expired. Try again.");
  let who; try { who = eth.recover(message, sig).toLowerCase(); } catch (_) { throw new Error("That signature is not valid."); }
  if (who !== String(addr).toLowerCase()) throw new Error("The signature does not match that wallet.");
  for (const [k, v] of sessions) if (Date.now() - v.t > 864e5) sessions.delete(k);
  const sid = crypto.randomBytes(16).toString("hex"); sessions.set(sid, { a: who, t: Date.now() });
  let best = null; for (const [k, p] of Object.entries(db.passes)) if (p.from && p.from.toLowerCase() === who && p.exp > Date.now() && (!best || p.exp > db.passes[best].exp)) best = k;
  return { sid, address: who, pass: best || undefined, name: best ? db.passes[best].name || "" : "" };
}

// ---- portfolio: one wallet across all five tokens (reads the radar's known updates, so it is cheap) ----
async function portfolio(w) {
  const now = radar.now || Math.floor(Date.now() / 1000);
  const tokens = await Promise.all(Object.keys(TOK).map(async (s) => {
    const [dec, bal, mu] = await Promise.all([decOf(s), call(TOK[s], SEL.balanceOf + pad32(w)).then((x) => BigInt(x)), call(TOK[s], SEL.ui).then((x) => BigInt(x)).catch(() => null)]);
    const ev = radar.ev[s], past = ev.filter((e) => e.eff <= now), next = ev.filter((e) => e.eff > now)[0] || null, last = past[past.length - 1] || null;
    return { sym: s, decimals: dec, balance: bal.toString(), shares: mu !== null ? ((bal * mu) / ONE18).toString() : last ? ((bal * BigInt(last.n)) / ONE18).toString() : null, mult: mu === null ? null : mu.toString(), last, next, complete: !!radar.full[s] };
  }));
  return { wallet: w, now, tokens };
}

const rd = (f) => require("fs").readFileSync(require("path").join(__dirname, f), "utf8");
const HTML = rd("index.html"), HOME = rd("home.html"), ROOMSPAGE = rd("rooms.html"), JUDGESPAGE = rd("judges.html"), BUILDERSPAGE = rd("builders.html");
const STATIC = { "/logo.svg": [rd("logo.svg"), "image/svg+xml"], "/mark.svg": [rd("mark.svg"), "image/svg+xml"], "/site.css": [rd("site.css"), "text/css; charset=utf-8"], "/site.js": [rd("site.js"), "application/javascript; charset=utf-8"], "/wallet.js": [rd("wallet.js"), "application/javascript; charset=utf-8"] };
if (process.argv[2] === "verify") verify().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });
else http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HOME); }
  if (u.pathname === "/rooms") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(ROOMSPAGE); }
  if (STATIC[u.pathname]) { res.writeHead(200, { "content-type": STATIC[u.pathname][1], "cache-control": "public, max-age=300" }); return res.end(STATIC[u.pathname][0]); }
  if (u.pathname === "/builders") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(BUILDERSPAGE); }
  if (u.pathname === "/judges") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(JUDGESPAGE); }
  if (u.pathname === "/app") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HTML); }
  if (u.pathname === "/api/chat/stream") {
    const room = u.searchParams.get("room");
    if (!ROOMS.includes(room)) { res.writeHead(400); return res.end(); }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const send = (o) => res.write("data: " + JSON.stringify(o) + "\n\n");
    send({ type: "init", msgs: (db.chat.msgs[room] || []).filter((m) => !m.hidden).slice(-100).map(pub) });
    EE.on(room, send);
    const ka = setInterval(() => res.write(": ka\n\n"), 20000);
    req.on("close", () => { clearInterval(ka); EE.off(room, send); });
    return;
  }
  if (u.pathname === "/api/chat/post" || u.pathname === "/api/chat/report" || u.pathname === "/api/chat/name" || u.pathname === "/api/login") {
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(o)); };
    let body = ""; req.on("data", (d) => { body += d; if (body.length > 2000) req.destroy(); });
    req.on("end", async () => {
      try {
        const j = JSON.parse(body || "{}"), pass = req.headers["x-pass"];
        if (u.pathname.endsWith("post")) { const m = await postMsg(pass, j.room, j.text); send(200, { ok: true, id: m.id }); }
        else if (u.pathname === "/api/login") { send(200, login(j.address, j.message, j.signature)); }
        else if (u.pathname.endsWith("name")) { send(200, { name: setName(pass, j.name) }); }
        else { await reportMsg(pass, j.room, j.id); send(200, { ok: true }); }
      } catch (e) { send(400, { error: e.message }); }
    });
    return;
  }
  
if (["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats", "/api/radar", "/api/health", "/api/renew", "/api/addwallet", "/api/nonce", "/api/portfolio"].includes(u.pathname)) {
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(o)); };
    try {
      if (u.pathname === "/api/pass-info") return send(200, { token: WIF, dead: DEAD, price: PRICE, decimals: await wifDec(), days: DAYS, bot: BOT_NAME });
      if (u.pathname === "/api/portfolio") { const w = u.searchParams.get("wallet") || ""; if (!/^0x[0-9a-fA-F]{40}$/.test(w)) throw new Error("Invalid wallet address"); return send(200, await portfolio(w)); }
      if (u.pathname === "/api/nonce") return send(200, { message: loginMessage() });
      if (u.pathname === "/api/health") return send(200, { ok: true, telegram: await tgCheck(), burns: db.burns.length, store: UP ? (storeOk ? "external" : "external (not loaded)") : "file", chainTime: radar.now || null });
      if (u.pathname === "/api/renew" || u.pathname === "/api/addwallet") {
        const pass = req.headers["x-pass"], tx = u.searchParams.get("tx") || "";
        if (busy.has(tx)) throw new Error("That transaction is already being checked.");
        busy.add(tx);
        try { return send(200, u.pathname === "/api/renew" ? await renew(pass, tx) : await addWallet(pass, tx, u.searchParams.get("wallet") || "")); } finally { busy.delete(tx); }
      }
      
if (u.pathname === "/api/radar") return send(200, radarJson());
      if (u.pathname === "/api/stats") return send(200, await stats());
      if (u.pathname === "/api/pass") { const p = db.passes[u.searchParams.get("pass")]; return send(200, p && p.exp > Date.now() ? { valid: true, exp: p.exp, wallets: walletsOf(p), tg: !!p.chat, price: PRICE, priceWallet: PRICE_WALLET, name: p.name || "", me: who(u.searchParams.get("pass")) } : { valid: false }); }
      const tx = u.searchParams.get("tx") || "";
      if (busy.has(tx)) throw new Error("That transaction is already being checked.");
      busy.add(tx);
      try { return send(200, await redeem(tx, req.headers["x-sid"])); } finally { busy.delete(tx); }
    } catch (e) { return send(400, { error: e.message }); }
  }
  if (u.pathname === "/api/lookup") {
    const t = u.searchParams.get("token"), w = u.searchParams.get("wallet") || "";
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(o)); };
    if (!TOK[t]) return send(400, { error: "Unknown token" });
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) return send(400, { error: "Invalid wallet address" });
    const wantPro = u.searchParams.get("full") === "1";
    if (wantPro && !okPass(req.headers["x-pass"])) return send(401, { error: "Pro pass missing or expired." });
    try { send(200, await lookup(t, w, wantPro)); } catch (e) { send(502, { error: e.message }); }
    return;
  }
  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => { console.log("Running on http://localhost:" + PORT + "  (RPC: " + RPC + ")"); loadStore().finally(() => { startBackground(); tgCheck().then((r) => console.log("Telegram:", JSON.stringify(r))); }); });
