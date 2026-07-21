/* Conta e saída, no cabeçalho da página.
 *
 * Ficava dentro do menu de três pontos do celular simulado, buscando fidelidade
 * ao WhatsApp — mas ninguém procura o botão de sair dentro de uma maquete.
 * Agora a maquete exibe apenas o conteúdo; conta e saída são da página.
 */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  const email = $('#topo-email');
  const btnSair = $('#btn-sair');
  const linkEntrar = $('#link-entrar');

  const folha = $('#folha-sair');
  const cancelar = $('#folha-cancelar');
  const confirmar = $('#folha-confirmar');

  if (!btnSair || !folha) return;

  /* ----------------------------------------------------------- sessão --- */

  async function carregarConta() {
    try {
      const r = await fetch('/api/auth/status', { cache: 'no-store' });
      const s = r.ok ? await r.json() : {};

      if (s.autenticado && s.email) {
        email.textContent = s.email;
        btnSair.hidden = false;
        return;
      }
      // Sem sessão (modo demonstração): oferecer a entrada, não a saída.
      email.textContent = '';
      linkEntrar.hidden = false;
    } catch (e) {
      email.textContent = '';
      linkEntrar.hidden = false;
    }
  }

  /* ------------------------------------------------------------- saída --- */

  let focoAnterior = null;

  function abrirFolha() {
    focoAnterior = document.activeElement;
    folha.hidden = false;
    confirmar.focus();
    document.addEventListener('keydown', tecla);
  }

  function fecharFolha() {
    folha.hidden = true;
    document.removeEventListener('keydown', tecla);
    if (focoAnterior) focoAnterior.focus();
  }

  function tecla(e) {
    if (e.key === 'Escape') { e.preventDefault(); fecharFolha(); return; }

    // Prende o foco entre os dois botões enquanto o diálogo está aberto.
    if (e.key === 'Tab') {
      const foco = [cancelar, confirmar];
      const i = foco.indexOf(document.activeElement);
      e.preventDefault();
      if (i === -1) { confirmar.focus(); return; }
      foco[e.shiftKey ? (i + foco.length - 1) % foco.length : (i + 1) % foco.length].focus();
    }
  }

  btnSair.addEventListener('click', abrirFolha);
  cancelar.addEventListener('click', fecharFolha);

  folha.addEventListener('pointerdown', e => {
    if (e.target === folha) fecharFolha();  // clique no fundo escurecido
  });

  confirmar.addEventListener('click', () => {
    confirmar.disabled = true;
    cancelar.disabled = true;
    confirmar.textContent = 'Saindo…';
    location.href = '/api/auth/sair';
  });

  carregarConta();
})();
