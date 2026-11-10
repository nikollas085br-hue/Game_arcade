# Arcade M5 — jogos em grupo no M5Stack Cardputer (ADV)

O Cardputer vira um "roteador de jogos": ele cria uma rede Wi-Fi com senha, os
celulares/tablets conectam e jogam no navegador (xadrez, jogo da velha, quatro em
linha, batalha naval, trivia, desenho e mais). A tela do Cardputer mostra o placar.

Baseado em [hotspot-arcade-cardputer](https://github.com/genkigenki/hotspot-arcade-cardputer)
(MIT), que por sua vez usa o motor de jogos de [tarikbc/hotspot-arcade](https://github.com/tarikbc/hotspot-arcade) (MIT).

## O que mudou em relação ao original

- **Rede normal com senha (WPA2).** Nome e senha são editados no próprio Cardputer.
- **Sem popup de login.** Antes o jogo só abria dentro da janelinha de "entrar na rede"
  (que alguns tablets não abrem). Agora você conecta no Wi-Fi como em qualquer rede e
  digita o endereço no navegador.
- **Tudo em português** (aparelho e site). Inglês e alemão continuam disponíveis em Configurações.
- **Poucos arquivos:** só 2 pastas (`jogos` e `.github`). Cada jogo tem 1 arquivo em `jogos/`.

## Como usar

1. Ligue o Cardputer com o firmware. A tela mostra o **nome da rede**, a **senha** e o endereço.
2. No celular/tablet: conecte no Wi-Fi (padrão: **Arcade-M5** / senha **jogar1234**).
3. Abra o navegador e digite **http://192.168.4.1** (com `http://`, não `https`).
4. Escolha um apelido e um avatar. Para jogar xadrez: no Cardputer aperte **G** e escolha
   **Xadrez**; um jogador desafia o outro na tela do celular.

Dicas:
- Se o Android perguntar "essa rede não tem internet, continuar conectado?", escolha **manter**.
- Se a página não abrir, desligue os **dados móveis** do celular e tente de novo.
- Até 10 aparelhos ao mesmo tempo (limite do chip).

## Teclas do Cardputer

| Tecla | Função |
| --- | --- |
| `G` | escolher o jogo (setas `;` `.` movem, `Enter` escolhe, `Esc` volta) |
| `L` | placar completo (dentro dele, `R` zera) |
| `S` | configurações |
| `E` | encerrar a rodada |
| `Esc` | voltar |

**Configurações (`S`)**: *Nome* da rede, *Senha*, Som, Idioma, Wi-Fi ligado/desligado, Eventos.
Use `;` `.` para subir/descer, `Enter` para editar, `,` `/` para mudar valores.
A senha precisa ter de 8 a 63 letras; vazia = rede aberta. Mudar nome ou senha reinicia a rede.

As configurações ficam salvas na placa e também no cartão SD, em `/hotspot-arcade/config.txt`
(texto simples, dá para editar no computador: linhas `ssid=`, `pass=`, `audio=`, `lang=`).

## Como colocar no GitHub e gerar o .bin

1. Crie um repositório novo no GitHub.
2. **Add file → Upload files** e arraste **todos** os arquivos e as pastas `jogos` e `.github`
   (no Mac/Linux a pasta `.github` fica oculta; se não aparecer, use o plano B abaixo).
3. **Commit changes.** Abra a aba **Actions**: o "Compilar firmware" roda sozinho (uns 5–10 min).
4. Quando ficar verde, clique nele e baixe **arcade-m5** em *Artifacts*:
   - `arcade-m5-app.bin` — para o M5Launcher/cartão SD (mantém o Launcher).
   - `arcade-m5-completo.bin` — imagem completa, gravar no endereço `0x0` com esptool (substitui tudo).

**Plano B para o `.github`:** em *Add file → Create new file*, digite o nome
`.github/workflows/build.yml` e cole o conteúdo do arquivo `build.yml` deste projeto.

Se o build der erro, abra o passo vermelho, copie as últimas linhas e me mande.
Erros em `jogos/` aparecem em português e dizem arquivo e linha.

## Pasta `jogos/` — conteúdo dos jogos

Cada arquivo guarda os *packs* (conjuntos de perguntas, palavras, etc.) de **um** jogo:
`trivia.txt`, `wyr.txt` (Você Prefere), `scramble.txt`, `draw.txt`, `spectrum.txt`,
`kmk.txt`, `secrets.txt`, `fillblank.txt`, `spyfall.txt`.

Um pack novo começa com `=== idioma nome` (idioma: `pt-br`, `en` ou `de`). Exemplo, no fim de `jogos/trivia.txt`:

```
=== pt-br filmes
Pack: Filmes
Q: Qual filme tem um boneco de neve chamado Olaf?
A: Moana
B: Frozen
C: Encanto
D: Shrek
Answer: B
---
Q: Próxima pergunta...
```

Formato de cada jogo (copie um pack que já existe e troque o texto):

| Arquivo | Cada item |
| --- | --- |
| trivia | `Q:` `A:` `B:` `C:` `D:` `Answer:` (letra certa), itens separados por `---` |
| wyr | `A:` e `B:` |
| scramble, draw | `Word:` |
| kmk | `Name:` |
| spectrum | `Left:` e `Right:` |
| secrets | `Q:` |
| fillblank | `P:` (frase com `_____`) e `A:` (respostas) |
| spyfall | `Loc:` (lugar) seguido de várias linhas `R:` (papéis) |

Limites do motor: até 6 packs por jogo em cada idioma, 15 perguntas por pack de trivia.
Palavras de `scramble` e `draw` ficam melhores **sem acento** (o jogador digita no celular).

## O site

`index.html` é a página que abre no celular (já em português por padrão). Os textos ficam
no bloco `"pt-br": { ... }` dentro dele. Para criar um **jogo totalmente novo** (regras
novas, não só perguntas) é preciso programar o juiz do jogo em `ha_games.h` (C++) e a tela
em `index.html` (JavaScript) — o xadrez, por exemplo, já está pronto lá dentro.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `hotspot-arcade-cardputer.ino` | rede Wi-Fi, servidor web, ligação com o motor |
| `ha_ui.h` | telas e teclado do Cardputer (tabela de textos em português no começo) |
| `ha_host.h`, `ha_history.h`, `ha_content.h` | placar, histórico no SD, leitura dos packs |
| `ha_games.h`, `ha_json.h`, `ha_proto.h` | motor dos jogos (do projeto original) |
| `index.html` | site dos jogos |
| `jogos/*.txt` | conteúdo dos jogos |
| `gerar-assets.mjs` | usado pelo GitHub para embutir site e jogos no firmware |

## Avisos

- O original foi testado no Cardputer v1. No **ADV** (teclado e antena diferentes) deve
  funcionar, mas ainda não foi verificado. Se algo falhar, me diga o que apareceu na tela.
- Use só onde for permitido operar uma rede Wi-Fi própria.
- Licença MIT (arquivo `LICENSE`).
