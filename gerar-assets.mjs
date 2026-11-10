#!/usr/bin/env node
// Prepara o firmware para compilar (o GitHub Actions roda isto sozinho; voce nao precisa).
//
//   node gerar-assets.mjs
//
// 1. Le o site        (index.html)
// 2. Le os jogos      (jogos/*.txt, um arquivo por jogo)
// 3. Cria a pasta     hotspot-arcade-cardputer/ com o .ino, todos os .h e o ha_bundle.h
//                     (o arduino-cli exige que o .ino fique numa pasta com o mesmo nome).
//
// FORMATO DOS ARQUIVOS DE jogos/
//   Cada arquivo guarda os "packs" (conjuntos de perguntas/palavras) de UM jogo.
//   Um pack novo comeca com uma linha:   === idioma nome
//       idioma = pt-br, en ou de
//       nome   = qualquer nome curto (so identifica o pack)
//   Tudo abaixo dessa linha, ate a proxima linha "===", e o conteudo do pack.
//   Linhas antes do primeiro "===" sao comentarios e sao ignoradas.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const sketch = join(root, 'hotspot-arcade-cardputer');

const fail = (msg) => {
  console.error('\nERRO: ' + msg + '\n');
  process.exit(1);
};

// ---- jogos: arquivo -> constante do engine -----------------------------------
// Para criar um jogo NOVO com packs, ele precisa existir no engine (ha_games.h).
// Pack novo de jogo que ja existe: e so acrescentar uma secao "===" no arquivo dele.
const GAMES = {
  trivia: 'HA_GAME_TRIVIA',
  wyr: 'HA_GAME_WYR',
  scramble: 'HA_GAME_SCRAMBLE',
  draw: 'HA_GAME_DRAW',
  spectrum: 'HA_GAME_SPECTRUM',
  kmk: 'HA_GAME_KMK',
  secrets: 'HA_GAME_SECRETS',
  fillblank: 'HA_GAME_FILLBLANK',
  spyfall: 'HA_GAME_SPYFALL',
};
const LANGS = ['en', 'de', 'pt-br'];
const MAX_PER_GAME = 6; // limite do engine: 6 packs por jogo, por idioma
const TRIVIA_MAX_QS = 15; // limite do engine: 15 perguntas por pack de trivia

// ---- 1. site ------------------------------------------------------------------
if (!existsSync(join(root, 'index.html'))) fail('index.html nao encontrado na raiz do projeto.');
const webBytes = gzipSync(readFileSync(join(root, 'index.html')), { level: 9 });

// ---- 2. jogos -----------------------------------------------------------------
const jogosDir = join(root, 'jogos');
if (!existsSync(jogosDir)) fail('a pasta "jogos" nao existe.');
const packs = [];
const warnings = [];

