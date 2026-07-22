/* Registro de acessos — visível apenas para a conta autorizada.
   A restrição real é do servidor; aqui só apresentamos o resultado. */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  const EVENTOS = {
    entrada:  { texto: 'Entrou',   classe: 'ok' },
    saida:    { texto: 'Saiu',     classe: 'neutro' },
    recusado: { texto: 'Recusado', classe: 'erro' },
  };

  const MOTIVOS = {
    dominio: 'conta fora do domínio',
    email: 'e-mail não verificado',
    estado: 'tentativa expirada ou interrompida',
    cancelado: 'cancelou no Google',
    token: 'identidade não validada',
    troca: 'falha na troca com o Google',
    google: 'Google recusou',
    indisponivel: 'autenticação indisponível',
  };

  function escapar(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function dataHora(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /** Navegador e sistema, sem o ruído do user-agent completo. */
  function origem(ev) {
    const a = String(ev.agente || '');
    const navegador =
      /Edg\//.test(a) ? 'Edge' :
      /OPR\//.test(a) ? 'Opera' :
      /Chrome\//.test(a) ? 'Chrome' :
      /Firefox\//.test(a) ? 'Firefox' :
      /Safari\//.test(a) ? 'Safari' : '';
    const sistema =
      /Android/.test(a) ? 'Android' :
      /iPhone|iPad/.test(a) ? 'iOS' :
      /Windows/.test(a) ? 'Windows' :
      /Mac OS/.test(a) ? 'macOS' :
      /Linux/.test(a) ? 'Linux' : '';

    return [navegador, sistema].filter(Boolean).join(' · ') || '—';
  }

  function aviso(texto, tipo) {
    const el = $('#aviso');
    el.textContent = texto;
    el.className = 'aud-aviso ' + (tipo || 'erro');
    el.hidden = false;
  }

  function pintar(eventos) {
    const tbody = $('#linhas');
    tbody.innerHTML = '';

    for (const ev of eventos) {
      const tipo = EVENTOS[ev.evento] || { texto: ev.evento, classe: 'neutro' };
      const motivo = ev.motivo ? MOTIVOS[ev.motivo] || ev.motivo : '';

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="aud-quando">' + escapar(dataHora(ev.quando)) + '</td>' +
        '<td><span class="aud-marca aud-' + tipo.classe + '">' + escapar(tipo.texto) + '</span>' +
          (motivo ? '<span class="aud-motivo">' + escapar(motivo) + '</span>' : '') + '</td>' +
        '<td class="aud-conta">' + escapar(ev.email || '—') + '</td>' +
        '<td class="aud-ip">' + escapar(ev.ip || '—') + '</td>' +
        '<td class="aud-origem">' + escapar(origem(ev)) + '</td>';
      tbody.appendChild(tr);
    }

    $('#total').textContent = eventos.length;
    $('#vazio').hidden = eventos.length > 0;
  }

  async function carregar() {
    const dias = $('#dias').value;

    try {
      const r = await fetch('/api/auditoria?dias=' + encodeURIComponent(dias), { cache: 'no-store' });

      if (r.status === 403) {
        const j = await r.json().catch(() => ({}));
        aviso(j.detalhe || 'Acesso restrito.', 'erro');
        $('#conteudo').hidden = true;
        return;
      }
      if (r.status === 401) { location.href = '/?next=/auditoria'; return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);

      const j = await r.json();
      $('#aviso').hidden = true;
      $('#conteudo').hidden = false;
      pintar(j.eventos || []);
    } catch (e) {
      aviso('Não foi possível carregar o registro de acessos.', 'erro');
    }
  }

  async function identificar() {
    try {
      const r = await fetch('/api/auth/status', { cache: 'no-store' });
      const s = r.ok ? await r.json() : {};
      if (s.email) $('#topo-email').textContent = s.email;
    } catch (e) { /* sem identificação no cabeçalho */ }
  }

  $('#dias').addEventListener('change', carregar);

  identificar();
  carregar();
})();
