/**
 * Quem pode ver o quê. Módulo sem dependências de propósito: o middleware roda
 * no Edge e importar `lib/auditoria.js` traria o SDK do Blob junto, que não
 * pertence a esse runtime.
 */

/** Conta autorizada a ver o registro de acessos. */
export function emailAuditor(env = process.env) {
  return (env.AUDITORIA_EMAIL || 'assessoria.dc@caema.ma.gov.br').toLowerCase();
}

export function podeVerAuditoria(email) {
  return typeof email === 'string' && email.toLowerCase() === emailAuditor();
}

/** Rotas restritas à conta acima — página e API. */
export function ehRotaDeAuditoria(caminho) {
  return caminho === '/auditoria' || caminho === '/api/auditoria';
}
