/**
 * Publicação e leitura dos informativos (Vercel Blob, store privado).
 *
 * Duas decisões que valem explicação:
 *
 * 1. UM ARQUIVO POR CONTATO. Publicar tudo num JSON só exigiria ler-alterar-
 *    gravar, e dois workflows publicando ao mesmo tempo sobrescreveriam um ao
 *    outro. Com um arquivo por contato não existe corrida.
 *
 * 2. CAMINHO SIMPLES. O store é privado: o conteúdo só sai mediante token, e
 *    não há URL pública para adivinhar. Uma versão anterior derivava o caminho
 *    do SESSAO_SEGREDO por HMAC, supondo store público -- além de
 *    desnecessário agora, aquilo acoplava a localização dos dados ao segredo
 *    de sessão, e rotacionar o segredo tornaria tudo ilegível.
 */

import { put, get, del } from '@vercel/blob';

/** Ordem aqui = ordem das conversas na tela. */
export const CONTATOS = [
  { id: 'arrecadacao', nome: 'Arrecadação',       inicial: 'AR', horarios: '10h e 16h' },
  { id: 'faturamento', nome: 'Faturamento',       inicial: 'FT', horarios: '21h' },
  { id: 'cortes',      nome: 'Cortes',            inicial: 'CO', horarios: '21h' },
  { id: 'ordens',      nome: 'Ordens de Serviço', inicial: 'OS', horarios: '20h' },
];

const IDS = new Set(CONTATOS.map(c => c.id));

/** Limite defensivo: a maior mensagem real tem ~2,5 KB. */
export const TAMANHO_MAX = 64 * 1024;

const PASTA = 'informativos';
const ACESSO = 'private';

const enc = new TextEncoder();

export function contatoValido(id) {
  return typeof id === 'string' && IDS.has(id);
}

function caminho(contato) {
  return PASTA + '/' + contato + '.json';
}

/**
 * Ao conectar um Blob Store, a Vercel pode prefixar o nome da variável -- e aí
 * ela não se chama BLOB_READ_WRITE_TOKEN. O SDK só procura o nome padrão.
 */
function tokenBlob() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;

  const chave = Object.keys(process.env)
    .filter(k => k.endsWith('BLOB_READ_WRITE_TOKEN'))
    .sort()[0];
  if (chave) return process.env[chave];

  // Nomes (nunca valores) para diagnosticar sem adivinhação.
  const candidatas = Object.keys(process.env).filter(k => /BLOB/i.test(k));
  throw new Error(
    'Nenhuma variável *BLOB_READ_WRITE_TOKEN encontrada. ' +
    (candidatas.length
      ? 'Variáveis com "BLOB" no nome: ' + candidatas.join(', ')
      : 'O Blob Store não está conectado a este projeto/ambiente.')
  );
}

/**
 * Por quantos dias o informativo fica na conversa.
 *
 * Corte por data, nao por quantidade: com contagem fixa, uma reexecucao manual
 * no mesmo dia empurraria um dia inteiro para fora do historico.
 */
export const DIAS_HISTORICO = 7;

/** Teto de seguranca, para o arquivo nao crescer sem limite se algo repetir. */
const MAX_ENTRADAS = 60;

function dentroDoPeriodo(entrada) {
  const t = new Date(entrada.publicado_em || entrada.gerado_em).getTime();
  if (Number.isNaN(t)) return true;  // sem data legivel, preserva
  return t >= Date.now() - DIAS_HISTORICO * 86400000;
}

/**
 * Le o historico atual de um contato. Devolve [] quando ainda nao ha nada
 * publicado -- situacao normal antes da primeira execucao.
 */
async function lerHistorico(contato, token) {
  try {
    const r = await get(caminho(contato), { access: ACESSO, useCache: false, token });
    if (!r || !r.stream) return [];

    const j = await new Response(r.stream).json();
    if (Array.isArray(j.historico)) return j.historico;

    // Formato antigo: um informativo por arquivo. Vira o primeiro do historico.
    if (j.mensagem) return [{ mensagem: j.mensagem, publicado_em: j.publicado_em, gerado_em: j.gerado_em }];
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * Acrescenta um informativo ao historico do contato.
 *
 * Ler-alterar-gravar e seguro aqui porque cada arquivo tem um unico escritor
 * (o workflow daquele indicador) e ele roda duas vezes por dia -- nao ha dois
 * processos disputando o mesmo contato.
 */
export async function publicar(contato, { mensagem, gerado_em }) {
  const token = tokenBlob();
  const historico = await lerHistorico(contato, token);

  const entrada = {
    mensagem,
    gerado_em: gerado_em || new Date().toISOString(),
    publicado_em: new Date().toISOString(),
  };

  const ultimo = historico[historico.length - 1];

  // Reexecucao com o texto identico atualiza o ultimo em vez de duplicar --
  // rodar o workflow duas vezes para conferir nao deve poluir a conversa.
  if (ultimo && ultimo.mensagem === mensagem) historico[historico.length - 1] = entrada;
  else historico.push(entrada);

  const corpo = JSON.stringify({
    contato,
    historico: historico.filter(dentroDoPeriodo).slice(-MAX_ENTRADAS),
  });

  // addRandomSuffix:false mantém o caminho estável -- com sufixo aleatório,
  // cada publicação criaria um arquivo novo e a leitura não saberia qual é.
  await put(caminho(contato), corpo, {
    access: ACESSO,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    // 60 é o mínimo aceito (a documentação do pacote proíbe menos de 1 minuto,
    // e a validação é do servidor — 0 seria recusado na gravação). Não afeta a
    // atualidade da tela: a leitura usa useCache:false.
    cacheControlMaxAge: 60,
    token: tokenBlob(),
  });
}

/** Remove a publicação de um contato; a tela volta ao exemplo. */
export async function apagar(contato) {
  await del(caminho(contato), { token: tokenBlob() });
}

/**
 * Lê o que já foi publicado e devolve no formato que a tela consome.
 * Contato sem publicação simplesmente não aparece.
 */
export async function lerTodos() {
  const token = tokenBlob();

  const lidos = await Promise.all(CONTATOS.map(async c => {
    // useCache:false — o conteúdo muda a cada execução do workflow e o cache
    // do CDN mostraria o informativo de ontem.
    // Filtra tambem na leitura: um contato que parou de publicar nao fica
    // exibindo informativo velho como se fosse atual.
    const historico = (await lerHistorico(c.id, token)).filter(dentroDoPeriodo);
    return historico.length ? { ...c, historico } : null;
  }));

  const contatos = lidos.filter(Boolean);

  const datas = contatos
    .map(c => c.historico[c.historico.length - 1].publicado_em)
    .filter(Boolean)
    .sort();

  return {
    exemplo: false,
    atualizado_em: datas.length ? datas[datas.length - 1] : null,
    contatos,
  };
}

/**
 * Comparação em tempo constante. Com `===`, o tempo de resposta varia conforme
 * quantos caracteres iniciais batem, o que permite descobrir o token por
 * tentativa e medição.
 */
export function segredosIguais(a, b) {
  const A = enc.encode(String(a || ''));
  const B = enc.encode(String(b || ''));
  if (A.length !== B.length) return false;

  let dif = 0;
  for (let i = 0; i < A.length; i++) dif |= A[i] ^ B[i];
  return dif === 0;
}