for (const file of readdirSync(jogosDir).sort()) {
  if (!file.toLowerCase().endsWith('.txt')) continue;
  const game = file.slice(0, -4).toLowerCase();
  if (!GAMES[game]) {
    fail(
      `jogos/${file}: nao conheco o jogo "${game}".\n` +
        `Nomes de arquivo validos: ${Object.keys(GAMES).join(', ')}.\n` +
        `(Um jogo totalmente novo precisa ser programado em ha_games.h e index.html primeiro.)`,
    );
  }
  const lines = readFileSync(join(jogosDir, file), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let cur = null;
  lines.forEach((line, i) => {
    const m = /^===\s*(\S+)\s+(\S.*?)\s*$/.exec(line);
    if (m) {
      cur = { lang: m[1].toLowerCase(), name: m[2], start: i + 1, body: [] };
      sections.push(cur);
    } else if (/^===/.test(line)) {
      fail(`jogos/${file} linha ${i + 1}: use "=== idioma nome", por exemplo "=== pt-br animais".`);
    } else if (cur) {
      cur.body.push(line);
    }
  });
  if (!sections.length) warnings.push(`jogos/${file}: nenhum pack encontrado (falta a linha "=== idioma nome").`);

  const perLang = {};
  for (const s of sections) {
    if (!LANGS.includes(s.lang)) {
      fail(`jogos/${file} linha ${s.start}: idioma "${s.lang}" invalido. Use: ${LANGS.join(', ')}.`);
    }
    const text = s.body.join('\n').trim() + '\n';
    if (text.trim() === '') fail(`jogos/${file} linha ${s.start}: o pack "${s.name}" esta vazio.`);

    if (game === 'trivia') {
      const blocks = text.split(/^---\s*$/m).map((b) => b.trim()).filter(Boolean);
      let n = 0;
      for (const b of blocks) {
        const ls = b.split('\n').filter((l) => !/^Pack:/.test(l));
        if (!ls.length) continue;
        n++;
        for (const key of ['Q:', 'A:', 'B:', 'C:', 'D:', 'Answer:']) {
          if (!ls.some((l) => l.startsWith(key))) {
            fail(`jogos/${file}, pack "${s.name}": uma pergunta esta sem "${key}":\n${b}`);
          }
        }
        const ans = (ls.find((l) => l.startsWith('Answer:')) || '').slice(7).trim();
        if (!/^[ABCD]$/.test(ans)) fail(`jogos/${file}, pack "${s.name}": "Answer:" tem que ser A, B, C ou D (achei "${ans}"):\n${b}`);
      }
      if (n > TRIVIA_MAX_QS) {
        warnings.push(`jogos/${file}, pack "${s.name}": tem ${n} perguntas; so as ${TRIVIA_MAX_QS} primeiras funcionam.`);
      }
    }

    perLang[s.lang] = (perLang[s.lang] || 0) + 1;
    if (perLang[s.lang] > MAX_PER_GAME) {
      warnings.push(`jogos/${file}: o pack "${s.name}" (${s.lang}) ficou de fora: limite de ${MAX_PER_GAME} packs por idioma.`);
      continue;
    }
    packs.push({
      gameConst: GAMES[game],
      lang: s.lang,
      fallback: s.name.replace(/[^A-Za-z0-9_-]/g, '_'),
      text,
    });
  }
}

// Os packs vao comprimidos (deflate cru); o ESP32-S3 descomprime pela ROM.
for (const p of packs) {
  p.z = deflateRawSync(Buffer.from(p.text, 'utf8'), { level: 9 });
  p.raw = Buffer.byteLength(p.text, 'utf8');
}

const hex = (buf) => {
  const out = [];
  for (let i = 0; i < buf.length; i += 16) {
    out.push('    ' + [...buf.subarray(i, i + 16)].map((b) => '0x' + b.toString(16).padStart(2, '0')).join(','));
  }
  return out.join(',\n');
};

let h = `// GERADO por gerar-assets.mjs -- nao edite a mao (edite index.html e jogos/*.txt).
// site: ${webBytes.length} bytes (gzip). packs: ${packs.length}.
#pragma once
#include <Arduino.h>
#include "ha_proto.h"

static const uint8_t HA_WEB_0[] = {
${hex(webBytes)}};

struct HaBakedFile {
    const char* path;
    const char* mime;
    bool gzip;
    const uint8_t* data;
    size_t len;
};

static const HaBakedFile HA_BAKED_FILES[] = {
    {"/", "text/html", true, HA_WEB_0, sizeof(HA_WEB_0)},
};
static const size_t HA_BAKED_FILE_COUNT = sizeof(HA_BAKED_FILES) / sizeof(HA_BAKED_FILES[0]);

${packs.map((p, i) => `static const uint8_t HA_PK_${i}[] = {\n${hex(p.z)}};\n`).join('')}
struct HaBakedPack {
    uint8_t game;
    const char* lang;
    const char* fallback;
    const uint8_t* z;
    uint32_t zlen;
    uint32_t rawlen;
};

static const HaBakedPack HA_BAKED_PACKS[] = {
${packs.map((p, i) => `    {${p.gameConst}, "${p.lang}", "${p.fallback}", HA_PK_${i}, ${p.z.length}, ${p.raw}},`).join('\n')}
};
static const size_t HA_BAKED_PACK_COUNT = sizeof(HA_BAKED_PACKS) / sizeof(HA_BAKED_PACKS[0]);
`;

// ---- 3. pasta do sketch -------------------------------------------------------
rmSync(sketch, { recursive: true, force: true });
mkdirSync(sketch);
for (const f of readdirSync(root)) {
  if (f.endsWith('.ino') || f.endsWith('.h')) copyFileSync(join(root, f), join(sketch, f));
}
writeFileSync(join(sketch, 'ha_bundle.h'), h);

console.log(`site: ${webBytes.length} bytes | packs: ${packs.length} | pasta do sketch: hotspot-arcade-cardputer/`);
for (const w of warnings) console.log('AVISO: ' + w);
