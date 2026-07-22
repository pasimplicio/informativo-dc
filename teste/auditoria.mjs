import { podeVerAuditoria, emailAuditor } from '../lib/permissoes.js';

let falhas = 0;
const ok = (nome, cond) => {
  console.log((cond ? '  ok    ' : '  FALHA ') + nome);
  if (!cond) falhas++;
};

console.log('auditor padrao:', emailAuditor());

ok('aceita a conta autorizada', podeVerAuditoria('assessoria.dc@caema.ma.gov.br'));
ok('aceita com maiusculas', podeVerAuditoria('Assessoria.DC@CAEMA.MA.GOV.BR'));

// Estes sao os que importam: contas legitimas do dominio, que passam pelo
// middleware, mas NAO podem ver a auditoria.
ok('recusa outra conta do dominio', !podeVerAuditoria('fulano@caema.ma.gov.br'));
ok('recusa conta parecida', !podeVerAuditoria('assessoria.dc@caema.ma.gov.br.evil.com'));
ok('recusa prefixo parecido', !podeVerAuditoria('assessoria.dcx@caema.ma.gov.br'));
ok('recusa sufixo colado', !podeVerAuditoria('xassessoria.dc@caema.ma.gov.br'));
ok('recusa vazio', !podeVerAuditoria(''));
ok('recusa null', !podeVerAuditoria(null));
ok('recusa numero', !podeVerAuditoria(12345));
ok('recusa objeto', !podeVerAuditoria({ email: 'assessoria.dc@caema.ma.gov.br' }));

// Sobrescrita por ambiente
const antes = process.env.AUDITORIA_EMAIL;
process.env.AUDITORIA_EMAIL = 'outro@caema.ma.gov.br';
ok('respeita AUDITORIA_EMAIL', emailAuditor() === 'outro@caema.ma.gov.br');
if (antes === undefined) delete process.env.AUDITORIA_EMAIL; else process.env.AUDITORIA_EMAIL = antes;

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodos passaram.');
process.exit(falhas ? 1 : 0);
