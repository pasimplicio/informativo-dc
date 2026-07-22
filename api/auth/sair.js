import { montarCookie, verificar, lerCookie, COOKIE, ENV } from '../../lib/sessao.js';
import { registrar } from '../../lib/auditoria.js';

/** Encerra a sessao local. Nao desconecta a conta Google do navegador. */
export default async function handler(req, res) {
  const sessao = await verificar(lerCookie(req.headers.cookie, COOKIE), process.env[ENV.segredoSessao]);
  if (sessao) await registrar({ evento: 'saida', email: sessao.email }, req);

  res.setHeader('Set-Cookie', [montarCookie('', { apagar: true })]);
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, '/?saiu=1');
}
