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
const call = (to, data, block = "latest") => rpc("eth_call", [{ to, data }, block]);

// eth_getLogs over [from,to]. Shrinks the window until the node accepts it, then sweeps. Never hides a failure.
async function getLogs(base, from, to, deadline) {
  const q = (a, b) => rpc("eth_getLogs", [{ ...base, fromBlock: hex(a), toBlock: hex(b) }]);
  let size = to - from + 1, first;
  for (;;) {
    try { first = await q(from, Math.min(to, from + size - 1)); break; }
    catch (e) { if (!e.rpc || size <= 1000) throw e; size = Math.max(1000, Math.floor(size / 4)); }
  }
  const logs = [...first], ranges = [];
  for (let a = from + size; a <= to; a += size) ranges.push([a, Math.min(to, a + size - 1)]);
  let i = 0, partial = false;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (i < ranges.length) {
      if (Date.now() > deadline) { partial = true; return; }
      const [x, y] = ranges[i++]; logs.push(...(await q(x, y)));
    }
  }));
  return { logs, partial, size, calls: ranges.length + 1 };
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
  return { token: sym, chainId: cid, latestBlock: latest, decimals, balanceNow, events, scheduled, pending, partialHistory: H.partial, atUpdate, perEvent };
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
const save = () => fs.writeFileSync(DB, JSON.stringify(db));
const wifDec = async () => parseInt(await call(WIF, SEL.decimals), 16);
const toUnits = (s, d) => { const [a, b = ""] = String(s).split("."); return BigInt(a + (b + "0".repeat(d)).slice(0, d)); };
const okPass = (p) => !!(p && db.passes[p] && db.passes[p].exp > Date.now());
async function redeem(tx) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("That is not a transaction hash.");
  if (db.burns.some((b) => b.tx.toLowerCase() === tx.toLowerCase())) throw new Error("This transaction has already been used.");
  const r = await rpc("eth_getTransactionReceipt", [tx]);
  if (!r) throw new Error("Transaction not found yet. Wait a moment and try again.");
  if (r.status !== "0x1") throw new Error("That transaction failed on-chain.");
  const dec = await wifDec(), need = toUnits(PRICE, dec), dead = "0x" + pad32(DEAD);
  let paid = 0n, from = null;
  for (const l of r.logs) if (l.address.toLowerCase() === WIF.toLowerCase() && l.topics.length === 3 && l.topics[0] === T_TR && l.topics[2].toLowerCase() === dead) { paid += BigInt(l.data); from = "0x" + l.topics[1].slice(26); }
  if (paid < need) throw new Error("No transfer of at least " + PRICE + " $WIF to the dead address was found in that transaction.");
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
async function tg(method, body) { const r = await fetch(TG + "/bot" + BOT + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }
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
    return sendExample(p, chat);
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
    radar.err = null; await notifyDue(now);
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
const pub = (m) => ({ id: m.id, t: m.t, w: m.w, holder: m.holder, text: m.text, by: m.by });
async function holds(room, wallet) {
  if (!TOK[room]) return false;
  const k = room + wallet, c = holdC[k]; if (c && Date.now() - c.t < 300000) return c.v;
  let v = false; try { v = BigInt(await call(TOK[room], SEL.balanceOf + pad32(wallet))) > 0n; } catch (_) {}
  holdC[k] = { t: Date.now(), v }; return v;
}
async function postMsg(pass, room, text) {
  if (!okPass(pass)) throw new Error("Pro pass missing or expired.");
  if (!ROOMS.includes(room)) throw new Error("Unknown room.");
  text = clean(text);
  if (!text) throw new Error("Write something first.");
  if (text.length > 240) throw new Error("Keep it under 240 characters.");
  if (URLISH.test(text)) throw new Error("Links are not allowed in rooms.");
  const now = Date.now(), p = db.passes[pass];
  if (lastPost[pass] && now - lastPost[pass] < 4000) throw new Error("Slow down a little.");
  const h = (hourly[pass] = (hourly[pass] || []).filter((t) => now - t < 3600000));
  if (h.length >= 30) throw new Error("Hourly limit reached.");
  h.push(now); lastPost[pass] = now;
  const m = { id: ++db.chat.id, t: Math.floor(now / 1000), w: short(p.from), holder: await holds(room, p.from), text, by: who(pass), rep: [] };
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

const rd = (f) => require("fs").readFileSync(require("path").join(__dirname, f), "utf8");
const HTML = rd("index.html"), HOME = rd("home.html"), ROOMSPAGE = rd("rooms.html");
if (process.argv[2] === "verify") verify().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });
else http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HOME); }
  if (u.pathname === "/rooms") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(ROOMSPAGE); }
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
  if (u.pathname === "/api/chat/post" || u.pathname === "/api/chat/report") {
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    let body = ""; req.on("data", (d) => { body += d; if (body.length > 2000) req.destroy(); });
    req.on("end", async () => {
      try {
        const j = JSON.parse(body || "{}"), pass = req.headers["x-pass"];
        if (u.pathname.endsWith("post")) { const m = await postMsg(pass, j.room, j.text); send(200, { ok: true, id: m.id }); }
        else { await reportMsg(pass, j.room, j.id); send(200, { ok: true }); }
      } catch (e) { send(400, { error: e.message }); }
    });
    return;
  }
  
if (["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats", "/api/radar"].includes(u.pathname)) {
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    try {
      if (u.pathname === "/api/pass-info") return send(200, { token: WIF, dead: DEAD, price: PRICE, decimals: await wifDec(), days: DAYS, bot: BOT_NAME });
      if (u.pathname === "/api/radar") return send(200, radarJson());
      if (u.pathname === "/api/stats") return send(200, await stats());
      if (u.pathname === "/api/pass") { const p = db.passes[u.searchParams.get("pass")]; return send(200, p && p.exp > Date.now() ? { valid: true, exp: p.exp } : { valid: false }); }
      const tx = u.searchParams.get("tx") || "";
      if (busy.has(tx)) throw new Error("That transaction is already being checked.");
      busy.add(tx);
      try { return send(200, await redeem(tx)); } finally { busy.delete(tx); }
    } catch (e) { return send(400, { error: e.message }); }
  }
  if (u.pathname === "/api/lookup") {
    const t = u.searchParams.get("token"), w = u.searchParams.get("wallet") || "";
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (!TOK[t]) return send(400, { error: "Unknown token" });
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) return send(400, { error: "Invalid wallet address" });
    const wantPro = u.searchParams.get("full") === "1";
    if (wantPro && !okPass(req.headers["x-pass"])) return send(401, { error: "Pro pass missing or expired." });
    try { send(200, await lookup(t, w, wantPro)); } catch (e) { send(502, { error: e.message }); }
    return;
  }
  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => { console.log("Running on http://localhost:" + PORT + "  (RPC: " + RPC + ")"); startBackground(); });
