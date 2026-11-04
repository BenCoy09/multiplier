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
async function lookup(sym, w) {
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
  return { token: sym, chainId: cid, latestBlock: latest, decimals, balanceNow, events, scheduled, pending, partialHistory: H.partial, atUpdate };
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
  log("\nDone. Paste this whole report back.");
}

const HTML = require("fs").readFileSync(require("path").join(__dirname, "index.html"), "utf8");
if (process.argv[2] === "verify") verify().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });
else http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HTML); }
  if (u.pathname === "/api/lookup") {
    const t = u.searchParams.get("token"), w = u.searchParams.get("wallet") || "";
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (!TOK[t]) return send(400, { error: "Unknown token" });
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) return send(400, { error: "Invalid wallet address" });
    try { send(200, await lookup(t, w)); } catch (e) { send(502, { error: e.message }); }
    return;
  }
  res.writeHead(404); res.end("Not found");
}).listen(PORT, () => console.log("Running on http://localhost:" + PORT + "  (RPC: " + RPC + ")"));
