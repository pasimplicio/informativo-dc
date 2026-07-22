import { lerTodos } from '../lib/informativos.js';

/**
 * Entrega à tela os informativos publicados.
 *
 * Não confere sessão aqui: /api/mensagens está no matcher do middleware, que
 * já barra quem não tem sessão válida antes de a rota executar.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    const dados = await lerTodos();

    // Nada publicado ainda é situação normal (antes da primeira execução dos
    // workflows), não erro. A tela cai no exemplo.
    if (!dados.contatos.length) {
      return res.status(200).json({ vazio: true, contatos: [] });
    }
    return res.status(200).json(dados);
  } catch (e) {
    return res.status(500).json({ erro: e.message, contatos: [] });
  }
}
