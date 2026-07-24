/**
 * Gera os workflows "-INFO": CLONES COMPLETOS dos originais, com o final
 * trocado.
 *
 * A copia faz tudo o que o original faz -- consulta o GSAN, agrega, calcula e
 * grava o JSON que alimenta o portal. Ela e candidata a SUBSTITUIR o original:
 * quando aprovada, desativa-se o original e o portal continua sendo alimentado
 * sem perda.
 *
 * Muda apenas o final:
 *   - o no que enviava o relatorio inteiro aos grupos e removido;
 *   - entra "Publicar no Informativo DC", que manda a MESMA mensagem para o
 *     site;
 *   - entra o envio de um aviso curto com o link, so para o numero de teste.
 *
 * Todo o resto -- nos, parametros, credenciais, horario do agendamento --
 * e copiado sem alteracao, para que trocar um pelo outro nao mude nada alem
 * do que esta descrito acima.
 *
 * Uso:  node informativodc/gerar-wf-info.js wf1
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirPortal = path.join(path.resolve(__dirname, '..'), 'portal');

const SITE = 'https://informativo-dc.sistemaspsdev.com.br';

/** Numero de teste, o mesmo ja usado nos originais. */
const NUMERO_TESTE = '5598984312703';

/**
 * Credencial Header Auth do informativo (Authorization: Bearer <token>).
 *
 * Precisa estar no JSON: o import SOBRESCREVE o no inteiro, entao vincular a
 * credencial pela interface se perde na proxima reimportacao -- foi o que
 * derrubou as execucoes agendadas de 22/07 com "Credentials not found".
 */
const CRED_INFORMATIVO = { httpHeaderAuth: { id: 'T0l6OL0Cro3viyYe', name: 'Informativo DC' } };

/** Grupos oficiais, os mesmos que os workflows originais ja usam. */
const GRUPOS_OFICIAIS = [
  '559891485530-1606501662@g.us',
  '120363369397773589@g.us',
];

const DEFINICOES = {
  wf1: {
    saida: 'WF1-INFO - Arrecadacao (alimenta o informativo).json',
    nome: 'WF1-INFO - Arrecadacao e Faturamento Diario',
    origem: 'WF1 - Arrecadacao e Faturamento Diario - Atualizado.json',
    contato: 'arrecadacao',
    rotulo: 'ARRECADAÇÃO',
    noConfig: 'Configurar alerta WhatsApp Arrecadacao',
    noMontar: 'Montar alerta arrecadacao',
    noEnvioAntigo: 'Enviar alerta WhatsApp Arrecadacao',
    id: 'WF1InfoCaema',
  },
  wf2: {
    saida: 'WF2-INFO - Ordens de Servico (alimenta o informativo).json',
    nome: 'WF2-INFO - Ordens de Servico SLA 72h',
    // Existem tres arquivos WF2 no repositorio; este e o que o CLAUDE.md
    // documenta como o WF2 em producao (id DbJSlCZZIWl6zVGB).
    origem: 'WF2 - Ordens de Servico - SLA 72h - CORRIGIDO.json',
    contato: 'ordens',
    rotulo: 'ORDENS DE SERVIÇO',
    noConfig: 'Configurar alertas WhatsApp',
    noMontar: 'Montar alerta gerencial',
    noEnvioAntigo: 'Enviar alerta WhatsApp',
    id: 'WF2InfoCaema',
    // Noturno: publica no site e avisa so o teste. O anuncio aos grupos e feito
    // uma vez, de manha, pelo WF-SERVICOS-8H.
    grupos: false,
  },
  wf3: {
    saida: 'WF3-INFO - Cortes (alimenta o informativo).json',
    nome: 'WF3-INFO - Acompanhamento de Cortes',
    origem: 'WF3 - Acompanhamento de Cortes - Diario 21h.json',
    contato: 'cortes',
    rotulo: 'CORTES',
    noConfig: 'Configurar alerta WhatsApp Cortes',
    noMontar: 'Montar alerta cortes',
    noEnvioAntigo: 'Enviar alerta WhatsApp Cortes',
    id: 'WF3InfoCaema',
    // Noturno: publica no site e avisa so o teste; grupos so pelo WF-SERVICOS-8H.
    grupos: false,
  },
  wf4: {
    saida: 'WF4-INFO - Faturamento (alimenta o informativo).json',
    nome: 'WF4-INFO - Faturamento e Pagamentos',
    origem: 'WF4 - Faturamento e Pagamentos - Diario 21h.json',
    contato: 'faturamento',
    rotulo: 'FATURAMENTO',
    noConfig: 'Configurar alerta WhatsApp Faturamento',
    noMontar: 'Montar alerta faturamento',
    noEnvioAntigo: 'Enviar alerta WhatsApp Faturamento',
    id: 'WF4InfoCaema',
    // Ver configuracaoSoTeste(): o WF4 nunca enviou aos grupos.
    grupos: false,
    // BLOQUEADO de proposito. A mensagem do WF4-INFO passou a ser mantida
    // DIRETO no workflow (o "Montar alerta faturamento" do WF4-INFO diverge do
    // original). Regenerar aqui clonaria o original de novo e apagaria essa
    // mensagem sem aviso. Para reativar, primeiro traga a mensagem do
    // WF4-INFO para o WF4 original e so entao remova este campo.
    bloqueado: 'A mensagem do WF4-INFO e mantida direto no workflow; regenerar apagaria a versao boa.',
  },
  wf5: {
    saida: 'WF5-INFO - Hidrometracao (alimenta o informativo).json',
    nome: 'WF5-INFO - Hidrometracao Diario',
    origem: 'WF5 - Hidrometracao Diario.json',
    contato: 'hidrometracao',
    rotulo: 'HIDROMETRAÇÃO',
    noConfig: 'Configurar alerta WhatsApp Hidrometracao',
    noMontar: 'Montar alerta hidrometracao',
    noEnvioAntigo: 'Enviar alerta WhatsApp Hidrometracao',
    id: 'WF5InfoCaema',
    // Noturno (19h30): publica no site e avisa so o teste; grupos so pelo
    // WF-SERVICOS-8H, que anuncia Ordens, Cortes e Hidrometracao juntos.
    grupos: false,
  },
};

