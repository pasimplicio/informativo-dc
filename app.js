/* Informativo DC — visualizador das mensagens geradas pelas automações.
   O site não calcula nada: consome dados/mensagens.json, que o n8n publica. */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const estado = { contatos: [], id: null };

  /* --------------------------------------------------- markdown WhatsApp --- */

  function escapar(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Marcação do WhatsApp: os delimitadores só valem colados ao texto
   * (`*assim*`), por isso as bordas exigem não-espaço.
   */
  function marcacao(texto) {
    return escapar(texto)
      .replace(/```([\s\S]+?)```/g, '<code>$1</code>')
      .replace(/(^|[\s(])\*(\S(?:[^*\n]*\S)?)\*(?=[\s.,;:!?)]|$)/g, '$1<b>$2</b>')
      .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>')
      .replace(/(^|[\s(])~(\S(?:[^~\n]*\S)?)~(?=[\s.,;:!?)]|$)/g, '$1<s>$2</s>');
  }

  /* ------------------------------------------------------------ formatos --- */

  function hora(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function dataLonga(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /**
   * Horário mostrado no balão e na lista = quando o informativo foi publicado.
   * gerado_em pode vir como data sem hora (ex.: '2026-07-21'), que o navegador
   * lê como meia-noite UTC e exibe como 21:00 do dia anterior no Brasil.
   */
  function quando(c) {
    return c.publicado_em || c.gerado_em;
  }

  function primeiraLinha(msg) {
    return String(msg || '').replace(/[*_~`]/g, '').split('\n').filter(Boolean)[0] || '';
  }

  /* ---------------------------------------------------------------- telas --- */

  function pintarLista() {
    const ul = $('#lista-conversas');
    ul.innerHTML = '';

    for (const c of estado.contatos) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'conversa';
      b.type = 'button';
      b.innerHTML =
        '<span class="avatar">' + escapar(c.inicial) + '</span>' +
        '<span class="conversa-corpo">' +
          '<span class="conversa-linha">' +
            '<span class="conversa-nome">' + escapar(c.nome) + '</span>' +
            '<span class="conversa-hora">' + escapar(hora(quando(c))) + '</span>' +
          '</span>' +
          '<span class="conversa-previa">' + escapar(primeiraLinha(c.mensagem)) + '</span>' +
        '</span>';
      b.addEventListener('click', () => abrir(c.id));
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  function abrir(id) {
    const c = estado.contatos.find(x => x.id === id);
    if (!c) return;

    estado.id = id;
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);

    $('#conversa-nome').textContent = c.nome;
    $('#conversa-sub').textContent = c.horarios ? 'automação · ' + c.horarios : 'automação';
    $('#conversa-avatar').textContent = c.inicial;

    const thread = $('#thread');
    thread.innerHTML = '';

    if (dataLonga(quando(c))) {
      const dia = document.createElement('div');
      dia.className = 'dia';
      dia.textContent = dataLonga(quando(c));
      thread.appendChild(dia);
    }

    if (c.mensagem) {
      const balao = document.createElement('div');
      balao.className = 'balao';
      balao.innerHTML = marcacao(c.mensagem) +
        '<span class="balao-rodape">' + escapar(hora(quando(c))) +
        '<svg viewBox="0 0 16 15" width="15" height="15" aria-hidden="true">' +
        '<path d="M10.9 3.6L5.7 10 3.4 7.7l-.8.8 3.1 3.1 6-7.2zM14.2 3.6L9 10l-.6-.6-.8.9 1.4 1.4 6-7.2z"/>' +
        '</svg></span>';
      thread.appendChild(balao);
    } else {
      const aviso = document.createElement('div');
      aviso.className = 'aviso-thread';
      aviso.textContent = 'Ainda não há informativo publicado para este indicador.';
      thread.appendChild(aviso);
    }

    thread.scrollTop = 0;
    $('#tela-lista').classList.replace('tela-ativa', 'tela-atras');
    $('#tela-conversa').classList.add('tela-ativa');
  }

  function voltar() {
    estado.id = null;
    $('#tela-conversa').classList.remove('tela-ativa');
    $('#tela-lista').classList.replace('tela-atras', 'tela-ativa');
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  /* -------------------------------------------------------------- carga --- */

  /**
   * Tenta os informativos reais publicados pelo n8n; se ainda não houver
   * nenhum (ou a rota falhar), cai no arquivo de exemplo. Assim a tela nunca
   * fica vazia, e o selo do cabeçalho deixa claro qual dos dois está no ar.
   */
  async function buscarDados() {
    try {
      const r = await fetch('/api/mensagens', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.contatos) && j.contatos.length) return j;
      }
    } catch (e) {
      // Segue para o exemplo.
    }

    const r = await fetch('dados/mensagens.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function carregar() {
    let dados;
    try {
      dados = await buscarDados();
    } catch (e) {
      $('#lista-conversas').innerHTML =
        '<li><div class="aviso-thread">Não foi possível carregar os informativos.</div></li>';
      return;
    }

    estado.contatos = Array.isArray(dados.contatos) ? dados.contatos : [];

    // Sem a faixa amarela, o selo no cabeçalho é o que impede números
    // fictícios de passarem por reais.
    if (dados.exemplo) $('#selo-exemplo').hidden = false;

    $('#atualizado').textContent = dados.atualizado_em
      ? 'Atualizado em ' + dataLonga(dados.atualizado_em) + ' às ' + hora(dados.atualizado_em)
      : '';

    pintarLista();

    const alvo = location.hash.slice(1);
    if (alvo && estado.contatos.some(c => c.id === alvo)) abrir(alvo);
  }

  /* ------------------------------------------------------------ eventos --- */

  $('#btn-voltar').addEventListener('click', voltar);
  window.addEventListener('hashchange', () => {
    const alvo = location.hash.slice(1);
    if (alvo && estado.contatos.some(c => c.id === alvo)) abrir(alvo);
    else if (!alvo && estado.id) voltar();
  });

  carregar();
})();
