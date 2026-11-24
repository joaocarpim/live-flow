// Telas do liveflow no VS Code. Só interface: quem testa é a CLI (sem IA).
// Tudo é montado com h() (textContent), nunca com innerHTML de dados do usuário.
(function () {
  const vscode = acquireVsCodeApi();
  const modo = document.body.dataset.modo;
  const logo = document.body.dataset.logo;
  const raiz = document.getElementById('app');

  const S = {
    tela: 'cards',
    estado: null,
    sel: new Set(),
    busca: '',
    filtro: 'todos',
    cardAberto: null,
    plano: {},
    blocos: null,
    blocosIds: [],
    modoExec: 'completo',
    aoVivo: true,
    exec: null,
    resultados: null,
    problema: null,
    prompts: {},
    textoCards: '',
    carregando: true,
  };

  // ---------- utilidades ----------
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const grade = el.classList.contains('grade');
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      // na grade, cada texto vira uma célula (rótulo / valor)
      if (grade && !(f instanceof Node)) { const c = document.createElement('span'); c.textContent = String(f); el.append(c); continue; }
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }
  const enviar = (m) => vscode.postMessage(m);
  const svg = (d, cor) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('class', 'icone');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', cor || 'currentColor');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    for (const p of d.split('|')) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', p);
      el.append(path);
    }
    return el;
  };
  const I = {
    play: 'M7 5l12 7-12 7z',
    branch: 'M6 3v12|M18 9a3 3 0 1 0 0-.01|M6 21a3 3 0 1 0 0-.01|M18 9a9 9 0 0 1-9 9',
    celular: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z|M11 18h2',
    ok: 'M5 12l5 5L20 7',
    x: 'M6 6l12 12|M18 6L6 18',
    alerta: 'M12 3l10 18H2z|M12 10v4|M12 17v.01',
    info: 'M12 8v.01|M11 12h1v5h1|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    abrir: 'M14 4h6v6|M20 4l-9 9|M18 14v6H4V6h6',
    copiar: 'M9 9h11v11H9z|M5 15H4V4h11v1',
    gravar: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    voltar: 'M15 18l-6-6 6-6',
    recarregar: 'M4 4v6h6|M20 20v-6h-6|M5 15a8 8 0 0 0 14 3|M19 9A8 8 0 0 0 5 6',
    lampada: 'M9 18h6|M10 21h4|M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
    cadeado: 'M6 11h12v9H6z|M8 11V7a4 4 0 0 1 8 0v4',
    pessoa: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0',
  };

  const cards = () => (S.estado && S.estado.cards) || [];
  const cardPorId = (id) => cards().find((c) => c.card.id === id);
  const historicoDe = (id) => ((S.estado && S.estado.historico && S.estado.historico.historico) || {})[id] || [];
  const ultimo = (id) => { const h = historicoDe(id); return h.length ? h[h.length - 1].resultado : null; };
  const ROT = { passou: 'passou', falhou: 'falhou', instavel: 'instável', nao_rodou: 'não rodou', nao_se_aplica: 'não se aplica' };

  function descrever(p) {
    const quem = '';
    switch (p.acao) {
      case 'abrir': return quem + 'abrir ' + p.caminho;
      case 'clicar': return 'clicar em "' + p.alvo + '"';
      case 'preencher': return 'preencher "' + p.campo + '" com ' + (/segredo:/.test(p.valor) ? '•••• (segredo)' : '"' + p.valor + '"');
      case 'selecionar': return 'selecionar "' + p.opcao + '" em "' + p.campo + '"';
      case 'marcar': return 'marcar "' + p.campo + '"';
      case 'enviar_arquivo': return 'enviar ' + p.arquivos.join(', ') + ' em "' + p.campo + '"';
      case 'ver_texto': return 'ver "' + p.texto + '"';
      case 'nao_ver_texto': return 'não ver "' + p.texto + '"';
      case 'ver_url': return 'estar em ' + p.padrao;
      case 'guardar': return 'guardar {{' + p.nome + '}} ' + (p.da_url ? 'da URL' : 'do texto da tela');
      case 'api': return p.metodo + ' ' + p.rota + ' → ' + p.status + (p.guardar ? ' · guarda ' + Object.keys(p.guardar).join(', ') : '');
      case 'ver_email': return 'ver e-mail para ' + p.para + (p.assunto ? ' ("' + p.assunto + '")' : '') + (p.guardar_link ? ' · guarda o link' : '');
      case 'conferir_manual': return 'conferir à mão: ' + p.texto;
      case 'esperar_ms': return 'esperar ' + p.ms + ' ms';
    }
    return p.acao;
  }

  function pillEstado(c) {
    if (c.estado === 'pronto') return h('span', { class: 'pill verde' }, svg(I.ok), 'pronto');
    if (c.estado === 'sem_passos') return h('span', { class: 'pill ambar' }, 'falta o passo a passo');
    return h('span', { class: 'pill verm' }, 'com erro no artefato');
  }
  function chipsDoCard(card) {
    return [
      card.branch ? h('span', { class: 'chip' }, svg(I.branch), card.entregue ? 'main (entregue)' : card.branch) : h('span', { class: 'chip' }, 'checkout atual'),
      card.tipo === 'jornada' ? h('span', { class: 'chip' }, 'jornada: ' + (card.etapas || []).join(' → ')) : null,
      card.dispositivo === 'celular' ? h('span', { class: 'chip' }, svg(I.celular), 'celular') : null,
      card.depende_de && card.depende_de.length ? h('span', { class: 'chip' }, 'depende de ' + card.depende_de.join(', ')) : null,
      card.exclusivo ? h('span', { class: 'chip' }, 'roda sozinho') : null,
      [...new Set((card.como_testar || []).map((p) => p.como).filter(Boolean))].map((c) => h('span', { class: 'chip conta-chip' }, svg(I.pessoa), c)),
    ];
  }

  // ---------- topo ----------
  function topo() {
    const nSel = S.sel.size;
    const exec = S.exec && !S.exec.fim;
    const falhas = (S.resultados || []).filter((r) => r.resultado === 'falhou').length;
    const aba = (id, rot, conta, cls) => h('button', { class: 'aba' + (S.tela === id || (id === 'cards' && S.tela === 'card') || (id === 'resultados' && S.tela === 'problema') ? ' ativa' : ''), onclick: () => ir(id) }, rot, conta !== undefined && conta !== null ? h('span', { class: 'conta ' + (cls || '') }, conta) : null);
    return h('div', { class: 'topo' },
      h('div', { class: 'topo-linha' },
        h('div', { class: 'marca' }, h('img', { src: logo, alt: '' }), 'liveflow'),
        h('span', { class: 'repo' }, S.estado ? S.estado.repo.split(/[\\/]/).pop() : ''),
        h('span', { class: 'espaco' }),
        h('button', { class: 'btn peq', onclick: () => { S.carregando = true; enviar({ tipo: 'recarregar' }); render(); } }, svg(I.recarregar), 'Recarregar'),
      ),
      h('div', { class: 'abas' },
        aba('cards', 'Cards', cards().length),
        aba('blocos', 'Blocos', nSel || null),
        aba('execucao', 'Execução', exec ? 'rodando' : null, 'azul'),
        aba('resultados', 'Resultados', S.resultados ? (falhas ? falhas + ' falha(s)' : S.resultados.length) : null, falhas ? 'verm' : ''),
        aba('criar', 'Criar artefato'),
        aba('ambiente', 'Ambiente', ambienteFaltas() || null, ambienteFaltas() ? 'verm' : ''),
        aba('historico', 'Histórico'),
      ),
    );
  }
  function ambienteFaltas() {
    const a = S.estado && S.estado.ambiente;
    const seg = ((S.estado && S.estado.segredos) || []).filter((s) => !s.definido).length;
    return (a ? a.itens.filter((i) => !i.ok && !i.opcional).length : 0) + seg;
  }

  function ir(tela, extra) {
    S.tela = tela;
    Object.assign(S, extra || {});
    if (tela === 'blocos') pedirBlocos();
    window.scrollTo(0, 0);
    render();
  }

  // ---------- telas ----------
  function telaCards() {
    const todos = cards();
    if (S.estado && S.estado.erro && !todos.length) return [vazio('Não consegui ler os cards', S.estado.erro)];
    if (!todos.length) {
      return [h('div', { class: 'vazio' },
        h('h2', {}, 'Este projeto ainda não tem cards'),
        h('p', {}, 'O liveflow testa os cards do artefato .liveflow/cards.yaml. Crie o artefato com os seus cards (o Claude escreve o passo a passo) ou comece pelo exemplo.'),
        h('div', { class: 'acoes', style: 'justify-content:center' },
          h('button', { class: 'btn pri', onclick: () => enviar({ tipo: 'acao', qual: 'iniciar' }) }, 'Criar artefato de exemplo'),
          h('button', { class: 'btn', onclick: () => ir('criar') }, 'Criar artefato com os meus cards')))];
    }
    const prontos = todos.filter((c) => c.estado === 'pronto');
    const b = S.busca.toLowerCase();
    const filtrados = todos.filter((c) => (S.filtro === 'todos' || (S.filtro === 'prontos' ? c.estado === 'pronto' : c.estado !== 'pronto')) && (!b || (c.card.id + ' ' + c.card.titulo + ' ' + (c.card.branch || '')).toLowerCase().includes(b)));
    const semPassos = todos.filter((c) => c.estado === 'sem_passos').length;
    const invalidos = todos.filter((c) => c.estado === 'invalido').length;
    return [
      h('div', { class: 'cab' }, h('h1', {}, 'Cards'),
        h('span', { class: 'pill verde' }, prontos.length + ' prontos'),
        semPassos ? h('span', { class: 'pill ambar' }, semPassos + ' sem passo a passo') : null,
        invalidos ? h('span', { class: 'pill verm' }, invalidos + ' com erro') : null,
        h('span', { class: 'espaco' }),
        h('button', { class: 'btn', onclick: () => enviar({ tipo: 'abrirYaml' }) }, svg(I.abrir), 'Abrir cards.yaml')),
      semPassos ? h('div', { class: 'aviso ambar' }, svg(I.info, 'var(--ambar)'), h('span', {}, 'Card sem passo a passo não pode ser testado. Abra o card para gravar o fluxo no navegador ou pedir o passo a passo ao Claude.')) : null,
      h('div', { class: 'filtros' },
        h('input', { class: 'busca', placeholder: 'Buscar por id, título ou branch', value: S.busca, oninput: (e) => { S.busca = e.target.value; render(true); } }),
        h('div', { class: 'segm' }, [['todos', 'Todos'], ['prontos', 'Prontos'], ['pendentes', 'Pendentes']].map(([k, r]) => h('button', { class: S.filtro === k ? 'on' : '', onclick: () => { S.filtro = k; render(); } }, r))),
        h('button', { class: 'btn', onclick: () => { prontos.forEach((c) => S.sel.add(c.card.id)); render(); } }, 'Selecionar prontos'),
        S.sel.size ? h('button', { class: 'btn', onclick: () => { S.sel.clear(); render(); } }, 'Limpar') : null),
      h('div', { class: 'cards-lista' }, filtrados.map(itemCard)),
    ];
  }
  function itemCard(c) {
    const pronto = c.estado === 'pronto';
    const sel = S.sel.has(c.card.id);
    const ult = ultimo(c.card.id);
    return h('div', { class: 'card-item' + (sel ? ' sel' : ''), onclick: () => ir('card', { cardAberto: c.card.id, planoPedido: enviar({ tipo: 'plano', id: c.card.id, modo: S.modoExec }) }) },
      h('input', { type: 'checkbox', checked: sel, disabled: !pronto, title: pronto ? 'Selecionar para testar' : 'Precisa do passo a passo', onclick: (e) => { e.stopPropagation(); if (!pronto) return; sel ? S.sel.delete(c.card.id) : S.sel.add(c.card.id); render(); } }),
      h('span', { class: 'm mudo', style: 'padding-top:2px' }, c.card.id),
      h('div', {},
        h('div', { class: 'titulo' }, c.card.titulo || '(sem título)'),
        h('div', { class: 'meta' }, chipsDoCard(c.card), pronto ? h('span', { class: 'chip' }, c.card.como_testar.length + ' passos') : null),
        !pronto ? h('div', { class: 'prob' }, c.problemas[0]) : null),
      h('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:8px' },
        pillEstado(c),
        ult ? h('span', { class: 'peq mudo', style: 'display:flex;gap:6px;align-items:center' }, h('span', { class: 'ponto ' + ult }), 'última: ' + ROT[ult]) : null),
    );
  }

  function telaCard() {
    const c = cardPorId(S.cardAberto);
    if (!c) return [vazio('Card não encontrado', '')];
    const card = c.card;
    const provados = new Map();
    card.como_testar.forEach((p) => { if (p.criterio) provados.set(p.criterio, [...(provados.get(p.criterio) || []), p.n]); });
    const plano = S.plano[card.id];
    const hist = historicoDe(card.id);
    return [
      h('button', { class: 'voltar', onclick: () => ir('cards') }, svg(I.voltar), 'Cards'),
      h('div', { class: 'cab' }, h('span', { class: 'id' }, card.id), h('h1', {}, card.titulo), pillEstado(c), h('span', { class: 'espaco' }),
        c.estado === 'pronto' ? h('button', { class: 'btn pri', onclick: () => { S.sel = new Set([card.id]); S.aoVivo = true; ir('blocos'); } }, svg(I.play), 'Testar este card') : null),
      h('div', { class: 'meta acoes' }, chipsDoCard(card)),
      c.estado !== 'pronto' ? h('div', { class: c.estado === 'invalido' ? 'aviso verm' : 'aviso ambar' }, svg(I.alerta, c.estado === 'invalido' ? 'var(--vermelho)' : 'var(--ambar)'),
        h('div', {}, h('b', {}, c.estado === 'invalido' ? 'O card tem erro no artefato' : 'Este card ainda não pode ser testado'), h('div', { class: 'peq', style: 'margin-top:4px' }, c.problemas.map((p) => h('div', {}, p))))) : null,
      h('div', { class: 'acoes' },
        h('button', { class: 'btn', onclick: () => { const cam = card.como_testar[0] && card.como_testar[0].caminho || '/'; enviar({ tipo: 'gravar', id: card.id, caminho: cam }); } }, svg(I.gravar, 'var(--vermelho)'), c.estado === 'pronto' ? 'Regravar passo a passo' : 'Gravar passo a passo no navegador'),
        h('button', { class: 'btn', onclick: () => { enviar({ tipo: 'prompt', qual: 'passos', id: card.id }); ir('problema', { problema: { modo: 'passos', card: card.id } }); } }, svg(I.lampada), 'Pedir passo a passo ao Claude'),
        h('button', { class: 'btn', onclick: () => enviar({ tipo: 'abrirYaml', id: card.id }) }, svg(I.abrir), 'Abrir no cards.yaml')),
      h('div', { class: 'duas' },
        h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Critérios de aceite'), h('span', { class: 'espaco' }), card.criterios.length ? h('span', { class: 'peq mudo' }, provados.size + ' de ' + card.criterios.length + ' com passo que prova') : null),
            card.criterios.length ? h('div', { class: 'lista' }, card.criterios.map((t, i) => h('div', { class: 'linha' },
              h('span', { class: 'm mudo' }, String(i + 1)), h('span', { style: 'flex:1' }, t),
              provados.has(i + 1) ? h('span', { class: 'chip crit' }, 'passo ' + provados.get(i + 1).join(', ')) : h('span', { class: 'chip', style: 'color:var(--ambar)' }, 'nenhum passo prova')))) : h('div', { class: 'mudo peq' }, 'Sem critérios. O Claude pode propor ao escrever o passo a passo.')),
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Passo a passo'), h('span', { class: 'espaco' }), h('span', { class: 'peq mudo' }, card.como_testar.length + ' passos')),
            card.como_testar.length ? h('div', { class: 'lista' }, card.como_testar.map((p) => h('div', { class: 'passo' },
              h('span', { class: 'n' }, String(p.n)),
              h('div', {}, h('div', {}, descrever(p)), h('div', { class: 'acoes', style: 'margin-top:4px;gap:6px' }, p.como ? h('span', { class: 'chip conta-chip' }, svg(I.pessoa), p.como) : null, p.etapa ? h('span', { class: 'chip' }, 'etapa ' + p.etapa) : null)),
              p.criterio ? h('span', { class: 'chip crit' }, 'prova ' + p.criterio) : h('span', {})))) : h('div', { class: 'mudo peq' }, 'Vazio.'))),
        h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Como roda')),
            h('div', { class: 'grade' },
              'Código', card.entregue ? 'main (card entregue: regressão)' : (card.branch || 'checkout atual'),
              'Tela', card.dispositivo === 'celular' ? 'celular (390 px, toque)' : 'computador (1280 px)',
              'Depende de', card.depende_de.length ? card.depende_de.join(', ') : '—',
              'Altera', card.altera.length ? card.altera.join(', ') : '—',
              'Paralelo', card.exclusivo ? 'sempre sozinho' : 'pode rodar junto, se os dados forem isolados')),
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Camadas de teste'), h('span', { class: 'espaco' }),
            h('div', { class: 'segm' }, ['rapido', 'completo', 'noturno'].map((m) => h('button', { class: S.modoExec === m ? 'on' : '', onclick: () => { S.modoExec = m; enviar({ tipo: 'plano', id: card.id, modo: m }); render(); } }, { rapido: 'Rápido', completo: 'Completo', noturno: 'Noturno' }[m])))),
            plano ? camadas(plano) : h('div', { class: 'mudo peq' }, 'Carregando…')),
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Histórico')),
            hist.length ? h('div', {}, h('div', { class: 'hist' }, hist.slice(-20).map((l) => h('span', { class: 'ponto ' + l.resultado, title: l.quando + ' · ' + ROT[l.resultado] }))), h('div', { class: 'peq mudo', style: 'margin-top:8px' }, hist.length + ' execução(ões); última: ' + ROT[hist[hist.length - 1].resultado])) : h('div', { class: 'mudo peq' }, 'Ainda não foi testado.')))),
    ];
  }
  function camadas(plano) {
    const grupos = { estatica: 'Código', dependencias: 'Código', unitaria: 'Código', propriedades: 'Código', mutacao: 'Código', integracao: 'API e dados', contrato: 'API e dados', permissoes: 'API e dados', webhooks: 'API e dados', migracao: 'API e dados', fluxo: 'Interface', navegadores: 'Interface', offline: 'Interface', acessibilidade: 'Interface', desempenho: 'Interface', ataques: 'Segurança', sessao: 'Segurança', upload: 'Segurança', fuzzing: 'Segurança', concorrencia: 'Segurança', lgpd: 'Segurança', resiliencia: 'Robustez', vizinhos: 'Robustez', carga: 'Robustez', soak: 'Robustez' };
    const nomes = { estatica: 'Estática', dependencias: 'Dependências vulneráveis', unitaria: 'Unitária', propriedades: 'Propriedades, datas e formatos BR', mutacao: 'Mutação (linhas do card)', integracao: 'Integração', contrato: 'Contrato (OpenAPI)', permissoes: 'Permissões por perfil', webhooks: 'Webhooks e filas', migracao: 'Migração de banco', fluxo: 'Fluxo completo', navegadores: 'Navegadores e celular', offline: 'Offline e rede ruim', acessibilidade: 'Acessibilidade e visual', desempenho: 'Desempenho da página', ataques: 'Ataques comuns', sessao: 'Sessão e cabeçalhos', upload: 'Upload de arquivos', fuzzing: 'Entradas aleatórias', concorrencia: 'Concorrência e envio duplo', lgpd: 'Dados pessoais (LGPD)', resiliencia: 'Resiliência', vizinhos: 'Regressão dos vizinhos', carga: 'Carga e sobrecarga', soak: 'Teste longo (soak)' };
    const est = { vai_rodar: ['vai rodar', 'var(--verde)'], nao_se_aplica: ['não se aplica', 'var(--cinza)'], outro_modo: ['outro modo', 'var(--azul)'] };
    const ordem = ['Código', 'API e dados', 'Interface', 'Segurança', 'Robustez'];
    const rodam = plano.filter((p) => p.estado === 'vai_rodar').length;
    const futuras = plano.filter((p) => p.estado === 'ainda_nao_implementada').length;
    const blocos = ordem.map((g) => {
      const doGrupo = plano.filter((p) => grupos[p.camada] === g);
      const ativas = doGrupo.filter((p) => p.estado !== 'ainda_nao_implementada');
      const depois = doGrupo.filter((p) => p.estado === 'ainda_nao_implementada');
      const n = doGrupo.filter((p) => p.estado === 'vai_rodar').length;
      return h('div', {},
        h('div', { class: 'grupo-camada', style: 'display:flex;gap:8px;align-items:center' }, g, h('span', { class: 'espaco' }), h('span', { style: 'font-weight:500;letter-spacing:0;text-transform:none;color:' + (n ? 'var(--verde)' : 'var(--cinza)') }, n + ' de ' + doGrupo.length)),
        ativas.map((p) => h('div', { class: 'camada' }, h('span', { style: p.estado === 'vai_rodar' ? 'font-weight:500' : 'color:var(--mudo)' }, nomes[p.camada] || p.camada), h('span', { class: 'peq', style: 'color:' + est[p.estado][1] + ';font-weight:500' }, est[p.estado][0]), h('span', { class: 'peq mudo' }, p.motivo || ''))),
        depois.length ? h('div', { class: 'peq', style: 'color:var(--cinza);padding:4px 0 2px;display:flex;gap:6px;flex-wrap:wrap;align-items:center' }, 'ainda não rodam:', depois.map((p) => h('span', { class: 'chip', style: 'opacity:.75' }, nomes[p.camada] || p.camada))) : null);
    });
    return h('div', {},
      h('div', { style: 'display:flex;gap:3px;margin-bottom:6px' }, plano.map((p) => h('i', { title: (nomes[p.camada] || p.camada) + ': ' + (est[p.estado] ? est[p.estado][0] : 'ainda não roda'), style: 'display:block;height:8px;flex:1;border-radius:2px;background:' + (p.estado === 'vai_rodar' ? 'var(--verde)' : p.estado === 'outro_modo' ? 'color-mix(in srgb, var(--azul) 55%, transparent)' : p.estado === 'nao_se_aplica' ? 'transparent;border:1px dashed var(--cinza)' : 'var(--linha)') }))),
      h('div', { class: 'peq mudo', style: 'margin-bottom:6px' }, rodam + ' de ' + plano.length + ' camadas rodam neste modo' + (futuras ? ' · ' + futuras + ' chegam nas próximas versões do liveflow' : '') + '.'),
      blocos);
  }
  function pedirBlocos() {
    const ids = [...S.sel];
    S.blocosIds = ids;
    S.blocos = null;
    if (ids.length) enviar({ tipo: 'blocos', ids });
  }
  function telaBlocos() {
    const ids = [...S.sel];
    if (!ids.length) return [vazio('Nenhum card selecionado', 'Escolha os cards na aba Cards. Cards da mesma branch viram um bloco e dividem o mesmo app.'), h('div', { class: 'acoes', style: 'justify-content:center' }, h('button', { class: 'btn pri', onclick: () => ir('cards') }, 'Escolher cards'))];
    const p = S.blocos;
    const um = ids.length === 1;
    const modos = [['rapido', 'Rápido', 'Fluxo completo. Para rodar enquanto programa.'], ['completo', 'Completo', 'Fluxo + regressão dos cards vizinhos. Antes de entregar.'], ['noturno', 'Noturno', 'Tudo do completo; carga e teste longo quando existirem.']];
    return [
      h('div', { class: 'cab' }, h('h1', {}, 'Como os cards vão rodar'), h('span', { class: 'pill cinza' }, ids.length + ' card(s)'), p ? h('span', { class: 'pill cinza' }, p.blocos.length + ' bloco(s)') : null, h('span', { class: 'espaco' }),
        h('button', { class: 'btn pri', disabled: !p || !p.blocos.length || (S.exec && !S.exec.fim), onclick: comecar }, svg(I.play), 'Começar')),
      h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Modo')),
        h('div', { class: 'modos' }, modos.map(([k, t, d]) => h('button', { class: 'modo' + (S.modoExec === k ? ' on' : ''), onclick: () => { S.modoExec = k; render(); } }, h('b', {}, t), h('span', { class: 'peq mudo' }, d)))),
        h('label', { class: 'acoes', style: 'margin-top:12px;color:' + (um ? 'var(--texto)' : 'var(--mudo)') },
          h('input', { type: 'checkbox', checked: S.aoVivo, onchange: (e) => { S.aoVivo = e.target.checked; render(); } }),
          um ? 'Assistir ao vivo (abre o navegador e mostra a tela aqui)' : S.aoVivo ? 'Assistir ao vivo: os cards rodam um por vez e a tela de cada um aparece aqui.' : 'Assistir ao vivo desligado: os cards rodam escondidos, em paralelo quando é seguro.')),
      !p ? h('div', { class: 'cartao mudo' }, 'Montando os blocos…') : h('div', { style: 'display:flex;flex-direction:column;gap:12px' },
        p.blocos.map((b, i) => h('div', { class: 'bloco' },
          h('div', { class: 'bloco-cab' }, h('b', {}, b.sozinho ? 'Sozinho' : 'Bloco ' + (i + 1)), h('span', { class: 'chip' }, svg(I.branch), b.branch || 'checkout atual'), h('span', { class: 'peq mudo' }, b.sozinho ? 'card exclusivo, sem nada em paralelo' : '1 app no ar para o bloco todo')),
          b.ondas.map((o, j) => h('div', { class: 'onda' }, h('span', { class: 'peq mudo' }, j === 0 ? (o.length > 1 ? 'juntos' : 'primeiro') : (o.length > 1 ? 'depois, juntos' : 'depois')),
            h('div', { class: 'cards' }, o.map((c) => h('span', { class: 'mini' }, h('span', { class: 'm mudo' }, c.card.id), c.card.titulo)))))),
        ),
        p.incluidos.length ? h('div', { class: 'aviso' }, svg(I.info, 'var(--azul)'), h('div', {}, p.incluidos.map((x) => h('div', {}, x.id + ' entrou porque ' + x.porque + '.')))) : null,
        p.recusados.length ? h('div', { class: 'aviso ambar' }, svg(I.alerta, 'var(--ambar)'), h('div', {}, p.recusados.map((x) => h('div', {}, x.id + ' fica de fora: ' + x.motivo)))) : null,
        !p.paralelo ? h('div', { class: 'peq mudo' }, 'Um card por vez dentro de cada bloco: o seed não usa {{execucao}}, então os dados não são isolados.') : null),
    ];
  }
  function comecar() {
    const ids = [...S.sel];
    enviar({ tipo: 'rodar', ids, modo: S.modoExec, aoVivo: S.aoVivo });
  }

  function telaExecucao() {
    const e = S.exec;
    if (!e) return [vazio('Nada rodando', 'Escolha cards e comece pela aba Blocos.')];
    const estados = Object.values(e.cards);
    const n = (r) => estados.filter((c) => c.resultado === r).length;
    const cab = h('div', { class: 'cab' }, h('h1', {}, e.fim ? 'Execução terminada' : 'Testando ' + e.ids.length + ' card(s)'),
      !e.fim ? h('span', { class: 'pill azul' }, 'rodando') : null,
      n('passou') ? h('span', { class: 'pill verde' }, n('passou') + ' passou') : null,
      n('falhou') ? h('span', { class: 'pill verm' }, n('falhou') + ' falhou') : null,
      n('instavel') ? h('span', { class: 'pill ambar' }, n('instavel') + ' instável') : null,
      n('nao_rodou') ? h('span', { class: 'pill cinza' }, n('nao_rodou') + ' não rodou') : null,
      h('span', { class: 'espaco' }),
      !e.fim ? h('button', { class: 'btn perigo', onclick: () => enviar({ tipo: 'parar' }) }, 'Parar') : h('button', { class: 'btn pri', onclick: () => ir('resultados') }, 'Ver resultados'));
    const avisos = e.avisos.length ? h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Avisos durante o teste')), h('div', { class: 'lista' }, e.avisos.map((a) => h('div', { class: 'linha peq' }, svg(I.alerta, 'var(--ambar)'), h('span', { class: 'm mudo' }, a.card || ''), a.mensagem)))) : null;
    const naoRodaram = estados.length ? e.ids.filter((id) => e.cards[id] && e.cards[id].resultado === 'nao_rodou' && e.cards[id].msg) : [];
    const caixaMotivos = e.fim && naoRodaram.length ? h('div', { class: 'aviso verm' }, svg(I.alerta, 'var(--vermelho)'), h('div', {}, naoRodaram.map((id) => h('div', {}, h('b', {}, id + ' não rodou: '), e.cards[id].msg)))) : null;
    if (e.aoVivo) {
      const id = e.atual && e.cards[e.atual] ? e.atual : e.ids[0];
      const c = e.cards[id] || { passos: {}, tentativa: 1 };
      const card = cardPorId(id);
      const fila = e.ids.length > 1 ? h('div', { class: 'fila-vivo' }, e.ids.map((x, i) => {
        const cx = e.cards[x] || {};
        return h('button', { class: 'btn peq' + (x === id ? ' pri' : ''), onclick: () => { e.atual = x; e.fixado = true; render(); } }, h('span', { class: 'ponto ' + (cx.resultado || (cx.tentativa ? 'rodando' : '')) }), (i + 1) + '. ' + x + ' · ' + (cx.resultado ? ROT[cx.resultado] : cx.tentativa ? 'rodando' : 'na fila'));
      })) : null;
      const telaVazia = c.resultado === 'nao_rodou' ? h('div', { style: 'max-width:440px;text-align:center;color:var(--vermelho)' }, h('div', { style: 'font-weight:600;margin-bottom:6px' }, 'Não rodou'), c.msg || '') : h('span', {}, c.tentativa ? 'Abrindo o navegador…' : e.fase || 'Preparando a cópia da branch e subindo o app…');
      return [cab, caixaMotivos, fila,
        h('div', { class: 'ao-vivo' },
          h('div', { class: 'navegador' },
            h('div', { class: 'nav-barra' }, h('span', { class: 'bolas' }, h('i'), h('i'), h('i')), h('span', { class: 'nav-url' }, c.url || (c.resultado ? '—' : 'aguardando o app subir…')), !e.fim && !c.resultado ? h('span', { class: 'vivo' }, 'AO VIVO') : null),
            h('div', { class: 'nav-tela' }, c.imagem ? h('img', { src: c.imagem, alt: 'Tela do teste no passo ' + (c.passoAtual || '') }) : telaVazia)),
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, id + ' · passo a passo'), h('span', { class: 'espaco' }), c.tentativa > 1 ? h('span', { class: 'pill ambar' }, 'repetindo: tentativa ' + c.tentativa + ' de 3') : null),
            listaPassosVivos(card, c))),
        avisos];
    }
    return [cab,
      caixaMotivos,
      h('div', { class: 'aviso' }, svg(I.info, 'var(--azul)'), h('span', {}, 'Rodando escondido (sem assistir ao vivo). Para ver um card por vez na tela, marque "Assistir ao vivo" na aba Blocos. Cada falha repete até 3 vezes antes de ser confirmada; vídeo, prints e trace ficam salvos.')),
      e.fase ? h('div', { class: 'peq mudo' }, e.fase) : null,
      h('div', { class: 'cartao' }, h('div', { class: 'lista' }, e.ids.map((id) => {
        const c = e.cards[id] || { passos: {}, tentativa: 0 };
        const card = cardPorId(id);
        const total = card ? card.card.como_testar.length : 0;
        const st = (n) => (c.passos[n] && c.passos[n].estado) || '';
        return h('div', { class: 'exec-card' },
          h('span', { class: 'm mudo' }, id),
          h('div', {}, h('div', { style: 'font-weight:600' }, card ? card.card.titulo : id), h('div', { class: 'peq mudo' }, c.msg || (c.resultado ? '' : 'na fila'))),
          h('div', { class: 'trilha' }, Array.from({ length: total }, (_, i) => h('i', { class: st(i + 1) }))),
          h('span', { class: 'peq', style: 'display:flex;gap:6px;align-items:center;justify-content:flex-end' }, h('span', { class: 'ponto ' + (c.resultado || (c.tentativa ? 'rodando' : '')) }), c.resultado ? ROT[c.resultado] + (c.resultado === 'falhou' ? ' (3/3)' : '') : c.tentativa ? (c.tentativa > 1 ? 'tentativa ' + c.tentativa + ' de 3' : 'rodando') : 'na fila'));
      }))),
      avisos];
  }
  function listaPassosVivos(card, c) {
    if (!card) return h('div', {});
    return h('div', { class: 'lista' }, card.card.como_testar.map((p) => {
      const s = c.passos[p.n] || {};
      const marca = s.estado === 'ok' ? h('span', { class: 'est ok' }, '✓') : s.estado === 'falha' ? h('span', { class: 'est falha' }, '✕') : s.estado === 'rodando' ? h('span', { class: 'est rodando' }) : h('span', { class: 'est' });
      return h('div', { class: 'passo' }, marca, h('div', {}, h('div', { style: s.estado ? '' : 'color:var(--mudo)' }, (p.como ? '[' + p.como + '] ' : '') + descrever(p)), s.erro ? h('div', { class: 'peq', style: 'color:var(--vermelho);margin-top:2px' }, s.erro) : null), h('span', { class: 'peq mudo' }, s.ms ? (s.ms / 1000).toFixed(1) + ' s' : ''));
    }));
  }

  function telaResultados() {
    const r = S.resultados;
    if (!r) return [vazio('Sem resultados ainda', 'Rode cards para ver o resultado aqui. O histórico de execuções antigas fica na aba Histórico.')];
    const n = (x) => r.filter((c) => c.resultado === x).length;
    const pend = r.reduce((a, c) => a + (c.pendencias || []).length, 0);
    return [
      h('div', { class: 'cab' }, h('h1', {}, 'Resultado'),
        n('passou') ? h('span', { class: 'pill verde' }, n('passou') + ' passou') : null,
        n('falhou') ? h('span', { class: 'pill verm' }, n('falhou') + ' falha(s) confirmada(s)') : null,
        n('instavel') ? h('span', { class: 'pill ambar' }, n('instavel') + ' instável') : null,
        n('nao_rodou') ? h('span', { class: 'pill cinza' }, n('nao_rodou') + ' não rodou') : null,
        pend ? h('span', { class: 'pill roxo' }, pend + ' conferência(s) manual(is)') : null),
      S.erroExec ? h('div', { class: 'aviso verm' }, svg(I.alerta, 'var(--vermelho)'), h('span', { class: 'm' }, S.erroExec)) : null,
      h('div', { class: 'cartao' }, h('div', { class: 'lista' }, r.map((c) => {
        const card = cardPorId(c.card);
        const det = [];
        if (c.resultado === 'falhou' && c.falha) det.push(h('span', { style: 'color:var(--vermelho)' }, 'passo ' + c.falha.passo + ': ' + c.falha.erro));
        if (c.resultado === 'instavel') det.push(h('span', { style: 'color:var(--ambar)' }, 'falhou e passou nas repetições: vai para quarentena, não bloqueia'));
        if (c.motivo) det.push(h('span', {}, c.motivo));
        for (const cod of c.codigo || []) if (cod.observacao || (c.codigo || []).length > 1) det.push(h('span', { class: 'm' }, cod.servico + ': ' + cod.ref + ' @ ' + cod.sha.slice(0, 7) + (cod.observacao ? ' (' + cod.observacao + ')' : '')));
        for (const p of c.pendencias || []) det.push(h('span', { style: 'color:var(--roxo)' }, '☐ conferir à mão: ' + p));
        for (const v of c.vizinhos || []) det.push(h('span', { style: v.resultado === 'quebrou_nesta_branch' ? 'color:var(--vermelho)' : '' }, 'vizinho ' + v.card + ': ' + ({ ok: 'ok', quebrou_nesta_branch: 'quebrou nesta branch (passa na base)', ja_quebrado_na_base: 'já falhava na base', nao_rodou: 'não rodou' })[v.resultado]));
        return h('div', { class: 'res-card' }, h('span', { class: 'ponto ' + c.resultado, style: 'margin-top:5px' }), h('span', { class: 'm mudo', style: 'padding-top:1px' }, c.card),
          h('div', {}, h('div', { style: 'font-weight:600' }, card ? card.card.titulo : c.card, h('span', { class: 'peq mudo', style: 'font-weight:400;margin-left:8px' }, (c.branch || 'checkout atual') + (c.sha ? ' @ ' + c.sha.slice(0, 7) : ''))), h('div', { class: 'det' }, det)),
          h('div', { class: 'acoes' },
            h('span', { class: 'pill ' + ({ passou: 'verde', falhou: 'verm', instavel: 'ambar' }[c.resultado] || 'cinza') }, ROT[c.resultado] + (c.resultado === 'falhou' ? ' · ' + c.tentativas + '/' + c.tentativas : '')),
            c.falha && c.resultado !== 'passou' ? h('button', { class: 'btn peq', onclick: () => abrirProblema(c) }, 'Ver problema') : null,
            c.falha && c.resultado === 'falhou' ? h('button', { class: 'btn pri peq', onclick: () => { abrirProblema(c); } }, 'Resolver com Claude') : null));
      }))),
    ];
  }
  function abrirProblema(c) {
    enviar({ tipo: 'prompt', qual: 'resolver', id: c.card });
    ir('problema', { problema: { modo: 'resolver', card: c.card, resultado: c } });
  }

  function telaProblema() {
    const p = S.problema;
    if (!p) return [vazio('Nada aberto', '')];
    const card = cardPorId(p.card);
    const chave = p.modo + ':' + p.card;
    const texto = S.prompts[chave];
    const caixa = h('div', { class: 'cartao' },
      h('div', { class: 'sec' }, h('h2', {}, 'Texto para o Claude'), h('span', { class: 'espaco' }), h('span', { class: 'peq mudo' }, 'editável · sem senhas nem tokens')),
      texto === undefined ? h('div', { class: 'mudo peq' }, 'Montando o texto…') : h('textarea', { class: 'prompt', id: 'prompt', oninput: (e) => { S.prompts[chave] = e.target.value; } }, texto),
      h('div', { class: 'acoes', style: 'margin-top:12px' },
        h('button', { class: 'btn pri', disabled: texto === undefined, onclick: () => enviar({ tipo: 'claude', texto: S.prompts[chave] }) }, svg(I.abrir), 'Resolver com Claude'),
        h('button', { class: 'btn', disabled: texto === undefined, onclick: () => enviar({ tipo: 'copiar', texto: S.prompts[chave] }) }, svg(I.copiar), 'Copiar')),
      h('div', { class: 'peq mudo', style: 'margin-top:10px' }, '"Resolver com Claude" copia o texto e abre o Claude Code no terminal do projeto: cole e envie. Depois, teste o card de novo.'));
    if (p.modo === 'passos') {
      return [h('button', { class: 'voltar', onclick: () => ir('card') }, svg(I.voltar), p.card),
        h('div', { class: 'cab' }, h('span', { class: 'id' }, p.card), h('h1', {}, 'Pedir o passo a passo ao Claude')),
        h('div', { class: 'aviso' }, svg(I.info, 'var(--azul)'), h('span', {}, 'O Claude escreve o passo a passo no cards.yaml. O liveflow testa sem IA: os mesmos passos rodam sempre do mesmo jeito. Quando o arquivo mudar, esta lista se atualiza sozinha.')),
        caixa];
    }
    const r = p.resultado;
    const f = r.falha || {};
    return [
      h('button', { class: 'voltar', onclick: () => ir('resultados') }, svg(I.voltar), 'Resultados'),
      h('div', { class: 'cab' }, h('span', { class: 'id' }, r.card), h('h1', {}, card ? card.card.titulo : r.card),
        r.resultado === 'falhou' ? h('span', { class: 'pill verm' }, 'falha confirmada · ' + r.tentativas + ' de ' + r.tentativas) : h('span', { class: 'pill ambar' }, ROT[r.resultado]),
        h('span', { class: 'espaco' }),
        h('button', { class: 'btn', onclick: () => { S.sel = new Set([r.card]); ir('blocos'); } }, svg(I.play), 'Testar de novo')),
      h('div', { class: 'duas' },
        h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'O que aconteceu')),
            h('div', { class: 'grade' },
              'Passo', f.passo ? f.passo + ' · ' + f.descricao : '—',
              'Erro', h('span', { style: 'color:var(--vermelho)' }, f.erro || r.motivo || '—'),
              'Página', f.url ? h('span', { class: 'm' }, f.url) : '—',
              'Código', (r.branch || 'checkout atual') + (r.sha ? ' @ ' + r.sha.slice(0, 7) : ''),
              'Confirmação', r.resultado === 'falhou' ? 'falhou ' + r.tentativas + ' de ' + r.tentativas + ' vezes' + (r.bancoZerado ? ', com o banco zerado a cada vez' : ' (sem seed: o banco não foi zerado entre as tentativas)') : ROT[r.resultado])),
          f.sugestoes && f.sugestoes.length ? h('div', { class: 'cartao' }, h('div', { class: 'sec' }, svg(I.lampada, 'var(--ambar)'), h('h2', {}, 'Na tela existe algo parecido')),
            h('div', { class: 'acoes' }, f.sugestoes.map((s) => h('span', { class: 'chip', style: 'font-size:13px;padding:4px 10px;color:var(--texto)' }, s))),
            h('div', { class: 'peq mudo', style: 'margin-top:10px' }, 'Provável mudança de texto. Se foi de propósito, atualize o passo do card; se não, é um bug na tela.'),
            h('div', { class: 'acoes', style: 'margin-top:10px' }, h('button', { class: 'btn peq', onclick: () => enviar({ tipo: 'abrirYaml', id: r.card }) }, svg(I.abrir), 'Abrir o card no cards.yaml'))) : null,
          (r.codigo || []).length > 1 ? h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Código testado')), h('div', { class: 'lista' }, r.codigo.map((c) => h('div', { class: 'linha peq' }, h('b', {}, c.servico), h('span', { class: 'm' }, c.ref + ' @ ' + c.sha.slice(0, 7)), c.observacao ? h('span', { class: 'amb-txt' }, c.observacao) : null)))) : null),
        h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Evidências')),
          r.printUri ? h('img', { class: 'print', src: r.printUri, alt: 'Tela no momento da falha', onclick: () => enviar({ tipo: 'abrirArquivo', caminho: f.print }) }) : h('div', { class: 'mudo peq' }, 'Sem print desta falha.'),
          h('div', { class: 'acoes', style: 'margin-top:12px' },
            h('button', { class: 'btn peq', onclick: () => enviar({ tipo: 'trace', caminho: r.pasta + '/tentativa-' + r.tentativas + '/trace.zip' }) }, 'Abrir trace (passo a passo gravado)'),
            f.print ? h('button', { class: 'btn peq', onclick: () => enviar({ tipo: 'abrirArquivo', caminho: f.print }) }, 'Abrir print') : null))),
      caixa,
    ];
  }

  function telaCriar() {
    const chave = 'artefato';
    const texto = S.prompts[chave];
    return [
      h('div', { class: 'cab' }, h('h1', {}, 'Criar artefato')),
      h('div', { class: 'aviso' }, svg(I.info, 'var(--azul)'), h('span', {}, 'O liveflow testa cards, e os cards vivem no artefato .liveflow/cards.yaml. Cole abaixo os cards do seu quadro (id, título, descrição, critérios e a branch onde foram feitos). O Claude lê o código e escreve o artefato com o passo a passo de cada um. Para um card que já existe, também dá para gravar o passo a passo fazendo o fluxo no navegador (botão "Gravar passo a passo no navegador", na tela do card).')),
      h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Seus cards')),
        h('textarea', { class: 'prompt', placeholder: 'C-10 · Cliente aceita o orçamento pelo link (branch feat/aceite)\nCritérios:\n1. O cliente abre o link e vê o valor total\n2. Ao aceitar, o status vira "aprovado"', oninput: (e) => { S.textoCards = e.target.value; } }, S.textoCards),
        h('div', { class: 'acoes', style: 'margin-top:12px' },
          h('button', { class: 'btn pri', onclick: () => { enviar({ tipo: 'prompt', qual: 'artefato', texto: S.textoCards }); S.promptArtefato = chave; render(); } }, svg(I.lampada), 'Gerar texto para o Claude'))),
      S.promptArtefato && texto !== undefined ? h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Texto para o Claude')),
        h('textarea', { class: 'prompt', oninput: (e) => { S.prompts[chave] = e.target.value; } }, texto),
        h('div', { class: 'acoes', style: 'margin-top:12px' },
          h('button', { class: 'btn pri', onclick: () => enviar({ tipo: 'claude', texto: S.prompts[chave] }) }, 'Resolver com Claude'),
          h('button', { class: 'btn', onclick: () => enviar({ tipo: 'copiar', texto: S.prompts[chave] }) }, 'Copiar'))) : null,
    ];
  }

  function telaAmbiente() {
    const a = S.estado && S.estado.ambiente;
    const seg = (S.estado && S.estado.segredos) || [];
    if (!a) return [vazio('Lendo o ambiente…', '')];
    return [
      h('div', { class: 'cab' }, h('h1', {}, 'Ambiente de teste'), ambienteFaltas() ? h('span', { class: 'pill verm' }, ambienteFaltas() + ' pendência(s)') : h('span', { class: 'pill verde' }, svg(I.ok), 'pronto para testar')),
      h('div', { class: 'duas' },
        h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'O que o liveflow precisa')),
          h('div', { class: 'lista' }, a.itens.map((i) => h('div', { class: 'linha' },
            i.ok ? svg(I.ok, 'var(--verde)') : svg(i.opcional ? I.alerta : I.x, i.opcional ? 'var(--ambar)' : 'var(--vermelho)'),
            h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:500' }, i.nome), h('div', { class: 'peq mudo' }, i.detalhe)),
            i.resolver ? h('span', { class: 'm mudo' }, i.resolver) : null)))),
        h('div', { style: 'display:flex;flex-direction:column;gap:16px' },
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, svg(I.cadeado), h('h2', {}, 'Segredos'), h('span', { class: 'espaco' }), h('span', { class: 'peq mudo' }, 'ficam no cofre do VS Code')),
            seg.length ? h('div', { class: 'lista' }, seg.map((s) => h('div', { class: 'linha' }, s.definido ? svg(I.ok, 'var(--verde)') : svg(I.x, 'var(--vermelho)'), h('span', { class: 'm', style: 'flex:1' }, s.nome), h('button', { class: 'btn peq', onclick: () => enviar({ tipo: 'definirSegredo', nome: s.nome }) }, s.definido ? 'Trocar' : 'Definir')))) : h('div', { class: 'mudo peq' }, 'O artefato não usa {{segredo:...}}.')),
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Serviços por bloco')),
            a.sistema.servicos.length ? h('div', { class: 'lista' }, a.sistema.servicos.map((s) => h('div', { class: 'linha peq' }, h('b', {}, s.nome), h('span', { class: 'm mudo', style: 'flex:1' }, s.iniciar), s.repo ? h('span', { class: 'chip' }, s.repo) : null))) : h('div', { class: 'peq amb-txt' }, 'Sem "iniciar"/"servicos": o liveflow só testa a branch do seu checkout atual.'),
            h('div', { class: 'grade', style: 'margin-top:12px' }, 'Endereço', h('span', { class: 'm' }, a.sistema.url), 'Permitidos', a.sistema.permitidos.join(', '), 'Produção', a.sistema.producao.join(', ') || '—', 'Base', a.sistema.base)),
          h('div', { class: 'cartao' }, h('div', { class: 'sec' }, h('h2', {}, 'Automatizar')),
            h('div', { class: 'lista' },
              h('div', { class: 'linha' }, h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:500' }, 'Antes de cada push'), h('div', { class: 'peq mudo' }, 'roda os cards da branch no modo rápido')), h('button', { class: 'btn peq', onclick: () => enviar({ tipo: 'acao', qual: 'hook' }) }, 'Instalar hook')),
              h('div', { class: 'linha' }, h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:500' }, 'GitHub Actions'), h('div', { class: 'peq mudo' }, 'cards da branch no PR e regressão dos entregues toda noite')), h('button', { class: 'btn peq', onclick: () => enviar({ tipo: 'acao', qual: 'ci' }) }, 'Gerar workflow')))))),
    ];
  }

  function telaHistorico() {
    const hist = (S.estado && S.estado.historico) || { historico: {}, quarentena: [] };
    const ids = Object.keys(hist.historico);
    if (!ids.length) return [vazio('Sem histórico', 'Cada execução fica guardada em .liveflow/execucoes e aparece aqui.')];
    return [
      h('div', { class: 'cab' }, h('h1', {}, 'Histórico'), hist.quarentena.length ? h('span', { class: 'pill ambar' }, hist.quarentena.length + ' em quarentena') : h('span', { class: 'pill verde' }, 'nenhum card instável')),
      hist.quarentena.length ? h('div', { class: 'aviso ambar' }, svg(I.alerta, 'var(--ambar)'), h('span', {}, 'Em quarentena (instável em 2 ou mais das últimas 5): ' + hist.quarentena.map((q) => q.card + ' (' + q.instaveis + '/' + q.de + ')').join(', ') + '. Esses cards não bloqueiam ninguém até o teste ficar estável.')) : null,
      h('div', { class: 'cartao' }, h('div', { class: 'lista' }, ids.map((id) => {
        const l = hist.historico[id];
        const card = cardPorId(id);
        return h('div', { class: 'linha' }, h('span', { class: 'm mudo', style: 'width:70px' }, id), h('span', { style: 'flex:1' }, card ? card.card.titulo : ''),
          h('div', { class: 'hist' }, l.slice(-20).map((x) => h('span', { class: 'ponto ' + x.resultado, title: x.quando + ' · ' + ROT[x.resultado] + (x.sha ? ' · ' + x.sha.slice(0, 7) : '') }))),
          h('span', { class: 'peq mudo', style: 'width:90px;text-align:right' }, ROT[l[l.length - 1].resultado]));
      }))),
    ];
  }

  function vazio(t, d) {
    return h('div', { class: 'vazio' }, h('h2', {}, t), d ? h('p', {}, d) : null);
  }

  // ---------- barra lateral ----------
  function lateral() {
    const todos = cards();
    const a = S.estado && S.estado.ambiente;
    const prontos = todos.filter((c) => c.estado === 'pronto');
    return [
      h('div', { class: 'acoes' },
        h('button', { class: 'btn pri peq', onclick: () => enviar({ tipo: 'abrirPainel' }) }, 'Abrir painel'),
        prontos.length ? h('button', { class: 'btn peq', onclick: () => enviar({ tipo: 'abrirPainel', depois: { tela: 'blocos', ids: prontos.map((c) => c.card.id) } }) }, svg(I.play), 'Testar prontos') : null),
      h('div', {},
        h('div', { class: 'lat-sec' }, 'Cards · ' + prontos.length + ' de ' + todos.length + ' prontos'),
        todos.length ? todos.map((c) => {
          const ult = ultimo(c.card.id);
          return h('div', { class: 'lat-card', title: c.problemas[0] || c.card.titulo, onclick: () => enviar({ tipo: 'abrirPainel', depois: { tela: 'card', id: c.card.id } }) },
            h('span', { class: 'ponto ' + (c.estado !== 'pronto' ? 'nao_rodou' : ult || '') }),
            h('span', { class: 'm mudo' }, c.card.id), h('span', { class: 't' }, c.card.titulo),
            c.estado === 'sem_passos' ? h('span', { class: 'peq amb-txt' }, 'sem passos') : c.estado === 'invalido' ? h('span', { class: 'peq erro-txt' }, 'erro') : null);
        }) : h('div', { class: 'lat-item mudo' }, 'Nenhum card. Abra o painel para criar.')),
      a ? h('div', {}, h('div', { class: 'lat-sec' }, 'Ambiente'),
        a.itens.filter((i) => !i.opcional || !i.ok).slice(0, 6).map((i) => h('div', { class: 'lat-item' }, i.ok ? svg(I.ok, 'var(--verde)') : svg(i.opcional ? I.alerta : I.x, i.opcional ? 'var(--ambar)' : 'var(--vermelho)'), h('div', {}, h('div', {}, i.nome), h('div', { class: 'mudo' }, i.detalhe))))) : null,
    ];
  }

  // ---------- render ----------
  let focoBusca = false;
  function render(manterFoco) {
    focoBusca = manterFoco && document.activeElement && document.activeElement.classList.contains('busca');
    const pos = focoBusca ? document.activeElement.selectionStart : 0;
    raiz.replaceChildren();
    if (modo === 'lateral') {
      raiz.append(h('div', { class: 'topo' }, h('div', { class: 'topo-linha' }, h('div', { class: 'marca' }, h('img', { src: logo, alt: '' }), 'liveflow'))), h('main', {}, S.estado ? lateral() : h('div', { class: 'mudo peq' }, 'Carregando…')));
      return;
    }
    const telas = { cards: telaCards, card: telaCard, blocos: telaBlocos, execucao: telaExecucao, resultados: telaResultados, problema: telaProblema, criar: telaCriar, ambiente: telaAmbiente, historico: telaHistorico };
    raiz.append(topo(), h('main', {}, S.estado ? telas[S.tela]() : vazio('Carregando os cards…', '')));
    if (S.tela === 'cards' && S.sel.size) {
      raiz.append(h('div', { class: 'barra' }, h('b', {}, S.sel.size + ' selecionado(s)'), h('span', { class: 'mudo peq' }, 'cards da mesma branch dividem o mesmo app'), h('span', { class: 'espaco' }),
        h('button', { class: 'btn pri', onclick: () => ir('blocos') }, svg(I.play), 'Ver blocos e testar')));
    }
    if (focoBusca) {
      const b = raiz.querySelector('.busca');
      if (b) { b.focus(); b.setSelectionRange(pos, pos); }
    }
  }

  // ---------- mensagens da extensão ----------
  function aplicarEvento(ev) {
    const e = S.exec;
    if (!e) return;
    const id = ev.card;
    const c = id ? (e.cards[id] = e.cards[id] || { passos: {}, tentativa: 0 }) : null;
    switch (ev.tipo) {
      case 'copia_pronta': e.fase = 'Cópia de ' + ev.ref + ' pronta' + (ev.dependencias === 'reaproveitadas' ? ' (dependências reaproveitadas)' : '') + (ev.observacao ? ' · ' + ev.servico + ': ' + ev.observacao : ''); break;
      case 'app_no_ar': e.fase = 'App no ar em ' + ev.url; break;
      case 'card_inicio': c.msg = 'começando'; if (e.ids.includes(id) && !e.fixado) e.atual = id; break;
      case 'tentativa': c.tentativa = ev.n; c.passos = {}; c.msg = ev.n > 1 ? 'repetindo para confirmar' : 'rodando'; break;
      case 'passo_inicio': c.passos[ev.n] = { estado: 'rodando' }; c.passoAtual = ev.n; c.msg = 'passo ' + ev.n + ': ' + ev.descricao; break;
      case 'passo_ok': c.passos[ev.n] = { estado: 'ok', ms: ev.ms }; break;
      case 'passo_falhou': c.passos[ev.n] = { estado: 'falha', erro: ev.erro }; c.msg = 'passo ' + ev.n + ' falhou'; break;
      case 'quadro': c.imagem = ev.imagem; c.url = ev.url; break;
      case 'aviso': if (!e.avisos.some((a) => a.mensagem === ev.mensagem)) e.avisos.push({ card: id, mensagem: ev.mensagem }); break;
      case 'card_fim': c.resultado = ev.resultado; c.msg = ev.motivo || ''; break;
    }
  }

  window.addEventListener('message', (m) => {
    const d = m.data;
    switch (d.tipo) {
      case 'estado': S.estado = d.dados; S.carregando = false; for (const id of [...S.sel]) { const c = cardPorId(id); if (!c || c.estado !== 'pronto') S.sel.delete(id); } break;
      case 'pedirRecarga': enviar({ tipo: 'recarregar' }); return;
      case 'plano': S.plano[d.id] = d.dados; break;
      case 'blocos': if (JSON.stringify(d.ids) === JSON.stringify(S.blocosIds)) S.blocos = d.dados; break;
      case 'prompt': S.prompts[d.qual === 'artefato' ? S.promptArtefato : d.qual + ':' + d.id] = d.dados; break;
      case 'navegar': {
        const dest = d.destino || {};
        if (dest.ids) S.sel = new Set(dest.ids);
        if (dest.tela === 'card') { S.cardAberto = dest.id; enviar({ tipo: 'plano', id: dest.id, modo: S.modoExec }); }
        ir(dest.tela || 'cards');
        return;
      }
      case 'execucao_comecou': S.exec = { ids: d.ids, aoVivo: d.aoVivo, cards: {}, avisos: [], fim: false, fase: 'Preparando…' }; S.resultados = null; S.erroExec = ''; S.tela = 'execucao'; break;
      case 'evento': aplicarEvento(d.evento); if (S.tela !== 'execucao') { render(); return; } break;
      case 'execucao_terminou': if (S.exec) S.exec.fim = true; S.resultados = d.resultados; S.erroExec = d.resultados ? '' : d.erro; enviar({ tipo: 'recarregar' }); break;
    }
    render();
  });

  // ---------- testes visuais: permite abrir uma tela direto ----------
  window.__liveflow = { S, render, ir, aplicarEvento };
  render();
  enviar({ tipo: 'pronto' });
})();
