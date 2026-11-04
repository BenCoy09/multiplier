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
