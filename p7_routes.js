if (u.pathname === "/api/health") return send(200, { ok: true, telegram: await tgCheck(), burns: db.burns.length, store: UP ? (storeOk ? "external" : "external (not loaded)") : "file", chainTime: radar.now || null });
      if (u.pathname === "/api/renew" || u.pathname === "/api/addwallet") {
        const pass = req.headers["x-pass"], tx = u.searchParams.get("tx") || "";
        if (busy.has(tx)) throw new Error("That transaction is already being checked.");
        busy.add(tx);
        try { return send(200, u.pathname === "/api/renew" ? await renew(pass, tx) : await addWallet(pass, tx, u.searchParams.get("wallet") || "")); } finally { busy.delete(tx); }
      }
      
