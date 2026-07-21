import { montarCookie } from '../../lib/sessao.js';

/** Encerra a sessao local. Nao desconecta a conta Google do navegador. */
export default function handler(req, res) {
  res.setHeader('Set-Cookie', [montarCookie('', { apagar: true })]);
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, '/?saiu=1');
}
