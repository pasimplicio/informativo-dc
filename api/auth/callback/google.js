import {
  assinar, verificar, montarCookie, lerCookie,
  ehDominioPermitido, configurado, ENV, DOMINIO_PERMITIDO, TIPO,
} from '../../../lib/sessao.js';

/**
 * Volta do Google: troca o `code` por tokens, valida a identidade e emite a
 * sessao. Nenhuma informacao do usuario vem do navegador -- tudo e obtido
 * server-to-server com o Google.
 */
export default async function handler(req, res) {
  if (!configurado(process.env)) {
    return recusar(res, 'indisponivel');
  }

  const segredo = process.env[ENV.segredoSessao];

  // O Google devolve erro quando o usuario cancela ou a conta e barrada pela
  // tela de consentimento Interna.
  if (req.query.error) {
    return recusar(res, req.query.error === 'access_denied' ? 'cancelado' : 'google');
  }

  // 1. O state precisa ser autentico E igual ao que guardamos no cookie.
  const state = req.query.state;
  const salvo = lerCookie(req.headers.cookie, 'oauth_state');
  if (!state || !salvo || state !== salvo) return recusar(res, 'estado');

  const dadosState = await verificarState(state, segredo);
  if (!dadosState) return recusar(res, 'estado');

  // 2. Troca do codigo por tokens (server-to-server, sobre TLS).
  let tokens;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code || ''),
        client_id: process.env[ENV.clientId],
        client_secret: process.env[ENV.clientSecret],
        redirect_uri: `https://${req.headers['x-forwarded-host'] || req.headers.host}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    });
    tokens = await r.json();
    if (!r.ok || !tokens.id_token) throw new Error(tokens.error || 'sem id_token');
  } catch (e) {
    return recusar(res, 'troca');
  }

  // 3. O id_token veio direto do endpoint de token do Google sobre TLS
  //    autenticado, entao a assinatura ja esta garantida pelo canal. Ainda
  //    assim validamos as claims, que e o que de fato autoriza o acesso.
  const id = decodificarJWT(tokens.id_token);
  if (!id) return recusar(res, 'token');

  const agora = Math.floor(Date.now() / 1000);
  const emissorOk = id.iss === 'https://accounts.google.com' || id.iss === 'accounts.google.com';

  if (!emissorOk) return recusar(res, 'token');
  if (id.aud !== process.env[ENV.clientId]) return recusar(res, 'token');
  if (!id.exp || id.exp < agora) return recusar(res, 'token');

  // 4. Autorizacao. email_verified evita conta com e-mail nao confirmado; a
  //    checagem de dominio e a barreira que nao depende do parametro `hd`.
  if (id.email_verified !== true && id.email_verified !== 'true') {
    return recusar(res, 'email');
  }
  if (!ehDominioPermitido(id.email)) {
    return recusar(res, 'dominio');
  }

  const sessao = await assinar(
    { email: String(id.email).toLowerCase(), nome: id.name || null },
    segredo,
    TIPO.sessao
  );

  res.setHeader('Set-Cookie', [
    montarCookie(sessao),
    'oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, dadosState.destino || '/informativo');
}

async function verificarState(state, segredo) {
  // Exige TIPO.state: um cookie de sessao apresentado como state (ou o
  // contrario) e recusado, mesmo tendo assinatura valida.
  return verificar(state, segredo, TIPO.state);
}

function decodificarJWT(jwt) {
  try {
    const corpo = jwt.split('.')[1];
    const txt = atob(corpo.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(txt)));
  } catch (e) {
    return null;
  }
}

/** Volta para a tela de entrada com um motivo legivel, sem vazar detalhe tecnico. */
function recusar(res, motivo) {
  res.setHeader('Set-Cookie', ['oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, '/?erro=' + encodeURIComponent(motivo));
}

export const MOTIVOS = {
  dominio: `Esta conta não pertence ao domínio ${DOMINIO_PERMITIDO}.`,
  cancelado: 'Entrada cancelada.',
};
