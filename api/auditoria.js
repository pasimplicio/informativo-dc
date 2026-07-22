import { verificar, lerCookie, COOKIE, ENV } from '../lib/sessao.js';
import { listar, podeVerAuditoria, emailAuditor } from '../lib/auditoria.js';

/**
 * Entrega o registro de acessos.
 *
 * A sessao ja e exigida pelo middleware, mas a restricao a UMA conta e
 * conferida aqui tambem: qualquer usuario do dominio passa pelo middleware, e
 * so este endpoint sabe quem pode ver a auditoria. Depender de uma unica
 * camada deixaria o dado exposto a um erro de matcher.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const sessao = await verificar(
    lerCookie(req.headers.cookie, COOKIE),
    process.env[ENV.segredoSessao]
  );

  if (!sessao) return res.status(401).json({ erro: 'Sessão necessária.' });

  if (!podeVerAuditoria(sessao.email)) {
    return res.status(403).json({
      erro: 'Acesso restrito.',
      detalhe: 'O registro de acessos é visível apenas para ' + emailAuditor() + '.',
    });
  }

  const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 30, 1), 90);

  try {
    const eventos = await listar(dias);
    return res.status(200).json({ dias, total: eventos.length, eventos });
  } catch (e) {
    return res.status(500).json({ erro: e.message, eventos: [] });
  }
}
