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
