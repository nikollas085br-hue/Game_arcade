// EXTRAS -- NUCLEO: conexao, administrador, mesas, convites, modos, ranking e chat.
// Os jogos ficam em extras-jogos.js. Os dois sao colados no fim do index.html pelo
// gerar-assets.mjs (voce nao precisa mexer nisso).
//
// COMO FUNCIONA: o Cardputer so repassa para todos as mensagens que comecam com {"x":1.
// Todas as regras rodam aqui, nos celulares. Cada "mesa" tem um dono (quem criou): o
// celular do dono e o juiz, confere as jogadas e manda o estado para todo mundo.
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  var EX = (window.EX = { games: {}, order: [] });
  var ADMIN_SENHA = "nikollas"; // senha do administrador (quem abrir o codigo do site consegue ve-la)

  function rid(n) { return Math.random().toString(36).slice(2, 2 + n); }
  var me = { id: rid(6), nick: "", admin: false };
  try { me.nick = localStorage.getItem("ex_nick") || ""; } catch (e) {}
  var ws = null, roster = {}, adminId = null, admT = 0, mode = "comp", rank = {}, sdqOn = false;
  var tb = {}, own = {}, pv = {}, dat = {}, cur = null, tab = "mesas", ovOpen = false, asked = false;
  var unread = 0, chat = [], parts = {}, notified = {}, draft = null;
  EX.me = me;

  // ------------------------------- transporte -------------------------------
  function send(o) {
    var m = { x: 1 }; // "x" tem que ser a primeira chave: e por ela que o Cardputer reconhece
    for (var k in o) m[k] = o[k];
    m.f = me.id;
    var s = JSON.stringify(m);
    if (ws && ws.readyState === 1) ws.send(s);
  }
  var q = [], qt = null;
  function qsend(o) { // fila do chat: um pedaco a cada 70 ms para nao entupir o Cardputer
    q.push(o);
    if (qt) return;
    qt = setInterval(function () {
      var m = q.shift();
      if (!m) { clearInterval(qt); qt = null; return; }
      send(m);
    }, 70);
  }
  function connect() {
    try { ws = new WebSocket("ws://" + location.host + "/ws"); } catch (e) { return; }
    ws.onopen = function () { send({ k: "quem" }); hello(); setTimeout(askAdmin, 3500); };
    ws.onclose = function () { setTimeout(connect, 2000); };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || m.x !== 1 || m.f === me.id) return;
      if (m.to && m.to !== me.id) return;
      onMsg(m);
    };
  }
  function hello() {
    if (!me.nick) return;
    var o = { k: "oi", n: me.nick };
    if (me.admin) { o.a = 1; o.md = mode; o.sd = sdqOn ? 1 : 0; }
    send(o);
  }
  setInterval(hello, 6000);
  function live() {
    var now = Date.now(), out = [];
    for (var id in roster) if (now - roster[id].seen < 20000 && id !== me.id) out.push({ id: id, n: roster[id].n });
    return out;
  }
  function nameOf(id) { return id === me.id ? me.nick : (roster[id] ? roster[id].n : "?"); }
  EX.nameOf = nameOf;

  // ------------------------------- administrador -------------------------------
  function askAdmin() {
    if (asked || !me.nick || adminId) return;
    asked = true;
    var b = box("Você foi o primeiro a entrar. Quer ser o Administrador?");
    b.appendChild(btn("Sim, sou o admin", function () { b.remove(); pedirSenha(); }));
    b.appendChild(btn("Não", function () { b.remove(); }));
  }
  function pedirSenha() {
    var s = prompt("Senha do administrador:");
    if (s === ADMIN_SENHA) { claimAdmin(); paint(); } else if (s !== null) alert("Senha incorreta.");
  }
  function claimAdmin() { me.admin = true; adminId = me.id; admT = Date.now(); send({ k: "adm", t: admT }); hello(); }
  function setMode(v) { mode = v; send({ k: "md", v: v }); hello(); paint(); }
  function setSdq(v) { sdqOn = v; send({ k: "sdq", v: v ? 1 : 0 }); hello(); paint(); }
  EX.sdqOn = function () { return sdqOn; };
  EX.busy = false; // true enquanto o jogador arrasta uma peca: a tela nao se redesenha
  // Busca um arquivo de questoes no cartao SD do Cardputer (ele le o cartao e o celular consulta ate ficar pronto)
  EX.fetchSd = function (name, cb, tries) {
    tries = tries || 0;
    fetch("/sdq?f=" + encodeURIComponent(name)).then(function (r) {
      if (r.status === 200) return r.text().then(function (t) { cb(t); });
      if (r.status === 202 && tries < 40) setTimeout(function () { EX.fetchSd(name, cb, tries + 1); }, 250);
      else cb(null);
    }).catch(function () { cb(null); });
  };
  var tmStart = {};
  EX.timer = function (box, secs, key) { // barra de tempo que nao reinicia a cada redesenho
    if (!tmStart[key]) tmStart[key] = Date.now();
    var left = Math.max(0, secs - (Date.now() - tmStart[key]) / 1000);
    var bar = h("div", null, "tmbar" + (left < secs * 0.25 ? " low" : "")), i = h("i");
    i.style.width = (left / secs * 100) + "%";
    bar.appendChild(i); box.appendChild(bar);
    setTimeout(function () { i.style.transition = "width " + left + "s linear"; i.style.width = "0%"; }, 40);
    return left;
  };

  // ------------------------------- ranking -------------------------------
  EX.score = function (nick, d) { // chamado pelo dono da mesa; so conta no modo competitivo
    if (mode !== "comp" || !d) return;
    rank[nick] = (rank[nick] || 0) + d;
    send({ k: "rk", n: nick, d: d });
  };
  EX.mode = function () { return mode; };
  setInterval(function () { if (me.admin) send({ k: "rks", r: rank }); }, 20000);

  // ------------------------------- mensagens -------------------------------
  function onMsg(m) {
    var t;
    switch (m.k) {
      case "quem":
        hello();
        for (var id in own) announce(own[id]);
        break;
      case "oi":
        roster[m.f] = { n: m.n, seen: Date.now() };
        if (m.a) { adminId = m.f; if (m.md) mode = m.md; sdqOn = !!m.sd; }
        break;
      case "adm":
        if (m.t > admT) { admT = m.t; adminId = m.f; if (me.admin) me.admin = false; }
        break;
      case "md": if (m.f === adminId) mode = m.v; break;
      case "sdq": if (m.f === adminId) sdqOn = !!m.v; break;
      case "rk": rank[m.n] = (rank[m.n] || 0) + m.d; break;
      case "rks": if (m.f === adminId) rank = m.r || {}; break;
      case "st":
        m.seen = Date.now();
        tb[m.id] = m;
        invite(m);
        break;
      case "pv": pv[m.id] = m.p; break;
      case "pq": if (own[m.id]) pushPriv(own[m.id], m.f); break;
      case "dt": (dat[m.id] = dat[m.id] || {})[m.key] = m.v; break;
      case "fim":
        if (m.f === adminId || (tb[m.id] && tb[m.id].o === m.f)) {
          delete tb[m.id]; delete pv[m.id]; delete dat[m.id];
          if (own[m.id] && m.f === adminId) delete own[m.id];
          if (cur === m.id) cur = null;
        }
        break;
      case "ent": case "sair": case "mv":
        t = own[m.id];
        if (t) handle(t, m);
        return;
      case "ct": addChat({ n: m.n, t: m.t }); break;
      case "ci": chunk(m); break;
    }
    paint();
  }

  // ------------------------------- mesas -------------------------------
  function isPl(t, id) { for (var i = 0; i < t.pl.length; i++) if (t.pl[i].id === id) return true; return false; }
  function canJoin(t, id) {
    var G = EX.games[t.g];
    return t.ph === "lobby" && !isPl(t, id) && t.pl.length < G.max &&
      (id === me.id || t.inv === 1 || (t.inv && t.inv.indexOf(id) >= 0));
  }
  function handle(t, m) {
    var G = EX.games[t.g], i;
    if (m.k === "ent") {
      if (canJoin(t, m.f)) { t.pl.push({ id: m.f, n: nameOf(m.f) }); announce(t); }
    } else if (m.k === "sair") {
      if (t.ph === "lobby") for (i = 0; i < t.pl.length; i++) if (t.pl[i].id === m.f) t.pl.splice(i, 1);
      announce(t);
    } else if (m.k === "mv") {
      if (isPl(t, m.f)) G.msg(t, m);
    }
  }
  function announce(t, withPriv) {
    if (own[t.id] !== t) return; // mesa ja encerrada (um temporizador atrasado nao pode ressuscita-la)
    var G = EX.games[t.g];
    var s = { k: "st", id: t.id, g: t.g, o: me.id, on: me.nick, inv: t.inv, pl: t.pl, ph: t.ph, opt: t.opt, err: t.err || "", s: G.pub(t) };
    send(s);
    var c = JSON.parse(JSON.stringify(s)); c.f = me.id; c.seen = Date.now();
    tb[t.id] = c;
    if (withPriv) t.pl.forEach(function (p) { pushPriv(t, p.id); });
    paint();
  }
  function pushPriv(t, pid) {
    var G = EX.games[t.g];
    if (!G.priv) return;
    var o = G.priv(t, pid);
    if (!o) return;
    if (pid === me.id) pv[t.id] = o; else send({ k: "pv", id: t.id, to: pid, p: o });
  }
  function act(id, o) { // jogada do jogador: vai para o dono da mesa
    o.k = "mv"; o.id = id;
    if (own[id]) { o.f = me.id; handle(own[id], o); } else if (tb[id]) { o.to = tb[id].o; send(o); }
  }
  EX.announce = announce;
  EX.data = function (t, key, v) { send({ k: "dt", id: t.id, key: key, v: v }); (dat[t.id] = dat[t.id] || {})[key] = v; };
  EX.reg = function (g, def) { EX.games[g] = def; EX.order.push(g); };

  function create(g, inv) {
    var G = EX.games[g], opt = {};
    (G.opts || []).forEach(function (o) { opt[o.k] = o.def; });
    var t = { id: g.charAt(0) + rid(4), g: g, inv: inv, pl: [{ id: me.id, n: me.nick }], ph: "lobby", opt: opt };
    if (G.init) G.init(t);
    own[t.id] = t; cur = t.id; tab = "mesas";
    announce(t);
  }
  function startTable(t) {
    var G = EX.games[t.g];
    if (t.pl.length < G.min) { t.err = "Precisa de pelo menos " + G.min + " jogadores."; announce(t); return; }
    t.err = ""; t.ph = "jogo";
    var e = G.start(t); // um jogo pode recusar o inicio devolvendo um texto de erro
    if (e) { t.ph = "lobby"; t.err = e; announce(t); return; }
    announce(t, true);
  }
  function endTable(id) {
    delete own[id]; delete tb[id]; delete pv[id]; delete dat[id];
    send({ k: "fim", id: id });
    if (cur === id) cur = null;
    paint();
  }
  setInterval(function () { for (var id in own) announce(own[id]); }, 10000);

  function invite(s) { // convite: aparece um aviso para quem foi chamado
    if (s.ph !== "lobby" || s.o === me.id || notified[s.id]) return;
    var mineInv = s.inv === 1 || (s.inv && s.inv.indexOf(me.id) >= 0);
    if (!mineInv || isPl(s, me.id)) return;
    notified[s.id] = 1;
    try { if (navigator.vibrate) navigator.vibrate(150); } catch (e) {}
    var b = box(s.on + " chamou você para jogar " + (EX.games[s.g] ? EX.games[s.g].nome : s.g) + ".");
    b.appendChild(btn("Entrar", function () { send({ k: "ent", id: s.id, to: s.o }); cur = s.id; tab = "mesas"; open(); b.remove(); }));
    b.appendChild(btn("Agora não", function () { b.remove(); }));
  }

  // ------------------------------- chat -------------------------------
  function addChat(e) {
    chat.push(e);
    if (chat.length > 60) chat.shift();
    if (!e.me && !(ovOpen && tab === "chat")) unread++;
  }
  function chunk(m) {
    var p = parts[m.mid] = parts[m.mid] || { n: m.n, kd: m.kd, u: m.u, a: [], got: 0 };
    if (p.a[m.i] == null) { p.a[m.i] = m.d; p.got++; }
    if (p.got === p.n) { addChat({ n: p.u, kind: p.kd, src: p.a.join("") }); delete parts[m.mid]; }
  }
  function sendBlob(kind, url) {
    var CH = 640, n = Math.ceil(url.length / CH), mid = rid(5);
    if (n > 70) { alert("Arquivo grande demais para a rede do jogo."); return; }
    for (var i = 0; i < n; i++) qsend({ k: "ci", mid: mid, i: i, n: n, kd: kind, u: me.nick, d: url.substr(i * CH, CH) });
    addChat({ n: me.nick, kind: kind, src: url, me: 1 });
    paint();
  }
  function shrink(file) { // foto -> JPEG pequeno (cabe no Wi-Fi do Cardputer)
    var img = new Image(), u = URL.createObjectURL(file);
    img.onload = function () {
      var s = Math.min(1, 220 / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      sendBlob("i", c.toDataURL("image/jpeg", 0.5));
    };
    img.src = u;
  }
  function fileIn(accept, capture, fn) {
    var i = h("input"); i.type = "file"; i.accept = accept;
    if (capture) i.setAttribute("capture", capture);
    i.style.display = "none";
    i.onchange = function () { if (i.files && i.files[0]) fn(i.files[0]); };
    document.body.appendChild(i); i.click();
    setTimeout(function () { i.remove(); }, 60000);
  }
  function sendAudioFile(f) {
    var r = new FileReader();
    r.onload = function () {
      if (String(r.result).length > 44000) { alert("Áudio longo demais. Grave até uns 8 segundos."); return; }
      sendBlob("a", r.result);
    };
    r.readAsDataURL(f);
  }
  var rec = null;
  function toggleRec() { // gravacao direta: so funciona se o navegador liberar o microfone (em geral exige https)
    if (rec) { rec.stop(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
      var chunks = [];
      rec = new MediaRecorder(st, { audioBitsPerSecond: 16000 });
      rec.ondataavailable = function (e) { chunks.push(e.data); };
      rec.onstop = function () {
        st.getTracks().forEach(function (x) { x.stop(); });
        var r = rec; rec = null; paint();
        sendAudioFile(new Blob(chunks, { type: r.mimeType }));
      };
      rec.start();
      setTimeout(function () { if (rec) rec.stop(); }, 8000);
      paint();
    }).catch(function () { alert("O navegador não liberou o microfone. Use o botão 'Enviar áudio gravado'."); });
  }

  // ------------------------------- tela -------------------------------
  function h(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function btn(text, fn, cls) { var b = h("button", text, cls); b.onclick = fn; return b; }
  EX.h = h; EX.btn = btn;
  function box(text) { // aviso flutuante (convite, pergunta de admin)
    var b = h("div", null, "exinv"); b.appendChild(h("p", text));
    document.body.appendChild(b);
    return b;
  }

  var css = "#exbtn{position:fixed;left:12px;bottom:12px;z-index:9998;background:linear-gradient(135deg,#FF9E29,#FF8200);color:#0B0B0C;border:0;border-radius:26px;padding:13px 18px;font:800 14px monospace;box-shadow:0 4px 14px rgba(0,0,0,.5)}" +
    "#exov{position:fixed;inset:0;z-index:9999;background:radial-gradient(circle at 50% 0,#1b1b1f,#0B0B0C 60%);color:#F2F2EE;overflow:auto;padding:12px;font:15px monospace;display:none;-webkit-user-select:none;user-select:none}" +
    "#exov button,.exinv button{background:#202024;color:#F2F2EE;border:2px solid #34343a;border-radius:8px;padding:11px 13px;margin:3px 4px 3px 0;font:700 14px monospace;transition:transform .08s}" +
    "#exov button:active{transform:translateY(1px) scale(.98)}" +
    "#exov button.on{border-color:#FF8200;color:#FF9E29;background:#2a1d0e}#exov button.pri{background:#FF8200;color:#0B0B0C;border-color:#FF8200}#exov button:disabled{opacity:.3}" +
    "#exov input:not([type=file]){display:block;width:100%;box-sizing:border-box;background:#202024;color:#F2F2EE;border:2px solid #34343a;border-radius:8px;padding:12px;margin:6px 0;font:16px monospace;-webkit-user-select:text;user-select:text}" +
    "#exov input:focus{outline:none;border-color:#FF8200}" +
    "#exov select{background:#202024;color:#F2F2EE;border:2px solid #34343a;border-radius:8px;padding:9px;font:14px monospace;margin:3px 0}" +
    "#exov h2{color:#FF8200;margin:6px 0;letter-spacing:.04em}#exov h3{color:#FF9E29;margin:12px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:.08em}#exov p{margin:6px 0}" +
    ".exinv{position:fixed;top:10px;left:10px;right:10px;z-index:10000;background:#161618;color:#F2F2EE;border:2px solid #FF8200;border-radius:10px;padding:12px;font:14px monospace;box-shadow:0 6px 24px rgba(0,0,0,.6)}" +
    ".excard{background:#161618;border:2px solid #2a2a30;border-radius:12px;padding:12px;margin:8px 0}" +
    ".exinfo{color:#9A9A94}.exred{color:#FF4D4D}.exgood{color:#46D369}.exbig{font-size:24px;letter-spacing:2px;margin:10px 0;word-break:break-word;text-align:center}" +
    ".exrow{display:flex;align-items:center;gap:8px;border:2px solid #2a2a30;background:#161618;border-radius:10px;padding:9px 10px;margin:6px 0;flex-wrap:wrap}.exrow>span{flex:1;min-width:140px}" +
    ".pill{display:inline-block;background:#202024;border:2px solid #34343a;border-radius:999px;padding:3px 10px;font-size:12px;margin:2px 3px 2px 0}.pill.hot{border-color:#FF8200;color:#FF9E29}" +
    ".tmbar{height:8px;background:#202024;border-radius:6px;overflow:hidden;margin:8px 0}.tmbar>i{display:block;height:100%;background:linear-gradient(90deg,#FF8200,#FF9E29);transition-timing-function:linear}.tmbar.low>i{background:#FF4D4D}" +
    ".exchat{height:42vh;overflow:auto;border:2px solid #2a2a30;border-radius:10px;padding:8px;margin:6px 0;background:#101012}.exchat img{max-width:70%;display:block;border-radius:8px}.exchat audio{max-width:100%}" +
    /* ---------- forca ---------- */
    ".fcsvg{display:block;margin:6px auto;width:200px;height:200px}.fcsvg *{stroke:#F2F2EE;stroke-width:4;stroke-linecap:round;fill:none}.fcsvg .gal{stroke:#8b5a2b}" +
    ".fcword{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:10px 0}.fcl{width:32px;height:44px;border-bottom:4px solid #FF8200;display:flex;align-items:center;justify-content:center;font:800 26px monospace}.fcl.sp{border:0;width:14px}.fcl.new{color:#46D369}" +
    ".exkb{display:flex;flex-wrap:wrap;justify-content:center}.exkb button{width:13%;min-width:36px;padding:11px 0;margin:3px 2px;text-align:center}.exkb button.kok{background:#143b22;border-color:#46D369;color:#46D369}.exkb button.kno{background:#3b1414;border-color:#FF4D4D;color:#FF4D4D;opacity:.7}" +
    /* ---------- dama ---------- */
    ".dmboard{display:grid;grid-template-columns:repeat(8,1fr);width:min(96vw,440px);aspect-ratio:1;margin:8px auto;border:8px solid #4a2c12;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.6),inset 0 0 0 2px #2a170a;overflow:hidden}" +
    ".dmc{position:relative;display:flex;align-items:center;justify-content:center}.dmc.lt{background:linear-gradient(135deg,#f0dcae,#e3c88f)}.dmc.dk{background:linear-gradient(135deg,#8e5b2c,#6f431d)}" +
    ".dmc.sel{box-shadow:inset 0 0 0 4px #FF8200}.dmc.tg::after{content:'';position:absolute;width:34%;height:34%;border-radius:50%;background:rgba(255,130,0,.85);box-shadow:0 0 12px #FF8200}.dmc.lm{background:linear-gradient(135deg,#b88a2c,#a06f19)}" +
    ".dmn{position:absolute;left:3px;top:1px;font-size:9px;color:rgba(255,255,255,.55)}" +
    ".dpc{width:80%;height:80%;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 5px rgba(0,0,0,.55),inset 0 -4px 6px rgba(0,0,0,.35),inset 0 3px 5px rgba(255,255,255,.35)}" +
    ".dpw{background:radial-gradient(circle at 35% 30%,#fff,#d9d2c0 60%,#b9b09a);color:#b8860b}.dpb{background:radial-gradient(circle at 35% 30%,#555,#1c1c1c 60%,#000);color:#FFD34D}" +
    /* ---------- domino ---------- */
    ".dmtable{background:radial-gradient(ellipse at center,#1f8a4e,#0e4a2a);border:7px solid #5b3a1a;border-radius:16px;min-height:150px;padding:10px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:3px;box-shadow:inset 0 0 24px rgba(0,0,0,.55)}" +
    ".dmzone{min-width:40px;min-height:76px;border:3px dashed rgba(255,255,255,.35);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font:800 13px monospace;text-align:center;opacity:.55}.dmzone.act{border-color:#FF8200;background:rgba(255,130,0,.22);opacity:1;animation:dzp 1s infinite}@keyframes dzp{50%{box-shadow:0 0 14px #FF8200}}" +
    ".dthand{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:12px 0;padding-top:12px}.dtile{touch-action:none;cursor:pointer;transition:transform .12s;filter:drop-shadow(0 3px 3px rgba(0,0,0,.5))}.dtile.ok{transform:translateY(-10px)}.dtile.ok.sel{transform:translateY(-18px);filter:drop-shadow(0 0 8px #FF8200)}.dtile.off{opacity:.45}" +
    ".dback{display:inline-block;width:18px;height:34px;background:linear-gradient(135deg,#2b2b30,#444);border:2px solid #666;border-radius:4px;margin:1px}" +
    /* ---------- cidade dorme ---------- */
    ".cdn{background:linear-gradient(180deg,#0b1030,#1a1f4a 60%,#2a2a5e);border:2px solid #34408a;border-radius:14px;padding:12px;margin:8px 0}.cdd{background:linear-gradient(180deg,#f5c36b,#ffe2a8 60%,#ffeccb);color:#2b1d05;border:2px solid #d09a3a;border-radius:14px;padding:12px;margin:8px 0}" +
    ".cdd .exinfo{color:#6b5524}.cdd button{background:#fff3d6!important;color:#2b1d05!important;border-color:#d09a3a!important}" +
    ".cdrole{text-align:center;font-size:54px;line-height:1}.cdrole small{display:block;font-size:18px;font-weight:800;letter-spacing:.1em;margin-top:4px}" +
    ".cdgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin:8px 0}.cdt{border:2px solid #34408a;border-radius:12px;padding:8px 4px;text-align:center;font-size:12px;background:rgba(255,255,255,.06)}.cdt .av{width:40px;height:40px;border-radius:50%;margin:0 auto 4px;display:flex;align-items:center;justify-content:center;font:800 18px monospace;background:#FF8200;color:#0B0B0C}.cdt.dead{filter:grayscale(1);opacity:.45}" +
    /* ---------- quem eu sou ---------- */
    ".qpost{display:inline-block;width:46%;min-width:140px;background:#fff176;color:#3a3200;border-radius:4px;padding:12px 8px 14px;margin:8px 1.5%;transform:rotate(-1.5deg);box-shadow:3px 5px 10px rgba(0,0,0,.5);text-align:center;vertical-align:top}.qpost:nth-child(2n){transform:rotate(1.8deg);background:#ffb3d1}.qpost:nth-child(3n){background:#aee8ff}" +
    ".qpost b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}.qpost span{display:block;font:800 20px monospace;margin-top:6px;word-break:break-word}.qpost.me{background:#2a2a30;color:#FF9E29;border:2px dashed #FF8200}.blur{filter:blur(9px)}" +
    /* ---------- matematica / stop ---------- */
    ".mtq{background:linear-gradient(135deg,#1d1d24,#26262e);border:2px solid #FF8200;border-radius:16px;padding:22px 10px;text-align:center;font:800 34px monospace;margin:10px 0;word-break:break-word}" +
    ".mtbar{display:flex;align-items:center;gap:8px;margin:6px 0}.mtbar b{width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.mtbar i{display:block;height:16px;background:linear-gradient(90deg,#FF8200,#FF9E29);border-radius:4px;min-width:4px}" +
    ".spl{width:92px;height:92px;border-radius:50%;border:5px solid #FF8200;display:flex;align-items:center;justify-content:center;font:800 52px monospace;margin:8px auto;box-shadow:0 0 18px rgba(255,130,0,.5)}" +
    ".spsheet{background:#fdf8e8;color:#1c1c1c;border-radius:6px;padding:8px 10px;margin:8px 0;box-shadow:0 4px 12px rgba(0,0,0,.5)}.spsheet label{display:block;font:700 12px monospace;color:#8a6d1c;margin-top:6px}" +
    "#exov .spsheet input:not([type=file]){background:#fffdf4;color:#111;border:0;border-bottom:2px solid #c9a63c;border-radius:0;padding:8px 4px;margin:0 0 2px}" +
    ".sptb{width:100%;border-collapse:collapse;font-size:13px}.sptb td,.sptb th{border:1px solid #34343a;padding:5px;text-align:center}.sptb td button{margin:0;padding:6px 4px;width:100%;font-size:12px}";

  document.head.appendChild(h("style", css));
  var openBtn = h("button"); openBtn.id = "exbtn";
  var ov = h("div"); ov.id = "exov";
  function open() { ovOpen = true; ov.style.display = "block"; if (tab === "chat") unread = 0; paint(); }
  openBtn.onclick = open;
  document.body.appendChild(openBtn); document.body.appendChild(ov);

  function paint() {
    openBtn.textContent = "🎲 Jogos" + (unread ? " (" + unread + ")" : "");
    if (!ovOpen || EX.busy) return;
    var ae = document.activeElement;
    if (ae && ae.tagName === "INPUT" && ae.dataset.keep && ov.contains(ae)) return; // nao atrapalha quem esta digitando
    var now = Date.now();
    for (var k in tb) if (!own[k] && now - tb[k].seen > 40000) delete tb[k];
    var keep = ov.scrollTop;
    ov.innerHTML = "";
    ov.appendChild(btn("✕ Fechar", function () { ovOpen = false; ov.style.display = "none"; }));
    if (!me.nick) { paintNick(); return; }
    var tabs = [["mesas", "Mesas"], ["criar", "Criar"], ["chat", "Chat" + (unread ? " (" + unread + ")" : "")]];
    if (mode === "comp") tabs.push(["rank", "Ranking"]);
    if (me.admin) tabs.push(["admin", "Admin"]);
    tabs.forEach(function (x) { ov.appendChild(btn(x[1], function () { tab = x[0]; if (tab === "chat") unread = 0; if (tab !== "mesas") cur = null; paint(); }, tab === x[0] ? "on" : "")); });
    ov.appendChild(h("p", "Você: " + me.nick + (me.admin ? " (admin)" : "") + "  |  Modo: " + (mode === "comp" ? "Competitivo" : "Entretenimento"), "exinfo"));
    if (tab === "mesas") { if (cur && tb[cur]) paintTable(tb[cur]); else paintMesas(); }
    else if (tab === "criar") paintCriar();
    else if (tab === "chat") paintChat();
    else if (tab === "rank") paintRank();
    else if (tab === "admin") paintAdmin();
    ov.scrollTop = keep;
  }
  EX.paint = paint;

  function paintNick() {
    ov.appendChild(h("h2", "Seu apelido"));
    var i = h("input"); i.placeholder = "Seu apelido"; i.dataset.keep = 1; ov.appendChild(i);
    ov.appendChild(btn("Entrar", function () {
      var n = i.value.trim().slice(0, 14);
      if (!n) return;
      me.nick = n;
      try { localStorage.setItem("ex_nick", n); } catch (e) {}
      hello(); setTimeout(askAdmin, 3500); paint();
    }));
  }

  function paintMesas() {
    ov.appendChild(h("h2", "Mesas abertas"));
    var any = false;
    for (var id in tb) {
      any = true;
      (function (id, s) {
        var G = EX.games[s.g];
        var r = h("div", null, "exrow");
        r.appendChild(h("span", (G ? G.nome : s.g) + " de " + s.on + " (" + s.pl.length + " jog.) " + (s.ph === "lobby" ? "- sala" : "- em jogo")));
        r.appendChild(btn("Abrir", function () { cur = id; paint(); }));
        ov.appendChild(r);
      })(id, tb[id]);
    }
    if (!any) ov.appendChild(h("p", "Nenhuma mesa aberta. Vá em Criar."));
    ov.appendChild(h("p", "Jogo da Velha, Xadrez, Batalha Naval e outros estão na tela principal do site (feche esta janela).", "exinfo"));
    if (!me.admin) ov.appendChild(btn("Sou o administrador", pedirSenha));
  }

  function paintCriar() {
    ov.appendChild(h("h2", "Criar mesa"));
    if (!draft) draft = { g: null, sel: {}, all: false };
    EX.order.forEach(function (g) {
      if (EX.games[g].needSd && !sdqOn) return; // "Quiz do Cartão SD" so aparece quando o admin liga
      ov.appendChild(btn(EX.games[g].nome, function () { draft.g = g; paint(); }, draft.g === g ? "on" : ""));
    });
    if (!sdqOn) ov.appendChild(h("p", "O Quiz do Cartão SD aparece aqui quando o administrador ligar as questões do SD.", "exinfo"));
    if (!draft.g) { ov.appendChild(h("p", "Escolha o jogo.", "exinfo")); return; }
    var G = EX.games[draft.g];
    ov.appendChild(h("p", G.desc + " (" + (G.max >= 99 ? G.min + " ou mais" : G.min + (G.max > G.min ? " a " + G.max : "")) + " jogadores)", "exinfo"));
    ov.appendChild(h("h3", "Quem vai jogar?"));
    ov.appendChild(btn(draft.all ? "☑ Todos" : "☐ Selecionar todos", function () { draft.all = !draft.all; paint(); }, draft.all ? "on" : ""));
    live().forEach(function (p) {
      var on = draft.all || draft.sel[p.id];
      ov.appendChild(btn((on ? "☑ " : "☐ ") + p.n, function () { draft.all = false; draft.sel[p.id] = !draft.sel[p.id]; paint(); }, on ? "on" : ""));
    });
    if (!live().length) ov.appendChild(h("p", "Ninguém mais está na sala ainda.", "exinfo"));
    ov.appendChild(h("p", "Quem não for chamado fica livre para navegar, jogar em outra mesa ou assistir.", "exinfo"));
    ov.appendChild(btn("Criar mesa de " + G.nome, function () {
      var inv = draft.all ? 1 : Object.keys(draft.sel).filter(function (k) { return draft.sel[k]; });
      var g = draft.g; draft = null;
      create(g, inv);
    }));
  }

  function act0(s, k) { if (own[s.id]) handle(own[s.id], { k: k, f: me.id, id: s.id }); else send({ k: k, id: s.id, to: s.o }); }

  function paintTable(s) {
    var G = EX.games[s.g], t = own[s.id], mine = !!t, isP = false;
    s.pl.forEach(function (p) { if (p.id === me.id) isP = true; });
    ov.appendChild(btn("← Mesas", function () { cur = null; paint(); }));
    if (mine || me.admin) ov.appendChild(btn("Encerrar mesa", function () { if (mine) endTable(s.id); else { send({ k: "fim", id: s.id }); delete tb[s.id]; cur = null; paint(); } }));
    ov.appendChild(h("h2", G.nome + " - mesa de " + s.on));
    if (s.ph === "lobby") {
      ov.appendChild(h("h3", "Jogadores (" + s.pl.length + (G.max >= 99 ? "" : "/" + G.max) + ")"));
      s.pl.forEach(function (p) { ov.appendChild(h("p", "• " + p.n)); });
      if (s.inv && s.inv !== 1) {
        var wait = s.inv.filter(function (id) { return !s.pl.some(function (p) { return p.id === id; }); });
        if (wait.length) ov.appendChild(h("p", "Chamados que ainda não entraram: " + wait.map(nameOf).join(", "), "exinfo"));
      }
      if (!isP) {
        var ok = s.inv === 1 || (s.inv && s.inv.indexOf(me.id) >= 0);
        if (ok) ov.appendChild(btn("Entrar na mesa", function () { act0(s, "ent"); }));
        else ov.appendChild(h("p", "Você não foi chamado: pode só assistir.", "exinfo"));
      } else if (!mine) ov.appendChild(btn("Sair da mesa", function () { act0(s, "sair"); }));
      if (mine) {
        (G.opts || []).forEach(function (o) {
          var sel = h("select");
          o.vals.forEach(function (v) { var op = h("option", v[1]); op.value = v[0]; if (String(t.opt[o.k]) === String(v[0])) op.selected = true; sel.appendChild(op); });
          sel.onchange = function () { var v = sel.value; t.opt[o.k] = isNaN(v) ? v : Number(v); announce(t); };
          var r = h("div", o.label + ": "); r.appendChild(sel); ov.appendChild(r);
        });
        if (G.lobby) G.lobby(ov, t);
        ov.appendChild(btn(t.inv === 1 ? "Mesa aberta para todos" : "Abrir para todos", function () { t.inv = 1; announce(t); }));
        if (isP) ov.appendChild(btn("Eu não vou jogar (só juiz)", function () { t.pl = t.pl.filter(function (p) { return p.id !== me.id; }); announce(t); }));
        ov.appendChild(btn("▶ Iniciar partida", function () { startTable(t); }));
        if (s.err) ov.appendChild(h("p", s.err, "exred"));
      } else ov.appendChild(h("p", "Esperando " + s.on + " iniciar...", "exinfo"));
      return;
    }
    var b = h("div");
    ov.appendChild(b);
    G.draw(b, s.s, {
      id: s.id, s: s, me: me.id, isP: isP, owner: mine, pv: pv[s.id], dat: dat[s.id] || {},
      act: function (o) { act(s.id, o); },
      needPv: function () { if (isP && !pv[s.id] && !mine) send({ k: "pq", id: s.id, to: s.o }); }
    });
    if (s.ph === "fim" && mine) ov.appendChild(btn("Voltar para a sala", function () { t.ph = "lobby"; announce(t); }));
  }

  function paintChat() {
    ov.appendChild(h("h2", "Chat da sala"));
    var c = h("div", null, "exchat");
    chat.forEach(function (e) {
      var r = h("div"); r.appendChild(h("b", e.n + ": "));
      if (e.kind === "i") { var im = h("img"); im.src = e.src; r.appendChild(im); }
      else if (e.kind === "a") { var a = h("audio"); a.controls = true; a.src = e.src; r.appendChild(a); }
      else r.appendChild(h("span", e.t));
      c.appendChild(r);
    });
    ov.appendChild(c); c.scrollTop = c.scrollHeight;
    var i = h("input"); i.placeholder = "Mensagem"; i.dataset.keep = 1; ov.appendChild(i);
    var go = function () { var t = i.value.trim(); if (!t) return; qsend({ k: "ct", n: me.nick, t: t.slice(0, 300) }); addChat({ n: me.nick, t: t, me: 1 }); paint(); };
    i.onkeydown = function (e) { if (e.key === "Enter") go(); };
    ov.appendChild(btn("Enviar", go));
    ov.appendChild(btn("📷 Tirar foto", function () { fileIn("image/*", "environment", shrink); }));
    ov.appendChild(btn("🖼 Galeria", function () { fileIn("image/*", null, shrink); }));
    if (navigator.mediaDevices && window.MediaRecorder) ov.appendChild(btn(rec ? "⏹ Parar" : "🎤 Gravar áudio", toggleRec));
    ov.appendChild(btn("🎤 Enviar áudio gravado", function () { fileIn("audio/*", "microphone", sendAudioFile); }));
  }

  function paintRank() {
    ov.appendChild(h("h2", "Ranking (modo competitivo)"));
    var l = Object.keys(rank).sort(function (a, b) { return rank[b] - rank[a]; });
    if (!l.length) ov.appendChild(h("p", "Ainda sem pontos."));
    l.forEach(function (n, i) { ov.appendChild(h("p", (i + 1) + ". " + n + " - " + rank[n] + " pts")); });
  }

  function paintAdmin() {
    ov.appendChild(h("h2", "Painel do administrador"));
    ov.appendChild(h("h3", "Modo de jogo"));
    ov.appendChild(btn("Competitivo (placar e ranking)", function () { setMode("comp"); }, mode === "comp" ? "on" : ""));
    ov.appendChild(btn("Entretenimento (sem pontos)", function () { setMode("ent"); }, mode === "ent" ? "on" : ""));
    ov.appendChild(h("h3", "Questões do cartão SD"));
    ov.appendChild(h("p", "Quando ligado, o jogo 'Quiz do Cartão SD' lê os arquivos questoes*.txt que estão na raiz do cartão SD do Cardputer.", "exinfo"));
    ov.appendChild(btn("Ligado", function () { setSdq(true); }, sdqOn ? "on" : ""));
    ov.appendChild(btn("Desligado", function () { setSdq(false); }, !sdqOn ? "on" : ""));
    ov.appendChild(h("h3", "Pessoas na sala (" + (live().length + 1) + ")"));
    ov.appendChild(h("p", me.nick + " (você)"));
    live().forEach(function (p) { ov.appendChild(h("p", p.n)); });
    ov.appendChild(h("h3", "Mesas"));
    for (var id in tb) (function (id, s) {
      var r = h("div", null, "exrow");
      r.appendChild(h("span", (EX.games[s.g] ? EX.games[s.g].nome : s.g) + " de " + s.on));
      r.appendChild(btn("Abrir", function () { tab = "mesas"; cur = id; paint(); }));
      r.appendChild(btn("Encerrar", function () { if (own[id]) endTable(id); else { send({ k: "fim", id: id }); delete tb[id]; paint(); } }));
      ov.appendChild(r);
    })(id, tb[id]);
    ov.appendChild(btn("Zerar ranking", function () { rank = {}; send({ k: "rks", r: {} }); paint(); }));
  }

  connect();
  paint();
})();
