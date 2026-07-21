# Informativo DC

Visualizador dos informativos diários da Diretoria Comercial da CAEMA,
apresentados no visual de um celular com WhatsApp.

Site estático. Não calcula nada e não acessa banco: consome
`dados/mensagens.json`, publicado pelas automações do n8n.

## Endereço

Produção: **https://informativo-dc.sistemaspsdev.com.br**

O domínio `*.vercel.app` gerado automaticamente continua respondendo, mas o
endereço acima é o oficial — é o que vai nos alertas e o que precisa constar
como origem autorizada no OAuth.

## Estado atual

Os dados no repositório são **de demonstração** — números fictícios, marcados
na tela por uma faixa. Os informativos reais passam a ser publicados quando a
autenticação estiver ativa (ver Roteiro).

> **Nunca commite dado real neste repositório.** O `.gitignore` bloqueia
> `dados/*.local.json`, mas a regra vale para qualquer arquivo.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Moldura do aparelho, lista de conversas e thread |
| `estilo.css` | Visual do WhatsApp, tema claro (tema único) |
| `app.js` | Carrega o JSON, renderiza a marcação do WhatsApp (`*negrito*`) |
| `dados/mensagens.json` | Conteúdo exibido — o que o n8n atualiza |
| `gerar.js` | Ferramenta de dev; gera o JSON a partir dos workflows |
| `login.html` | Tela de entrada, identidade visual do Portal CAEMA |
| `auth.css` / `auth.js` | Estilo e comportamento do login |

## Tela de login

Reproduz a identidade do portal (`portal/auth-local/public/`), mas com **Google
no lugar de e-mail e senha** — só o tema claro, coerente com o resto do app.

O login **ainda não funciona**: depende de uma credencial OAuth que não existe
(o `portal/auth/` do repositório interno tem apenas o preparo, nunca ativado).
Por isso `auth.js` consulta `/api/auth/status` e, enquanto a rota não responder
`{ "configurado": true }`, mantém o botão desabilitado com o aviso na tela, em
vez de mandar o usuário para uma rota inexistente.

Quando a Fase 1 subir, a mesma tela passa a funcionar sem alteração.

O botão do Google usa fundo branco e borda cinza porque as diretrizes de marca
do Google exigem — não trocar pelo azul da CAEMA.

Deep link por indicador: `#arrecadacao`, `#faturamento`, `#cortes`, `#ordens`.

## Contrato dos dados

```json
{
  "exemplo": false,
  "atualizado_em": "2026-07-20T21:00:00-03:00",
  "contatos": [
    {
      "id": "cortes",
      "nome": "Cortes",
      "inicial": "CO",
      "horarios": "21h",
      "gerado_em": "2026-07-20T21:01:00-03:00",
      "mensagem": "✂️ *ACOMPANHAMENTO DE CORTES...*"
    }
  ]
}
```

`exemplo: true` liga a faixa de demonstração. `mensagem` usa a marcação do
WhatsApp e é exibida tal como chega.

## De onde vem a mensagem

O `gerar.js` **não reimplementa** a lógica dos alertas. Ele extrai o código dos
nós `Configurar alerta` e `Montar alerta` dos `.json` dos workflows e executa
esse mesmo código com um shim dos globais do n8n (`$()`, `$input`).

Isso é fiel porque, nos quatro workflows, o nó que grava o arquivo apenas
repassa `$input.first().json` — então o JSON em `csv/` é exatamente o objeto que
o nó de alerta consome. O texto exibido é o que o WhatsApp recebe.

Rodar (só na máquina de dev, onde `../portal` e `../csv` existem):

```powershell
node gerar.js     # escreve dados/mensagens.local.json (~9 KB, fora do git)
```

## Roteiro

- [x] **Fase 0** — visual do celular, tema claro, sem painel de configuração
- [ ] **Fase 1** — login Google restrito a `@caema.ma.gov.br` + `POST /api/publicar`
- [ ] **Fase 2** — workflows-cópia no n8n publicando (sem enviar WhatsApp)
- [ ] **Fase 3** — imagem estática + link substituindo o texto no alerta

### Notas de implementação das próximas fases

**Credencial OAuth — o que pedir ao admin do Google Workspace.** Cliente OAuth
2.0 do tipo *Aplicativo da Web*, num projeto da organização CAEMA, com a tela de
consentimento marcada como **Interna** (sendo interna, só contas do domínio
conseguem sequer autenticar — a restrição vem do Workspace, não do app):

| Campo | Valor |
|---|---|
| Origem JavaScript autorizada | `https://informativo-dc.sistemaspsdev.com.br` |
| URI de redirecionamento autorizada | `https://informativo-dc.sistemaspsdev.com.br/api/auth/callback/google` |

O Client Secret vai em variável de ambiente na Vercel — **nunca** neste
repositório, que é público.

**Autenticação.** Restringir por domínio exige validação **no servidor**:
`hd=caema.ma.gov.br` no pedido ao Google é só dica de interface e pode ser
contornado. Checar `email_verified === true` e o domínio do e-mail a cada sessão.

**Link vindo do WhatsApp.** O WhatsApp abre links num navegador embutido, e o
Google recusa OAuth em webview embutida (`disallowed_useragent`). Previsto uma
página-ponte que encaminha para o navegador do sistema — automática no Android
(`intent://…;package=com.android.chrome;end`), com instrução manual no iOS, onde
a Apple removeu o `x-safari-https://`. Convém testar antes: o resultado varia
por versão.

**Publicação.** `POST /api/publicar` com `Authorization: Bearer <token>`,
mesclando por `contato` num Blob. Payload de ~9 KB — o texto pronto, não a base
(`os_processada.json` sozinho tem 7 MB).

**Workflows.** Os workflows existentes não são alterados. Cada um ganha uma
cópia (`WF*-INFO`) que lê o JSON já gravado em `csv/` em vez de reconsultar o
GSAN — evita carga dupla e garante que os dois falem o mesmo número, dado que
execuções do GSAN em horários diferentes podem trazer totais diferentes.

## vercel.json

`/dados/` vai com `Cache-Control: no-store`. O JSON é reescrito a cada execução
do n8n; com o cache padrão do CDN, a tela continuaria mostrando o informativo do
dia anterior por horas — falha silenciosa, sem erro nenhum aparente.

O schema da Vercel rejeita propriedades extras nas regras de `headers`, então
não dá para deixar comentários (`"//"`) dentro do arquivo.

## Rodar local

```powershell
npx http-server . -p 3210     # http://localhost:3210
```

Abrir o `index.html` direto pelo disco não funciona: o `fetch` do JSON é
bloqueado pelo `file://`.
