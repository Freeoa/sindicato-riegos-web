// Sindicato de Riegos — web de presentación. Sin dependencias.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Vídeos (campo de fondo y grabación del programa): quietos si la persona prefiere menos movimiento
  // y solo se reproducen mientras se ven
  $$('video').forEach((clip) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { clip.removeAttribute('autoplay'); clip.pause(); }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) clip.play().catch(() => {}); else clip.pause(); }), { threshold: .1 }).observe(clip);
    }
  });

  // Enlaces internos con desplazamiento suave (solo al pulsarlos)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#') return;
    const dest = document.getElementById(a.getAttribute('href').slice(1));
    if (!dest) return;
    e.preventDefault();
    dest.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    try { history.replaceState(null, '', a.getAttribute('href')); } catch (err) { /* sin historial en páginas incrustadas */ }
  });

  // Menú en pantallas pequeñas
  const btn = $('.menu-btn'), menu = $('#menu');
  if (btn && menu) {
    btn.addEventListener('click', () => { const a = menu.classList.toggle('abierto'); btn.setAttribute('aria-expanded', String(a)); });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) { menu.classList.remove('abierto'); btn.setAttribute('aria-expanded', 'false'); } });
  }

  // Entrada de cada parte al aparecer; los chips entran en cadena
  $$('.chips li').forEach((li, i) => { li.classList.add('rv'); li.style.setProperty('--d', Math.min(i * 28, 700) + 'ms'); });
  const rv = $$('.rv');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } }), { threshold: 0, rootMargin: '0px 0px -4% 0px' });
    rv.forEach((n) => io.observe(n));
  } else rv.forEach((n) => n.classList.add('visto'));

  // Mascotas: se asoman al verse; la garza cruza la pantalla una vez al pasar del inicio
  const mascotas = $$('.mascota:not(.pasea)');
  if ('IntersectionObserver' in window) {
    const mo = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visto'); mo.unobserve(e.target); } }), { threshold: .35 });
    mascotas.forEach((n) => mo.observe(n));
    const paseo = $('.pasea'), juntos = $('#juntos');
    if (paseo && juntos && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { paseo.classList.add('cruza'); o.disconnect(); } }), { threshold: .2 }).observe(juntos);
    }
  } else mascotas.forEach((n) => n.classList.add('visto'));

  // Mapa del Catastro: los tres botones cambian la lectura del mismo mapa
  const vistas = $$('.vista'), mapas = $$('.mapa-visor img');
  if (vistas.length) {
    const ver = (i) => { vistas.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i))); mapas.forEach((m, k) => m.classList.toggle('on', k === i)); };
    vistas.forEach((b, i) => b.addEventListener('click', () => ver(i)));
    ver(0);
  }

  // Los pasos: el visor cambia de pantalla a medida que se lee
  const pasos = $$('.paso'), imgs = $$('.visor-marco img');
  if (pasos.length && 'IntersectionObserver' in window) {
    const poner = (i) => { pasos.forEach((p, k) => p.classList.toggle('activo', k === i)); imgs.forEach((m, k) => m.classList.toggle('on', k === i)); };
    poner(0);
    const so = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) poner(Number(e.target.dataset.i)); }), { rootMargin: '-45% 0px -45% 0px' });
    pasos.forEach((p) => so.observe(p));
  }

})();
