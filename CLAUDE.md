# CLAUDE.md

Orientações para o Claude Code (claude.ai/code) neste repositório.

## O que é

Site que exibe os informativos diários da Diretoria Comercial da CAEMA num
celular simulado com visual do WhatsApp. Os grupos passaram a receber um aviso
curto com link; o relatório completo vive aqui.

- **Produção:** https://informativo-dc.sistemaspsdev.com.br (Vercel)
- **Repositório:** `pasimplicio/informativo-dc` — **público**
- **Local:** `d:\n8n-automation\informativodc`, dentro do repo `n8n-automation`
  mas com git próprio

⚠️ **O repositório é público.** Nunca commitar token, dado real de arrecadação
ou credencial. O `.gitignore` barra `dados/*.local.json`; o resto depende de
atenção.

## O site não calcula nada

Ele exibe a mensagem que o n8n já montou. A lógica de cálculo vive nos nós
`Montar alerta *` dos workflows, e é a **mesma** que produzia o texto enviado
aos grupos. Duplicar essa lógica aqui criaria duas versões que divergiriam no
primeiro ajuste — foi decisão explícita não fazer isso.

## Fluxo

```
n8n (WF*-INFO)
  ├─ consulta o GSAN, agrega, grava csv/*_processada.json   → alimenta o PORTAL
  ├─ "Montar alerta"  → o mesmo texto de sempre
  ├─ POST /api/publicar (Bearer INFORMATIVO_TOKEN)          → alimenta o SITE
  └─ sendText: aviso curto + link                           → grupos do WhatsApp
```

## Rotas

| Rota | Proteção | Função |
|---|---|---|
| `/` | pública | tela de entrada (login Google) |
| `/informativo` | sessão | o celular com as conversas |
| `/auditoria` | sessão **+** e-mail específico | registro de acessos |
| `POST /api/publicar` | `Bearer INFORMATIVO_TOKEN` | o n8n grava |
| `GET /api/mensagens` | sessão (middleware) | a tela lê |
| `GET /api/auditoria` | sessão **+** e-mail | eventos de acesso |
| `/api/auth/*` | — | status, início, callback e saída do OAuth |

`middleware.js` exige sessão nas rotas do matcher. A restrição da auditoria a
**uma** conta é conferida *também* dentro da rota: qualquer conta do domínio
passa pelo middleware, e depender de uma camada só deixaria o dado a um erro de
matcher de distância.

## Autenticação

Google OAuth restrito a `@caema.ma.gov.br`. Sessão em cookie assinado com
HMAC-SHA256 (`lib/sessao.js`), 8h, sem banco — quem administra identidade é o
Workspace.

Pontos que já causaram bug e não devem ser "simplificados":

- **Assinatura em Web Crypto, uma implementação só.** Roda no Node das rotas e
  no Edge do middleware. Duas implementações divergiriam, e divergência aí
  significa sessão aceita num lado e recusada no outro.
- **Tokens declaram `tipo`** (`sessao` ou `state`). Sem isso, `verificar()`
  aplicava a checagem de domínio ao `state` do OAuth — que não tem e-mail — e
  **recusava todo login válido**.
- **Domínio conferido no servidor**, nunca pelo parâmetro `hd` do Google, que é
  só dica de interface.

## Armazenamento

Vercel Blob **privado** (`access: 'private'`, SDK ≥ 2.x). Um arquivo por
contato, `informativos/<contato>.json`, com histórico de **7 dias** cortado por
data — não por contagem, senão uma reexecução no mesmo dia empurraria um dia
inteiro para fora.

`allowOverwrite: true` é obrigatório: sem ele a segunda publicação falha.
`cacheControlMaxAge` não aceita menos de 60.

## Workflows `-INFO` (no repositório `n8n-automation`)

Gerados por `node informativodc/gerar-wf-info.js <wf1|wf2|wf3|wf4>` a partir
dos originais em `portal/`. São **clones completos**: consultam o GSAN, gravam
os mesmos JSONs do portal e mantêm o mesmo horário. Só o final muda.

Em produção desde 22/07/2026, com os originais **desativados**:

| Ativo | Horário | Avisa em |
|---|---|---|
| `WF1InfoCaema` | 16h30 | 2 grupos oficiais |
| `WF2InfoCaema` | 20h | 2 grupos oficiais |
| `WF3InfoCaema` | 21h | 2 grupos oficiais |
| `WF4InfoCaema` | 21h | **só o número de teste** |

⚠️ **WF4 não vai aos grupos de propósito.** O original vivia com `ativo: false`
aguardando aprovação do texto; liberar estrearia esse envio. Está marcado com
`grupos: false` no gerador.

O nó de dados da cópia recebe o **mesmo nome** do original (ex.:
`📈 Calcular Métricas`), porque o código de `Montar alerta` faz
`$('📈 Calcular Métricas')` — assim ele é copiado sem uma linha de alteração.

Depois de gerar, o import exige `id` não nulo; um id estável faz reimportação
atualizar o mesmo workflow em vez de duplicar.

## Comandos

```powershell
# Publicar um informativo de teste (pede o token, oculto)
.\publicar-teste.ps1
.\publicar-teste.ps1 -Contato faturamento

# Apagar publicação (a tela volta ao exemplo)
.\limpar-teste.ps1
.\limpar-teste.ps1 -Todos

# Testes (sessão + controle de acesso da auditoria)
npm test

# Gerar e importar um workflow -INFO
node gerar-wf-info.js wf1
# (na raiz de n8n-automation)
docker compose exec n8n n8n import:workflow --input=/data/csv/WF1-INFO.json
docker compose restart n8n
```

O caminho `/data/csv/...` **quebra no Git Bash** (converte para caminho
Windows). Rodar pelo PowerShell.

## Variáveis na Vercel

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSAO_SEGREDO`,
`INFORMATIVO_TOKEN`, `BLOB_READ_WRITE_TOKEN`. Opcional: `AUDITORIA_EMAIL`
(padrão `assessoria.dc@caema.ma.gov.br`).

Variável nova só vale no build seguinte — **exige Redeploy**.

O código aceita qualquer variante `*BLOB_READ_WRITE_TOKEN`: a Vercel pode
prefixar o nome ao conectar o store, e o SDK só procura o nome padrão.

## Botões no WhatsApp não funcionam

Testado: a Evolution API (Baileys) aceita `sendButtons` e monta um
`interactiveMessage` válido, mas o celular **não recebe** e o WhatsApp Web
mostra "Não foi possível carregar a mensagem". Não insistir — ficou o link
puro, com cartão Open Graph próprio em `assets/og.png`.

A imagem do cartão é gerada por captura de uma página HTML, então é editável e
reproduzível. Usar a logo direto não serve: PNG com transparência renderiza com
fundo preto na pré-visualização.

## Ao mexer na interface

- Tema claro único, visual do WhatsApp **dentro** do celular; identidade CAEMA
  (azul) na moldura da página. Os tokens estão separados: `--marca`/`--pagina-*`
  para a página, `--acento`/`--wa-*` para a maquete.
- A moldura do celular é preservada em toda largura — ela é o formato do
  produto. Já foi removida no mobile uma vez e o resultado foi ruim.
- `body` precisa de `height` (não `min-height`): a porcentagem de altura do
  aparelho só resolve com altura definida na cadeia.
- Capturas em Chrome headless mentem sobre largura — o viewport não corresponde
  ao `--window-size`. Já gerou dois falsos positivos de "overflow". Medir com
  `scrollWidth`/`clientWidth` antes de "corrigir" layout.
