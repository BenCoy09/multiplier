const fs = require("fs"), R = (f) => fs.readFileSync(f, "utf8");
let a = R("app.js");
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the right file version?)"); return s.slice(0, i) + to + s.slice(i + from.length); }
function before(s, at, ins, name) { return rep(s, at, ins + at, name); }
a = before(a, "const rd = (f) =>", R("p9_srv.js") + "\n", "names block");
a = rep(a, 'if (!ROOMS.includes(room)) throw new Error("Unknown room.");', 'if (!ROOMS.includes(room)) throw new Error("Unknown room.");\n  if (!db.passes[pass].name) throw new Error("Pick a username first.");', "name required");
a = rep(a, "w: short(p.from), holder: await holds(room, p.from), text, by: who(pass), rep: []", "n: p.name, w: short(p.from), holder: await holds(room, p.from), text, by: who(pass), rep: []", "message name");
a = rep(a, "const pub = (m) => ({ id: m.id, t: m.t, w: m.w, holder: m.holder, text: m.text, by: m.by });", 'const pub = (m) => ({ id: m.id, t: m.t, n: m.n || "", w: m.w, holder: m.holder, text: m.text, by: m.by });', "pub");
a = rep(a, 'if (u.pathname === "/api/chat/post" || u.pathname === "/api/chat/report") {', 'if (u.pathname === "/api/chat/post" || u.pathname === "/api/chat/report" || u.pathname === "/api/chat/name") {', "name route");
a = rep(a, "else { await reportMsg(pass, j.room, j.id); send(200, { ok: true }); }", 'else if (u.pathname.endsWith("name")) { send(200, { name: setName(pass, j.name) }); }\n        else { await reportMsg(pass, j.room, j.id); send(200, { ok: true }); }', "name branch");
a = rep(a, "priceWallet: PRICE_WALLET }", 'priceWallet: PRICE_WALLET, name: p.name || "", me: who(u.searchParams.get("pass")) }', "pass info");
fs.writeFileSync("app.js", a);
fs.appendFileSync("site.css", R("p9_css.css"));
console.log("patched app.js and site.css");
