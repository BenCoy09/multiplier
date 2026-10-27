if (["/api/pass-info", "/api/redeem", "/api/pass", "/api/stats"].includes(u.pathname)) {
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    try {
      if (u.pathname === "/api/pass-info") return send(200, { token: WIF, dead: DEAD, price: PRICE, decimals: await wifDec(), days: DAYS });
      if (u.pathname === "/api/stats") return send(200, await stats());
      if (u.pathname === "/api/pass") { const p = db.passes[u.searchParams.get("pass")]; return send(200, p && p.exp > Date.now() ? { valid: true, exp: p.exp } : { valid: false }); }
      const tx = u.searchParams.get("tx") || "";
      if (busy.has(tx)) throw new Error("That transaction is already being checked.");
      busy.add(tx);
      try { return send(200, await redeem(tx)); } finally { busy.delete(tx); }
    } catch (e) { return send(400, { error: e.message }); }
  }
  if (u.pathname === "/api/lookup") {
