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