function lerOrigem(arquivo) {
  const bruto = JSON.parse(fs.readFileSync(path.join(dirPortal, arquivo), 'utf8'));
  return Array.isArray(bruto) ? bruto[0] : bruto;
}

function exigirNo(w, nome) {
  const no = w.nodes.find(n => n.name === nome);
  if (!no) throw new Error(`No "${nome}" nao existe em ${w.name}. Nos: ${w.nodes.map(n => n.name).join(' | ')}`);
  return no;
}

/**
 * Configuracao com destinatarios limitados ao numero de teste.
 * Os grupos oficiais entram depois da validacao, trocando a lista.
 */
function configuracaoSoTeste(def) {
  const paraGrupos = def.grupos !== false;

  const cabecalho = paraGrupos
    ? [
        '// COPIA -INFO: avisa nos grupos oficiais, os mesmos do workflow original.',
        '// O que vai ao WhatsApp e apenas o aviso curto com o link; o relatorio',
        '// inteiro fica no informativo.',
      ]
    : [
        '// COPIA -INFO: destinatario limitado ao numero de teste.',
        '//',
        '// O WF4 nunca enviou aos grupos -- o original vive com ativo:false,',
        '// aguardando aprovacao do texto. Colocar os grupos aqui estrearia esse',
        '// envio. Para liberar, troque a lista pelos grupos e reimporte.',
      ];

  return [
    ...cabecalho,
    '//',
    '// ativo:true porque esta copia existe para alimentar o informativo.',
    'const destinatarios = [',
    ...(paraGrupos ? GRUPOS_OFICIAIS : [NUMERO_TESTE]).map(d => "  '" + d + "',"),
    '];',
    '',
    'return [{',
    '  json: {',
    '    ativo: true,',
    '    modo_teste: true,',
    '    destinatarios,',
    "    api_url: 'http://evolution-api:8080',",
    "    instancia: 'portal-alertas',",
    '    enviar_sem_dados: false,',
    '  },',
    '}];',
  ].join('\n');
}

/** Aviso curto que substitui o relatorio inteiro no WhatsApp. */
function codigoAviso(def) {
  return [
    '// O relatorio inteiro agora vive no informativo; o WhatsApp recebe a chamada.',
    'const config = $(' + JSON.stringify(def.noConfig) + ').first().json;',
    'const alerta = $(' + JSON.stringify(def.noMontar) + ').first().json;',
    '',
    'function formatarDia(valor) {',
    "  const m = String(valor || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);",
    "  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';",
    '}',
    '',
    'const dia = formatarDia(alerta.data_posicao);',
    // Link so da landing (raiz), sem #contato: os grupos entram pela porta da
    // frente do informativo, nao numa conversa especifica.
    'const link = ' + JSON.stringify(SITE) + ';',
    '',
    'const texto = [',
    "  '📊 *INFORMATIVO DE " + def.rotulo + "*' + (dia ? ' | POSIÇÃO ' + dia : ''),",
    "  '',",
    "  'O informativo atualizado já está disponível para consulta.',",
    "  '',",
    "  '👉 ' + link,",
    "  '',",
    "  '_Acesso restrito a contas @caema.ma.gov.br._',",
    "].join('\\n');",
    '',
    'const destinatarios = Array.isArray(config.destinatarios) ? config.destinatarios : [];',
    '',
    'return destinatarios.map(destinatario => ({',
    '  json: {',
    "    api_url: String(config.api_url || '').replace(/\\/$/, ''),",
    "    instancia: String(config.instancia || ''),",
    '    destinatario,',
    '    mensagem: texto,',
    '  },',
    '}));',
  ].join('\n');
}

