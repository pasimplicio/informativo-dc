import { publicar, apagar, contatoValido, segredosIguais, TAMANHO_MAX, CONTATOS }
  from '../lib/informativos.js';

/**
 * Recebe do n8n o informativo já montado.
 *
 *   POST /api/publicar
 *   Authorization: Bearer <INFORMATIVO_TOKEN>
 *   { "contato": "cortes", "mensagem": "...", "gerado_em": "2026-07-21T21:01:00Z" }
 *
 * Não fica atrás do login do Google: o n8n não tem sessão de usuário. A
 * proteção é o token, por isso ele precisa ser longo e aleatório.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }

  const esperado = process.env.INFORMATIVO_TOKEN;
  if (!esperado) {
    return res.status(503).json({ erro: 'INFORMATIVO_TOKEN não configurado neste ambiente.' });
  }

  const cabecalho = String(req.headers.authorization || '');

  // Erros distintos: "sem cabeçalho", "sem o prefixo Bearer" e "token errado"
  // exigem correções diferentes, e um 401 genérico obrigaria a adivinhar qual.
  if (!cabecalho) {
    return res.status(401).json({
      erro: 'Cabeçalho Authorization ausente.',
      dica: 'No n8n: credencial Header Auth com Name="Authorization".',
    });
  }
  if (!cabecalho.startsWith('Bearer ')) {
    return res.status(401).json({
      erro: 'Cabeçalho Authorization sem o prefixo "Bearer ".',
      dica: 'O Value da credencial deve ser: Bearer SEU_TOKEN (com espaço).',
      recebido: cabecalho.slice(0, 12) + '…',
    });
  }

  const enviado = cabecalho.slice(7).trim();
  if (!segredosIguais(enviado, esperado)) {
    return res.status(401).json({
      erro: 'Token inválido.',
      dica: 'O token do Value não é o INFORMATIVO_TOKEN cadastrado na Vercel.',
    });
  }

  const corpo = req.body && typeof req.body === 'object' ? req.body : {};

  if (!contatoValido(corpo.contato)) {
    return res.status(400).json({
      erro: 'Campo "contato" inválido.',
      aceitos: CONTATOS.map(c => c.id),
    });
  }

  // limpar:true remove a publicação e devolve a tela ao arquivo de exemplo.
  if (corpo.limpar === true) {
    try {
      await apagar(corpo.contato);
    } catch (e) {
      return res.status(500).json({ erro: 'Falha ao apagar: ' + e.message });
    }
    return res.status(200).json({ ok: true, contato: corpo.contato, apagado: true });
  }

  const mensagem = typeof corpo.mensagem === 'string' ? corpo.mensagem.trim() : '';
  if (!mensagem) {
    return res.status(400).json({ erro: 'Campo "mensagem" vazio.' });
  }
  if (mensagem.length > TAMANHO_MAX) {
    return res.status(413).json({
      erro: 'Mensagem acima de ' + TAMANHO_MAX + ' caracteres.',
      recebido: mensagem.length,
    });
  }

  try {
    await publicar(corpo.contato, { mensagem, gerado_em: corpo.gerado_em });
  } catch (e) {
    // A causa quase sempre é o Blob Store não conectado ao projeto.
    return res.status(500).json({ erro: 'Falha ao gravar: ' + e.message });
  }

  return res.status(200).json({
    ok: true,
    contato: corpo.contato,
    caracteres: mensagem.length,
  });
}
