/* Tela de entrada do Informativo DC.
 *
 * Consulta /api/auth/status para saber se o acesso corporativo esta disponivel.
 * Enquanto nao estiver, mantem o botao desabilitado e oferece a demonstracao --
 * em vez de mandar o usuario para uma rota que nao existe.
 */

(function () {
  'use strict';

  const botao = document.getElementById('btnGoogle');
  const caixa = document.getElementById('authMessage');
  const demo = document.getElementById('acessoDemo');

  /** Mensagens de retorno. O callback so devolve um codigo curto, nunca detalhe tecnico. */
  const MOTIVOS = {
    dominio: { texto: 'Esta conta não pertence ao domínio caema.ma.gov.br. Entre com sua conta corporativa.', tipo: 'error' },
    cancelado: { texto: 'Entrada cancelada.', tipo: 'warning' },
    sessao: { texto: 'Sua sessão expirou. Entre novamente.', tipo: 'warning' },
    email: { texto: 'O e-mail desta conta não está verificado no Google.', tipo: 'error' },
    estado: { texto: 'A tentativa de entrada expirou ou foi interrompida. Tente de novo.', tipo: 'warning' },
    troca: { texto: 'Não foi possível concluir a entrada com o Google. Tente de novo.', tipo: 'error' },
    token: { texto: 'Não foi possível validar sua identidade. Tente de novo.', tipo: 'error' },
    google: { texto: 'O Google recusou a entrada. Tente de novo.', tipo: 'error' },
    indisponivel: { texto: 'A autenticação não está configurada neste ambiente.', tipo: 'warning' },
  };

  function aviso(texto, tipo) {
    caixa.textContent = texto;
    caixa.className = 'auth-message visible ' + (tipo || 'error');
  }

  function destino() {
    const p = new URLSearchParams(location.search).get('next');
    // So caminhos internos: evita virar redirecionador aberto para outro site.
    return p && p.startsWith('/') && !p.startsWith('//') ? p : '/informativo';
  }

  function mostrarRetorno() {
    const q = new URLSearchParams(location.search);
    const erro = q.get('erro');
    if (erro && MOTIVOS[erro]) {
      aviso(MOTIVOS[erro].texto, MOTIVOS[erro].tipo);
    } else if (q.get('saiu')) {
      aviso('Você saiu do informativo.', 'warning');
    }
    // Limpa a barra de enderecos para o aviso nao reaparecer ao recarregar.
    if (erro || q.get('saiu')) {
      const limpa = q.get('next') ? '?next=' + encodeURIComponent(q.get('next')) : '';
      history.replaceState(null, '', location.pathname + limpa);
    }
  }

  async function iniciar() {
    mostrarRetorno();

    try {
      const r = await fetch('/api/auth/status', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const s = await r.json();

      if (!s.configurado) throw new Error('nao configurado');

      // Sessao ainda valida: nao faz sentido pedir login de novo.
      if (s.autenticado) {
        location.replace(destino());
        return;
      }

      botao.disabled = false;
    } catch (e) {
      botao.disabled = true;
      if (!caixa.classList.contains('visible')) {
        aviso(
          'O acesso com conta corporativa ainda não foi liberado neste ambiente. ' +
          'Enquanto isso, o informativo exibe dados de demonstração.',
          'warning'
        );
      }
      // Sem isto a entrada nao levaria a lugar nenhum. Some quando o OAuth entrar.
      if (demo) demo.hidden = false;
    }
  }

  botao.addEventListener('click', () => {
    botao.disabled = true;
    location.href = '/api/auth/google?next=' + encodeURIComponent(destino());
  });

  botao.disabled = true;
  iniciar();
})();
