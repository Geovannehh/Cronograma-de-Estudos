/* StudyFlow — camada de dados (estado, persistência, helpers) */
const Store = (() => {
  const KEY = 'studyflow.v1';
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const INTERVALS = [1, 2, 4, 8, 16, 32, 64]; // dias por estágio (Leitner / espaçada)
  const COLORS = ['#4a6fa5', '#2f6bed', '#4e6bb5', '#4a86e8', '#777777', '#1c8f88', '#9a9c9f', '#0a0a0a'];
  // migra cores antigas (tema escuro) para a paleta atual
  const OLD = { '#7c5cff': COLORS[0], '#22d3ee': COLORS[1], '#34d399': COLORS[2], '#fbbf24': COLORS[3], '#fb7185': COLORS[4], '#f97316': COLORS[5], '#a3e635': COLORS[6], '#e879f9': COLORS[7] };

  let state;

  function blankCard(over = {}) {
    return Object.assign({
      id: uid(), title: '', desc: '', subject: '', priority: 2,
      important: false, urgent: false, frog: false, due: '', est: 2, pomos: 0,
      checklist: [], tags: [],
      cornell: { cue: '', notes: '', summary: '' },
      feynman: { explain: '', gaps: '', simple: '' },
      srs: null, done: false, completedAt: null, created: Date.now()
    }, over);
  }

  function seed() {
    const subjects = [
      { id: 's1', name: 'Matemática', color: COLORS[0] },
      { id: 's2', name: 'Programação', color: COLORS[1] },
      { id: 's3', name: 'Inglês', color: COLORS[2] },
      { id: 's4', name: 'Física', color: COLORS[3] }
    ];
    const cols = ['Backlog', 'Para estudar', 'Estudando', 'Revisar', 'Concluído']
      .map((n, i) => ({ id: uid(), name: n, done: i === 4, cards: [] }));
    const board = { id: uid(), name: 'Meu estudo', columns: cols };
    const cards = {};
    const add = (ci, over) => { const c = blankCard(over); cards[c.id] = c; cols[ci].cards.push(c.id); return c; };
    add(0, { title: 'Cálculo II — integrais por partes', subject: 's1', priority: 3, important: true, est: 4, tags: ['recall'] });
    add(0, { title: 'Ler artigo sobre Clean Architecture', subject: 's2', priority: 1, est: 2, tags: ['sq3r'] });
    add(1, { title: 'Lista de exercícios de Física (cap. 5)', subject: 's4', priority: 3, urgent: true, important: true, due: addDays(today(), 2), est: 3, tags: ['pomodoro'], frog: true,
      checklist: [{ t: 'Questões 1–10', d: false }, { t: 'Questões 11–20', d: false }, { t: 'Revisar erros', d: false }] });
    add(1, { title: 'Vocabulário: phrasal verbs', subject: 's3', priority: 2, est: 1, tags: ['spaced'] });
    add(2, { title: 'Projeto: API REST em Node', subject: 's2', priority: 2, important: true, est: 5, tags: ['kanban', 'feynman'] });
    add(4, { title: 'Revisão de álgebra linear', subject: 's1', priority: 2, est: 2, done: true, completedAt: Date.now() });
    const flash = [
      { id: uid(), subject: 's2', front: 'O que é uma closure em JavaScript?', back: 'Função que "lembra" o escopo em que foi criada, mesmo executada fora dele.', box: 0, next: today() },
      { id: uid(), subject: 's1', front: 'Fórmula da integração por partes', back: '∫u dv = u·v − ∫v du', box: 0, next: today() },
      { id: uid(), subject: 's3', front: '"Give up"', back: 'Desistir', box: 0, next: today() }
    ];
    return {
      v: 1, boards: [board], activeBoard: board.id, cards, subjects, blocks: [], flash,
      sessions: [], reviewLog: [],
      settings: { pomo: { focus: 25, short: 5, long: 15, cycles: 4 } }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : seed();
    } catch (e) { state = seed(); }
    state.settings = state.settings || { pomo: { focus: 25, short: 5, long: 15, cycles: 4 } };
    state.reviewLog = state.reviewLog || [];
    state.sessions = state.sessions || [];
    state.blocks = state.blocks || [];
    state.flash = state.flash || [];
    (state.subjects || []).forEach(x => { if (OLD[x.color]) x.color = OLD[x.color]; });
    if (!state.boards.find(b => b.id === state.activeBoard)) state.activeBoard = state.boards[0].id;
    save();
  }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage cheio/bloqueado */ } }
  const get = () => state;
  const board = () => state.boards.find(b => b.id === state.activeBoard);
  const subj = id => state.subjects.find(s => s.id === id);

  function addBoard(name, colDefs) {
    const b = {
      id: uid(), name,
      columns: (colDefs || [{ name: 'A fazer' }, { name: 'Fazendo' }, { name: 'Feito', done: true }])
        .map(c => ({ id: uid(), name: c.name, done: !!c.done, cards: [] }))
    };
    state.boards.push(b); state.activeBoard = b.id; save(); return b;
  }

  function removeBoard(id) {
    if (state.boards.length < 2) return false;
    const b = state.boards.find(x => x.id === id);
    b.columns.forEach(c => c.cards.forEach(cid => delete state.cards[cid]));
    state.boards = state.boards.filter(x => x.id !== id);
    if (state.activeBoard === id) state.activeBoard = state.boards[0].id;
    save(); return true;
  }

  function addCard(colId, title, over = {}) {
    const col = board().columns.find(c => c.id === colId) || board().columns[0];
    const c = blankCard(Object.assign({ title, done: !!col.done }, over));
    state.cards[c.id] = c; col.cards.push(c.id); save(); return c;
  }

  function findCol(cardId) {
    for (const b of state.boards) for (const c of b.columns) if (c.cards.includes(cardId)) return { b, c };
    return null;
  }

  function moveCard(id, colId, index) {
    const f = findCol(id); if (!f) return;
    const target = f.b.columns.find(c => c.id === colId); if (!target) return;
    f.c.cards = f.c.cards.filter(x => x !== id);
    const i = index == null ? target.cards.length : Math.max(0, Math.min(index, target.cards.length));
    target.cards.splice(i, 0, id);
    const card = state.cards[id];
    card.done = !!target.done;
    card.completedAt = card.done ? (card.completedAt || Date.now()) : null;
    save();
  }

  function removeCard(id) {
    const f = findCol(id); if (f) f.c.cards = f.c.cards.filter(x => x !== id);
    delete state.cards[id];
    state.blocks.forEach(b => { if (b.cardId === id) b.cardId = null; });
    save();
  }

  function addSubject(name) {
    const s = { id: uid(), name, color: COLORS[state.subjects.length % COLORS.length] };
    state.subjects.push(s); save(); return s;
  }

  // rating: 'again' | 'hard' | 'good'
  function nextReview(stage, rating) {
    let st = stage;
    if (rating === 'again') st = 0;
    else if (rating === 'good') st = Math.min(stage + 1, INTERVALS.length - 1);
    return { stage: st, next: addDays(today(), INTERVALS[st]) };
  }

  function logSession(min, subject, cardId) {
    state.sessions.push({ ts: Date.now(), date: today(), min, subject: subject || '', cardId: cardId || null });
    save();
  }

  function activityByDate() {
    const m = {};
    state.sessions.forEach(s => { m[s.date] = (m[s.date] || 0) + s.min; });
    state.reviewLog.forEach(d => { m[d] = (m[d] || 0) + 2; });
    return m;
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(txt) {
    const o = JSON.parse(txt);
    if (!o || !o.boards || !o.cards) throw new Error('Arquivo inválido');
    state = o; load(); return true;
  }
  function reset() { state = seed(); save(); }

  load();
  return {
    get, save, board, subj, uid, today, addDays, iso, pad, INTERVALS, COLORS,
    addBoard, removeBoard, addCard, moveCard, removeCard, findCol, addSubject,
    nextReview, logSession, activityByDate, exportJSON, importJSON, reset, blankCard
  };
})();
