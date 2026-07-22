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

import { put, list, get, del } from '@vercel/blob';

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

/** Grava (ou substitui) o informativo de um contato. */
export async function publicar(contato, { mensagem, gerado_em }) {
  const corpo = JSON.stringify({
    contato,
    mensagem,
    gerado_em: gerado_em || new Date().toISOString(),
    publicado_em: new Date().toISOString(),
  });

  // addRandomSuffix:false mantém o caminho estável -- com sufixo aleatório,
  // cada publicação criaria um arquivo novo e a leitura não saberia qual é.
  await put(caminho(contato), corpo, {
    access: ACESSO,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 0,
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
    try {
      // useCache:false — o conteúdo muda a cada execução do workflow e o cache
      // do CDN mostraria o informativo de ontem.
      const r = await get(caminho(c.id), { access: ACESSO, useCache: false, token });
      if (!r || !r.stream) return null;

      const j = await new Response(r.stream).json();
      return contatoValido(j.contato) ? j : null;
    } catch (e) {
      // Ainda não publicado, ou arquivo ilegível: não pode derrubar os outros.
      return null;
    }
  }));

  const porId = new Map();
  lidos.filter(Boolean).forEach(j => porId.set(j.contato, j));

  const contatos = CONTATOS
    .filter(c => porId.has(c.id))
    .map(c => ({ ...c, ...porId.get(c.id) }));

  const datas = contatos.map(c => c.publicado_em).filter(Boolean).sort();

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
