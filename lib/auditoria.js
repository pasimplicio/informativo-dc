/**
 * Registro de acesso: quem entrou, quem foi recusado e quando.
 *
 * Um arquivo por dia (auditoria/AAAA-MM-DD.json). Escolha deliberada:
 *
 *   - arquivo unico cresceria sem limite e exigiria reescrever tudo a cada
 *     evento;
 *   - um arquivo por evento evitaria concorrencia, mas ler um mes exigiria
 *     centenas de requisicoes.
 *
 * LIMITACAO CONHECIDA: dois logins no mesmo segundo podem se sobrepor no
 * ler-alterar-gravar e um evento se perder. Com o volume desta aplicacao
 * (poucos usuarios, poucas entradas por dia) o risco e baixo, mas esta
 * registrado aqui para nao ser descoberto como surpresa numa investigacao.
 */

import { put, get, list } from '@vercel/blob';

const PASTA = 'auditoria';
const ACESSO = 'private';

/** Quem pode ver a auditoria. Sobrescrevivel por variavel de ambiente. */
export function emailAuditor(env = process.env) {
  return (env.AUDITORIA_EMAIL || 'assessoria.dc@caema.ma.gov.br').toLowerCase();
}

export function podeVerAuditoria(email) {
  return typeof email === 'string' && email.toLowerCase() === emailAuditor();
}

function tokenBlob() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const chave = Object.keys(process.env).filter(k => k.endsWith('BLOB_READ_WRITE_TOKEN')).sort()[0];
  if (chave) return process.env[chave];
  throw new Error('BLOB_READ_WRITE_TOKEN ausente.');
}

/** AAAA-MM-DD no fuso de São Paulo, para o dia bater com o dia local. */
function diaDe(data = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(data);
}

const caminho = dia => PASTA + '/' + dia + '.json';

async function lerDia(dia, token) {
  try {
    const r = await get(caminho(dia), { access: ACESSO, useCache: false, token });
    if (!r || !r.stream) return [];
    const j = await new Response(r.stream).json();
    return Array.isArray(j.eventos) ? j.eventos : [];
  } catch (e) {
    return [];
  }
}

/**
 * Grava um evento. Nunca lanca: auditoria que quebra o login e pior do que
 * auditoria incompleta -- ninguem entraria no sistema por causa dela.
 */
export async function registrar(evento, req) {
  try {
    const token = tokenBlob();
    const dia = diaDe();
    const eventos = await lerDia(dia, token);

    eventos.push({
      quando: new Date().toISOString(),
      evento: evento.evento,
      email: evento.email || null,
      motivo: evento.motivo || null,
      // Primeiro IP do encadeamento: os seguintes sao proxies.
      ip: String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null,
      agente: String(req?.headers?.['user-agent'] || '').slice(0, 200) || null,
    });

    await put(caminho(dia), JSON.stringify({ dia, eventos }), {
      access: ACESSO,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: 60,
      token,
    });
  } catch (e) {
    // Silencioso de proposito. Ver comentario acima.
  }
}

/** Eventos dos ultimos N dias, do mais recente para o mais antigo. */
export async function listar(dias = 30) {
  const token = tokenBlob();

  // list() em vez de tentar cada data: dias sem acesso nao geram arquivo, e
  // buscar 30 caminhos inexistentes seria desperdicio.
  const { blobs } = await list({ prefix: PASTA + '/', token });

  const corte = diaDe(new Date(Date.now() - dias * 86400000));
  const alvos = blobs
    .map(b => b.pathname.replace(PASTA + '/', '').replace('.json', ''))
    .filter(d => d >= corte)
    .sort()
    .reverse();

  const porDia = await Promise.all(alvos.map(d => lerDia(d, token)));

  return porDia
    .flat()
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
}
