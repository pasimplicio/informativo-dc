/**
 * Publicação e leitura dos informativos.
 *
 * Duas decisões que valem explicação:
 *
 * 1. UM ARQUIVO POR CONTATO. Publicar tudo num JSON só exigiria ler-alterar-
 *    gravar, e dois workflows publicando ao mesmo tempo sobrescreveriam um ao
 *    outro. Com um arquivo por contato não existe corrida.
 *
 * 2. CAMINHO SECRETO. O Vercel Blob serve os arquivos por URL pública: quem
 *    descobrir o endereço lê o conteúdo sem passar pelo login. Como o caminho
 *    seria previsível (`cortes.json`), ele leva um prefixo derivado do
 *    SESSAO_SEGREDO por HMAC -- secreto, estável entre execuções e sem exigir
 *    mais uma variável de ambiente.
 */

import { put, list } from '@vercel/blob';

/** Ordem aqui = ordem das conversas na tela. */
export const CONTATOS = [
  { id: 'arrecadacao', nome: 'Arrecadação',      inicial: 'AR', horarios: '10h e 16h' },
  { id: 'faturamento', nome: 'Faturamento',      inicial: 'FT', horarios: '21h' },
  { id: 'cortes',      nome: 'Cortes',           inicial: 'CO', horarios: '21h' },
  { id: 'ordens',      nome: 'Ordens de Serviço', inicial: 'OS', horarios: '20h' },
];

const IDS = new Set(CONTATOS.map(c => c.id));

/** Limite defensivo: a maior mensagem real tem ~2,5 KB. */
export const TAMANHO_MAX = 64 * 1024;

const enc = new TextEncoder();
let prefixoCache = null;

/**
 * Segmento secreto do caminho, derivado do segredo de sessão. Determinístico,
 * então a leitura encontra o que a publicação gravou.
 */
async function prefixo() {
  if (prefixoCache) return prefixoCache;

  const segredo = process.env.SESSAO_SEGREDO;
  if (!segredo) throw new Error('SESSAO_SEGREDO ausente');

  const chave = await crypto.subtle.importKey(
    'raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', chave, enc.encode('caminho-dos-informativos'));

  prefixoCache = 'inf-' + [...new Uint8Array(mac)]
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  return prefixoCache;
}

export function contatoValido(id) {
  return typeof id === 'string' && IDS.has(id);
}

/**
 * Ao conectar um Blob Store, a Vercel permite prefixar o nome da variável --
 * e aí ela não se chama BLOB_READ_WRITE_TOKEN, mas <PREFIXO>_BLOB_READ_WRITE_TOKEN.
 * O SDK só procura o nome padrão. Aqui resolvemos qualquer variante e passamos
 * o token explicitamente.
 */
function tokenBlob() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;

  const chave = Object.keys(process.env)
    .filter(k => k.endsWith('BLOB_READ_WRITE_TOKEN'))
    .sort()[0];

  if (chave) return process.env[chave];

  // Mensagem com os nomes (nunca os valores) para diagnosticar sem adivinhação.
  const candidatas = Object.keys(process.env).filter(k => /BLOB/i.test(k));
  throw new Error(
    'Nenhuma variável *BLOB_READ_WRITE_TOKEN encontrada. ' +
    (candidatas.length
      ? 'Variáveis com "BLOB" no nome: ' + candidatas.join(', ')
      : 'Nenhuma variável com "BLOB" no nome — o Blob Store não está conectado a este projeto/ambiente.')
  );
}

/** Grava (ou substitui) o informativo de um contato. */
export async function publicar(contato, { mensagem, gerado_em }) {
  const caminho = (await prefixo()) + '/' + contato + '.json';

  const corpo = JSON.stringify({
    contato,
    mensagem,
    gerado_em: gerado_em || new Date().toISOString(),
    publicado_em: new Date().toISOString(),
  });

  // addRandomSuffix:false mantém o caminho estável -- com sufixo aleatório,
  // cada publicação criaria um arquivo novo e a leitura não saberia qual é.
  await put(caminho, corpo, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 0,
    token: tokenBlob(),
  });
}

/**
 * Lê o que já foi publicado e devolve no formato que a tela consome.
 * Contato sem publicação simplesmente não aparece.
 */
export async function lerTodos() {
  const { blobs } = await list({ prefix: (await prefixo()) + '/', token: tokenBlob() });

  const porId = new Map();
  await Promise.all(blobs.map(async b => {
    try {
      const r = await fetch(b.url, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (contatoValido(j.contato)) porId.set(j.contato, j);
    } catch (e) {
      // Um arquivo ilegível não pode derrubar os outros três.
    }
  }));

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
