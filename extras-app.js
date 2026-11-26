// EXTRAS -- GERENCIADOR DE PERGUNTAS (aba "Perguntas", so para o administrador)
// Colado no fim do index.html pelo gerar-assets.mjs, depois de extras.js e extras-jogos.js.
//
// O que faz:
//  - lista, cria, edita (adicionar/alterar/apagar/mudar a ordem) e apaga os arquivos questoes*.txt
//    do cartao SD do Cardputer, direto pelo celular;
//  - gera um PROMPT para voce levar a uma IA (Gemini, ChatGPT, Claude...) e IMPORTA a resposta dela,
//    sem API e sem chave (voce copia o texto da IA e cola/importa aqui);
//  - guarda o padrao do Quiz (areas, ordem, quantidade) no cartao (questoes_config.txt).
// No app Android ("Arcade M5") o objeto window.ArcadeApp existe e deixa tudo mais direto
// (abrir o app da IA, colar o que foi copiado, entrar na rede do Cardputer).
(function () {
  "use strict";
  var LIM = 15000;                 // bytes por arquivo (o Cardputer le no maximo 16000)
  var CH = 400;                    // caracteres por pedaco enviado ao Cardputer
  var CFG = "questoes_config.txt"; // padrao do quiz (nao e um arquivo de perguntas)

  // ------------------------------- formato dos arquivos -------------------------------
  function bytes(s) {
    try { return new TextEncoder().encode(s).length; } catch (e) { return unescape(encodeURIComponent(s)).length; }
  }
  function limpaTxt(s) { // uma linha so, sem emoji (pares substitutos) e sem espacos sobrando
    return String(s == null ? "" : s).replace(/[\ud800-\udfff]/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  }
  function limpaMd(l) { return l.replace(/\*\*|__|`/g, "").replace(/^\s*(?:[-*\u2022]\s+|#+\s*)/, "").trim(); }

  // Le o formato do jogo (Q:/A:/B:/C:/D:/Answer:/---) e tambem respostas "bagunçadas" de IA:
  // com **negrito**, com ```cercas```, "1. Pergunta", "a) texto", "Resposta: C", "Gabarito: C"...
  function parseTxt(text) {
    var tema = "", qs = [], cur = null, ign = 0;
    function fecha() {
      if (!cur) return;
      if (cur.q && cur.o.A && cur.o.B && cur.o.C && cur.o.D && /^[ABCD]$/.test(cur.a)) {
        qs.push({ q: limpaTxt(cur.q).slice(0, 160), o: ["A", "B", "C", "D"].map(function (k) { return limpaTxt(cur.o[k]).slice(0, 60); }), a: "ABCD".indexOf(cur.a) });
      } else if (cur.q) ign++;
      cur = null;
    }
    String(text == null ? "" : text).replace(/\r/g, "").split("\n").forEach(function (raw) {
      var l = limpaMd(raw), m;
      if (!l || /^```/.test(l)) return;
      if (/^(?:-{3,}|={3,}|_{3,})$/.test(l)) { fecha(); return; }
      if ((m = /^(?:Pack|Tema)\s*:\s*(.+)$/i.exec(l))) { tema = limpaTxt(m[1]).slice(0, 30); return; }
      if ((m = /^(?:Answer|Resposta(?: correta)?|Gabarito|Correta)\s*[:\-]\s*\(?([A-Da-d])\b/i.exec(l))) { if (cur) cur.a = m[1].toUpperCase(); return; }
      if (cur && (m = /^\(?([A-Da-d])\s*[):.\-]\s*(.+)$/.exec(l))) { cur.o[m[1].toUpperCase()] = m[2].trim(); return; }
      if ((m = /^(?:(?:Q|P|Pergunta|Quest[aã]o)\s*\d*|\d+)\s*[:.)\-]\s*(.+)$/i.exec(l))) { fecha(); cur = { q: m[1].trim(), o: {}, a: "" }; return; }
      if (/\?\s*$/.test(l) && (!cur || cur.a)) { fecha(); cur = { q: l, o: {}, a: "" }; } // pergunta sem rotulo
    });
    fecha();
    return { tema: tema, qs: qs, ign: ign };
  }
  function ser(tema, qs) {
    var o = "Pack: " + (limpaTxt(tema).slice(0, 30) || "Perguntas") + "\n";
    qs.forEach(function (q) {
      o += "Q: " + limpaTxt(q.q) + "\n";
      for (var i = 0; i < 4; i++) o += "ABCD".charAt(i) + ": " + limpaTxt(q.o[i]) + "\n";
      o += "Answer: " + "ABCD".charAt(q.a) + "\n---\n";
    });
    return o;
  }
  function partir(tema, qs) { // divide em textos de ate LIM bytes
    var out = [], atual = [];
    qs.forEach(function (q) {
      var teste = atual.concat([q]);
      if (atual.length && bytes(ser(tema, teste)) > LIM) { out.push(ser(tema, atual)); atual = [q]; } else atual = teste;
    });
    out.push(ser(tema, atual));
    return out;
  }
  function slug(s) {
    var t = String(s || "");
    if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28);
  }
  function nomeArq(s) { var sl = slug(s); return sl ? "questoes_" + sl + ".txt" : ""; }
  function proximoNome(nome, usados) {
    var base = nome.replace(/(?:_\d+)?\.txt$/, "");
    for (var k = 2; k < 100; k++) { var c = base + "_" + k + ".txt"; if (usados.indexOf(c) < 0) return c; }
    return base + "_x.txt";
  }
  function criaPrompt(I, evitar) {
    var area = limpaTxt(I.area) || "conhecimentos gerais";
    var p = "Crie " + I.qtd + " perguntas de múltipla escolha sobre " + area + ", para um jogo de quiz entre amigos. " +
      "Nível: " + I.nivel + ". São perguntas de conhecimentos gerais, do tipo que se aprende na escola, sem detalhes muito específicos. " +
      "Cada pergunta tem 4 alternativas (A, B, C, D), só uma correta, e a letra da correta deve variar de uma pergunta para outra. " +
      "Pergunta com no máximo 150 caracteres e cada alternativa com no máximo 50 caracteres. Não repita perguntas. Português do Brasil.\n";
    if (evitar && evitar.length) p += "Não repita estas perguntas, que eu já tenho:\n" + evitar.map(function (q) { return "- " + q.slice(0, 70); }).join("\n") + "\n";
    p += "\nResponda SOMENTE neste formato exato, sem numerar, sem explicações e sem nenhum texto antes ou depois:\n\n" +
      "Pack: " + area.slice(0, 30) + "\nQ: pergunta aqui\nA: alternativa\nB: alternativa\nC: alternativa\nD: alternativa\nAnswer: letra da correta (A, B, C ou D)\n---\nQ: próxima pergunta...";
    return p;
  }
  function lerCfg(txt) {
    var c = {};
    String(txt || "").split(/\r?\n/).forEach(function (l) { var m = /^\s*(\w+)\s*=\s*(.*?)\s*$/.exec(l); if (m) c[m[1]] = m[2]; });
    return c;
  }

  if (typeof window === "undefined" || !window.EX) { // testes em Node
    if (typeof module !== "undefined") module.exports = { parseTxt: parseTxt, ser: ser, partir: partir, nomeArq: nomeArq, proximoNome: proximoNome, criaPrompt: criaPrompt, lerCfg: lerCfg, bytes: bytes, LIM: LIM };
    return;
  }

  var EX = window.EX, h = EX.h, btn = EX.btn;
  var AND = window.ArcadeApp || null; // ponte com o app Android (se estiver rodando nele)
  var nomeBonito = EX.sdNome || function (f) { return f; };

  // ------------------------------- conversa com o Cardputer (/sdq) -------------------------------
  function sd(url, cb, tries) {
    tries = tries || 0;
    fetch(url, { cache: "no-store" }).then(function (r) {
      if (r.status === 200) return r.text().then(function (t) { cb(t); });
      if (r.status === 202 && tries < 150) setTimeout(function () { sd(url, cb, tries + 1); }, tries ? 150 : 70);
      else cb(null);
    }).catch(function () { cb(null); });
  }
  function sdLista(cb) { sd("/sdq?f=lista", function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} cb(j && j.ok ? j : null); }); }
  function sdLer(nome, cb) { sd("/sdq?f=" + encodeURIComponent(nome), cb); }
  function sdApagar(nome, cb) { sd("/sdq?f=" + encodeURIComponent(nome) + "&x=1", function (t) { cb(t === "ok"); }); }
  function sdGravar(nome, texto, prog, cb) { // manda em pedacos pequenos (o Cardputer grava um por vez)
    var n = Math.max(1, Math.ceil(texto.length / CH)), i = 0;
    (function prox() {
      if (i >= n) { cb(true); return; }
      prog(i, n);
      sd("/sdq?f=" + encodeURIComponent(nome) + "&w=" + i + "&d=" + encodeURIComponent(texto.substr(i * CH, CH)), function (t) {
        if (t !== "ok") { cb(false); return; }
        i++; prox();
      });
    })();
  }

  // ------------------------------- estado -------------------------------
  var A = { view: "arq", lista: null, carrega: false, busy: "", msg: "", err: "", ed: null, cfg: null, cfgSel: null, ia: carregaIa(), novo: "" };
  function carregaIa() {
    var o = { area: "", qtd: 10, nivel: "médio", resp: "", dest: "", novo: "", evitarArq: "", evitar: [], prev: null, sel: [], ultimo: "" };
    try { var j = JSON.parse(localStorage.getItem("ex_app_ia") || "{}"); for (var k in j) if (k in o && k !== "prev" && k !== "sel") o[k] = j[k]; } catch (e) {}
    return o;
  }
  function guardaIa() {
    try { var I = A.ia; localStorage.setItem("ex_app_ia", JSON.stringify({ area: I.area, qtd: I.qtd, nivel: I.nivel, resp: I.resp.slice(0, 40000), dest: I.dest, novo: I.novo })); } catch (e) {}
  }
  function rep() { try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {} EX.paint(); }
  function tam(nome) { var i = A.lista ? A.lista.f.indexOf(nome) : -1; return i >= 0 ? (A.lista.z[i] || 0) : 0; }
  function nomesPerg() { return (A.lista ? A.lista.f : []).filter(function (f) { return f !== CFG; }); }
  function carregaLista(forca) {
    if (A.carrega || (A.lista && !forca)) return;
    A.carrega = true;
    sdLista(function (j) {
      A.carrega = false;
      A.lista = j ? { ok: 1, f: j.f || [], z: j.z || [] } : { ok: 0, f: [], z: [] };
      rep();
    });
  }
  function gravaArq(nome, txt, cb) {
    A.busy = "Salvando...";
    sdGravar(nome, txt, function (i, n) { A.busy = "Salvando " + (i + 1) + "/" + n; EX.paint(); }, function (ok) {
      A.busy = "";
      if (EX.sdReset) EX.sdReset();
      cb(ok);
    });
  }

  // ------------------------------- pecas de tela -------------------------------
  function campo(valor, ph, max, fn) {
    var i = h("input"); i.value = valor || ""; i.placeholder = ph || ""; i.dataset.keep = 1;
    if (max) i.maxLength = max;
    i.oninput = function () { fn(i.value); };
    return i;
  }
  function area(valor, rows, ph, fn, ro) {
    var t = h("textarea"); t.value = valor || ""; t.rows = rows || 4; t.placeholder = ph || ""; t.dataset.keep = 1;
    if (ro) { t.readOnly = true; t.onclick = function () { t.select(); }; }
    else t.oninput = function () { fn(t.value); };
    return t;
  }
  function seletor(opcoes, atual, fn) { // opcoes: [[valor, texto]]
    var s = h("select");
    opcoes.forEach(function (o) { var op = h("option", o[1]); op.value = o[0]; if (String(o[0]) === String(atual)) op.selected = true; s.appendChild(op); });
    s.onchange = function () { fn(s.value); };
    return s;
  }
  function copiar(texto, ok) {
    if (AND && AND.copy) { try { AND.copy(texto); ok(true); return; } catch (e) {} }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(texto).then(function () { ok(true); }, function () { ok(false); }); return; }
    } catch (e) {}
    var t = h("textarea"); t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.focus(); t.select();
    var r = false; try { r = document.execCommand("copy"); } catch (e) {}
    t.remove(); ok(r);
  }

  // ------------------------------- aba -------------------------------
  function topo(ov) {
    ov.appendChild(h("h2", "Perguntas do Quiz"));
    [["arq", "📁 Arquivos"], ["ia", "🤖 IA e importar"], ["cfg", "⚙ Padrão do quiz"]].forEach(function (x) {
      ov.appendChild(btn(x[1], function () { A.view = x[0]; A.err = A.msg = ""; rep(); }, (A.view === x[0] || (A.view === "edit" && x[0] === "arq")) ? "on" : ""));
    });
    if (AND) ov.appendChild(h("p", "Você está no app Arcade M5.", "exinfo"));
    if (A.busy) ov.appendChild(h("p", A.busy, "exinfo"));
    if (A.msg) ov.appendChild(h("p", A.msg, "exgood"));
    if (A.err) ov.appendChild(h("p", A.err, "exred"));
  }

  function vArq(ov) {
    carregaLista();
    ov.appendChild(h("h3", "Arquivos no cartão SD"));
    if (!A.lista) { ov.appendChild(h("p", "Lendo o cartão SD...", "exinfo")); return; }
    if (!A.lista.ok) {
      ov.appendChild(h("p", "Não consegui falar com o cartão SD do Cardputer. Confira se o cartão está colocado (FAT32) e se este celular está na rede do Cardputer.", "exred"));
      ov.appendChild(btn("↻ Tentar de novo", function () { A.lista = null; rep(); }));
      return;
    }
    var nomes = nomesPerg().sort();
    if (!nomes.length) ov.appendChild(h("p", "Nenhum arquivo questoes*.txt ainda. Crie um abaixo ou importe da IA.", "exinfo"));
    nomes.forEach(function (f) {
      var r = h("div", null, "exrow");
      r.appendChild(h("span", nomeBonito(f) + "  (" + tam(f) + " bytes)"));
      r.appendChild(btn("Editar", function () { abreEd(f); }));
      r.appendChild(btn("Apagar", function () {
        if (!confirm("Apagar " + f + " do cartão?")) return;
        A.busy = "Apagando...";
        rep();
        sdApagar(f, function (ok) { A.busy = ""; if (ok) { A.msg = "Apagado: " + f; if (EX.sdReset) EX.sdReset(); } else A.err = "Não consegui apagar."; A.lista = null; rep(); });
      }));
      ov.appendChild(r);
    });
    ov.appendChild(h("h3", "Novo arquivo"));
    ov.appendChild(campo(A.novo, "Nome da área (ex.: Matemática 2)", 40, function (v) { A.novo = v; }));
    ov.appendChild(btn("➕ Criar e editar", function () {
      var n = nomeArq(A.novo);
      if (!n) { A.err = "Escreva um nome para o arquivo."; rep(); return; }
      if (nomes.indexOf(n) >= 0) { abreEd(n); return; }
      A.ed = { file: n, tema: limpaTxt(A.novo).slice(0, 30), qs: [], sel: -1, f: formVazio(), dirty: true, ign: 0 };
      A.view = "edit"; A.err = A.msg = ""; rep();
    }));
    ov.appendChild(btn("↻ Reler o cartão", function () { A.lista = null; if (EX.sdReset) EX.sdReset(); rep(); }));
    ov.appendChild(h("p", "Dica: o Quiz lê os arquivos em ordem alfabética. Para controlar a ordem, use nomes como questoes_01_matematica.txt, questoes_02_ciencias.txt.", "exinfo"));
  }

  function formVazio() { return { q: "", o: ["", "", "", ""], a: 0 }; }
  function abreEd(f) {
    if (tam(f) > 16000) { A.err = "Este arquivo passa de 16000 bytes; o jogo só lê o começo dele. Edite no computador ou divida em dois."; rep(); return; }
    A.busy = "Lendo " + f + "..."; A.err = A.msg = ""; rep();
    sdLer(f, function (t) {
      A.busy = "";
      if (t == null) { A.err = "Não consegui ler o arquivo."; rep(); return; }
      var p = parseTxt(t);
      A.ed = { file: f, tema: p.tema || nomeBonito(f), qs: p.qs, sel: -1, f: formVazio(), dirty: false, ign: p.ign };
      A.view = "edit"; rep();
    });
  }

  function vEdit(ov) {
    var E = A.ed;
    if (!E) { A.view = "arq"; return vArq(ov); }
    ov.appendChild(btn("← Arquivos", function () {
      if (E.dirty && !confirm("Há mudanças que ainda não foram salvas no cartão. Sair assim mesmo?")) return;
      A.ed = null; A.view = "arq"; A.lista = null; rep();
    }));
    ov.appendChild(h("h3", "Editando " + E.file));
    ov.appendChild(h("p", "Nome da área (aparece no jogo):", "exinfo"));
    ov.appendChild(campo(E.tema, "Nome da área", 30, function (v) { E.tema = v; E.dirty = true; }));
    var tamTxt = bytes(ser(E.tema, E.qs));
    ov.appendChild(h("p", E.qs.length + " perguntas, " + tamTxt + " de " + LIM + " bytes" + (E.ign ? " (" + E.ign + " incompletas foram ignoradas)" : ""), tamTxt > LIM ? "exred" : "exinfo"));
    if (tamTxt > LIM) ov.appendChild(h("p", "Passou do limite: apague algumas perguntas ou use outro arquivo.", "exred"));
    E.qs.forEach(function (q, i) {
      var r = h("div", null, "exrow");
      r.appendChild(h("span", (i + 1) + ". " + q.q + "  → " + "ABCD".charAt(q.a) + ") " + q.o[q.a]));
      r.appendChild(btn("↑", function () { if (i > 0) { E.qs.splice(i - 1, 0, E.qs.splice(i, 1)[0]); E.dirty = true; rep(); } }));
      r.appendChild(btn("↓", function () { if (i < E.qs.length - 1) { E.qs.splice(i + 1, 0, E.qs.splice(i, 1)[0]); E.dirty = true; rep(); } }));
      r.appendChild(btn("Editar", function () { E.sel = i; E.f = { q: q.q, o: q.o.slice(), a: q.a }; rep(); }));
      r.appendChild(btn("Apagar", function () { E.qs.splice(i, 1); E.sel = -1; E.dirty = true; rep(); }));
      ov.appendChild(r);
    });
    ov.appendChild(h("h3", E.sel >= 0 ? "Alterar a pergunta " + (E.sel + 1) : "Adicionar pergunta"));
    var F = E.f;
    ov.appendChild(campo(F.q, "Pergunta", 160, function (v) { F.q = v; }));
    for (var k = 0; k < 4; k++) (function (k) {
      ov.appendChild(campo(F.o[k], "Alternativa " + "ABCD".charAt(k), 60, function (v) { F.o[k] = v; }));
    })(k);
    var r2 = h("div"); r2.appendChild(h("span", "Resposta certa: "));
    r2.appendChild(seletor([[0, "A"], [1, "B"], [2, "C"], [3, "D"]], F.a, function (v) { F.a = Number(v); }));
    ov.appendChild(r2);
    ov.appendChild(btn(E.sel >= 0 ? "✔ Guardar alteração" : "➕ Adicionar", function () {
      var nq = { q: limpaTxt(F.q), o: F.o.map(limpaTxt), a: F.a };
      if (!nq.q || nq.o.some(function (x) { return !x; })) { A.err = "Preencha a pergunta e as 4 alternativas."; rep(); return; }
      A.err = "";
      if (E.sel >= 0) E.qs[E.sel] = nq; else E.qs.push(nq);
      E.sel = -1; E.f = formVazio(); E.dirty = true; rep();
    }, "pri"));
    if (E.sel >= 0) ov.appendChild(btn("Cancelar alteração", function () { E.sel = -1; E.f = formVazio(); rep(); }));
    ov.appendChild(h("h3", "Cartão SD"));
    ov.appendChild(btn("💾 Salvar no cartão", function () {
      var txt = ser(E.tema, E.qs);
      if (bytes(txt) > LIM) { A.err = "Passou de " + LIM + " bytes. Apague perguntas ou use outro arquivo."; rep(); return; }
      A.err = A.msg = "";
      gravaArq(E.file, txt, function (ok) {
        if (ok) { E.dirty = false; A.msg = "Salvo no cartão: " + E.qs.length + " perguntas."; } else A.err = "Não consegui gravar no cartão. Confira se ele está colocado e tente de novo.";
        A.lista = null; rep();
      });
    }, E.dirty ? "pri" : ""));
  }

  // ------------------------------- IA e importar -------------------------------
  function mostraPrev(I, texto) {
    var p = parseTxt(texto);
    I.prev = p; I.sel = p.qs.map(function () { return true; });
    A.err = A.msg = "";
    if (!p.qs.length) A.err = "Não achei nenhuma pergunta nesse texto. Peça de novo à IA usando o prompt acima (o formato precisa ter Q:, A:, B:, C:, D: e Answer:).";
  }
  function vIa(ov) {
    carregaLista();
    var I = A.ia, nomes = nomesPerg().sort();
    ov.appendChild(h("h3", "1) Peça as perguntas a uma IA (sem API, sem chave)"));
    ov.appendChild(h("p", AND
      ? "Preencha, toque num botão de IA, mande o prompt lá, copie a resposta e volte para este app: ela aparece sozinha no passo 2."
      : "Preencha, copie o prompt, cole numa IA (Gemini, ChatGPT, Claude...), copie a resposta dela e cole no passo 2. Obs.: sem o app, o celular precisa de internet para a IA; com o app Arcade M5 não precisa trocar de rede.", "exinfo"));
    var pta = area("", 6, "", null, true); // o prompt acompanha o que voce digita
    var atual = function () { return criaPrompt(I, I.evitar); };
    ov.appendChild(campo(I.area, "Assunto (ex.: Matemática, Brasil, Futebol)", 40, function (v) { I.area = v; guardaIa(); pta.value = atual(); }));
    var r1 = h("div"); r1.appendChild(h("span", "Quantas: "));
    r1.appendChild(seletor([[5, "5"], [10, "10"], [20, "20"], [30, "30"], [40, "40"]], I.qtd, function (v) { I.qtd = Number(v); guardaIa(); rep(); }));
    r1.appendChild(h("span", "  Nível: "));
    r1.appendChild(seletor([["fácil", "Fácil"], ["médio", "Médio"], ["difícil", "Difícil"]], I.nivel, function (v) { I.nivel = v; guardaIa(); rep(); }));
    ov.appendChild(r1);
    if (nomes.length) {
      var r2 = h("div"); r2.appendChild(h("span", "Não repetir as de: "));
      r2.appendChild(seletor([["", "(nenhum)"]].concat(nomes.map(function (f) { return [f, nomeBonito(f)]; })), I.evitarArq, function (v) {
        I.evitarArq = v; I.evitar = [];
        if (!v) { rep(); return; }
        sdLer(v, function (t) { I.evitar = t ? parseTxt(t).qs.map(function (q) { return q.q; }).slice(0, 40) : []; rep(); });
      }));
      ov.appendChild(r2);
    }
    pta.value = atual();
    ov.appendChild(pta);
    ov.appendChild(btn("📋 Copiar prompt", function () { copiar(atual(), function (ok) { A.msg = ok ? "Prompt copiado." : ""; A.err = ok ? "" : "Não consegui copiar: toque no texto, selecione tudo e copie."; rep(); }); }, "pri"));
    if (AND) {
      [["gemini", "Gemini"], ["chatgpt", "ChatGPT"], ["claude", "Claude"], ["outro", "Outro app..."]].forEach(function (x) {
        ov.appendChild(btn("Abrir " + x[1], function () {
          var ok = false; try { ok = AND.openAi(x[0], atual()); } catch (e) {}
          A.msg = ok ? "Prompt copiado e enviado. Mande lá, copie a resposta e volte." : ""; A.err = ok ? "" : "Não consegui abrir " + x[1] + ". O prompt foi copiado: abra o app e cole.";
          rep();
        }));
      });
    } else {
      [["https://gemini.google.com/app", "Gemini"], ["https://chatgpt.com/", "ChatGPT"], ["https://claude.ai/new", "Claude"]].forEach(function (x) {
        var a = h("a", "Abrir " + x[1], "exa"); a.href = x[0]; a.target = "_blank"; a.rel = "noopener";
        a.onclick = function () { copiar(atual(), function () {}); };
        ov.appendChild(a);
      });
    }

    ov.appendChild(h("h3", "2) Cole aqui a resposta da IA (ou qualquer lista de perguntas)"));
    ov.appendChild(area(I.resp, 7, "Cole aqui o texto que a IA respondeu...", function (v) { I.resp = v; guardaIa(); }));
    ov.appendChild(btn("📥 Colar do que copiei", function () {
      var pegou = function (t) {
        if (!t) { A.err = "Não há texto copiado."; rep(); return; }
        I.resp = t; I.ultimo = t; guardaIa(); mostraPrev(I, t); rep();
      };
      if (AND && AND.paste) { try { pegou(AND.paste()); return; } catch (e) {} }
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(pegou, function () { A.err = "O navegador não deixou ler o que você copiou. Toque no campo e use Colar."; rep(); });
      else { A.err = "Toque no campo acima e use Colar."; rep(); }
    }));
    ov.appendChild(btn("🔍 Ler as perguntas", function () { mostraPrev(I, I.resp); rep(); }, "pri"));

    if (I.prev && I.prev.qs.length) {
      var n = I.sel.filter(Boolean).length;
      ov.appendChild(h("h3", "3) Confira (" + I.prev.qs.length + " lidas" + (I.prev.ign ? ", " + I.prev.ign + " incompletas ignoradas" : "") + ")"));
      I.prev.qs.forEach(function (q, i) {
        var r = h("div", null, "exrow");
        r.appendChild(btn(I.sel[i] ? "☑" : "☐", function () { I.sel[i] = !I.sel[i]; rep(); }, I.sel[i] ? "on" : ""));
        r.appendChild(h("span", q.q + "  → " + "ABCD".charAt(q.a) + ") " + q.o[q.a]));
        ov.appendChild(r);
      });
      ov.appendChild(h("h3", "4) Onde guardar"));
      if (!I.dest) I.dest = nomes[0] || "__novo";
      var op = nomes.map(function (f) { return [f, "Adicionar em: " + nomeBonito(f)]; }); op.push(["__novo", "➕ Criar arquivo novo"]);
      ov.appendChild(seletor(op, I.dest, function (v) { I.dest = v; guardaIa(); rep(); }));
      if (I.dest === "__novo") ov.appendChild(campo(I.novo || I.prev.tema || I.area, "Nome do arquivo novo (ex.: Matemática)", 40, function (v) { I.novo = v; guardaIa(); }));
      ov.appendChild(btn("💾 Salvar " + n + " perguntas no cartão", function () { salvaIa(); }, "pri"));
    }
  }
  function salvaIa() {
    var I = A.ia, novas = I.prev.qs.filter(function (q, i) { return I.sel[i]; });
    if (!novas.length) { A.err = "Nenhuma pergunta marcada."; rep(); return; }
    var nome = I.dest === "__novo" ? nomeArq(I.novo || I.prev.tema || I.area) : I.dest;
    if (!nome) { A.err = "Dê um nome ao arquivo novo."; rep(); return; }
    A.err = A.msg = "";
    function seguir(tema, antigas) {
      var vistos = {}, todas = [];
      antigas.concat(novas).forEach(function (q) { var k = q.q.toLowerCase(); if (!vistos[k]) { vistos[k] = 1; todas.push(q); } });
      var partes = partir(tema, todas), usados = A.lista ? A.lista.f.slice() : [], nomes = [nome];
      for (var i = 1; i < partes.length; i++) nomes.push(proximoNome(nome, usados.concat(nomes)));
      (function grava(i) {
        if (i >= partes.length) {
          A.msg = "Salvo: " + todas.length + " perguntas em " + nomes.join(", ") + ".";
          I.prev = null; I.sel = []; I.resp = ""; guardaIa(); A.lista = null; rep(); return;
        }
        gravaArq(nomes[i], partes[i], function (ok) {
          if (!ok) { A.err = "Não consegui gravar " + nomes[i] + " no cartão."; A.lista = null; rep(); return; }
          grava(i + 1);
        });
      })(0);
    }
    var existe = A.lista && A.lista.f.indexOf(nome) >= 0;
    if (!existe) { seguir(I.prev.tema || limpaTxt(I.novo || I.area) || nomeBonito(nome), []); return; }
    if (tam(nome) > 16000) { A.err = "Esse arquivo é maior que 16000 bytes; escolha outro ou crie um novo."; rep(); return; }
    A.busy = "Lendo " + nome + "..."; rep();
    sdLer(nome, function (t) {
      A.busy = "";
      if (t == null) { A.err = "Não consegui ler " + nome + "."; rep(); return; }
      var p = parseTxt(t);
      seguir(p.tema || nomeBonito(nome), p.qs);
    });
  }

  // ------------------------------- padrao do quiz -------------------------------
  function vCfg(ov) {
    carregaLista();
    ov.appendChild(h("h3", "Padrão do Quiz do Cartão SD"));
    ov.appendChild(h("p", "É o ponto de partida de toda mesa nova do Quiz (dá para mudar na sala). Fica guardado no cartão.", "exinfo"));
    if (!A.lista) { ov.appendChild(h("p", "Lendo o cartão SD...", "exinfo")); return; }
    if (!A.lista.ok) { ov.appendChild(h("p", "Cartão SD não encontrado.", "exred")); return; }
    if (!A.cfg) {
      if (!A.cfgCarrega) {
        A.cfgCarrega = true;
        sdLer(CFG, function (t) {
          var c = lerCfg(t);
          A.cfg = { ordem: /^(eq|al|seq)$/.test(c.ordem) ? c.ordem : "eq", qtd: c.qtd !== undefined && c.qtd !== "" && !isNaN(c.qtd) ? Number(c.qtd) : 10, areas: c.areas ? c.areas.split(",").map(function (x) { return x.trim(); }).filter(Boolean) : [] };
          A.cfgCarrega = false; rep();
        });
      }
      ov.appendChild(h("p", "Lendo o padrão...", "exinfo")); return;
    }
    var C = A.cfg, nomes = nomesPerg().sort();
    ov.appendChild(h("h3", "De onde vêm as perguntas"));
    ov.appendChild(btn((C.areas.length ? "☐ " : "☑ ") + "🎲 Geral: todas as áreas", function () { C.areas = []; rep(); }, C.areas.length ? "" : "on"));
    nomes.forEach(function (f) {
      var on = C.areas.indexOf(f) >= 0;
      ov.appendChild(btn((on ? "☑ " : "☐ ") + nomeBonito(f), function () { if (on) C.areas.splice(C.areas.indexOf(f), 1); else C.areas.push(f); rep(); }, on ? "on" : ""));
    });
    ov.appendChild(h("h3", "Ordem"));
    [["eq", "Misturar as áreas (equilibrado)"], ["al", "Tudo aleatório"], ["seq", "Na ordem dos arquivos"]].forEach(function (x) {
      ov.appendChild(btn(x[1], function () { C.ordem = x[0]; rep(); }, C.ordem === x[0] ? "on" : ""));
    });
    ov.appendChild(h("h3", "Quantidade de perguntas"));
    [[5, "5"], [10, "10"], [20, "20"], [30, "30"], [50, "50"], [100, "100"], [0, "Todas"]].forEach(function (x) {
      ov.appendChild(btn(x[1], function () { C.qtd = x[0]; rep(); }, C.qtd === x[0] ? "on" : ""));
    });
    ov.appendChild(h("p", ""));
    ov.appendChild(btn("💾 Salvar padrão no cartão", function () {
      A.err = A.msg = "";
      gravaArq(CFG, "ordem=" + C.ordem + "\nqtd=" + C.qtd + "\nareas=" + C.areas.join(",") + "\n", function (ok) {
        if (ok) A.msg = "Padrão salvo."; else A.err = "Não consegui gravar no cartão.";
        A.lista = null; rep();
      });
    }, "pri"));
  }

  document.head.appendChild(h("style",
    "#exov textarea{display:block;width:100%;box-sizing:border-box;background:#202024;color:#F2F2EE;border:2px solid #34343a;border-radius:8px;padding:10px;margin:6px 0;font:13px monospace;-webkit-user-select:text;user-select:text}" +
    "#exov textarea:focus{outline:none;border-color:#FF8200}" +
    "#exov a.exa{display:inline-block;text-decoration:none;background:#202024;color:#F2F2EE;border:2px solid #34343a;border-radius:8px;padding:11px 13px;margin:3px 4px 3px 0;font:700 14px monospace}"));

  EX.tabs.push({
    id: "perg", label: "Perguntas", admin: true,
    paint: function (ov) {
      topo(ov);
      if (A.view === "edit") vEdit(ov);
      else if (A.view === "ia") vIa(ov);
      else if (A.view === "cfg") vCfg(ov);
      else vArq(ov);
    }
  });

  // O app Android chama isto quando volta para a tela (ex.: depois de copiar a resposta da IA).
  window.arcadeResume = function () {
    try {
      if (!AND || !AND.paste || A.view !== "ia") return;
      var t = AND.paste(), I = A.ia;
      if (!t || t === I.ultimo || t === I.resp) return;
      var p = parseTxt(t);
      if (!p.qs.length) return;
      I.ultimo = t; I.resp = t; guardaIa(); mostraPrev(I, t);
      A.msg = "Achei " + p.qs.length + " perguntas no que você copiou.";
      EX.paint();
    } catch (e) {}
  };
})();
