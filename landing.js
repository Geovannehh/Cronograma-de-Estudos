/* StudyFlow — landing: menu mobile, revelação ao rolar, contadores e formulário */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // menu mobile
  const links = $('#links');
  $('#burger').addEventListener('click', () => links.classList.toggle('open'));
  links.addEventListener('click', e => { if (e.target.tagName === 'A') links.classList.remove('open'); });

  // sombra do menu ao rolar
  const nav = $('#nav');
  const onScroll = () => { nav.style.boxShadow = window.scrollY > 8 ? '0 1px 0 #e8e9ec' : 'none'; };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // contador animado
  function count(el) {
    const end = +el.dataset.count, suf = el.dataset.suffix || '', t0 = performance.now(), dur = 1200;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
      el.textContent = v + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // revelar ao rolar
  const targets = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        $$('[data-count]', en.target).forEach(count);
        io.unobserve(en.target);
      });
    }, { threshold: 0.15 });
    targets.forEach(t => io.observe(t));
  } else {
    targets.forEach(t => { t.classList.add('in'); $$('[data-count]', t).forEach(count); });
  }

  // formulário: leva ao sistema guardando o e-mail digitado
  $('#ctaForm').addEventListener('submit', e => {
    e.preventDefault();
    try { localStorage.setItem('studyflow.lead', $('#email').value.trim()); } catch (err) { /* sem storage */ }
    window.location.href = 'index.html';
  });
})();
