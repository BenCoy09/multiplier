const fs = require("fs"), R = (f) => fs.readFileSync(f, "utf8");
let a = R("app.js"), h = R("index.html"), m = R("home.html");
function rep(s, from, to, name) { const i = s.indexOf(from); if (i < 0) throw new Error("anchor not found: " + name + " (is this the right file version?)"); return s.slice(0, i) + to + s.slice(i + from.length); }
function before(s, at, ins, name) { return rep(s, at, ins + at, name); }
// server
a = before(a, "const rd = (f) =>", R("p_srv_a.js") + "\n", "srv a");
a = rep(a, 'if (u.pathname === "/api/lookup") {', R("p_srv_routes.js").trimEnd(), "routes");
a = rep(a, "async function lookup(sym, w) {", "async function lookup(sym, w, pro) {", "lookup sig");
a = rep(a, "return { token: sym, chainId: cid, latestBlock: latest, decimals, balanceNow, events, scheduled, pending, partialHistory: H.partial, atUpdate };", R("p_srv_pro.js").trimEnd(), "lookup return");
a = rep(a, "try { send(200, await lookup(t, w)); } catch (e) { send(502, { error: e.message }); }",
  'const wantPro = u.searchParams.get("full") === "1";\n    if (wantPro && !okPass(req.headers["x-pass"])) return send(401, { error: "Pro pass missing or expired." });\n    try { send(200, await lookup(t, w, wantPro)); } catch (e) { send(502, { error: e.message }); }', "lookup call");
a = rep(a, 'log("\\nDone. Paste this whole report back.");', R("p_srv_verify.js").trimEnd(), "verify");
// explorer page
h = before(h, "</style>", R("p_css.css"), "css");
h = rep(h, '<div id="out" aria-live="polite"></div>', '<div id="pro" class="pro"></div><div id="out" aria-live="polite"></div>', "pro div");
h = rep(h, 'try{const r=await fetch("/api/lookup?token="+cur+"&wallet="+w),d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");render(d,w)}',
  'try{const r=await fetch("/api/lookup?token="+cur+"&wallet="+w+(PASS?"&full=1":""),{headers:PASS?{"x-pass":PASS}:{}}),d=await r.json();if(r.status===401){setPass("");proInit()}if(!r.ok)throw new Error(d.error||"Request failed");render(d,w)}', "fetch");
h = rep(h, "h+=`<h2>Every multiplier change, newest first</h2><ol>${tl(d.events,0)}</ol>`}", "h+=`<h2>Every multiplier change, newest first</h2><ol>${tl(d.events,0)}</ol>`;if(d.perEvent)h+=holdTable(d,w)}", "table call");
h = before(h, "function wrap(c,t,x,y,w,lh){", R("p_cli.js"), "client");
h = before(h, "const p=new URLSearchParams(location.search);", "proInit();", "init");
// home page
m = before(m, '<section class="band">', R("p_home.html"), "home");
fs.writeFileSync("app.js", a); fs.writeFileSync("index.html", h); fs.writeFileSync("home.html", m);
console.log("patched app.js, index.html, home.html");
