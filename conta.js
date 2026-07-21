/* Menu da conta e saída do informativo.
 *
 * Separado de app.js de propósito: aquele cuida das mensagens, este da sessão.
 */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  const botao = $('#btn-conta');
  const menu = $('#menu-conta');
  const email = $('#menu-email');
  const avatar = $('#menu-avatar');
  const itemSair = $('#menu-sair');

  const folha = $('#folha-sair');
  const cancelar = $('#folha-cancelar');
  const confirmar = $('#folha-confirmar');

  if (!botao || !menu) return;

  let focoAnterior = null;

  /* ----------------------------------------------------------- sessão --- */

  /**
   * Em modo demonstração não há sessão: o menu passa a oferecer a entrada em
   * vez da saída. Um "Sair" que não sai seria pior que não ter menu.
   */
  async function carregarConta() {
    try {
      const r = await fetch('/api/auth/status', { cache: 'no-store' });
      const s = r.ok ? await r.json() : {};

      if (s.autenticado && s.email) {
        email.textContent = s.email;
        avatar.textContent = iniciais(s.email);
        return;
      }
      virarModoDemo();
    } catch (e) {
      virarModoDemo();
    }
  }

  function virarModoDemo() {
    email.textContent = 'Modo demonstração';
    avatar.textContent = '—';
    itemSair.textContent = 'Entrar com conta CAEMA';
    itemSair.classList.remove('menu-item-perigo');
    itemSair.dataset.acao = 'entrar';
  }

  function iniciais(mail) {
    const nome = String(mail).split('@')[0];
    const partes = nome.split(/[._-]+/).filter(Boolean);
    return ((partes[0] || '?')[0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
  }

  /* ------------------------------------------------------------- menu --- */

  function abrir() {
    focoAnterior = document.activeElement;
    menu.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    itemSair.focus();
    document.addEventListener('keydown', teclaMenu);
    // Em captura: fecha antes que o clique chegue ao conteúdo atrás.
    document.addEventListener('pointerdown', cliqueFora, true);
  }

  function fechar({ devolverFoco = true } = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', teclaMenu);
    document.removeEventListener('pointerdown', cliqueFora, true);
    if (devolverFoco && focoAnterior) focoAnterior.focus();
  }

  function cliqueFora(e) {
    if (!menu.contains(e.target) && !botao.contains(e.target)) fechar({ devolverFoco: false });
  }

  function teclaMenu(e) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    // Só há um item hoje; as setas existem para o menu crescer sem virar
    // armadilha de teclado.
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      itemSair.focus();
    }
  }

  botao.addEventListener('click', () => (menu.hidden ? abrir() : fechar()));

  /* -------------------------------------------------------- sair/entrar --- */

  itemSair.addEventListener('click', () => {
    if (itemSair.dataset.acao === 'entrar') {
      location.href = '/?next=' + encodeURIComponent('/informativo');
      return;
    }
    fechar({ devolverFoco: false });
    abrirFolha();
  });

  function abrirFolha() {
    folha.hidden = false;
    confirmar.focus();
    document.addEventListener('keydown', teclaFolha);
  }

  function fecharFolha() {
    folha.hidden = true;
    document.removeEventListener('keydown', teclaFolha);
    botao.focus();
  }

  function teclaFolha(e) {
    if (e.key === 'Escape') { e.preventDefault(); fecharFolha(); return; }

    // Prende o foco entre os dois botões enquanto o diálogo está aberto.
    if (e.key === 'Tab') {
      const foco = [cancelar, confirmar];
      const i = foco.indexOf(document.activeElement);
      if (i === -1) { e.preventDefault(); confirmar.focus(); return; }
      const proximo = e.shiftKey ? (i + foco.length - 1) % foco.length : (i + 1) % foco.length;
      e.preventDefault();
      foco[proximo].focus();
    }
  }

  cancelar.addEventListener('click', fecharFolha);

  folha.addEventListener('pointerdown', e => {
    if (e.target === folha) fecharFolha();  // toque no scrim
  });

  confirmar.addEventListener('click', () => {
    confirmar.disabled = true;
    cancelar.disabled = true;
    confirmar.textContent = 'Saindo…';
    location.href = '/api/auth/sair';
  });

  carregarConta();
})();
