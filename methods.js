/* StudyFlow — catálogo de metodologias de estudo e modelos de quadro */
const Methods = (() => {
  const LIST = [
    {
      id: 'kanban', icon: '📋', name: 'Kanban', tagline: 'Visualize o fluxo e limite o trabalho em andamento.',
      how: ['Divida o estudo em cartões (tópicos ou tarefas).', 'Mova entre listas: A fazer → Fazendo → Feito.', 'Mantenha no máximo 2–3 cartões em "Fazendo".'],
      when: 'Para ter visão geral da matéria e não começar tudo ao mesmo tempo.',
      template: [{ name: 'Backlog' }, { name: 'A fazer' }, { name: 'Fazendo' }, { name: 'Feito', done: true }]
    },
    {
      id: 'pomodoro', icon: '🍅', name: 'Pomodoro', tagline: 'Blocos de foco curtos com pausas programadas.',
      how: ['Escolha um cartão e inicie o timer (25 min).', 'Estude sem interrupções até tocar o alarme.', 'Pausa de 5 min; a cada 4 ciclos, pausa longa.'],
      when: 'Quando você procrastina ou perde foco com facilidade.', view: 'pomodoro'
    },
    {
      id: 'timeblock', icon: '🗓️', name: 'Time blocking', tagline: 'Reserve horários fixos na agenda para cada matéria.',
      how: ['Abra o Cronograma e clique num horário livre.', 'Crie blocos por matéria ou cartão.', 'Use "Planejar semana" para distribuir automaticamente.'],
      when: 'Para transformar intenção em compromisso com hora marcada.', view: 'schedule'
    },
    {
      id: 'eisenhower', icon: '🎯', name: 'Matriz de Eisenhower', tagline: 'Priorize por importância × urgência.',
      how: ['Marque cada cartão como Importante e/ou Urgente.', 'Faça agora o que é importante e urgente.', 'Agende o importante não urgente (é onde está o progresso).'],
      when: 'Época de provas e prazos acumulados.', view: 'eisenhower'
    },
    {
      id: 'spaced', icon: '🔁', name: 'Repetição espaçada', tagline: 'Revise logo antes de esquecer (1, 2, 4, 8, 16… dias).',
      how: ['Abra um cartão → aba Revisão → "Iniciar revisões".', 'Todo dia abra a aba Revisão e responda: errei / difícil / lembrei.', 'O intervalo cresce a cada acerto.'],
      when: 'Memorização de longo prazo (vocabulário, fórmulas, conceitos).', view: 'review',
      template: [{ name: 'Aprender' }, { name: 'Revisão 1' }, { name: 'Revisão 2' }, { name: 'Revisão 3' }, { name: 'Dominado', done: true }]
    },
    {
      id: 'recall', icon: '🧠', name: 'Active recall (flashcards)', tagline: 'Teste a si mesmo em vez de reler.',
      how: ['Crie flashcards pergunta/resposta.', 'Tente responder antes de revelar.', 'Avalie e deixe o sistema reagendar.'],
      when: 'Sempre — é uma das técnicas com maior evidência de eficácia.', view: 'review'
    },
    {
      id: 'feynman', icon: '🧑‍🏫', name: 'Técnica Feynman', tagline: 'Explique como se ensinasse uma criança.',
      how: ['Escolha o conceito e explique com suas palavras.', 'Anote as lacunas onde travou.', 'Volte à fonte e reescreva de forma simples.'],
      when: 'Conceitos difíceis que você acha que entendeu.', open: 'feynman',
      template: [{ name: 'Escolher conceito' }, { name: 'Explicar' }, { name: 'Achar lacunas' }, { name: 'Simplificar' }, { name: 'Dominado', done: true }]
    },
    {
      id: 'cornell', icon: '📝', name: 'Método Cornell', tagline: 'Anotações em três zonas: pistas, notas e resumo.',
      how: ['Registre as notas na coluna principal.', 'Depois, escreva perguntas-chave (pistas).', 'Feche com um resumo de 2–3 frases.'],
      when: 'Aulas, livros e vídeos.', open: 'cornell'
    },
    {
      id: 'sq3r', icon: '📖', name: 'SQ3R', tagline: 'Survey, Question, Read, Recite, Review.',
      how: ['Passe os olhos no capítulo (títulos, resumos).', 'Transforme títulos em perguntas.', 'Leia, recite com suas palavras e revise.'],
      when: 'Leitura de textos longos e técnicos.',
      template: [{ name: 'Survey (visão geral)' }, { name: 'Question (perguntas)' }, { name: 'Read (ler)' }, { name: 'Recite (recitar)' }, { name: 'Review (revisar)', done: true }]
    },
    {
      id: 'ivy', icon: '6️⃣', name: 'Ivy Lee', tagline: 'Escolha 6 tarefas para amanhã e vá na ordem.',
      how: ['No fim do dia, liste as 6 tarefas mais importantes.', 'Ordene por prioridade.', 'No dia seguinte, faça uma de cada vez, só passe adiante ao terminar.'],
      when: 'Para ter clareza e começar o dia sem decidir nada.',
      template: [{ name: 'Seis de amanhã' }, { name: 'Fazendo' }, { name: 'Feito', done: true }]
    },
    {
      id: 'frog', icon: '🐸', name: 'Eat the Frog', tagline: 'Comece pela tarefa mais difícil.',
      how: ['Marque 🐸 no cartão mais desafiador do dia.', 'Faça-o primeiro, com a energia mais alta.', 'O resto do dia fica mais leve.'],
      when: 'Quando você adia sempre o assunto que mais teme.', open: 'frog'
    },
    {
      id: 'gtd', icon: '📥', name: 'GTD', tagline: 'Capture tudo, esclareça e organize em próximas ações.',
      how: ['Jogue tudo na Caixa de entrada.', 'Defina a próxima ação concreta.', 'Revise semanalmente.'],
      when: 'Muitas matérias, projetos e demandas simultâneas.',
      template: [{ name: 'Caixa de entrada' }, { name: 'Próximas ações' }, { name: 'Aguardando' }, { name: 'Algum dia' }, { name: 'Feito', done: true }]
    }
  ];

  const byId = id => LIST.find(m => m.id === id);
  const TAGGABLE = LIST.map(m => ({ id: m.id, name: m.name, icon: m.icon }));

  return { LIST, byId, TAGGABLE };
})();
