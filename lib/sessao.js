/**
 * Sessao em cookie assinado (HMAC-SHA256). Sem banco: quem administra a
 * identidade e o Google Workspace, nao este app.
 *
 * Usa exclusivamente Web Crypto (globalThis.crypto.subtle), disponivel tanto no
 * runtime Node das rotas /api quanto no runtime Edge do middleware. Uma
 * implementacao so -- duas divergiriam, e uma divergencia aqui significa
 * sessao aceita num lado e recusada no outro.
 */

export const COOKIE = 'sessao';
export const DOMINIO_PERMITIDO = 'caema.ma.gov.br';
const VALIDADE_S = 60 * 60 * 8; // 8h: um turno de trabalho

const enc = new TextEncoder();

function b64urlEnc(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDec(txt) {
  const s = atob(txt.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function chave(segredo) {
  return crypto.subtle.importKey(
    'raw', enc.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

/** Gera o valor do cookie para um usuario ja validado. */
export async function assinar(dados, segredo) {
  const carga = { ...dados, exp: Math.floor(Date.now() / 1000) + VALIDADE_S };
  const corpo = b64urlEnc(enc.encode(JSON.stringify(carga)));
  const mac = await crypto.subtle.sign('HMAC', await chave(segredo), enc.encode(corpo));
  return corpo + '.' + b64urlEnc(new Uint8Array(mac));
}

/**
 * Devolve a carga se o token for autentico e nao expirado; senao null.
 * A verificacao usa crypto.subtle.verify, que compara em tempo constante.
 */
export async function verificar(token, segredo) {
  if (!token || typeof token !== 'string') return null;

  const p = token.split('.');
  if (p.length !== 2) return null;

  try {
    const ok = await crypto.subtle.verify(
      'HMAC', await chave(segredo), b64urlDec(p[1]), enc.encode(p[0])
    );
    if (!ok) return null;

    const carga = JSON.parse(new TextDecoder().decode(b64urlDec(p[0])));
    if (!carga.exp || carga.exp < Math.floor(Date.now() / 1000)) return null;

    // Revalida o dominio a cada requisicao: se a regra mudar, sessoes ja
    // emitidas param de valer sem precisar esperar a expiracao.
    if (!ehDominioPermitido(carga.email)) return null;

    return carga;
  } catch (e) {
    return null;
  }
}

/**
 * A restricao real vem da tela de consentimento Interna do Workspace. Esta
 * checagem e a segunda barreira: o parametro `hd` do Google e apenas uma dica
 * de interface e nao serve como controle de acesso.
 */
export function ehDominioPermitido(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@' + DOMINIO_PERMITIDO);
}

export function montarCookie(valor, { apagar = false } = {}) {
  const partes = [
    COOKIE + '=' + (apagar ? '' : valor),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=' + (apagar ? 0 : VALIDADE_S),
  ];
  return partes.join('; ');
}

export function lerCookie(cabecalho, nome) {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

/** Nomes das variaveis de ambiente, num lugar so. */
export const ENV = {
  clientId: 'GOOGLE_CLIENT_ID',
  clientSecret: 'GOOGLE_CLIENT_SECRET',
  segredoSessao: 'SESSAO_SEGREDO',
};

export function configurado(env) {
  return Boolean(env[ENV.clientId] && env[ENV.clientSecret] && env[ENV.segredoSessao]);
}
