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
