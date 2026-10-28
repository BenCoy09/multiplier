if (u.pathname === "/api/chat/stream") {
    const room = u.searchParams.get("room");
    if (!ROOMS.includes(room)) { res.writeHead(400); return res.end(); }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const send = (o) => res.write("data: " + JSON.stringify(o) + "\n\n");
    send({ type: "init", msgs: (db.chat.msgs[room] || []).filter((m) => !m.hidden).slice(-100).map(pub) });
    EE.on(room, send);
    const ka = setInterval(() => res.write(": ka\n\n"), 20000);
    req.on("close", () => { clearInterval(ka); EE.off(room, send); });
    return;
  }
  if (u.pathname === "/api/chat/post" || u.pathname === "/api/chat/report") {
    const send = (c, o) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    let body = ""; req.on("data", (d) => { body += d; if (body.length > 2000) req.destroy(); });
    req.on("end", async () => {
      try {
        const j = JSON.parse(body || "{}"), pass = req.headers["x-pass"];
        if (u.pathname.endsWith("post")) { const m = await postMsg(pass, j.room, j.text); send(200, { ok: true, id: m.id }); }
        else { await reportMsg(pass, j.room, j.id); send(200, { ok: true }); }
      } catch (e) { send(400, { error: e.message }); }
    });
    return;
  }
  
