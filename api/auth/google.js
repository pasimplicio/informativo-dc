import { assinar, configurado, ENV, DOMINIO_PERMITIDO, TIPO } from '../../lib/sessao.js';

/** Inicia o fluxo OAuth: leva o usuario ao consentimento do Google. */
export default async function handler(req, res) {
  if (!configurado(process.env)) {
    return res.status(503).json({ erro: 'Autenticação não configurada neste ambiente.' });
  }

  const destino = destinoSeguro(req.query.next);

  // O `state` viaja ate o Google e volta. Assinado e guardado tambem em cookie,
  // ele garante que a volta corresponde a uma ida iniciada por este site --
  // sem isso, um terceiro consegue disparar o callback (CSRF de login).
  const state = await assinar(
    { destino, aleatorio: crypto.randomUUID() },
    process.env[ENV.segredoSessao],
    TIPO.state
  );

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env[ENV.clientId]);
  url.searchParams.set('redirect_uri', urlCallback(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  // Dica de interface para o Google ja filtrar a conta. NAO e controle de
  // acesso -- a validacao real acontece no callback.
  url.searchParams.set('hd', DOMINIO_PERMITIDO);

  res.setHeader('Set-Cookie', [
    `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, url.toString());
}

function destinoSeguro(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/informativo';
}

export function urlCallback(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}/api/auth/callback/google`;
}
