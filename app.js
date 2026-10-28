/* StudyFlow — interface e comportamento */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = () => Store.get();
  const ui = { view: 'board', search: '', weekOffset: 0, revTab: 'cards', flashShow: false };
  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const PRIOS = ['', 'Baixa', 'Média', 'Alta', 'Crítica'];
  const NAV = [
    { id: 'board', ic: '📋', lbl: 'Quadro' }, { id: 'schedule', ic: '🗓️', lbl: 'Cronograma' },
    { id: 'pomodoro', ic: '🍅', lbl: 'Pomodoro' }, { id: 'eisenhower', ic: '🎯', lbl: 'Prioridades' },
    { id: 'review', ic: '🔁', lbl: 'Revisão' }, { id: 'stats', ic: '📊', lbl: 'Progresso' },
    { id: 'methods', ic: '🧭', lbl: 'Métodos' }
  ];
  const fmtT = m => `${Store.pad(Math.floor(m / 60))}:${Store.pad(m % 60)}`;
  const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`;
  const fmtDate = iso => { const p = iso.split('-'); return `${p[2]}/${p[1]}`; };
  const mmss = s => `${Store.pad(Math.floor(s / 60))}:${Store.pad(s % 60)}`;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /* ---------- modal ---------- */
  function openModal(html, cls = '', onClose) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    const close = () => { if (!ov.isConnected) return; ov.remove(); if (onClose) onClose(); };
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov._close = close; $('#modalRoot').appendChild(ov);
    return { el: ov.firstElementChild, close };
  }
  function closeTopModal() { const o = $$('.overlay').pop(); if (o) o._close(); }

  function ask(title, val = '', ph = '') {
    return new Promise(res => {
      let done = false;
      const { el, close } = openModal(`<h2>${esc(title)}</h2>
        <input type="text" id="askIn" value="${esc(val)}" placeholder="${esc(ph)}" style="margin-top:12px">
        <div class="foot"><span></span><div class="r"><button class="ghost" data-x="c">Cancelar</button><button class="primary" data-x="o">OK</button></div></div>`,
        'sm', () => { if (!done) res(null); });
      const inp = $('#askIn', el); inp.focus(); inp.select();
      const ok = () => { done = true; const v = inp.value.trim(); close(); res(v || null); };
      el.addEventListener('click', e => { const x = e.target.dataset.x; if (x === 'o') ok(); if (x === 'c') close(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    });
  }

  /* ---------- timer (Pomodoro) ---------- */
  const T = { mode: 'focus', running: false, endAt: 0, left: null, cycle: 0, cardId: '' };
  const pset = () => st().settings.pomo;
  const modeDur = m => pset()[m === 'focus' ? 'focus' : m === 'short' ? 'short' : 'long'] * 60;
  const tLeft = () => T.running ? Math.max(0, Math.round((T.endAt - Date.now()) / 1000)) : (T.left == null ? modeDur(T.mode) : T.left);
  const MODE_LBL = { focus: 'Foco', short: 'Pausa curta', long: 'Pausa longa' };

  function beep() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach(d => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.15, ac.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d + 0.2);
        o.start(ac.currentTime + d); o.stop(ac.currentTime + d + 0.22);
      });
    } catch (e) { /* sem áudio */ }
  }
  function tStart() {
    if (T.running) return;
    T.left = tLeft(); T.endAt = Date.now() + T.left * 1000; T.running = true;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    render();
  }
  function tPause() { T.left = tLeft(); T.running = false; render(); }
  function tReset() { T.running = false; T.left = null; render(); }
  function tMode(m) { T.mode = m; T.running = false; T.left = null; render(); }
  function tDone(silent) {
    T.running = false; T.left = null;
    if (!silent) beep();
    let msg;
    if (T.mode === 'focus') {
      const card = st().cards[T.cardId];
      if (!silent) {
        Store.logSession(pset().focus, card && card.subject, card && card.id);
        if (card) { card.pomos++; Store.save(); }
        T.cycle++;
      }
      T.mode = T.cycle % pset().cycles === 0 ? 'long' : 'short';
      msg = '🍅 Foco concluído! Hora da pausa.';
    } else { T.mode = 'focus'; msg = '⏰ Pausa terminada. Bora focar!'; }
    toast(msg);
    if ('Notification' in window && Notification.permission === 'granted' && !silent) new Notification('StudyFlow', { body: msg });
    render();
  }
  function tickDom() {
    const left = tLeft();
    const total = modeDur(T.mode);
    const tt = $('#tTime'); if (tt) tt.textContent = mmss(left);
    const ring = $('#tRing'); if (ring) ring.style.strokeDashoffset = String(753.98 * (1 - left / total));
    const mini = $('#miniTimer');
    const active = T.running || T.left != null;
    mini.hidden = !active;
    if (active) mini.innerHTML = `<div class="l">${MODE_LBL[T.mode]}${T.running ? '' : ' · pausado'}</div><div class="t">${mmss(left)}</div>`;
    document.title = T.running ? `${mmss(left)} · StudyFlow` : 'StudyFlow — organize seus estudos';
  }
  setInterval(() => { if (T.running && tLeft() <= 0) tDone(); tickDom(); }, 500);

  /* ---------- helpers de cartão ---------- */
  function dueChip(c) {
    if (!c.due) return '';
    const diff = Math.round((new Date(c.due + 'T12:00:00') - new Date(Store.today() + 'T12:00:00')) / 864e5);
    const cls = c.done ? 'ok' : diff < 0 ? 'late' : diff <= 2 ? 'soon' : '';
    return `<span class="chip ${cls}">📅 ${fmtDate(c.due)}</span>`;
  }
  function cardHTML(c) {
    const s = Store.subj(c.subject);
    const d = c.checklist.filter(i => i.d).length, n = c.checklist.length;
    const tags = c.tags.map(t => (Methods.byId(t) || {}).icon).filter(Boolean).join(' ');
    return `<article class="card ${c.done ? 'done' : ''}" draggable="true" data-id="${c.id}">
      <div class="row">
        <span class="prio p${c.priority}" title="Prioridade ${PRIOS[c.priority]}"></span>
        ${s ? `<span class="chip subj" style="background:${s.color}33;color:${s.color}">${esc(s.name)}</span>` : ''}
        ${c.frog ? '<span title="Eat the frog">🐸</span>' : ''}
        ${c.srs ? '<span title="Em revisão espaçada">🔁</span>' : ''}
      </div>
      <div class="ttl">${esc(c.title)}</div>
      <div class="row">
        ${dueChip(c)}
        ${n ? `<span class="chip">☑ ${d}/${n}</span>` : ''}
        ${c.est ? `<span class="chip">🍅 ${c.pomos}/${c.est}</span>` : ''}
        ${tags ? `<span class="chip">${tags}</span>` : ''}
      </div>
      ${n ? `<div class="progress"><i style="width:${Math.round(d / n * 100)}%"></i></div>` : ''}
    </article>`;
  }
  const matches = c => !ui.search || (c.title + ' ' + c.desc).toLowerCase().includes(ui.search);
  const boardCards = () => Store.board().columns.flatMap(col => col.cards.map(id => st().cards[id]).filter(Boolean));
  const dueReviews = () => Object.values(st().cards).filter(c => c.srs && c.srs.next <= Store.today());
  const dueFlash = () => st().flash.filter(f => f.next <= Store.today());

  /* ---------- views ---------- */
  function vBoard() {
    const b = Store.board();
    const cols = b.columns.map(col => {
      const cards = col.cards.map(id => st().cards[id]).filter(c => c && matches(c));
      return `<section class="col ${col.done ? 'done-col' : ''}">
        <header><h3>${esc(col.name)}</h3><span class="count">${cards.length}</span>
          <button class="icon" data-act="col-menu" data-col="${col.id}" title="Opções da lista">⋯</button></header>
        <div class="cards" data-drop="${col.id}" data-drop-kind="col">${cards.map(cardHTML).join('')}</div>
        <button class="add" data-act="add-card" data-col="${col.id}">＋ Adicionar cartão</button>
      </section>`;
    }).join('');
    return `<div class="board">${cols}<button class="col add-col" data-act="add-col">＋ Nova lista</button></div>`;
  }

  function weekStart(off) {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d;
  }
  const START_H = 6, ROW = 48;
  function vSchedule() {
    const ws = weekStart(ui.weekOffset), todayIso = Store.today();
    const days = [...Array(7)].map((_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return d; });
    const range = `${fmtDate(Store.iso(days[0]))} – ${fmtDate(Store.iso(days[6]))}`;
    const heads = days.map((d, i) => `<div class="head ${Store.iso(d) === todayIso ? 'today' : ''}">${DAYS[i]}<b>${d.getDate()}</b></div>`).join('');
    const hours = [...Array(24 - START_H)].map((_, i) => `<div>${Store.pad(START_H + i)}:00</div>`).join('');
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const cols = days.map(d => {
      const iso = Store.iso(d);
      const blocks = st().blocks.filter(b => b.date === iso).map(b => {
        const s = Store.subj(b.subject), color = s ? s.color : '#4a6fa5';
        const top = Math.max(0, (b.start - START_H * 60) / 60 * ROW);
        return `<div class="block" data-block="${b.id}" style="top:${top}px;height:${Math.max(22, b.dur / 60 * ROW - 2)}px;background:${color}d9">
          <b>${esc(b.title)}</b><small>${fmtT(b.start)}–${fmtT(b.start + b.dur)}</small></div>`;
      }).join('');
      const line = iso === todayIso && nowMin >= START_H * 60 ? `<div class="nowline" style="top:${(nowMin - START_H * 60) / 60 * ROW}px"></div>` : '';
      return `<div class="daycol ${iso === todayIso ? 'today' : ''}" data-date="${iso}" style="height:${(24 - START_H) * ROW}px">${line}${blocks}</div>`;
    }).join('');
    const due = Object.values(st().cards).filter(c => c.due && !c.done && c.due >= Store.iso(days[0]) && c.due <= Store.iso(days[6])).sort((a, b) => a.due.localeCompare(b.due));
    return `<div class="toolbar">
        <h2>Cronograma</h2>
        <button class="ghost" data-act="week-prev">←</button>
        <button class="ghost" data-act="week-today">Hoje</button>
        <button class="ghost" data-act="week-next">→</button>
        <span class="chip">${range}</span><span class="grow"></span>
        <button class="ghost" data-act="auto-plan" title="Distribui cartões pendentes nos horários livres dos próximos 7 dias">✨ Planejar semana</button>
        <button class="primary" data-act="add-block">＋ Bloco</button>
      </div>
      <div class="scroll-x"><div class="week"><div class="head"></div>${heads}<div class="hours">${hours}</div>${cols}</div></div>
      ${due.length ? `<div class="glass" style="margin-top:14px"><b>Prazos da semana</b><div class="row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        ${due.map(c => `<span class="chip" style="cursor:pointer" data-open="${c.id}">📅 ${fmtDate(c.due)} · ${esc(c.title)}</span>`).join('')}</div></div>` : ''}
      <p class="hint" style="margin-top:10px">Dica: clique em um horário vazio para criar um bloco de estudo (time blocking).</p>`;
  }

  const PRESETS = [['Clássico', 25, 5, 15], ['Estendido', 50, 10, 30], ['52/17', 52, 17, 30], ['Deep work', 90, 20, 30]];
  function vPomo() {
    const p = pset(), left = tLeft(), total = modeDur(T.mode);
    const cards = Object.values(st().cards).filter(c => !c.done);
    const today = Store.today();
    const sess = st().sessions.filter(s => s.date === today);
    const mins = sess.reduce((a, s) => a + s.min, 0);
    const last = st().sessions.slice(-5).reverse();
    return `<div class="pomo">
      <div class="modes">${['focus', 'short', 'long'].map(m => `<button class="${T.mode === m ? 'on' : ''}" data-act="t-mode" data-m="${m}">${MODE_LBL[m]}</button>`).join('')}</div>
      <div class="ring"><svg width="280" height="280" viewBox="0 0 280 280">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bed"/><stop offset="1" stop-color="#4a86e8"/></linearGradient></defs>
        <circle cx="140" cy="140" r="120" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10"/>
        <circle id="tRing" cx="140" cy="140" r="120" fill="none" stroke="url(#g)" stroke-width="10" stroke-linecap="round" stroke-dasharray="753.98" stroke-dashoffset="${753.98 * (1 - left / total)}"/></svg>
        <div class="time"><b id="tTime">${mmss(left)}</b><span>${MODE_LBL[T.mode]}</span></div></div>
      <div class="dots">${[...Array(p.cycles)].map((_, i) => `<i class="${i < T.cycle % p.cycles ? 'on' : ''}"></i>`).join('')}</div>
      <select data-pcard style="max-width:360px"><option value="">— estudar qual cartão? (opcional) —</option>
        ${cards.map(c => `<option value="${c.id}" ${c.id === T.cardId ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select>
      <div class="controls">
        ${T.running ? '<button class="primary" data-act="t-pause">⏸ Pausar</button>' : '<button class="primary" data-act="t-start">▶ Iniciar</button>'}
        <button class="ghost" data-act="t-reset">↺ Reiniciar</button>
        <button class="ghost" data-act="t-skip">⏭ Pular</button>
      </div>
      <div class="glass"><b>Hoje</b> · ${sess.length} ciclos · ${fmtMin(mins)}
        ${last.length ? `<div style="margin-top:8px;color:var(--muted);font-size:12px">${last.map(s => { const sb = Store.subj(s.subject); return `${fmtDate(s.date)} · ${s.min} min${sb ? ' · ' + esc(sb.name) : ''}`; }).join('<br>')}</div>` : ''}</div>
      <div class="glass" style="margin-top:12px"><b>Configuração</b>
        <div class="presets">${PRESETS.map(x => `<button class="ghost" data-act="t-preset" data-p="${x.slice(1).join(',')}">${x[0]} ${x[1]}/${x[2]}</button>`).join('')}</div>
        <div class="cols3" style="grid-template-columns:repeat(4,1fr)">
          ${[['focus', 'Foco'], ['short', 'Curta'], ['long', 'Longa'], ['cycles', 'Ciclos']].map(([k, l]) => `<div><label class="lbl">${l}</label><input type="number" min="1" max="180" data-pset="${k}" value="${p[k]}"></div>`).join('')}
        </div></div></div>`;
  }

  const QUADS = [
    { id: 'q1', t: '🔥 Fazer agora', d: 'Importante e urgente', imp: true, urg: true },
    { id: 'q2', t: '📅 Agendar', d: 'Importante, não urgente', imp: true, urg: false },
    { id: 'q3', t: '⚡ Resolver rápido', d: 'Urgente, não importante', imp: false, urg: true },
    { id: 'q4', t: '🗂️ Depois / eliminar', d: 'Nem urgente nem importante', imp: false, urg: false }
  ];
  function vEisen() {
    const cards = boardCards().filter(c => !c.done && matches(c));
    return `<div class="toolbar"><h2>Matriz de Eisenhower</h2><span class="hint">Arraste os cartões entre os quadrantes.</span></div>
      <div class="matrix">${QUADS.map(q => `<div class="quad ${q.id}"><h3>${q.t}</h3><p>${q.d}</p>
        <div class="cards" data-drop="${q.id}" data-drop-kind="quad">${cards.filter(c => c.important === q.imp && c.urgent === q.urg).map(cardHTML).join('')}</div></div>`).join('')}</div>`;
  }

  function vReview() {
    const dr = dueReviews(), df = dueFlash();
    const tabs = `<div class="tabs"><button class="${ui.revTab === 'cards' ? 'on' : ''}" data-act="rev-tab" data-t="cards">Cartões (${dr.length})</button>
      <button class="${ui.revTab === 'flash' ? 'on' : ''}" data-act="rev-tab" data-t="flash">Flashcards (${df.length})</button></div>`;
    if (ui.revTab === 'cards') {
      const upcoming = Object.values(st().cards).filter(c => c.srs && c.srs.next > Store.today()).sort((a, b) => a.srs.next.localeCompare(b.srs.next));
      return `<div class="toolbar"><h2>Revisão espaçada</h2></div>${tabs}
        ${dr.length ? dr.map(c => `<div class="glass review-card"><div class="row" style="display:flex;gap:8px;align-items:center"><b class="grow">${esc(c.title)}</b><span class="chip">estágio ${c.srs.stage + 1}</span>
          <button class="icon" data-open="${c.id}" title="Abrir">↗</button></div>
          ${c.cornell.summary ? `<p class="hint" style="margin-top:8px">${esc(c.cornell.summary)}</p>` : ''}
          <p class="hint" style="margin:10px 0">Consegue explicar este tópico de memória?</p>
          <div class="rate"><button class="again" data-act="rev" data-r="again" data-id="${c.id}">😵 Esqueci</button><button class="hard" data-act="rev" data-r="hard" data-id="${c.id}">🤔 Difícil</button><button class="good" data-act="rev" data-r="good" data-id="${c.id}">✅ Lembrei</button></div></div>`).join('')
          : '<div class="empty">🎉 Nenhuma revisão pendente hoje.<br>Abra um cartão → aba <b>Revisão</b> para iniciar o ciclo.</div>'}
        ${upcoming.length ? `<h3 style="margin:22px 0 8px">Próximas</h3>${upcoming.map(c => `<div class="list-item"><span class="grow">${esc(c.title)}</span><span class="chip">📅 ${fmtDate(c.srs.next)}</span></div>`).join('')}` : ''}`;
    }
    const f = df[0];
    const s = st();
    return `<div class="toolbar"><h2>Flashcards · Active recall</h2></div>${tabs}
      ${f ? `<div class="flash"><div><small>${(Store.subj(f.subject) || { name: 'Geral' }).name} · ${df.length} restantes</small>
          ${esc(ui.flashShow ? f.back : f.front)}</div></div>
        ${ui.flashShow ? `<div class="rate"><button class="again" data-act="flash-rate" data-r="again" data-id="${f.id}">😵 Errei</button><button class="hard" data-act="flash-rate" data-r="hard" data-id="${f.id}">🤔 Difícil</button><button class="good" data-act="flash-rate" data-r="good" data-id="${f.id}">✅ Acertei</button></div>`
          : `<div class="rate"><button class="primary" data-act="flash-show">Mostrar resposta</button></div>`}`
        : '<div class="empty">🎉 Sem flashcards para hoje.</div>'}
      <div class="glass" style="max-width:640px;margin:26px auto 14px"><b>Novo flashcard</b>
        <div class="cols2"><div><label class="lbl">Matéria</label><select id="fcSubj"><option value="">Geral</option>${s.subjects.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><div></div></div>
        <label class="lbl">Pergunta</label><input type="text" id="fcFront"><label class="lbl">Resposta</label><input type="text" id="fcBack">
        <div style="margin-top:12px"><button class="primary" data-act="flash-add">Adicionar</button></div></div>
      <div style="max-width:640px;margin:0 auto">${s.flash.map(x => `<div class="list-item"><div class="grow"><div>${esc(x.front)}</div><div class="hint">${esc(x.back)}</div></div>
        <span class="chip">${x.next <= Store.today() ? 'hoje' : fmtDate(x.next)}</span><button class="icon" data-act="flash-del" data-id="${x.id}">✕</button></div>`).join('')}</div>`;
  }

  function vStats() {
    const s = st(), act = Store.activityByDate(), today = Store.today();
    const totalMin = s.sessions.reduce((a, x) => a + x.min, 0);
    let streak = 0, d = act[today] ? today : Store.addDays(today, -1);
    while (act[d]) { streak++; d = Store.addDays(d, -1); }
    const doneCount = Object.values(s.cards).filter(c => c.done).length, all = Object.keys(s.cards).length;
    const last14 = [...Array(14)].map((_, i) => Store.addDays(today, i - 13));
    const vals = last14.map(x => s.sessions.filter(y => y.date === x).reduce((a, y) => a + y.min, 0));
    const max = Math.max(30, ...vals);
    const bySub = {};
    s.sessions.forEach(x => { bySub[x.subject || ''] = (bySub[x.subject || ''] || 0) + x.min; });
    const subRows = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
    const maxSub = Math.max(1, ...subRows.map(r => r[1]));
    const ws = weekStart(-11);
    const cells = [...Array(84)].map((_, i) => {
      const dt = new Date(ws); dt.setDate(ws.getDate() + i); const iso = Store.iso(dt), m = act[iso] || 0;
      const lv = iso > today ? '' : m === 0 ? '' : m <= 25 ? 'l1' : m <= 60 ? 'l2' : m <= 120 ? 'l3' : 'l4';
      return `<i class="${lv}" title="${fmtDate(iso)} · ${m} min" ${iso > today ? 'style="opacity:.25"' : ''}></i>`;
    }).join('');
    return `<div class="toolbar"><h2>Progresso</h2></div>
      <div class="stats">
        <div class="stat"><b>${fmtMin(vals[13])}</b><span>Foco hoje</span></div>
        <div class="stat"><b>${fmtMin(totalMin)}</b><span>Foco total</span></div>
        <div class="stat"><b>🔥 ${streak}</b><span>Dias seguidos</span></div>
        <div class="stat"><b>${doneCount}/${all}</b><span>Cartões concluídos</span></div>
        <div class="stat"><b>${s.reviewLog.length}</b><span>Revisões feitas</span></div>
      </div>
      <div class="grid2">
        <div class="glass"><b>Últimos 14 dias</b><div class="bars">${last14.map((x, i) => `<div title="${fmtMin(vals[i])}"><i style="height:${vals[i] / max * 100}%"></i>${x.slice(8)}</div>`).join('')}</div></div>
        <div class="glass"><b>Tempo por matéria</b>${subRows.length ? subRows.map(([id, m]) => { const sb = Store.subj(id); return `<div class="hbar"><div class="t"><span>${sb ? esc(sb.name) : 'Sem matéria'}</span><span>${fmtMin(m)}</span></div><div class="b"><i style="width:${m / maxSub * 100}%;background:${sb ? sb.color : '#9a9c9f'}"></i></div></div>`; }).join('') : '<p class="hint" style="margin-top:10px">Conclua ciclos Pomodoro para ver os dados.</p>'}</div>
      </div>
      <div class="glass" style="margin-top:14px"><b>Constância (12 semanas)</b><div class="heat">${cells}</div></div>`;
  }

  function vMethods() {
    return `<div class="hero"><h2>🧭 Metodologias de estudo</h2>
        <p style="color:#c9cde0">Combinação sugerida: <b>Time blocking</b> para agendar → <b>Pomodoro</b> para focar → <b>Active recall + Repetição espaçada</b> para fixar → <b>Eisenhower</b> para priorizar na semana.</p></div>
      <div class="methods">${Methods.LIST.map(m => `<div class="method"><h3><span class="em">${m.icon}</span>${esc(m.name)}</h3>
        <div class="tag">${esc(m.tagline)}</div><ol>${m.how.map(h => `<li>${esc(h)}</li>`).join('')}</ol>
        <div class="when">💡 ${esc(m.when)}</div>
        <div class="actions">${m.view ? `<button class="primary" data-act="m-view" data-v="${m.view}">Abrir ferramenta</button>` : ''}
          ${m.open ? `<button class="primary" data-act="m-open" data-m="${m.open}">Como usar</button>` : ''}
          ${m.template ? `<button class="ghost" data-act="m-template" data-m="${m.id}">Criar quadro modelo</button>` : ''}</div></div>`).join('')}</div>`;
  }

  /* ---------- shell ---------- */
  function renderNav() {
    const badge = dueReviews().length + dueFlash().length;
    $('#nav').innerHTML = NAV.map(n => `<button class="nav-btn ${ui.view === n.id ? 'on' : ''}" data-view="${n.id}"><span class="ic">${n.ic}</span><span class="lbl">${n.lbl}</span>${n.id === 'review' && badge ? `<span class="badge">${badge}</span>` : ''}</button>`).join('');
  }
  function renderPicker() {
    const s = st();
    $('#boardPicker').innerHTML = `<select id="boardSel">${s.boards.map(b => `<option value="${b.id}" ${b.id === s.activeBoard ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
      <button class="icon" data-act="new-board" title="Novo quadro">＋</button><button class="icon" data-act="rename-board" title="Renomear">✎</button><button class="icon" data-act="del-board" title="Excluir quadro">🗑</button>`;
  }
  function render() {
    const v = $('#view'), sy = v.scrollTop, sx = v.scrollLeft;
    renderNav(); renderPicker();
    const fn = { board: vBoard, schedule: vSchedule, pomodoro: vPomo, eisenhower: vEisen, review: vReview, stats: vStats, methods: vMethods }[ui.view];
    v.innerHTML = fn();
    v.scrollTop = sy; v.scrollLeft = sx;
    tickDom();
  }
  function go(view) { ui.view = view; ui.flashShow = false; render(); }

  /* ---------- modal do cartão ---------- */
  function setPath(o, path, val) {
    const k = path.split('.'); let t = o;
    while (k.length > 1) t = t[k.shift()];
    t[k[0]] = val;
  }
  function openCard(id) {
    const c = st().cards[id]; if (!c) return;
    const loc = Store.findCol(id);
    const subjOpts = () => `<option value="">— sem matéria —</option>${st().subjects.map(x => `<option value="${x.id}" ${x.id === c.subject ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="__new">＋ Nova matéria…</option>`;
    const html = `
      <input class="title-in" data-bind="title" value="${esc(c.title)}" placeholder="Título do cartão">
      <div class="hint">na lista <b>${esc(loc.c.name)}</b> · quadro ${esc(loc.b.name)}</div>
      <div class="tabs" style="margin-top:14px">${[['d', 'Detalhes'], ['c', 'Checklist'], ['n', 'Cornell'], ['f', 'Feynman'], ['r', 'Revisão']].map(([k, l], i) => `<button data-tab="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>

      <div class="panel on" data-panel="d">
        <div class="cols2"><div><label class="lbl">Lista</label><select data-colmove>${loc.b.columns.map(x => `<option value="${x.id}" ${x.id === loc.c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div><label class="lbl">Matéria</label><select data-bind="subject" id="subjSel">${subjOpts()}</select></div></div>
        <div class="cols3"><div><label class="lbl">Prioridade</label><select data-bind="priority" data-num>${[1, 2, 3, 4].map(p => `<option value="${p}" ${c.priority === p ? 'selected' : ''}>${PRIOS[p]}</option>`).join('')}</select></div>
          <div><label class="lbl">Prazo</label><input type="date" data-bind="due" value="${c.due}"></div>
          <div><label class="lbl">Estimativa 🍅</label><input type="number" min="0" max="40" data-bind="est" data-num value="${c.est}"></div></div>
        <div class="flags">
          <label class="flag"><input type="checkbox" data-bind="important" ${c.important ? 'checked' : ''}> ⭐ Importante</label>
          <label class="flag"><input type="checkbox" data-bind="urgent" ${c.urgent ? 'checked' : ''}> ⏰ Urgente</label>
          <label class="flag"><input type="checkbox" data-bind="frog" ${c.frog ? 'checked' : ''}> 🐸 Sapo do dia</label></div>
        <label class="lbl">Métodos aplicados</label>
        <div class="flags" style="margin-top:0">${Methods.TAGGABLE.map(m => `<label class="flag"><input type="checkbox" data-tag="${m.id}" ${c.tags.includes(m.id) ? 'checked' : ''}> ${m.icon} ${esc(m.name)}</label>`).join('')}</div>
        <label class="lbl">Descrição / notas</label><textarea data-bind="desc" placeholder="Links, capítulos, dúvidas…">${esc(c.desc)}</textarea>
      </div>

      <div class="panel" data-panel="c">
        <div id="cl"></div>
        <div style="display:flex;gap:8px;margin-top:10px"><input type="text" id="clNew" placeholder="Novo item (Enter)"><button class="primary" id="clAdd">Add</button></div>
      </div>

      <div class="panel" data-panel="n">
        <p class="hint">Método Cornell: notas à direita, perguntas-chave à esquerda e resumo no fim.</p>
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px"><div><label class="lbl">Pistas / perguntas</label><textarea data-bind="cornell.cue" style="min-height:200px">${esc(c.cornell.cue)}</textarea></div>
          <div><label class="lbl">Anotações</label><textarea data-bind="cornell.notes" style="min-height:200px">${esc(c.cornell.notes)}</textarea></div></div>
        <label class="lbl">Resumo</label><textarea data-bind="cornell.summary" style="min-height:70px">${esc(c.cornell.summary)}</textarea>
      </div>

      <div class="panel" data-panel="f">
        <p class="hint">Técnica Feynman: explique, ache as lacunas e reescreva de forma simples.</p>
        <label class="lbl">1 · Explique com suas palavras</label><textarea data-bind="feynman.explain">${esc(c.feynman.explain)}</textarea>
        <label class="lbl">2 · Onde travei? (lacunas)</label><textarea data-bind="feynman.gaps" style="min-height:70px">${esc(c.feynman.gaps)}</textarea>
        <label class="lbl">3 · Versão simples (analogia)</label><textarea data-bind="feynman.simple" style="min-height:70px">${esc(c.feynman.simple)}</textarea>
      </div>

      <div class="panel" data-panel="r"><div id="srs"></div></div>

      <div class="foot"><button class="danger" id="cDel">Excluir</button><div class="r"><button class="primary" id="cOk">Fechar</button></div></div>`;
    const { el, close } = openModal(html, '', () => { render(); });

    const renderCL = () => {
      $('#cl', el).innerHTML = c.checklist.length ? c.checklist.map((i, k) => `<label class="check ${i.d ? 'd' : ''}"><input type="checkbox" data-ci="${k}" ${i.d ? 'checked' : ''}><span>${esc(i.t)}</span><button class="icon" data-cdel="${k}">✕</button></label>`).join('')
        : '<p class="hint">Quebre o tópico em passos pequenos.</p>';
    };
    const renderSRS = () => {
      const box = $('#srs', el);
      box.innerHTML = c.srs ? `<div class="glass"><b>Estágio ${c.srs.stage + 1}</b> · próxima revisão em <b>${fmtDate(c.srs.next)}</b>
          <p class="hint" style="margin:8px 0">Intervalos: ${Store.INTERVALS.map(x => '+' + x + 'd').join(' · ')}</p>
          <div style="display:flex;gap:8px"><button class="ghost" id="srsReset">Reiniciar (estudei hoje)</button><button class="danger" id="srsStop">Parar revisões</button></div></div>`
        : `<div class="glass"><p>Agende revisões automáticas: ela volta para você em 1, 2, 4, 8, 16… dias.</p><div style="margin-top:12px"><button class="primary" id="srsStart">🔁 Iniciar revisões</button></div></div>`;
    };
    renderCL(); renderSRS();

    el.addEventListener('click', e => {
      const t = e.target;
      if (t.dataset.tab) { $$('[data-tab]', el).forEach(b => b.classList.toggle('on', b === t)); $$('.panel', el).forEach(p => p.classList.toggle('on', p.dataset.panel === t.dataset.tab)); }
      if (t.dataset.cdel != null) { c.checklist.splice(+t.dataset.cdel, 1); Store.save(); renderCL(); }
      if (t.id === 'clAdd') addItem();
      if (t.id === 'cOk') close();
      if (t.id === 'cDel') { if (confirm('Excluir este cartão?')) { Store.removeCard(id); close(); } }
      if (t.id === 'srsStart') { c.srs = { stage: 0, next: Store.addDays(Store.today(), 1) }; Store.save(); renderSRS(); toast('Primeira revisão amanhã 🔁'); }
      if (t.id === 'srsReset') { c.srs = { stage: 0, next: Store.addDays(Store.today(), 1) }; Store.save(); renderSRS(); }
      if (t.id === 'srsStop') { c.srs = null; Store.save(); renderSRS(); }
    });
    const addItem = () => { const i = $('#clNew', el); if (i.value.trim()) { c.checklist.push({ t: i.value.trim(), d: false }); i.value = ''; Store.save(); renderCL(); i.focus(); } };
    $('#clNew', el).addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
    const onChange = async e => {
      const t = e.target;
      if (t.dataset.ci != null) { c.checklist[+t.dataset.ci].d = t.checked; Store.save(); renderCL(); return; }
      if (t.dataset.tag) { c.tags = t.checked ? [...new Set([...c.tags, t.dataset.tag])] : c.tags.filter(x => x !== t.dataset.tag); Store.save(); return; }
      if (t.dataset.colmove != null) { Store.moveCard(id, t.value); return; }
      if (t.dataset.bind) {
        if (t.id === 'subjSel' && t.value === '__new') {
          const name = await ask('Nova matéria', '', 'Ex.: Química');
          if (name) { c.subject = Store.addSubject(name).id; Store.save(); }
          t.innerHTML = subjOpts(); return;
        }
        let v = t.type === 'checkbox' ? t.checked : t.value;
        if (t.hasAttribute('data-num')) v = Number(v) || 0;
        setPath(c, t.dataset.bind, v); Store.save();
      }
    };
    el.addEventListener('input', e => { if (e.target.dataset.bind && e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') onChange(e); });
    el.addEventListener('change', onChange);
  }

  /* ---------- modal de bloco ---------- */
  function openBlock(id, pre = {}) {
    const s = st(), b = id ? s.blocks.find(x => x.id === id) : null;
    const v = b || Object.assign({ title: '', subject: '', cardId: '', date: Store.today(), start: 9 * 60, dur: 60 }, pre);
    const cards = Object.values(s.cards).filter(c => !c.done);
    const { el, close } = openModal(`<h2>${b ? 'Editar bloco' : 'Novo bloco de estudo'}</h2>
      <label class="lbl">Título</label><input type="text" id="bT" value="${esc(v.title)}" placeholder="O que vai estudar?">
      <div class="cols2"><div><label class="lbl">Matéria</label><select id="bS"><option value="">—</option>${s.subjects.map(x => `<option value="${x.id}" ${x.id === v.subject ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <div><label class="lbl">Vincular a cartão</label><select id="bC"><option value="">—</option>${cards.map(x => `<option value="${x.id}" ${x.id === v.cardId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></div></div>
      <div class="cols3"><div><label class="lbl">Data</label><input type="date" id="bD" value="${v.date}"></div>
        <div><label class="lbl">Início</label><input type="time" id="bH" value="${fmtT(v.start)}"></div>
        <div><label class="lbl">Duração (min)</label><input type="number" id="bM" min="15" step="15" value="${v.dur}"></div></div>
      <div class="foot">${b ? '<button class="danger" id="bDel">Excluir</button>' : '<span></span>'}<div class="r"><button class="ghost" id="bX">Cancelar</button><button class="primary" id="bOk">Salvar</button></div></div>`, 'sm', () => render());
    $('#bC', el).addEventListener('change', e => {
      const c = s.cards[e.target.value]; if (!c) return;
      if (!$('#bT', el).value.trim()) $('#bT', el).value = c.title;
      if (c.subject) $('#bS', el).value = c.subject;
    });
    el.addEventListener('click', e => {
      const t = e.target.id;
      if (t === 'bX') close();
      if (t === 'bDel') { s.blocks = s.blocks.filter(x => x.id !== id); Store.save(); close(); }
      if (t === 'bOk') {
        const title = $('#bT', el).value.trim(); if (!title) { $('#bT', el).focus(); return; }
        const [h, m] = ($('#bH', el).value || '09:00').split(':').map(Number);
        const data = { title, subject: $('#bS', el).value, cardId: $('#bC', el).value, date: $('#bD', el).value || Store.today(), start: h * 60 + m, dur: Math.max(15, Number($('#bM', el).value) || 60) };
        if (b) Object.assign(b, data); else s.blocks.push(Object.assign({ id: Store.uid() }, data));
        Store.save(); close();
      }
    });
  }

  function autoPlan() {
    const s = st(), todayIso = Store.today(), now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const WIN = [[8 * 60, 12 * 60], [14 * 60, 18 * 60], [19 * 60, 22 * 60]];
    const cands = Object.values(s.cards).filter(c => !c.done && c.est > c.pomos && !s.blocks.some(b => b.cardId === c.id && b.date >= todayIso))
      .sort((a, b) => (Number(b.frog) - Number(a.frog)) || (a.due || '9999').localeCompare(b.due || '9999') || b.priority - a.priority);
    let created = 0;
    for (const c of cands) {
      const need = Math.min((c.est - c.pomos) * 30, 120);
      let placed = false;
      for (let d = 0; d < 7 && !placed; d++) {
        const date = Store.addDays(todayIso, d);
        if (c.due && date > c.due && d > 0) break;
        const day = s.blocks.filter(b => b.date === date);
        if (day.reduce((a, b) => a + b.dur, 0) >= 300) continue;
        for (const [ws, we] of WIN) {
          for (let t = ws; t + need <= we && !placed; t += 15) {
            if (d === 0 && t < nowMin + 15) continue;
            if (day.some(b => t < b.start + b.dur + 10 && t + need + 10 > b.start)) continue;
            s.blocks.push({ id: Store.uid(), date, start: t, dur: need, title: c.title, subject: c.subject, cardId: c.id });
            placed = true; created++;
          }
          if (placed) break;
        }
      }
    }
    Store.save(); ui.weekOffset = 0; render();
    toast(created ? `✨ ${created} bloco(s) criado(s) automaticamente` : 'Nada para planejar (sem cartões com estimativa pendente)');
  }

  /* ---------- modelos de quadro ---------- */
  function newBoardModal() {
    const opts = [{ id: '', name: 'Em branco', icon: '📄', template: null }, ...Methods.LIST.filter(m => m.template)];
    const { el, close } = openModal(`<h2>Novo quadro</h2>
      <label class="lbl">Nome</label><input type="text" id="nbN" placeholder="Ex.: Prova de Cálculo">
      <label class="lbl">Modelo</label>
      ${opts.map((m, i) => `<label class="list-item" style="cursor:pointer"><input type="radio" name="tpl" value="${m.id}" ${i === 0 ? 'checked' : ''}><span style="font-size:18px">${m.icon}</span><div class="grow"><b>${esc(m.name)}</b><div class="hint">${m.template ? m.template.map(c => esc(c.name)).join(' → ') : 'A fazer → Fazendo → Feito'}</div></div></label>`).join('')}
      <div class="foot"><span></span><div class="r"><button class="ghost" id="nbX">Cancelar</button><button class="primary" id="nbOk">Criar</button></div></div>`);
    el.addEventListener('click', e => {
      if (e.target.id === 'nbX') close();
      if (e.target.id === 'nbOk') {
        const tpl = ($('input[name=tpl]:checked', el) || {}).value, m = Methods.byId(tpl);
        Store.addBoard($('#nbN', el).value.trim() || (m ? m.name : 'Novo quadro'), m ? m.template : null);
        close(); go('board');
      }
    });
  }

  async function colMenu(colId) {
    const b = Store.board(), col = b.columns.find(c => c.id === colId);
    const { el, close } = openModal(`<h2>${esc(col.name)}</h2>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <button class="ghost" data-x="ren">✎ Renomear lista</button>
        <button class="ghost" data-x="done">${col.done ? '☐ Deixar de marcar como "concluído"' : '✓ Marcar como lista de concluídos'}</button>
        <button class="ghost" data-x="left">← Mover para a esquerda</button><button class="ghost" data-x="right">→ Mover para a direita</button>
        <button class="danger" data-x="del">🗑 Excluir lista</button></div>`, 'sm');
    el.addEventListener('click', async e => {
      const x = e.target.dataset.x; if (!x) return;
      const i = b.columns.indexOf(col);
      if (x === 'ren') { close(); const n = await ask('Renomear lista', col.name); if (n) { col.name = n; Store.save(); render(); } return; }
      if (x === 'done') { col.done = !col.done; col.cards.forEach(id => { const c = st().cards[id]; c.done = col.done; c.completedAt = col.done ? (c.completedAt || Date.now()) : null; }); }
      if (x === 'left' && i > 0) [b.columns[i - 1], b.columns[i]] = [b.columns[i], b.columns[i - 1]];
      if (x === 'right' && i < b.columns.length - 1) [b.columns[i + 1], b.columns[i]] = [b.columns[i], b.columns[i + 1]];
      if (x === 'del') {
        if (b.columns.length < 2) { toast('O quadro precisa de ao menos uma lista'); return; }
        if (!confirm('Excluir lista? Os cartões vão para outra lista.')) return;
        const other = b.columns.find(c => c !== col);
        other.cards.push(...col.cards); col.cards.forEach(id => { st().cards[id].done = !!other.done; });
        b.columns = b.columns.filter(c => c !== col);
      }
      Store.save(); close(); render();
    });
  }

  /* ---------- ações ---------- */
  const A = {
    'quick-add': () => {
      go('board');
      const col = Store.board().columns.find(c => !c.done) || Store.board().columns[0];
      const c = Store.addCard(col.id, 'Novo cartão'); render(); openCard(c.id);
    },
    'add-card': el => {
      const box = document.createElement('div'); box.className = 'inline-add'; box.dataset.col = el.dataset.col;
      box.innerHTML = '<textarea rows="2" placeholder="Título do cartão…"></textarea><div style="display:flex;gap:6px"><button class="primary" data-act="inline-save">Adicionar</button><button class="ghost" data-act="inline-cancel">Cancelar</button></div>';
      el.replaceWith(box);
      const ta = $('textarea', box); ta.focus();
      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); A['inline-save'](box); }
        if (e.key === 'Escape') { e.stopPropagation(); render(); }
      });
    },
    'inline-save': el => {
      const box = el.closest('.inline-add'), v = $('textarea', box).value.trim();
      if (v) { Store.addCard(box.dataset.col, v); toast('Cartão criado'); }
      render();
      if (v) { const b = $(`[data-act="add-card"][data-col="${box.dataset.col}"]`); if (b) b.click(); }
    },
    'inline-cancel': () => render(),
    'add-col': async () => { const n = await ask('Nova lista', '', 'Ex.: Em revisão'); if (n) { Store.board().columns.push({ id: Store.uid(), name: n, done: false, cards: [] }); Store.save(); render(); } },
    'col-menu': el => colMenu(el.dataset.col),
    'new-board': () => newBoardModal(),
    'rename-board': async () => { const b = Store.board(), n = await ask('Renomear quadro', b.name); if (n) { b.name = n; Store.save(); render(); } },
    'del-board': () => { const b = Store.board(); if (st().boards.length < 2) return toast('Mantenha ao menos um quadro'); if (confirm(`Excluir o quadro "${b.name}" e seus cartões?`)) { Store.removeBoard(b.id); render(); } },
    'week-prev': () => { ui.weekOffset--; render(); }, 'week-next': () => { ui.weekOffset++; render(); }, 'week-today': () => { ui.weekOffset = 0; render(); },
    'add-block': () => openBlock(null), 'auto-plan': autoPlan,
    't-start': tStart, 't-pause': tPause, 't-reset': tReset, 't-skip': () => tDone(true),
    't-mode': el => tMode(el.dataset.m),
    't-preset': el => { const [f, s, l] = el.dataset.p.split(',').map(Number); Object.assign(pset(), { focus: f, short: s, long: l }); Store.save(); T.left = null; render(); },
    'rev-tab': el => { ui.revTab = el.dataset.t; ui.flashShow = false; render(); },
    'rev': el => {
      const c = st().cards[el.dataset.id], r = Store.nextReview(c.srs.stage, el.dataset.r);
      c.srs.stage = r.stage; c.srs.next = r.next; st().reviewLog.push(Store.today()); Store.save(); render();
      toast(`Próxima revisão: ${fmtDate(r.next)}`);
    },
    'flash-show': () => { ui.flashShow = true; render(); },
    'flash-rate': el => {
      const f = st().flash.find(x => x.id === el.dataset.id), r = Store.nextReview(f.box, el.dataset.r);
      f.box = r.stage; f.next = r.next; st().reviewLog.push(Store.today()); Store.save(); ui.flashShow = false; render();
    },
    'flash-add': () => {
      const fr = $('#fcFront').value.trim(), bk = $('#fcBack').value.trim();
      if (!fr || !bk) return toast('Preencha pergunta e resposta');
      st().flash.push({ id: Store.uid(), subject: $('#fcSubj').value, front: fr, back: bk, box: 0, next: Store.today() }); Store.save(); render(); toast('Flashcard adicionado');
    },
    'flash-del': el => { st().flash = st().flash.filter(x => x.id !== el.dataset.id); Store.save(); render(); },
    'm-view': el => go(el.dataset.v),
    'm-open': el => { go('board'); toast(el.dataset.m === 'frog' ? 'Abra um cartão e marque 🐸 Sapo do dia' : `Abra um cartão e use a aba ${el.dataset.m === 'cornell' ? 'Cornell' : 'Feynman'}`); },
    'm-template': el => { const m = Methods.byId(el.dataset.m); Store.addBoard(`${m.name} — modelo`, m.template); go('board'); toast(`Quadro "${m.name}" criado`); },
    'export': () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([Store.exportJSON()], { type: 'application/json' }));
      a.download = `studyflow-backup-${Store.today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    'import': () => $('#importFile').click()
  };

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-view]'); if (nav) return go(nav.dataset.view);
    if (e.target.closest('#miniTimer')) return go('pomodoro');
    const act = e.target.closest('[data-act]'); if (act && A[act.dataset.act]) return A[act.dataset.act](act);
    const op = e.target.closest('[data-open]'); if (op) return openCard(op.dataset.open);
    const blk = e.target.closest('[data-block]'); if (blk) return openBlock(blk.dataset.block);
    const card = e.target.closest('.card[data-id]'); if (card) return openCard(card.dataset.id);
    const col = e.target.closest('.daycol');
    if (col) {
      const y = e.clientY - col.getBoundingClientRect().top;
      const start = START_H * 60 + Math.floor(y / ROW * 4) * 15;
      openBlock(null, { date: col.dataset.date, start: Math.min(start, 22 * 60) });
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'boardSel') { st().activeBoard = t.value; Store.save(); render(); }
    if (t.dataset.pcard != null) T.cardId = t.value;
    if (t.dataset.pset) { const v = Math.max(1, Math.min(180, Number(t.value) || 1)); pset()[t.dataset.pset] = v; Store.save(); T.left = null; render(); }
    if (t.id === 'importFile' && t.files[0]) {
      const r = new FileReader();
      r.onload = () => { try { Store.importJSON(r.result); render(); toast('Backup importado ✔'); } catch (err) { toast('Arquivo inválido'); } };
      r.readAsText(t.files[0]); t.value = '';
    }
  });
  $('#search').addEventListener('input', e => { ui.search = e.target.value.trim().toLowerCase(); if (ui.view === 'board' || ui.view === 'eisenhower') render(); });

  /* ---------- arrastar e soltar ---------- */
  let dragId = null;
  document.addEventListener('dragstart', e => {
    const c = e.target.closest && e.target.closest('.card[data-id]'); if (!c) return;
    dragId = c.dataset.id; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
  });
  document.addEventListener('dragend', () => { dragId = null; $$('.dragging,.over').forEach(x => x.classList.remove('dragging', 'over')); });
  document.addEventListener('dragover', e => {
    const z = e.target.closest && e.target.closest('[data-drop]'); if (!z || !dragId) return;
    e.preventDefault(); $$('.over').forEach(x => { if (x !== z) x.classList.remove('over'); }); z.classList.add('over');
  });
  document.addEventListener('drop', e => {
    const z = e.target.closest && e.target.closest('[data-drop]'); if (!z || !dragId) return;
    e.preventDefault(); const id = dragId; dragId = null;
    if (z.dataset.dropKind === 'quad') {
      const q = QUADS.find(x => x.id === z.dataset.drop), c = st().cards[id];
      c.important = q.imp; c.urgent = q.urg; Store.save();
    } else {
      const col = Store.board().columns.find(c => c.id === z.dataset.drop);
      const vis = $$('.card[data-id]', z).filter(x => x.dataset.id !== id);
      let idx = vis.length;
      for (let i = 0; i < vis.length; i++) { const r = vis[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { idx = i; break; } }
      const rest = col.cards.filter(x => x !== id);
      const at = idx < vis.length ? rest.indexOf(vis[idx].dataset.id) : rest.length;
      Store.moveCard(id, col.id, at < 0 ? rest.length : at);
    }
    render();
  });

  /* ---------- atalhos ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') return closeTopModal();
    const typing = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || $('.overlay');
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
    else if (e.key === 'n') A['quick-add']();
    else if (/^[1-7]$/.test(e.key)) go(NAV[+e.key - 1].id);
  });

  render();
})();
