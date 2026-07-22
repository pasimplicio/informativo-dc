import { verificar, lerCookie, configurado, COOKIE, ENV } from './lib/sessao.js';
import { podeVerAuditoria, ehRotaDeAuditoria } from './lib/permissoes.js';

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

  const url = new URL(req.url);

  if (sessao) {
    // Sessão válida não basta para a auditoria: qualquer conta do domínio tem
    // sessão. Sem esta checagem, outro funcionário carregava a página (sem
    // dados, barrados pela rota) -- mas carregava.
    if (ehRotaDeAuditoria(url.pathname) && !podeVerAuditoria(sessao.email)) {
      return url.pathname.startsWith('/api/')
        ? Response.json({ erro: 'Acesso restrito.' }, { status: 403 })
        : Response.redirect(new URL('/informativo?erro=restrito', url.origin).toString(), 302);
    }
    return;
  }

  const entrada = new URL('/', url.origin);
  entrada.searchParams.set('next', url.pathname + url.search);
  entrada.searchParams.set('erro', 'sessao');

  return Response.redirect(entrada.toString(), 302);
}

export const config = {
  // /auditoria exige sessão aqui e, além disso, e-mail específico dentro da
  // própria rota — o middleware só sabe que há sessão válida, não de quem.
  matcher: ['/informativo', '/api/mensagens', '/auditoria', '/api/auditoria'],
};
