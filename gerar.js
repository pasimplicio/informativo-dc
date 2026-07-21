/**
 * Gera dados/mensagens.local.json a partir dos workflows do n8n.
 *
 * Extrai o codigo dos nos "Configurar alerta" / "Montar alerta" dos .json dos
 * workflows e executa contra os JSONs de csv/, produzindo o mesmo texto que o
 * WhatsApp recebe -- sem reimplementar a logica em lugar nenhum.
 *
 * A saida contem dado REAL e fica fora do git (ver .gitignore). Para publicar
 * no site, o n8n faz POST em /api/publicar; ver README.
 *
 * Rode na maquina de dev, onde ../portal e ../csv existem:
 *   node gerar.js
 */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const dirPortal = path.join(raiz, 'portal');
const dirDados = path.join(raiz, 'csv');
const dirSaida = __dirname;

/**
 * Cada workflow guarda as referencias mensais num formato proprio. Em vez de
 * adivinhar, cada um declara como extrair a sua lista. Serve so para popular o
 * seletor de mes na tela -- quem escolhe a referencia de fato continua sendo o
 * codigo do no, que ja tem o fallback para a mais recente com dados.
 */
const REFS = {
  // WF1/WF3/WF4: referencias_disponiveis no topo, formato YYYYMM.
  padrao: dados => {
    const lista = Array.isArray(dados.referencias_disponiveis) && dados.referencias_disponiveis.length
      ? dados.referencias_disponiveis
      : Object.keys(dados.visoes || {});
    return [...new Set(lista.map(String))].sort().reverse();
  },
  // WF2: sem referencia_atual; os meses vivem nos registros, formato YYYY-MM.
  ordensServico: dados => {
    const registros = Array.isArray(dados.encerradas?.registros) ? dados.encerradas.registros : [];
    const dosRegistros = registros.map(r => r.mes).filter(Boolean).map(String);
    const doIndice = Array.isArray(dados.referencias?.encerradas) ? dados.referencias.encerradas.map(String) : [];
    return [...new Set([...dosRegistros, ...doIndice])].sort().reverse();
  },
};

// Ordem aqui = ordem da lista de conversas na tela.
const WORKFLOWS = [
  {
    id: 'arrecadacao',
    contato: 'Arrecadação',
    inicial: 'AR',
    horarios: '10h e 16h',
    workflow: 'WF1 - Arrecadacao e Faturamento Diario - Atualizado.json',
    dados: 'arrecadacao_processada.json',
    noConfig: 'Configurar alerta WhatsApp Arrecadacao',
    noMontar: 'Montar alerta arrecadacao',
    refs: REFS.padrao,
  },
  {
    id: 'faturamento',
    contato: 'Faturamento',
    inicial: 'FT',
    horarios: '21h',
    workflow: 'WF4 - Faturamento e Pagamentos - Diario 21h.json',
    dados: 'faturamento_processada.json',
    noConfig: 'Configurar alerta WhatsApp Faturamento',
    noMontar: 'Montar alerta faturamento',
    refs: REFS.padrao,
  },
  {
    id: 'cortes',
    contato: 'Cortes',
    inicial: 'CO',
    horarios: '21h',
    workflow: 'WF3 - Acompanhamento de Cortes - Diario 21h.json',
    dados: 'cortes_processada.json',
    noConfig: 'Configurar alerta WhatsApp Cortes',
    noMontar: 'Montar alerta cortes',
    refs: REFS.padrao,
  },
  {
    id: 'ordens',
    contato: 'Ordens de Serviço',
    inicial: 'OS',
    horarios: '20h',
    workflow: 'WF2 - Ordens de Servico - SLA 72h - CORRIGIDO.json',
    dados: 'os_processada.json',
    noConfig: 'Configurar alertas WhatsApp',
    noMontar: 'Montar alerta gerencial',
    refs: REFS.ordensServico,
  },
];

function lerWorkflow(arquivo) {
  const bruto = JSON.parse(fs.readFileSync(path.join(dirPortal, arquivo), 'utf8'));
  return Array.isArray(bruto) ? bruto[0] : bruto;
}

