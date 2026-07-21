import { verificar, lerCookie, configurado, COOKIE, ENV } from './lib/sessao.js';

/**
 * Protege o informativo. Roda no Edge, antes de servir o arquivo.
 *
 * Comportamento condicional de proposito: sem credencial configurada o acesso
 * fica liberado (o site exibe apenas dados de demonstracao). Assim que as
 * variaveis existirem, a mesma rota passa a exigir sessao -- sem precisar
 * lembrar de "ligar" a protecao no dia que o dado real entrar, que e
 * exatamente o tipo de passo que se esquece.
 */
export default async function middleware(req) {
  if (!configurado(process.env)) return;

  const sessao = await verificar(
    lerCookie(req.headers.get('cookie'), COOKIE),
    process.env[ENV.segredoSessao]
  );

  if (sessao) return;

  const url = new URL(req.url);
  const entrada = new URL('/', url.origin);
  entrada.searchParams.set('next', url.pathname + url.search);
  entrada.searchParams.set('erro', 'sessao');

  return Response.redirect(entrada.toString(), 302);
}

export const config = {
  matcher: ['/informativo', '/api/mensagens'],
};
