/* Tela de login do Informativo DC.
 *
 * A autenticacao (Google, dominio caema.ma.gov.br) e a Fase 1 e ainda nao esta
 * publicada. Em vez de mandar o usuario para uma rota inexistente, a tela
 * consulta /api/auth/status e mostra o estado real.
 *
 * Quando a Fase 1 subir, o endpoint passa a responder { configurado: true } e
 * esta mesma tela comeca a funcionar sem alteracao.
 */

(function () {
  'use strict';

  const botao = document.getElementById('btnGoogle');
  const caixa = document.getElementById('authMessage');

  function aviso(texto, tipo) {
    caixa.textContent = texto;
    caixa.className = 'auth-message visible ' + (tipo || 'error');
  }

  /** Destino pos-login, preservado entre a ida e a volta do OAuth. */
  function proximoDestino() {
    const p = new URLSearchParams(location.search).get('next');
    // So caminhos internos: evita virar redirecionador aberto para outro site.
    return p && p.startsWith('/') && !p.startsWith('//') ? p : '/';
  }

  async function verificarDisponibilidade() {
    try {
      const r = await fetch('/api/auth/status', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const s = await r.json();
      if (!s.configurado) throw new Error('nao configurado');
      botao.disabled = false;
    } catch (e) {
      botao.disabled = true;
      aviso(
        'O acesso com conta corporativa ainda não foi liberado neste ambiente. ' +
        'Enquanto isso, o informativo exibe dados de demonstração.',
        'warning'
      );
    }
  }

  botao.addEventListener('click', () => {
    botao.disabled = true;
    location.href = '/api/auth/google?next=' + encodeURIComponent(proximoDestino());
  });

  botao.disabled = true;
  verificarDisponibilidade();
})();