function montar(def) {
  // Clone profundo: tudo o que nao for explicitamente alterado permanece
  // identico ao original, inclusive credenciais e horario do agendamento.
  const w = JSON.parse(JSON.stringify(lerOrigem(def.origem)));

  const noMontar = exigirNo(w, def.noMontar);
  const noConfig = exigirNo(w, def.noConfig);
  const noEnvio = exigirNo(w, def.noEnvioAntigo);

  const credEvolution = noEnvio.credentials;
  const base = noEnvio.position || [0, 0];

  // 1. Fora o envio do relatorio inteiro aos grupos.
  w.nodes = w.nodes.filter(n => n.name !== def.noEnvioAntigo);
  delete w.connections[def.noEnvioAntigo];

  // 2. Destinatarios so de teste.
  noConfig.parameters.jsCode = configuracaoSoTeste(def);

  // 3. Nos novos.
  w.nodes.push({
    parameters: {
      method: 'POST',
      url: SITE + '/api/publicar',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      // Sem gerado_em: data_posicao e a data de REFERENCIA do dado, sem hora.
      // Usada como carimbo, o navegador a lia como meia-noite UTC e exibia
      // 21:00 do dia anterior. O horario correto e o da publicacao, que o
      // servidor grava sozinho em publicado_em.
      jsonBody: '={{ { contato: ' + JSON.stringify(def.contato) + ', mensagem: $json.mensagem } }}',
      options: { timeout: 30000 },
    },
    id: 'Publicar no Informativo DC',
    name: 'Publicar no Informativo DC',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [base[0], base[1]],
    // "Montar alerta" devolve um item por destinatario; publicar uma vez basta.
    executeOnce: true,
    credentials: CRED_INFORMATIVO,
  });

  w.nodes.push({
    parameters: { jsCode: codigoAviso(def) },
    id: 'Montar aviso curto',
    name: 'Montar aviso curto',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [base[0] + 220, base[1]],
  });

  w.nodes.push({
    parameters: {
      method: 'POST',
      url: "={{ $json.api_url + '/message/sendText/' + $json.instancia }}",
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '={{ { number: $json.destinatario, text: $json.mensagem } }}',
      options: { timeout: 30000 },
    },
    id: 'Enviar aviso WhatsApp',
    name: 'Enviar aviso WhatsApp',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [base[0] + 440, base[1]],
    credentials: credEvolution,
  });

  // 4. Religa o final: Montar -> Publicar -> Aviso -> Enviar.
  const liga = (de, para) => { w.connections[de] = { main: [[{ node: para, type: 'main', index: 0 }]] }; };
  liga(def.noMontar, 'Publicar no Informativo DC');
  liga('Publicar no Informativo DC', 'Montar aviso curto');
  liga('Montar aviso curto', 'Enviar aviso WhatsApp');

  // 5. Identidade propria, inativo ate a validacao.
  // id explicito: o import do n8n exige um id nao nulo, e um id estavel faz
  // reimportacoes atualizarem o mesmo workflow em vez de criar duplicatas.
  w.name = def.nome;
  w.id = def.id;
  w.active = false;
  delete w.versionId;

  return w;
}

const alvo = (process.argv[2] || '').toLowerCase();
const def = DEFINICOES[alvo];

if (!def) {
  console.error('Uso: node informativodc/gerar-wf-info.js <' + Object.keys(DEFINICOES).join('|') + '>');
  process.exit(1);
}

// Guarda: alvo cuja copia -INFO deixou de ser derivada do original. Regenerar
// sobrescreveria trabalho que so existe na copia.
if (def.bloqueado) {
  console.error('BLOQUEADO: ' + alvo + ' nao pode ser regenerado.');
  console.error('  Motivo: ' + def.bloqueado);
  console.error('  Edite o workflow -INFO diretamente e reimporte no n8n.');
  process.exit(1);
}

const wf = montar(def);
fs.writeFileSync(path.join(dirPortal, def.saida), JSON.stringify(wf, null, 2), 'utf8');

const origem = lerOrigem(def.origem);
console.log('Gerado: portal/' + def.saida);
console.log('  nos          : ' + wf.nodes.length + ' (original: ' + origem.nodes.length + ')');
console.log('  removido     : ' + def.noEnvioAntigo);
console.log('  adicionados  : Publicar no Informativo DC, Montar aviso curto, Enviar aviso WhatsApp');
console.log('  destinatarios: ' + (def.grupos === false ? NUMERO_TESTE + ' (somente teste)' : GRUPOS_OFICIAIS.join(', ')));
console.log('  ativo        : ' + wf.active);
