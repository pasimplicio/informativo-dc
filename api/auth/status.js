import { configurado, verificar, lerCookie, COOKIE, ENV } from '../../lib/sessao.js';

/**
 * Diz a tela de login se o acesso corporativo esta disponivel e se ja existe
 * sessao. A tela usa isso para habilitar o botao -- sem este endpoint ela
 * mandaria o usuario para uma rota inexistente.
 */
export default async function handler(req, res) {
  const pronto = configurado(process.env);
  let sessao = null;

  if (pronto) {
    sessao = await verificar(
      lerCookie(req.headers.cookie, COOKIE),
      process.env[ENV.segredoSessao]
    );
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    configurado: pronto,
    autenticado: Boolean(sessao),
    email: sessao ? sessao.email : null,
  });
}
