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
  var ws = null, roster = {}, adminId = null, admT = 0, mode = "comp", rank = {};
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
    if (me.admin) { o.a = 1; o.md = mode; }
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
        if (m.a) { adminId = m.f; if (m.md) mode = m.md; }
        break;
      case "adm":
        if (m.t > admT) { admT = m.t; adminId = m.f; if (me.admin) me.admin = false; }
        break;
      case "md": if (m.f === adminId) mode = m.v; break;
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

  var css = "#exbtn{position:fixed;left:12px;bottom:12px;z-index:9998;background:#FF8200;color:#0B0B0C;border:0;border-radius:24px;padding:12px 16px;font:700 14px monospace}" +
    "#exov{position:fixed;inset:0;z-index:9999;background:#0B0B0C;color:#F2F2EE;overflow:auto;padding:12px;font:15px monospace;display:none}" +
    "#exov button,.exinv button{background:#202024;color:#F2F2EE;border:2px solid #2E2E33;border-radius:2px;padding:11px;margin:3px 4px 3px 0;font:700 14px monospace}" +
    "#exov button.on{border-color:#FF8200;color:#FF8200}#exov button:disabled{opacity:.3}" +
    "#exov input:not([type=file]){display:block;width:100%;box-sizing:border-box;background:#202024;color:#F2F2EE;border:2px solid #2E2E33;padding:11px;margin:5px 0;font:16px monospace}" +
    "#exov select{background:#202024;color:#F2F2EE;border:2px solid #2E2E33;padding:9px;font:14px monospace;margin:3px 0}" +
    "#exov h2{color:#FF8200;margin:6px 0}#exov h3{color:#FF8200;margin:10px 0 4px}#exov p{margin:6px 0}" +
    ".exinv{position:fixed;top:10px;left:10px;right:10px;z-index:10000;background:#161618;color:#F2F2EE;border:2px solid #FF8200;padding:10px;font:14px monospace}" +
    ".exbig{font-size:26px;letter-spacing:2px;margin:10px 0;word-break:break-all}" +
    ".exkb{display:flex;flex-wrap:wrap}.exkb button{width:12%;min-width:34px;padding:10px 0}" +
    ".exrow{display:flex;align-items:center;gap:6px;border:2px solid #2E2E33;padding:8px;margin:5px 0;flex-wrap:wrap}" +
    ".exchat{height:42vh;overflow:auto;border:2px solid #2E2E33;padding:6px;margin:6px 0}.exchat img{max-width:70%;display:block}.exchat audio{max-width:100%}" +
    ".exboard{display:grid;grid-template-columns:repeat(8,1fr);width:min(96vw,420px);aspect-ratio:1;margin:8px 0;border:2px solid #2E2E33}" +
    ".excell{display:flex;align-items:center;justify-content:center}.excell.lt{background:#d8c9a8}.excell.dk{background:#6b4a2b}" +
    ".excell.sel{outline:3px solid #FF8200;outline-offset:-3px}.excell.tg{box-shadow:inset 0 0 0 999px rgba(255,130,0,.45)}" +
    ".expc{width:78%;height:78%;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px}" +
    ".pw{background:#f4f1ea;color:#6b4a2b;border:2px solid #999}.pb{background:#222;color:#FF8200;border:2px solid #000}" +
    ".dt{display:inline-flex;align-items:center;background:#f4f1ea;color:#111;border:2px solid #555;border-radius:4px;margin:2px;font:700 16px monospace}" +
    ".dt span{padding:4px 6px}.dt span+span{border-left:2px solid #555}#exov button.dt{padding:0;background:#f4f1ea;color:#111}.blur{filter:blur(8px)}" +
    ".exinfo{color:#9A9A94}.exred{color:#FF4D4D}";
  document.head.appendChild(h("style", css));
  var openBtn = h("button"); openBtn.id = "exbtn";
  var ov = h("div"); ov.id = "exov";
  function open() { ovOpen = true; ov.style.display = "block"; if (tab === "chat") unread = 0; paint(); }
  openBtn.onclick = open;
  document.body.appendChild(openBtn); document.body.appendChild(ov);

  function paint() {
    openBtn.textContent = "🎲 Jogos" + (unread ? " (" + unread + ")" : "");
    if (!ovOpen) return;
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
      ov.appendChild(btn(EX.games[g].nome, function () { draft.g = g; paint(); }, draft.g === g ? "on" : ""));
    });
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
