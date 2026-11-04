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
