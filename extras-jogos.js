// EXTRAS -- JOGOS: Forca, Dama, Domino, Cidade Dorme, Quem Eu Sou?, Desafio Matematico e Stop.
// O nucleo (mesas, convites, admin, chat) esta em extras.js.
//
// PARA CRIAR UM JOGO NOVO: copie um jogo daqui e registre com EX.reg("id", {...}):
//   nome, desc, min, max      nome, descricao e numero de jogadores
//   opts                      opcoes que o dono escolhe na sala (opcional)
//   start(t)                  comeca a partida (devolva um texto para recusar)
//   msg(t, m)                 recebe uma jogada (m.a = tipo, m.f = quem mandou); chame EX.announce(t)
//   pub(t)                    estado publico (<= ~500 bytes), todos veem
//   priv(t, id)               estado secreto de um jogador (opcional)
//   draw(box, S, c)           desenha a tela; c.act({a:"tipo",...}) manda uma jogada
(function () {
  "use strict";
  var EX = typeof window !== "undefined" ? window.EX : null;

  function norm(s) { return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
  function isL(ch) { return /[A-Z]/.test(norm(ch)); }
  function shuffle(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor((rnd || Math.random)() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function nm(pl, id) { for (var i = 0; i < pl.length; i++) if (pl[i].id === id) return pl[i].n; return "?"; }
  function keys(o) { return Object.keys(o); }

  // =========================== FORCA ===========================
  function mask(word, g, rev) {
    var o = "";
    for (var i = 0; i < word.length; i++) {
      var ch = word.charAt(i);
      o += !isL(ch) ? ch : (rev || g.indexOf(norm(ch)) >= 0 ? ch.toUpperCase() : "_");
    }
    return o;
  }
  var CATS = ["Animal", "Comida", "Fruta", "Local", "Série", "Filme", "Pessoa famosa", "Objeto", "Profissão"];

  function forcaFim(t, win) {
    var f = t.f;
    f.st = "fim"; f.win = win ? 1 : 2;
    if (!EX) return;
    if (win) t.pl.forEach(function (p) { if (p.id !== f.cr) EX.score(p.n, 1); });
    else EX.score(nm(t.pl, f.cr), 2);
  }
  var forca = {
    nome: "Forca", desc: "Um jogador cria a palavra e os outros chutam letras.", min: 2, max: 12,
    start: function (t) { t.f = { st: "vote", cr: null, prop: null, yes: {}, no: {}, word: "", ht: "none", hint: "", g: "", er: 0, pend: null, win: 0 }; },
    pub: function (t) {
      var f = t.f;
      if (!f) return {};
      return { st: f.st, cr: f.cr, pr: f.prop, y: keys(f.yes).length, n: keys(f.no).length,
        m: (f.st === "joga" || f.st === "fim") ? mask(f.word, f.g, f.st === "fim") : "", g: f.g, e: f.er, p: f.pend ? f.pend.L : "", h: f.hint, w: f.win };
    },
    msg: function (t, m) {
      var f = t.f, a = m.a, n = t.pl.length;
      if (!f) return;
      if (a === "quero" && f.st === "vote" && !f.prop) { f.prop = m.f; f.yes = {}; f.no = {}; }
      else if (a === "voto" && f.st === "vote" && f.prop && m.f !== f.prop) {
        delete f.yes[m.f]; delete f.no[m.f];
        (m.v ? f.yes : f.no)[m.f] = 1;
        var others = n - 1;
        if (keys(f.yes).length * 2 > others) { f.st = "cria"; f.cr = f.prop; }
        else if (keys(f.no).length * 2 >= others) f.prop = null;
      } else if (a === "pal" && f.st === "cria" && m.f === f.cr) {
        var w = String(m.w || "").trim().slice(0, 24);
        if (!/[A-Za-z\u00C0-\u00FF]/.test(w)) return;
        f.word = w; f.ht = m.ht === "txt" || m.ht === "cat" ? m.ht : "none";
        f.hint = f.ht === "none" ? "" : String(m.h || "").slice(0, 40);
        f.st = "joga"; f.g = ""; f.er = 0; f.pend = null; f.win = 0;
      } else if (a === "let" && f.st === "joga" && m.f !== f.cr && !f.pend) {
        var L = norm(m.v || "").charAt(0), hit = false;
        if (!/[A-Z]/.test(L) || f.g.indexOf(L) >= 0) return;
        f.g += L;
        for (var i = 0; i < f.word.length; i++) if (norm(f.word.charAt(i)) === L) hit = true;
        if (hit) { if (mask(f.word, f.g, false).indexOf("_") < 0) forcaFim(t, true); }
        else f.pend = { L: L }; // o criador confirma se conta como erro
      } else if (a === "val" && f.st === "joga" && f.pend && m.f === f.cr) {
        f.pend = null;
        if (m.v) { f.er++; if (f.er >= 6) forcaFim(t, false); }
      } else if (a === "outra" && f.st === "fim") {
        f.st = "vote"; f.prop = null; f.cr = null; f.word = ""; f.yes = {}; f.no = {};
      } else return;
      EX.announce(t);
    },
    draw: function (box, S, c) { drawForca(box, S, c); }
  };
  var FD = { w: "", h: "", ht: "none", cat: "" };
  function bonecoEmoji(e) { return ["😀", "😐", "😟", "😨", "😱", "😵", "💀"][Math.min(e, 6)]; }
  function drawForca(box, S, c) {
    var h = EX.h, btn = EX.btn, pl = c.s.pl, I = c.me;
    if (S.st === "vote") {
      if (!S.pr) {
        box.appendChild(h("p", "Quem quer criar a palavra desta rodada?"));
        if (c.isP) box.appendChild(btn("Ser o criador", function () { c.act({ a: "quero" }); }));
      } else if (S.pr === I) {
        box.appendChild(h("p", "Esperando os outros concordarem... (sim: " + S.y + ", não: " + S.n + ")"));
      } else {
        box.appendChild(h("p", nm(pl, S.pr) + " quer ser o criador. Você concorda?"));
        if (c.isP) {
          box.appendChild(btn("Sim", function () { c.act({ a: "voto", v: 1 }); }));
          box.appendChild(btn("Não", function () { c.act({ a: "voto", v: 0 }); }));
        }
      }
      return;
    }
    if (S.st === "cria") {
      if (S.cr !== I) { box.appendChild(h("p", nm(pl, S.cr) + " está escolhendo a palavra...")); return; }
      box.appendChild(h("p", "Você é o criador. Digite a palavra ou frase (só você vê):"));
      var w = h("input"); w.value = FD.w; w.placeholder = "Palavra ou frase"; w.dataset.keep = 1; w.oninput = function () { FD.w = w.value; };
      box.appendChild(w);
      box.appendChild(h("p", "Dica:"));
      [["none", "Sem dica"], ["txt", "Dica escrita"], ["cat", "Categoria"]].forEach(function (x) {
        box.appendChild(btn(x[1], function () { FD.ht = x[0]; EX.paint(); }, FD.ht === x[0] ? "on" : ""));
      });
      if (FD.ht === "txt") {
        var d = h("input"); d.value = FD.h; d.placeholder = "Escreva a dica"; d.dataset.keep = 1; d.oninput = function () { FD.h = d.value; };
        box.appendChild(d);
      } else if (FD.ht === "cat") {
        CATS.forEach(function (k) { box.appendChild(btn(k, function () { FD.cat = k; EX.paint(); }, FD.cat === k ? "on" : "")); });
      }
      box.appendChild(btn("Começar a rodada", function () {
        var hint = FD.ht === "txt" ? FD.h : FD.ht === "cat" ? FD.cat : "";
        if (!FD.w.trim()) return;
        if (FD.ht !== "none" && !hint.trim()) { alert("Escreva a dica ou escolha 'Sem dica'."); return; }
        c.act({ a: "pal", w: FD.w, ht: FD.ht, h: hint });
        FD.w = ""; FD.h = ""; FD.cat = ""; FD.ht = "none";
      }));
      return;
    }
    box.appendChild(h("p", "Criador: " + nm(pl, S.cr) + "   |   " + (S.h ? "Dica: " + S.h : "Sem dica")));
    var big = h("div", S.m.split("").join(" "), "exbig"); box.appendChild(big);
    box.appendChild(h("p", "Erros: " + S.e + " / 6   " + bonecoEmoji(S.e)));
    box.appendChild(h("p", "Letras: " + (S.g.split("").join(" ") || "-"), "exinfo"));
    if (S.st === "fim") {
      box.appendChild(h("p", S.w === 1 ? "Acertaram! 🎉" : "Enforcou! 💀", "exbig"));
      if (c.isP) box.appendChild(btn("Próxima rodada", function () { c.act({ a: "outra" }); }));
      return;
    }
    if (S.p) {
      if (S.cr === I) {
        box.appendChild(h("p", "A letra " + S.p + " NÃO está na palavra. Conta como erro?"));
        box.appendChild(btn("Conta como erro", function () { c.act({ a: "val", v: 1 }); }));
        box.appendChild(btn("Não conta", function () { c.act({ a: "val", v: 0 }); }));
      } else box.appendChild(h("p", "Letra " + S.p + ": esperando o criador decidir se conta como erro..."));
      return;
    }
    if (S.cr === I) { box.appendChild(h("p", "Você criou esta palavra: espere os palpites.")); return; }
    if (!c.isP) return;
    var kb = h("div", null, "exkb");
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (L) {
      var b = btn(L, function () { c.act({ a: "let", v: L }); });
      if (S.g.indexOf(L) >= 0) b.disabled = true;
      kb.appendChild(b);
    });
    box.appendChild(kb);
  }

  // =========================== DAMA (regras brasileiras) ===========================
  // Pedra anda 1 casa na diagonal para frente e captura para frente e para tras. Dama anda e
  // captura a qualquer distancia. Captura obrigatoria e "lei da maioria" (mais pecas).
  var DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  function inb(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function side(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function newBoard() {
    var b = [];
    for (var r = 0; r < 8; r++) {
      b.push([]);
      for (var c = 0; c < 8; c++) b[r].push((r + c) % 2 === 1 ? (r < 3 ? -1 : r > 4 ? 1 : 0) : 0);
    }
    return b;
  }
  function dfs(b, r, c, king, sd, taken, path, caps, out) {
    var more = false;
    DIRS.forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      if (king) while (inb(rr, cc) && b[rr][cc] === 0) { rr += d[0]; cc += d[1]; }
      if (!inb(rr, cc) || side(b[rr][cc]) !== -sd || taken[rr + "," + cc]) return;
      var er = rr, ec = cc, lr = er + d[0], lc = ec + d[1];
      while (inb(lr, lc) && b[lr][lc] === 0) {
        more = true;
        taken[er + "," + ec] = 1; path.push([lr, lc]); caps.push([er, ec]);
        dfs(b, lr, lc, king, sd, taken, path, caps, out);
        path.pop(); caps.pop(); delete taken[er + "," + ec];
        if (!king) break;
        lr += d[0]; lc += d[1];
      }
    });
    if (!more && caps.length) out.push({ p: path.map(function (x) { return x.slice(); }), n: caps.length, x: caps.map(function (x) { return x.slice(); }) });
    return more;
  }
  function legalMoves(b, sd) {
    var caps = [], simple = [];
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var v = b[r][c];
      if (side(v) !== sd) continue;
      var king = Math.abs(v) === 2;
      var t = b.map(function (row) { return row.slice(); });
      t[r][c] = 0;
      dfs(t, r, c, king, sd, {}, [[r, c]], [], caps);
      DIRS.forEach(function (d) {
        if (!king && d[0] !== -sd) return;
        var rr = r + d[0], cc = c + d[1];
        while (inb(rr, cc) && b[rr][cc] === 0) {
          simple.push({ p: [[r, c], [rr, cc]], n: 0, x: [] });
          if (!king) break;
          rr += d[0]; cc += d[1];
        }
      });
    }
    if (caps.length) {
      var max = Math.max.apply(null, caps.map(function (m) { return m.n; }));
      return caps.filter(function (m) { return m.n === max; });
    }
    return simple;
  }
  function applyMove(b, m, sd) {
    var t = b.map(function (row) { return row.slice(); });
    var s = m.p[0], e = m.p[m.p.length - 1], v = t[s[0]][s[1]];
    t[s[0]][s[1]] = 0;
    m.x.forEach(function (x) { t[x[0]][x[1]] = 0; });
    if (Math.abs(v) === 1 && e[0] === (sd === 1 ? 0 : 7)) v = 2 * sd;
    t[e[0]][e[1]] = v;
    return t;
  }
  function enc(b) { return b.map(function (row) { return row.map(function (v) { return v === 0 ? "." : v === 1 ? "w" : v === 2 ? "W" : v === -1 ? "b" : "B"; }).join(""); }).join(""); }
  function dec(s) {
    var b = [];
    for (var r = 0; r < 8; r++) { b.push([]); for (var c = 0; c < 8; c++) { var ch = s.charAt(r * 8 + c); b[r].push(ch === "w" ? 1 : ch === "W" ? 2 : ch === "b" ? -1 : ch === "B" ? -2 : 0); } }
    return b;
  }
  function samePath(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
    return true;
  }
  function damaFim(t) { t.ph = "fim"; if (EX) EX.score(t.pl[t.d.win === 1 ? 0 : 1].n, 3); }
  var dama = {
    nome: "Dama", desc: "Dama brasileira (captura obrigatória, dama voadora).", min: 2, max: 2,
    start: function (t) { t.d = { bd: newBoard(), turn: 1, win: 0 }; },
    pub: function (t) { return t.d ? { bd: enc(t.d.bd), t: t.d.turn, w: t.d.win } : {}; },
    msg: function (t, m) {
      var d = t.d, si = -1, i;
      if (!d || d.win) return;
      for (i = 0; i < t.pl.length; i++) if (t.pl[i].id === m.f) si = i;
      if (m.a === "des") { d.win = si === 0 ? -1 : 1; damaFim(t); EX.announce(t); return; }
      var sd = si === 0 ? 1 : si === 1 ? -1 : 0;
      if (m.a !== "jog" || !sd || sd !== d.turn || !m.p) return;
      var ms = legalMoves(d.bd, sd), found = null;
      for (i = 0; i < ms.length; i++) if (samePath(ms[i].p, m.p)) { found = ms[i]; break; }
      if (!found) return;
      d.bd = applyMove(d.bd, found, sd);
      d.turn = -sd;
      if (!legalMoves(d.bd, d.turn).length) { d.win = sd; damaFim(t); }
      EX.announce(t);
    },
    draw: function (box, S, c) { drawDama(box, S, c); }
  };
  var dsel = null;
  function drawDama(box, S, c) {
    var h = EX.h, btn = EX.btn, pl = c.s.pl, bd = dec(S.bd);
    var my = pl[0] && pl[0].id === c.me ? 1 : (pl[1] && pl[1].id === c.me ? -1 : 0);
    box.appendChild(h("p", "Brancas: " + pl[0].n + "   Pretas: " + pl[1].n));
    box.appendChild(h("p", S.w ? "Fim! Venceu: " + (S.w === 1 ? pl[0].n + " (brancas)" : pl[1].n + " (pretas)") : "Vez de: " + (S.t === 1 ? pl[0].n + " (brancas)" : pl[1].n + " (pretas)")));
    var moves = my && my === S.t && !S.w ? legalMoves(bd, my) : [], targets = {};
    if (dsel) moves.forEach(function (m) { if (m.p[0][0] === dsel[0] && m.p[0][1] === dsel[1]) { var e = m.p[m.p.length - 1]; targets[e[0] + "," + e[1]] = m; } });
    var grid = h("div", null, "exboard");
    for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) {
      var r = my === -1 ? 7 - i : i, cc = my === -1 ? 7 - j : j;
      var cell = h("div", null, "excell " + ((r + cc) % 2 ? "dk" : "lt")), key = r + "," + cc, v = bd[r][cc];
      if (dsel && dsel[0] === r && dsel[1] === cc) cell.className += " sel";
      if (targets[key]) cell.className += " tg";
      if (v) cell.appendChild(h("div", Math.abs(v) === 2 ? "♛" : "", "expc " + (v > 0 ? "pw" : "pb")));
      (function (r, cc, key) {
        cell.onclick = function () {
          if (targets[key]) { var p = targets[key].p; dsel = null; c.act({ a: "jog", p: p }); return; }
          dsel = moves.some(function (m) { return m.p[0][0] === r && m.p[0][1] === cc; }) ? [r, cc] : null;
          EX.paint();
        };
      })(r, cc, key);
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    if (my && !S.w) box.appendChild(btn("Desistir", function () { c.act({ a: "des" }); }));
  }

  // =========================== DOMINO ===========================
  function allTiles() { var a = []; for (var i = 0; i <= 6; i++) for (var j = i; j <= 6; j++) a.push([i, j]); return a; }
  function ends(ch) { return ch.length ? [ch[0][0], ch[ch.length - 1][1]] : null; }
  function canPlay(t, e) { return !e || t[0] === e[0] || t[1] === e[0] || t[0] === e[1] || t[1] === e[1]; }
  function playable(hand, ch) { var e = ends(ch); return hand.filter(function (x) { return canPlay(x, e); }); }
  function pips(h) { return h.reduce(function (s, x) { return s + x[0] + x[1]; }, 0); }
  function domDeal(S, order, per, monte, rnd, starter) {
    var tiles = shuffle(allTiles(), rnd), best = -1, who = order[0];
    S.hands = {};
    order.forEach(function (id) { S.hands[id] = tiles.splice(0, per); });
    S.stock = monte ? tiles : [];
    S.chain = []; S.passes = 0; S.st = "jogo"; S.rev = null;
    order.forEach(function (id) {
      S.hands[id].forEach(function (x) { var v = x[0] === x[1] ? 100 + x[0] : x[0] + x[1]; if (v > best) { best = v; who = id; } });
    });
    S.turn = starter || who;
  }
  function domPlay(S, id, i, sd) {
    var hand = S.hands[id], t = hand && hand[i], e = ends(S.chain);
    if (S.turn !== id || S.st !== "jogo") return "não é sua vez";
    if (!t) return "peça inválida";
    if (!canPlay(t, e)) return "não encaixa";
    if (!e) S.chain.push([t[0], t[1]]);
    else if (sd === "L") {
      if (t[1] === e[0]) S.chain.unshift([t[0], t[1]]); else if (t[0] === e[0]) S.chain.unshift([t[1], t[0]]); else return "não encaixa na esquerda";
    } else {
      if (t[0] === e[1]) S.chain.push([t[0], t[1]]); else if (t[1] === e[1]) S.chain.push([t[1], t[0]]); else return "não encaixa na direita";
    }
    hand.splice(i, 1); S.passes = 0;
    return "";
  }
  function domBuy(S, id) {
    if (S.turn !== id || S.st !== "jogo" || playable(S.hands[id], S.chain).length || !S.stock.length) return "não pode comprar";
    S.hands[id].push(S.stock.pop());
    return "";
  }
  // Fim de rodada? devolve {w, pts} ou null
  function domEnd(S, order) {
    var i, w = null;
    for (i = 0; i < order.length; i++) if (!S.hands[order[i]].length) w = order[i];
    var blocked = !w && S.passes >= order.length;
    if (!w && !blocked) return null;
    if (blocked) { var lo = 1e9; order.forEach(function (id) { var p = pips(S.hands[id]); if (p < lo) { lo = p; w = id; } }); }
    var pts = 0;
    order.forEach(function (id) { if (id !== w) pts += pips(S.hands[id]); });
    return { w: w, pts: pts, blocked: blocked };
  }
  function domAuto(S, order) { // passa sozinho quem nao tem jogada e nao pode comprar
    for (var g = 0; g < order.length + 1; g++) {
      var r = domEnd(S, order);
      if (r) return r;
      if (playable(S.hands[S.turn], S.chain).length || S.stock.length) return null;
      S.passes++;
      r = domEnd(S, order);
      if (r) return r;
      S.turn = order[(order.indexOf(S.turn) + 1) % order.length];
    }
    return null;
  }
  function domFinish(t, r) {
    var S = t.dm, name = nm(t.pl, r.w);
    S.sc[r.w] = (S.sc[r.w] || 0) + r.pts;
    S.rev = {}; S.o.forEach(function (id) { S.rev[id] = S.hands[id]; });
    S.ev = name + (r.blocked ? " ganhou o jogo trancado" : " bateu") + " e fez " + r.pts + " pontos.";
    S.st = "rodada";
    if (EX) EX.score(name, r.pts);
    var meta = t.opt.meta;
    if (!meta || S.sc[r.w] >= meta) { S.st = "fim"; t.ph = "fim"; S.ev += " Fim de jogo!"; }
  }
  var domino = {
    nome: "Dominó", desc: "Dominó tradicional, com monte e contagem de pontos.", min: 2, max: 4,
    opts: [
      { k: "pecas", label: "Peças por jogador", vals: [[5, "5"], [6, "6"], [7, "7"], [8, "8"]], def: 7 },
      { k: "monte", label: "Monte para comprar", vals: [["sim", "Com monte"], ["nao", "Sem monte"]], def: "sim" },
      { k: "meta", label: "Jogar até", vals: [[0, "Uma rodada"], [50, "50 pontos"], [100, "100 pontos"]], def: 0 }
    ],
    start: function (t) {
      var n = t.pl.length;
      if (n * t.opt.pecas > 28) return "Peças demais para " + n + " jogadores (máx. 28 no total).";
      var S = t.dm = { o: t.pl.map(function (p) { return p.id; }), sc: {}, ev: "" };
      domDeal(S, S.o, t.opt.pecas, t.opt.monte === "sim");
      S.o.forEach(function (id) { S.sc[id] = 0; });
      S.ev = nm(t.pl, S.turn) + " começa.";
    },
    pub: function (t) {
      var S = t.dm;
      if (!S) return {};
      var hc = {};
      S.o.forEach(function (id) { hc[id] = S.hands[id].length; });
      return { b: S.chain, tn: S.turn, hc: hc, sk: S.stock.length, sc: S.sc, st: S.st, ev: S.ev, rv: S.rev || 0 };
    },
    priv: function (t, id) { return t.dm && t.dm.hands[id] ? { h: t.dm.hands[id] } : null; },
    msg: function (t, m) {
      var S = t.dm, r = null, err = "";
      if (!S) return;
      if (m.a === "joga") {
        err = domPlay(S, m.f, m.i, m.s);
        if (!err) {
          r = domEnd(S, S.o);
          if (!r) { S.turn = S.o[(S.o.indexOf(S.turn) + 1) % S.o.length]; r = domAuto(S, S.o); }
          S.ev = nm(t.pl, m.f) + " jogou.";
        }
      } else if (m.a === "compra") {
        err = domBuy(S, m.f);
        if (!err) { S.ev = nm(t.pl, m.f) + " comprou do monte."; r = domAuto(S, S.o); }
      } else if (m.a === "prox" && S.st === "rodada") {
        domDeal(S, S.o, t.opt.pecas, t.opt.monte === "sim");
        S.ev = "Nova rodada. " + nm(t.pl, S.turn) + " começa.";
        EX.announce(t, true);
        return;
      } else return;
      if (err) return;
      if (r) domFinish(t, r);
      EX.announce(t, true);
    },
    draw: function (box, S, c) { drawDomino(box, S, c); }
  };
  function tileEl(a, b, fn, off) {
    var e = EX.h(fn ? "button" : "span", null, "dt");
    e.appendChild(EX.h("span", String(a))); e.appendChild(EX.h("span", String(b)));
    if (fn) { e.onclick = fn; if (off) e.disabled = true; }
    return e;
  }
  var dsx = null;
  function drawDomino(box, S, c) {
    var h = EX.h, btn = EX.btn, pl = c.s.pl, hand = c.pv && c.pv.h;
    box.appendChild(h("p", S.ev));
    box.appendChild(h("p", "Pontos: " + pl.map(function (p) { return p.n + " " + (S.sc[p.id] || 0); }).join("  |  "), "exinfo"));
    box.appendChild(h("p", pl.map(function (p) { return p.n + ": " + S.hc[p.id] + " peças"; }).join("  |  ") + "  |  Monte: " + S.sk, "exinfo"));
    var tr = h("div"); S.b.forEach(function (x) { tr.appendChild(tileEl(x[0], x[1])); });
    box.appendChild(h("p", "Mesa:")); box.appendChild(tr);
    if (S.st !== "jogo") {
      box.appendChild(h("p", "Peças que sobraram:"));
      pl.forEach(function (p) { var d = h("div", p.n + ": "); (S.rv && S.rv[p.id] || []).forEach(function (x) { d.appendChild(tileEl(x[0], x[1])); }); box.appendChild(d); });
      if (S.st === "rodada" && c.isP) box.appendChild(btn("Próxima rodada", function () { c.act({ a: "prox" }); }));
      return;
    }
    if (!c.isP) return;
    if (!hand) { c.needPv(); box.appendChild(h("p", "Carregando suas peças...")); return; }
    var mine = S.tn === c.me, e = S.b.length ? [S.b[0][0], S.b[S.b.length - 1][1]] : null;
    box.appendChild(h("p", mine ? "Sua vez! Toque numa peça." : "Vez de " + nm(pl, S.tn) + "."));
    var hd = h("div");
    hand.forEach(function (x, i) {
      var ok = mine && canPlay(x, e);
      hd.appendChild(tileEl(x[0], x[1], function () {
        var l = e && (x[0] === e[0] || x[1] === e[0]), r = e && (x[0] === e[1] || x[1] === e[1]);
        if (e && l && r && e[0] !== e[1]) { dsx = i; EX.paint(); }
        else { dsx = null; c.act({ a: "joga", i: i, s: r || !e ? "R" : "L" }); }
      }, !ok));
    });
    box.appendChild(hd);
    if (dsx !== null && hand[dsx]) {
      box.appendChild(h("p", "Em qual ponta?"));
      box.appendChild(btn("Esquerda (" + e[0] + ")", function () { var i = dsx; dsx = null; c.act({ a: "joga", i: i, s: "L" }); }));
      box.appendChild(btn("Direita (" + e[1] + ")", function () { var i = dsx; dsx = null; c.act({ a: "joga", i: i, s: "R" }); }));
    }
    if (mine && !playable(hand, S.b).length && S.sk > 0) box.appendChild(btn("Comprar do monte (" + S.sk + ")", function () { c.act({ a: "compra" }); }));
  }

  // =========================== CIDADE DORME ===========================
  var ROLE = { A: "Assassino", M: "Médico", D: "Detetive", C: "Cidadão" };
  function cdCount(c, kind) { var n = 0; keys(c.alive).forEach(function (id) { if (c.alive[id] && (kind === "A" ? c.roles[id] === "A" : c.roles[id] !== "A")) n++; }); return n; }
  function cdWin(c) { var a = cdCount(c, "A"), o = cdCount(c, "O"); return a === 0 ? "C" : a >= o ? "A" : ""; }
  function cdNight(c, pl, rnd) { // resolve a noite; devolve texto do que aconteceu
    var kills = {}, saves = {}, vic = null;
    keys(c.alive).forEach(function (id) {
      if (!c.alive[id]) return;
      var r = c.roles[id], a = c.act[id];
      if (!a || a === "ok") return;
      if (r === "A") kills[a] = (kills[a] || 0) + 1;
      if (r === "M") saves[a] = 1;
      if (r === "D") (c.det[id] = c.det[id] || []).push([nm(pl, a), c.roles[a] === "A" ? 1 : 0]);
    });
    var best = 0, tied = [];
    keys(kills).forEach(function (k) { if (kills[k] > best) { best = kills[k]; tied = [k]; } else if (kills[k] === best) tied.push(k); });
    if (tied.length) vic = tied[Math.floor((rnd || Math.random)() * tied.length)];
    if (vic && !saves[vic]) { c.alive[vic] = 0; return nm(pl, vic) + " foi morto(a) durante a noite."; }
    return "Ninguém morreu esta noite.";
  }
  function cdVote(c, pl) { // resolve a votacao
    var tally = {}, best = 0, tied = [];
    keys(c.vote).forEach(function (id) { var v = c.vote[id]; if (v !== "0") tally[v] = (tally[v] || 0) + 1; });
    keys(tally).forEach(function (k) { if (tally[k] > best) { best = tally[k]; tied = [k]; } else if (tally[k] === best) tied.push(k); });
    if (tied.length === 1) { c.alive[tied[0]] = 0; return nm(pl, tied[0]) + " foi eliminado(a) e era " + ROLE[c.roles[tied[0]]] + "."; }
    return "Empate ou ninguém votado: ninguém foi eliminado.";
  }
  function cdEnd(t, w) {
    var c = t.c; c.ph = "fim"; c.w = w; t.ph = "fim";
    if (EX) t.pl.forEach(function (p) { if ((c.roles[p.id] === "A") === (w === "A")) EX.score(p.n, 3); });
  }
  function cdAlive(c) { return keys(c.alive).filter(function (id) { return c.alive[id]; }); }
  var cidade = {
    nome: "Cidade Dorme", desc: "Assassinos, médico, detetive e cidadãos. Descubra os assassinos.", min: 4, max: 12,
    opts: [
      { k: "a", label: "Assassinos", vals: [[1, "1"], [2, "2"], [3, "3"]], def: 1 },
      { k: "m", label: "Médicos", vals: [[0, "0"], [1, "1"], [2, "2"]], def: 1 },
      { k: "d", label: "Detetives", vals: [[0, "0"], [1, "1"], [2, "2"]], def: 1 },
      { k: "tarefas", label: "Tarefas na noite", vals: [["sim", "Ligadas"], ["nao", "Desligadas"]], def: "sim" }
    ],
    start: function (t) {
      var o = t.opt, ids = shuffle(t.pl.map(function (p) { return p.id; })), n = ids.length;
      if (o.a * 2 >= n) return "Assassinos demais para " + n + " jogadores.";
      if (o.a + o.m + o.d > n - 1) return "Papéis demais para " + n + " jogadores.";
      var c = t.c = { ph: "noite", n: 1, roles: {}, alive: {}, act: {}, ready: {}, vote: {}, ev: "A noite começou.", det: {}, w: "" };
      ids.forEach(function (id, i) { c.roles[id] = i < o.a ? "A" : i < o.a + o.m ? "M" : i < o.a + o.m + o.d ? "D" : "C"; c.alive[id] = 1; });
    },
    pub: function (t) {
      var c = t.c;
      if (!c) return {};
      var o = { ph: c.ph, n: c.n, ev: c.ev, al: cdAlive(c).join(","), na: keys(c.act).length, np: keys(c.ready).length, nv: keys(c.vote).length, w: c.w, tk: t.opt.tarefas === "sim" ? 1 : 0 };
      if (c.ph === "fim") o.rv = c.roles;
      return o;
    },
    priv: function (t, id) { var c = t.c; return c ? { r: c.roles[id], d: c.det[id] || [] } : null; },
    msg: function (t, m) {
      var c = t.c, pl = t.pl, na = cdAlive(c).length;
      if (!c || c.ph === "fim" || !c.alive[m.f]) return;
      if (m.a === "noite" && c.ph === "noite") {
        var r = c.roles[m.f], v = String(m.v || "");
        if (v !== "ok" && (!c.alive[v] || (r === "A" && v === m.f) || r === "C")) return;
        c.act[m.f] = v;
        if (keys(c.act).length >= na) {
          c.ev = cdNight(c, pl);
          var w = cdWin(c);
          if (w) { cdEnd(t, w); } else { c.ph = "dia"; c.ready = {}; }
          EX.announce(t, true);
          return;
        }
      } else if (m.a === "pronto" && c.ph === "dia") {
        c.ready[m.f] = 1;
        if (keys(c.ready).length * 2 > na) { c.ph = "voto"; c.vote = {}; }
      } else if (m.a === "voto" && c.ph === "voto") {
        var tv = String(m.v || "0");
        if (tv !== "0" && !c.alive[tv]) return;
        c.vote[m.f] = tv;
        if (keys(c.vote).length >= na) {
          c.ev = cdVote(c, pl);
          var w2 = cdWin(c);
          if (w2) cdEnd(t, w2); else { c.ph = "noite"; c.n++; c.act = {}; c.ready = {}; c.vote = {}; }
        }
      } else return;
      EX.announce(t, true);
    },
    draw: function (box, S, c) { drawCidade(box, S, c); }
  };
  var TK = { n: -1, type: 0, cnt: 0, a: 0, b: 0, sent: false, ok: false };
  function drawCidade(box, S, c) {
    var h = EX.h, btn = EX.btn, pl = c.s.pl, I = c.me, al = S.al ? S.al.split(",") : [], alive = al.indexOf(I) >= 0, pv = c.pv;
    box.appendChild(h("p", S.ev));
    box.appendChild(h("p", "Vivos: " + al.map(function (id) { return nm(pl, id); }).join(", "), "exinfo"));
    if (S.ph === "fim") {
      box.appendChild(h("p", S.w === "C" ? "A cidade venceu! 🎉" : "Os assassinos venceram! 🔪", "exbig"));
      pl.forEach(function (p) { box.appendChild(h("p", p.n + ": " + ROLE[S.rv[p.id]] + (al.indexOf(p.id) >= 0 ? "" : " (morto)"))); });
      return;
    }
    if (!c.isP) return;
    if (!pv) { c.needPv(); box.appendChild(h("p", "Carregando seu papel...")); return; }
    box.appendChild(h("p", "Seu papel: " + ROLE[pv.r] + (alive ? "" : " (você morreu: assista)"), "exbig"));
    if (pv.r === "D" && pv.d.length) box.appendChild(h("p", "Suas investigações: " + pv.d.map(function (x) { return x[0] + (x[1] ? " = ASSASSINO" : " = inocente"); }).join("; ")));
    if (!alive) return;
    if (S.ph === "noite") {
      box.appendChild(h("h3", "Noite " + S.n + " (" + S.na + "/" + al.length + " prontos)"));
      if (TK.n !== S.n) { TK = { n: S.n, type: Math.floor(Math.random() * 2), cnt: 0, a: 2 + Math.floor(Math.random() * 8), b: 2 + Math.floor(Math.random() * 8), sent: false, ok: false }; }
      if (TK.sent) { box.appendChild(h("p", "Pronto. Aguarde os outros...")); return; }
      var done = function (v) { TK.sent = true; c.act({ a: "noite", v: v }); };
      if (pv.r === "A" || pv.r === "M" || pv.r === "D") {
        box.appendChild(h("p", pv.r === "A" ? "Escolha quem matar:" : pv.r === "M" ? "Escolha quem salvar:" : "Escolha quem investigar:"));
        al.forEach(function (id) { if (!(pv.r === "A" && id === I)) box.appendChild(btn(nm(pl, id), function () { done(id); })); });
        box.appendChild(btn("Não fazer nada", function () { done("ok"); }));
      } else if (S.tk) {
        box.appendChild(h("p", "Tarefa da noite (finja que está agindo!):"));
        if (TK.type === 0) {
          box.appendChild(btn("Toque 6 vezes: " + TK.cnt + "/6", function () { TK.cnt++; if (TK.cnt >= 6) done("ok"); else EX.paint(); }));
        } else {
          box.appendChild(h("p", "Quanto é " + TK.a + " + " + TK.b + "?"));
          [TK.a + TK.b - 1, TK.a + TK.b, TK.a + TK.b + 2].sort().forEach(function (x) { box.appendChild(btn(String(x), function () { if (x === TK.a + TK.b) done("ok"); else { TK.n = -1; EX.paint(); } })); });
        }
      } else box.appendChild(btn("Fechei os olhos", function () { done("ok"); }));
    } else if (S.ph === "dia") {
      box.appendChild(h("h3", "Dia " + S.n + ": discutam!"));
      box.appendChild(btn("Estou pronto para votar (" + S.np + "/" + al.length + ")", function () { c.act({ a: "pronto" }); }));
    } else if (S.ph === "voto") {
      box.appendChild(h("h3", "Votação (" + S.nv + "/" + al.length + ")"));
      al.forEach(function (id) { if (id !== I) box.appendChild(btn("Eliminar " + nm(pl, id), function () { c.act({ a: "voto", v: id }); })); });
      box.appendChild(btn("Ninguém", function () { c.act({ a: "voto", v: "0" }); }));
    }
  }

  // =========================== QUEM EU SOU? ===========================
  function derange(ids, rnd) {
    var a, p = {};
    do { a = shuffle(ids.slice(), rnd); } while (a.some(function (x, i) { return x === ids[i]; }));
    ids.forEach(function (id, i) { p[id] = a[i]; });
    return p; // quem escreve -> para quem escreve
  }
  var quem = {
    nome: "Quem Eu Sou?", desc: "Cada um escreve o personagem de outro; adivinhe o seu.", min: 2, max: 12,
    start: function (t) { t.q = { st: "escreve", pair: derange(t.pl.map(function (p) { return p.id; })), chars: {}, solved: [] }; },
    pub: function (t) {
      var q = t.q;
      if (!q) return {};
      var o = { st: q.st, w: keys(q.chars).length, sv: q.solved };
      if (q.st === "fim") o.ch = q.chars;
      return o;
    },
    priv: function (t, id) {
      var q = t.q;
      if (!q) return null;
      if (q.st === "escreve") { var tg = q.pair[id]; return { w: nm(t.pl, tg), ok: q.chars[tg] ? 1 : 0 }; }
      var v = {};
      keys(q.chars).forEach(function (k) { if (k !== id) v[k] = q.chars[k]; });
      return { v: v };
    },
    msg: function (t, m) {
      var q = t.q;
      if (!q) return;
      if (m.a === "nome" && q.st === "escreve") {
        var s = String(m.v || "").trim().slice(0, 20);
        if (!s) return;
        q.chars[q.pair[m.f]] = s;
        if (keys(q.chars).length >= t.pl.length) q.st = "jogo";
      } else if (m.a === "achei" && q.st === "jogo" && q.solved.indexOf(m.f) < 0) {
        q.solved.push(m.f);
        EX.score(nm(t.pl, m.f), t.pl.length - q.solved.length + 1);
        if (q.solved.length >= t.pl.length) { q.st = "fim"; t.ph = "fim"; }
      } else if (m.a === "fim" && q.st === "jogo" && m.f === EX.me.id) { q.st = "fim"; t.ph = "fim"; }
      else return;
      EX.announce(t, true);
    },
    draw: function (box, S, c) { drawQuem(box, S, c); }
  };
  var QS = { hide: false, v: "" };
  function drawQuem(box, S, c) {
    var h = EX.h, btn = EX.btn, pl = c.s.pl, I = c.me, pv = c.pv;
    if (S.st === "fim") {
      box.appendChild(h("h3", "Fim! Os personagens eram:"));
      pl.forEach(function (p) { box.appendChild(h("p", p.n + " era " + (S.ch[p.id] || "?"))); });
      return;
    }
    if (!c.isP) { box.appendChild(h("p", S.st === "escreve" ? "Os jogadores estão escrevendo (" + S.w + "/" + pl.length + ")..." : "Partida em andamento.")); return; }
    if (!pv || (S.st === "escreve" ? pv.w === undefined : !pv.v)) { c.needPv(); box.appendChild(h("p", "Carregando...")); return; }
    if (S.st === "escreve") {
      box.appendChild(h("p", "Escreva o personagem de " + pv.w + " (ex.: Homem de Ferro):"));
      if (pv.ok) { box.appendChild(h("p", "Enviado! Esperando os outros (" + S.w + "/" + pl.length + ")...")); return; }
      var i = h("input"); i.value = QS.v; i.placeholder = "Personagem"; i.dataset.keep = 1; i.oninput = function () { QS.v = i.value; };
      box.appendChild(i);
      box.appendChild(btn("Enviar", function () { if (QS.v.trim()) { c.act({ a: "nome", v: QS.v }); QS.v = ""; } }));
      return;
    }
    var lock = btn(QS.hide ? "🔒" : "🔍", function () { QS.hide = !QS.hide; EX.paint(); });
    lock.style.cssText = "position:fixed;top:8px;right:8px;z-index:10001;font-size:20px";
    box.appendChild(lock);
    box.appendChild(h("p", "Veja os personagens dos outros. O seu você descobre perguntando!"));
    pl.forEach(function (p) {
      if (p.id === I) { box.appendChild(h("p", p.n + ": ???")); return; }
      var r = h("p", p.n + ": " + (pv.v[p.id] || "?") + (S.sv.indexOf(p.id) >= 0 ? " ✅" : ""));
      if (QS.hide) r.className = "blur";
      box.appendChild(r);
    });
    if (S.sv.indexOf(I) < 0) box.appendChild(btn("Descobri quem eu sou!", function () { c.act({ a: "achei" }); }));
    else box.appendChild(h("p", "Você já descobriu! 🎉"));
    if (c.owner) box.appendChild(btn("Encerrar rodada", function () { c.act({ a: "fim" }); }));
  }

  // =========================== DESAFIO MATEMATICO ===========================
  function mgen(lv, rnd) {
    rnd = rnd || Math.random;
    var r = function (a, b) { return a + Math.floor(rnd() * (b - a + 1)); }, a, b, c, d, k;
    if (lv === 1) {
      k = r(0, 2);
      if (k === 0) { a = r(2, 60); b = r(2, 60); return { q: a + " + " + b, a: a + b }; }
      if (k === 1) { a = r(20, 99); b = r(2, a - 1); return { q: a + " − " + b, a: a - b }; }
      a = r(2, 10); b = r(2, 10); return { q: a + " × " + b, a: a * b };
    }
    if (lv === 2) {
      if (r(0, 1)) { a = r(2, 9); b = r(11, 19); return { q: a + " × " + b, a: a * b }; }
      a = r(2, 9); b = r(11, 19); return { q: a * b + " ÷ " + a, a: b };
    }
    if (lv === 3) {
      if (r(0, 1)) { a = r(12, 49); b = r(12, 29); return { q: a + " × " + b, a: a * b }; }
      a = r(11, 19); b = r(12, 29); return { q: a * b + " ÷ " + a, a: b };
    }
    k = r(0, 2);
    if (k === 0) { a = r(2, 30); b = r(2, 12); c = r(2, 12); d = r(1, 20); return { q: a + " + " + b + " × " + c + " − " + d, a: a + b * c - d }; }
    if (k === 1) { var x = r(2, 15); a = r(2, 9); b = r(1, 30); return { q: a + "x + " + b + " = " + (a * x + b) + "   (x = ?)", a: x }; }
    a = r(2, 15); b = r(2, 15); c = r(2, 9); d = r(1, 30);
    return { q: "(" + a + " + " + b + ") × " + c + " − " + d, a: (a + b) * c - d };
  }
  function mNext(t) {
    var m = t.m;
    if (m.n >= t.opt.r) { m.st = "fim"; t.ph = "fim"; EX.announce(t); return; }
    var q = mgen(t.opt.nivel);
    m.n++; m.q = q.q; m.ans = q.a; m.open = true; m.st = "q";
    var n = m.n;
    EX.announce(t);
    setTimeout(function () { // ninguem acertou em 30 s: passa para a proxima
      if (t.m === m && m.n === n && m.open) { m.open = false; m.last = "ninguém"; EX.announce(t); setTimeout(function () { if (t.m === m && m.n === n) mNext(t); }, 1500); }
    }, 30000);
  }
  var mat = {
    nome: "Desafio Matemático", desc: "Cálculo mental: o primeiro a acertar ganha o ponto.", min: 1, max: 12,
    opts: [
      { k: "nivel", label: "Dificuldade", vals: [[1, "Fácil"], [2, "Médio"], [3, "Difícil"], [4, "Impossível"]], def: 1 },
      { k: "r", label: "Perguntas", vals: [[5, "5"], [10, "10"], [15, "15"], [20, "20"]], def: 10 }
    ],
    start: function (t) { t.m = { n: 0, q: "", ans: 0, sc: {}, open: false, last: "", st: "q" }; mNext(t); },
    pub: function (t) { var m = t.m; return m ? { n: m.n, tot: t.opt.r, q: m.q, sc: m.sc, last: m.last, op: m.open ? 1 : 0, st: m.st } : {}; },
    msg: function (t, m) {
      var q = t.m;
      if (!q || m.a !== "resp" || !q.open) return;
      if (parseInt(String(m.v).trim(), 10) !== q.ans) return;
      q.open = false; q.sc[m.f] = (q.sc[m.f] || 0) + 1; q.last = nm(t.pl, m.f);
      EX.score(q.last, 1);
      EX.announce(t);
      var n = q.n;
      setTimeout(function () { if (t.m === q && q.n === n) mNext(t); }, 1500);
    },
    draw: function (box, S, c) {
      var h = EX.h, btn = EX.btn, pl = c.s.pl;
      box.appendChild(h("p", "Pergunta " + Math.min(S.n, S.tot) + " de " + S.tot, "exinfo"));
      if (S.st === "fim") box.appendChild(h("p", "Fim!", "exbig"));
      else {
        box.appendChild(h("div", S.q, "exbig"));
        box.appendChild(h("p", S.op ? "Valendo!" : "Acertou: " + S.last, "exinfo"));
        if (c.isP && S.op) {
          var i = h("input"); i.placeholder = "Sua resposta"; i.setAttribute("inputmode", "numeric"); i.dataset.keep = 1;
          var go = function () { if (i.value.trim()) { c.act({ a: "resp", v: i.value }); i.value = ""; } };
          i.onkeydown = function (e) { if (e.key === "Enter") go(); };
          box.appendChild(i); box.appendChild(btn("Responder", go));
        }
      }
      box.appendChild(h("h3", "Placar"));
      pl.slice().sort(function (a, b) { return (S.sc[b.id] || 0) - (S.sc[a.id] || 0); }).forEach(function (p) { box.appendChild(h("p", p.n + ": " + (S.sc[p.id] || 0))); });
    }
  };

  // =========================== STOP / ADEDONHA ===========================
  var DEFCATS = ["Nome", "Animal", "Cidade/País", "Cor", "Fruta", "Objeto"];
  var LETRAS = "ABCDEFGHIJLMNOPRSTUV";
  // Pontuacao: valida e unica = 10; valida e repetida = 5; vazia/invalida = 0.
  function stopScore(cats, L, ans, flagged, ids) {
    var res = {};
    ids.forEach(function (id) { res[id] = 0; });
    cats.forEach(function (cat, c) {
      var seen = {};
      ids.forEach(function (id) {
        var s = norm(String((ans[id] || [])[c] || "").trim());
        if (s && s.charAt(0) === L && !flagged[id + "." + c]) seen[s] = (seen[s] || 0) + 1;
      });
      ids.forEach(function (id) {
        var s = norm(String((ans[id] || [])[c] || "").trim());
        if (s && s.charAt(0) === L && !flagged[id + "." + c]) res[id] += seen[s] > 1 ? 5 : 10;
      });
    });
    return res;
  }
  function stopFlags(votes, ids) { // votos dos outros: mais da metade invalida a resposta
    var out = {};
    keys(votes).forEach(function (k) {
      var author = k.split(".")[0], n = keys(votes[k]).filter(function (v) { return v !== author; }).length;
      if (n * 2 > ids.length - 1) out[k] = 1;
    });
    return out;
  }
  function stopRound(t) {
    var s = t.s, avail = LETRAS.split("").filter(function (l) { return s.used.indexOf(l) < 0; });
    if (!avail.length) { s.used = ""; avail = LETRAS.split(""); }
    s.L = avail[Math.floor(Math.random() * avail.length)]; s.used += s.L;
    s.st = "joga"; s.rn++; s.ans = {}; s.votes = {}; s.rs = {};
    var rn = s.rn;
    setTimeout(function () { if (t.s === s && s.rn === rn && s.st === "joga") stopCollect(t); }, t.opt.s * 1000 + 1500);
  }
  function stopCollect(t) {
    var s = t.s, rn = s.rn;
    s.st = "coleta";
    EX.announce(t);
    setTimeout(function () { if (t.s === s && s.rn === rn && s.st === "coleta") stopValida(t); }, 3500);
  }
  function stopValida(t) {
    var s = t.s;
    s.st = "valida";
    t.pl.forEach(function (p) { EX.data(t, p.id, (s.ans[p.id] || []).slice(0, s.cats.length)); });
    EX.announce(t);
  }
  var stop = {
    nome: "Stop (Adedonha)", desc: "Sorteio de letra, tempo e validação entre os jogadores.", min: 2, max: 10,
    opts: [{ k: "s", label: "Tempo da rodada", vals: [[30, "30 s"], [60, "60 s"], [90, "90 s"], [120, "120 s"]], def: 60 }],
    start: function (t) { t.s = { st: "cats", cats: DEFCATS.slice(), L: "", used: "", rn: 0, ans: {}, votes: {}, sc: {}, rs: {} }; },
    pub: function (t) {
      var s = t.s;
      if (!s) return {};
      var flags = keys(stopFlags(s.votes, t.pl));
      return { st: s.st, cats: s.cats, L: s.L, sec: t.opt.s, rn: s.rn, ok: keys(s.ans).length, bad: flags, sc: s.sc, rs: s.rs };
    },
    msg: function (t, m) {
      var s = t.s, me = EX.me.id;
      if (!s) return;
      if (m.a === "cat" && s.st === "cats") {
        var c = String(m.v || "").trim().slice(0, 14);
        if (!c || s.cats.length >= 10 || s.cats.indexOf(c) >= 0) return;
        s.cats.push(c);
      } else if (m.a === "ini" && (s.st === "cats" || s.st === "res") && m.f === me) {
        stopRound(t);
      } else if (m.a === "stop" && s.st === "joga") {
        stopCollect(t); return;
      } else if (m.a === "resp" && s.st === "coleta") {
        s.ans[m.f] = (m.v || []).slice(0, s.cats.length).map(function (x) { return String(x || "").slice(0, 16); });
        if (keys(s.ans).length >= t.pl.length) { stopValida(t); return; }
      } else if (m.a === "inv" && s.st === "valida") {
        var k = m.p + "." + m.c;
        if (m.f === m.p) return;
        s.votes[k] = s.votes[k] || {};
        if (s.votes[k][m.f]) delete s.votes[k][m.f]; else s.votes[k][m.f] = 1;
        if (!keys(s.votes[k]).length) delete s.votes[k];
      } else if (m.a === "fimv" && s.st === "valida" && m.f === me) {
        var ids = t.pl.map(function (p) { return p.id; });
        s.rs = stopScore(s.cats, s.L, s.ans, stopFlags(s.votes, t.pl), ids);
        ids.forEach(function (id) { s.sc[id] = (s.sc[id] || 0) + s.rs[id]; });
        s.st = "res";
      } else if (m.a === "fim" && s.st === "res" && m.f === me) {
        s.st = "fim"; t.ph = "fim";
        var top = 0; keys(s.sc).forEach(function (id) { if (s.sc[id] > top) top = s.sc[id]; });
        keys(s.sc).forEach(function (id) { if (s.sc[id] === top) EX.score(nm(t.pl, id), 5); });
      } else return;
      EX.announce(t);
    },
    draw: function (box, S, c) { drawStop(box, S, c); }
  };
  var SA = { rn: -1, t0: 0, v: [], sent: -1, el: null, cat: "" };
  if (typeof window !== "undefined") setInterval(function () {
    if (SA.el && SA.el.isConnected) { var r = Math.max(0, SA.sec - Math.round((Date.now() - SA.t0) / 1000)); SA.el.textContent = "Tempo: " + r + " s"; }
  }, 500);
  function drawStop(box, S, c) {
    var h = EX.h, btn = EX.btn, pl = c.s.pl, I = c.me;
    if (S.st === "cats") {
      box.appendChild(h("h3", "Categorias"));
      box.appendChild(h("p", S.cats.join(", ")));
      if (c.isP) {
        var i = h("input"); i.value = SA.cat; i.placeholder = "Nova categoria (opcional)"; i.dataset.keep = 1; i.oninput = function () { SA.cat = i.value; };
        box.appendChild(i);
        box.appendChild(btn("Adicionar categoria", function () { if (SA.cat.trim()) { c.act({ a: "cat", v: SA.cat }); SA.cat = ""; } }));
      }
      if (c.owner) box.appendChild(btn("▶ Sortear letra e começar", function () { c.act({ a: "ini" }); }));
      else box.appendChild(h("p", "Esperando o dono começar a rodada.", "exinfo"));
      return;
    }
    if (S.st === "joga" || S.st === "coleta") {
      if (SA.rn !== S.rn) { SA.rn = S.rn; SA.t0 = Date.now(); SA.v = []; SA.sec = S.sec; }
      box.appendChild(h("div", "Letra: " + S.L, "exbig"));
      var tm = h("p", "Tempo", "exinfo"); box.appendChild(tm); SA.el = tm;
      if (!c.isP) return;
      if (S.st === "coleta") {
        box.appendChild(h("p", "Tempo! Enviando suas respostas..."));
        if (SA.sent !== S.rn) { SA.sent = S.rn; c.act({ a: "resp", v: SA.v.slice() }); }
        return;
      }
      S.cats.forEach(function (cat, k) {
        var inp = h("input"); inp.placeholder = cat; inp.value = SA.v[k] || ""; inp.dataset.keep = 1;
        inp.oninput = function () { SA.v[k] = inp.value; };
        box.appendChild(h("p", cat + ":")); box.appendChild(inp);
      });
      box.appendChild(btn("STOP!", function () { c.act({ a: "stop" }); }));
      return;
    }
    if (S.st === "valida") {
      box.appendChild(h("div", "Letra " + S.L, "exbig"));
      box.appendChild(h("p", "Toque numa resposta que você acha errada (a maioria invalida). Respostas dos jogadores: " + S.ok, "exinfo"));
      S.cats.forEach(function (cat, k) {
        box.appendChild(h("h3", cat));
        pl.forEach(function (p) {
          var a = (c.dat[p.id] || [])[k] || "", bad = S.bad.indexOf(p.id + "." + k) >= 0;
          var b = btn(p.n + ": " + (a || "—") + (bad ? "  ✗" : ""), function () { if (p.id !== I && a) c.act({ a: "inv", p: p.id, c: k }); });
          if (bad) b.style.textDecoration = "line-through";
          box.appendChild(b);
        });
      });
      if (c.owner) box.appendChild(btn("Encerrar validação e contar pontos", function () { c.act({ a: "fimv" }); }));
      return;
    }
    box.appendChild(h("h3", S.st === "fim" ? "Fim de jogo! Total:" : "Pontos da rodada (total)"));
    pl.slice().sort(function (a, b) { return (S.sc[b.id] || 0) - (S.sc[a.id] || 0); }).forEach(function (p) {
      box.appendChild(h("p", p.n + ": +" + (S.rs[p.id] || 0) + "  (total " + (S.sc[p.id] || 0) + ")"));
    });
    if (S.st === "res" && c.owner) {
      box.appendChild(btn("Próxima rodada", function () { c.act({ a: "ini" }); }));
      box.appendChild(btn("Encerrar jogo", function () { c.act({ a: "fim" }); }));
    }
  }

  // ---------------------------------------------------------------------
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { norm: norm, mask: mask, newBoard: newBoard, legalMoves: legalMoves, applyMove: applyMove, enc: enc, dec: dec,
      mgen: mgen, domDeal: domDeal, domPlay: domPlay, domBuy: domBuy, domEnd: domEnd, domAuto: domAuto, playable: playable, derange: derange,
      cdNight: cdNight, cdVote: cdVote, cdWin: cdWin, stopScore: stopScore, stopFlags: stopFlags };
    return;
  }
  if (!EX) return;
  EX.reg("forca", forca);
  EX.reg("dama", dama);
  EX.reg("domino", domino);
  EX.reg("cidade", cidade);
  EX.reg("quem", quem);
  EX.reg("mat", mat);
  EX.reg("stop", stop);
  EX.paint();
})();
