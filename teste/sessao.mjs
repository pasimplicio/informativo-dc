import { assinar, verificar, ehDominioPermitido, lerCookie, montarCookie, TIPO }
  from '../lib/sessao.js';

const S = 'segredo-de-teste-nao-usado-em-producao';
let falhas = 0;

function ok(nome, cond) {
  console.log((cond ? '  ok   ' : '  FALHA') + '  ' + nome);
  if (!cond) falhas++;
}

// 1. Ida e volta
const t = await assinar({ email: 'fulano@caema.ma.gov.br', nome: 'Fulano' }, S);
const v = await verificar(t, S);
ok('assina e verifica', v && v.email === 'fulano@caema.ma.gov.br');
ok('inclui expiracao', v && typeof v.exp === 'number' && v.exp > Date.now() / 1000);

// 2. Adulteracao da carga (o ataque obvio: trocar o e-mail)
const [corpo, mac] = t.split('.');
const forjado = Buffer.from(JSON.stringify({
  email: 'invasor@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600,
})).toString('base64url') + '.' + mac;
ok('recusa carga adulterada', (await verificar(forjado, S)) === null);

// 3. Assinatura de outro segredo
ok('recusa segredo errado', (await verificar(t, 'outro-segredo')) === null);

// 4. Formatos invalidos
for (const ruim of [null, '', 'semponto', 'a.b.c', '.', 'x.']) {
  const r = await verificar(ruim, S);
  if (r !== null) { console.log('  FALHA  aceitou entrada invalida: ' + JSON.stringify(ruim)); falhas++; }
}
ok('recusa formatos invalidos', true);

// 5. Expiracao: assina com exp no passado usando o mesmo caminho de codigo
const expirado = await assinar({ email: 'x@caema.ma.gov.br' }, S);
const partes = expirado.split('.');
const cargaVelha = JSON.parse(Buffer.from(partes[0], 'base64url').toString());
cargaVelha.exp = Math.floor(Date.now() / 1000) - 10;
// reassina de verdade, senao estariamos testando a assinatura e nao a validade
const enc = new TextEncoder();
const k = await crypto.subtle.importKey('raw', enc.encode(S), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const novoCorpo = Buffer.from(JSON.stringify(cargaVelha)).toString('base64url');
const novoMac = Buffer.from(await crypto.subtle.sign('HMAC', k, enc.encode(novoCorpo))).toString('base64url');
ok('recusa sessao expirada', (await verificar(novoCorpo + '.' + novoMac, S)) === null);

// 6. Dominio — a barreira que nao depende do parametro hd do Google
ok('aceita dominio correto', ehDominioPermitido('a.b@caema.ma.gov.br'));
ok('aceita maiusculas', ehDominioPermitido('A@CAEMA.MA.GOV.BR'));
ok('recusa gmail', !ehDominioPermitido('a@gmail.com'));
// O '@' no inicio do sufixo e o que impede um dominio registrado como
// "evilcaema.ma.gov.br" de ser aceito. Sem ele, este teste falharia.
ok('recusa sufixo enganoso', !ehDominioPermitido('a@evilcaema.ma.gov.br'));
ok('recusa sem arroba', !ehDominioPermitido('caema.ma.gov.br'));
ok('recusa dominio parecido', !ehDominioPermitido('a@caema.ma.gov.br.evil.com'));
ok('recusa vazio', !ehDominioPermitido('') && !ehDominioPermitido(null));

// 7. Sessao valida mas de dominio nao permitido deve ser recusada na verificacao
const intruso = await assinar({ email: 'x@gmail.com' }, S);
ok('recusa sessao de dominio proibido', (await verificar(intruso, S)) === null);

// 8. Cookie
ok('le cookie entre outros', lerCookie('a=1; sessao=abc; b=2', 'sessao') === 'abc');
ok('cookie ausente vira null', lerCookie('a=1', 'sessao') === null);
const c = montarCookie('valor');
ok('cookie tem HttpOnly/Secure/SameSite', /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c));
ok('cookie de logout zera Max-Age', /Max-Age=0/.test(montarCookie('', { apagar: true })));

// 9. State — o token do fluxo OAuth NAO carrega e-mail.
//    A ausencia destes testes deixou passar um bug que rejeitava todo login
//    valido: verificar() aplicava a checagem de dominio tambem no state.
const st = await assinar({ destino: '/informativo', aleatorio: 'abc' }, S, TIPO.state);
const stv = await verificar(st, S, TIPO.state);
ok('state valido e aceito sem e-mail', stv && stv.destino === '/informativo');
ok('state nao expira de imediato', stv && stv.exp > Date.now() / 1000);

// 10. Confusao de tipos: um nao pode ser usado no lugar do outro
ok('sessao recusada como state', (await verificar(t, S, TIPO.state)) === null);
ok('state recusado como sessao', (await verificar(st, S, TIPO.sessao)) === null);
ok('tipo ausente e recusado', (await (async () => {
  const enc2 = new TextEncoder();
  const corpo2 = Buffer.from(JSON.stringify({
    email: 'x@caema.ma.gov.br', exp: Math.floor(Date.now() / 1000) + 600,
  })).toString('base64url');
  const k2 = await crypto.subtle.importKey('raw', enc2.encode(S), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const m2 = Buffer.from(await crypto.subtle.sign('HMAC', k2, enc2.encode(corpo2))).toString('base64url');
  return verificar(corpo2 + '.' + m2, S, TIPO.sessao);
})()) === null);

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