function acharNo(workflow, nome) {
  const no = workflow.nodes.find(n => n.name === nome);
  if (!no) {
    const codes = workflow.nodes.filter(n => n.parameters && n.parameters.jsCode).map(n => n.name);
    throw new Error(
      `No "${nome}" nao existe em ${workflow.name}.\n` +
      `  Nos Code disponiveis: ${codes.join(' | ')}\n` +
      `  Se voce renomeou o no no n8n, ajuste WORKFLOWS em gerar.js.`
    );
  }
  if (!no.parameters || typeof no.parameters.jsCode !== 'string') {
    throw new Error(`No "${nome}" nao e um no Code com jsCode.`);
  }
  return no.parameters.jsCode;
}

/**
 * Descobre de qual no o "Montar alerta" puxa os dados processados, lendo as
 * referencias $('...') do proprio codigo. Assim o gerador acompanha mudancas
 * de nome de no sem precisar de manutencao aqui.
 */
function acharNoDeDados(codigoMontar) {
  const refs = [...new Set(
    (codigoMontar.match(/\$\('([^']+)'\)/g) || []).map(r => r.slice(3, -2))
  )].filter(nome => nome !== 'Executar manualmente');

  if (refs.length !== 1) {
    throw new Error(
      `Esperava exatamente 1 no de dados referenciado no "Montar alerta", achei ${refs.length}: ` +
      `${JSON.stringify(refs)}. Ajuste acharNoDeDados() ou o codigo do no.`
    );
  }
  return refs[0];
}

// ---------------------------------------------------------------------------
// Shim dos globais do n8n. Precisa existir em dois lugares (aqui, para
// pre-renderizar o snapshot; e em motor.js, para o navegador). A implementacao
// e identica de proposito -- se divergir, o snapshot deixa de bater com o vivo.
// ---------------------------------------------------------------------------

function criarContexto({ dados, noDados, entrada, modoTeste }) {
  const item = json => ({ json });
  const colecao = itens => ({
    all: () => itens,
    first: () => itens[0],
    last: () => itens[itens.length - 1],
    item: itens[0],
  });

  const nos = {
    [noDados]: colecao([item(dados)]),
    // A deteccao teste/producao dos workflows e feita por
    // $('Executar manualmente').all().length > 0 -- ver CLAUDE.md.
    'Executar manualmente': colecao(modoTeste ? [item({})] : []),
  };

  return {
    $input: colecao(entrada.map(item)),
    $: nome => {
      if (!nos[nome]) {
        throw new Error(`O codigo do no pediu $('${nome}'), que o simulador nao fornece.`);
      }
      return nos[nome];
    },
    $execution: { mode: modoTeste ? 'manual' : 'trigger', id: 'simulador' },
    $now: new Date(),
  };
}

async function rodarNo(codigo, contexto) {
  // O jsCode de um no Code e um corpo de funcao que termina em return.
  const fn = new Function(
    '$input', '$', '$execution', '$now',
    `"use strict"; return (async () => {\n${codigo}\n})();`
  );
  const saida = await fn(contexto.$input, contexto.$, contexto.$execution, contexto.$now);
  return Array.isArray(saida) ? saida : [];
}

/**
 * Executa a cadeia Configurar -> Montar exatamente como o n8n faria.
 * Retorna null quando o workflow decide nao enviar (sem dados / desativado),
 * que e um resultado legitimo e precisa aparecer na tela como tal.
 */
async function montarMensagem({ codigoConfig, codigoMontar, noDados, dados, referencia, modoTeste }) {
  const config = await rodarNo(codigoConfig, criarContexto({
    dados, noDados, entrada: [{}], modoTeste,
  }));

  if (!config.length) return null;

  const ativoNoN8n = config[0].json.ativo !== false;

  const configAjustada = config.map(c => ({
    json: {
      ...c.json,
      // Sobrescreve a referencia para navegar por outros meses na tela. O no ja
      // trata config.referencia (com fallback para a mais recente com dados),
      // entao isso passa pelo caminho real, nao por um atalho.
      ...(referencia ? { referencia } : {}),
      // O WF4 vive com ativo:false de proposito -- roda para alimentar o portal
      // mas nao dispara o alerta, aguardando aprovacao do texto. Para o
      // simulador forcamos ativo:true (senao o no retorna [] e nao ha o que
      // revisar); a tela mostra o estado real via ativoNoN8n.
      ativo: true,
    },
  }));

  const saida = await rodarNo(codigoMontar, criarContexto({
    dados, noDados, entrada: configAjustada.map(c => c.json), modoTeste,
  }));

  if (!saida.length) return { vazio: true, ativoNoN8n };

  // Os nos "Montar alerta" emitem UM ITEM POR DESTINATARIO, cada um carregando
  // o mesmo texto -- e o no HTTP seguinte que faz uma chamada por item.
  const itens = saida.map(s => s.json || {});
  return {
    mensagem: itens[0].mensagem || itens[0].texto || '',
    destinatarios: itens.map(j => j.destinatario).filter(Boolean),
    referencia: itens[0].referencia || referencia || null,
    ativoNoN8n,
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const modulos = [];
  const snapshot = {};
  const avisos = [];

  for (const wf of WORKFLOWS) {
    process.stdout.write(`\n[${wf.id}] `);

    let workflow;
    try {
      workflow = lerWorkflow(wf.workflow);
    } catch (e) {
      avisos.push(`${wf.id}: workflow ilegivel (${e.message})`);
      process.stdout.write('workflow ILEGIVEL');
      continue;
    }

    const codigoMontar = acharNo(workflow, wf.noMontar);
    const codigoConfig = acharNo(workflow, wf.noConfig);
    const noDados = acharNoDeDados(codigoMontar);
    process.stdout.write(`no de dados: "${noDados}" `);

    modulos.push({
      id: wf.id,
      contato: wf.contato,
      inicial: wf.inicial,
      horarios: wf.horarios,
      arquivoDados: wf.dados,
      noDados,
      codigoConfig,
      codigoMontar,
    });

    // Pre-renderiza para o modo offline.
    const caminhoDados = path.join(dirDados, wf.dados);
    if (!fs.existsSync(caminhoDados)) {
      avisos.push(`${wf.id}: ${wf.dados} nao existe em csv/ - sem snapshot offline`);
      process.stdout.write('| sem dados');
      continue;
    }

    const dados = JSON.parse(fs.readFileSync(caminhoDados, 'utf8'));
    const refs = wf.refs(dados).slice(0, 6);
    snapshot[wf.id] = { gerado_em: dados.gerado_em || null, referencias: refs, mensagens: {} };

    for (const ref of refs) {
      for (const modoTeste of [false, true]) {
        const chave = `${ref}|${modoTeste ? 'teste' : 'producao'}`;
        try {
          const r = await montarMensagem({
            codigoConfig, codigoMontar, noDados, dados, referencia: ref, modoTeste,
          });
          snapshot[wf.id].mensagens[chave] = r;
        } catch (e) {
          snapshot[wf.id].mensagens[chave] = { erro: e.message };
          avisos.push(`${wf.id} ${chave}: ${e.message}`);
        }
      }
    }
    const ok = Object.values(snapshot[wf.id].mensagens).filter(m => m && !m.erro && m.mensagem).length;
    process.stdout.write(`| ${refs.length} refs, ${ok} mensagens`);
  }

  const saida = {
    exemplo: false,
    atualizado_em: new Date().toISOString(),
    contatos: modulos.map(m => {
      const snap = snapshot[m.id] || {};
      const ref = (snap.referencias || [])[0];
      const msg = ref && snap.mensagens ? snap.mensagens[ref + '|producao'] : null;
      return {
        id: m.id,
        nome: m.contato,
        inicial: m.inicial,
        horarios: m.horarios,
        gerado_em: snap.gerado_em || null,
        mensagem: (msg && msg.mensagem) || '',
      };
    }),
  };

  const destino = path.join(dirSaida, 'dados', 'mensagens.local.json');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(saida, null, 2), 'utf8');

  const kb = (fs.statSync(destino).size / 1024).toFixed(0);
  console.log(`\n\ndados/mensagens.local.json  ${kb} KB  (dado real -- fora do git)`);
  console.log('Publique com: POST /api/publicar  (ver README)');

  if (avisos.length) {
    console.log('\nAvisos:');
    for (const a of avisos) console.log('  - ' + a);
  }
}

main().catch(e => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
