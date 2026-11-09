// Sindicato de Riegos. Editor visual de la web de presentación. Sin dependencias.
//
// Cómo se abre: Ctrl + Alt + E, o tres clics rápidos sobre las letras grandes del pie, o añadir #editar a la dirección.
// Qué hace:
//   · Clic en un texto y escribir. Todo el texto de la página se puede cambiar.
//   · Arrastrar un dibujo (o el asa ⠿ de un texto) para moverlo; la esquina para cambiar su tamaño; Supr para ocultarlo.
//   · Escritorio, tablet y móvil se editan por separado, así lo que muevas en una vista no rompe las otras.
//   · Se guarda solo en este navegador. «Descargar» da un cambios.json que se puede dejar junto a la web para que lo vea todo el mundo.
// Las posiciones se guardan en unidades relativas al ancho de la ventana (no en píxeles), por eso siguen siendo responsive.
(() => {
  'use strict';
  const LS = 'sr-editor-v1';
  const UNIDAD_MAX = 12.4;                         // 1 unidad = 1 % del ancho de la ventana, con tope en pantallas muy anchas (igual que el ancho máximo de la página)
  const NOMBRE_VISTA = { pc: 'Escritorio', tab: 'Tablet', mov: 'Móvil' };
  const vista = () => (innerWidth > 1000 ? 'pc' : innerWidth > 640 ? 'tab' : 'mov');
  const unidadPx = () => Math.min(innerWidth / 100, UNIDAD_MAX);
  const esMarco = location.hash.includes('sr-marco');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const vacio = () => ({ v: 1, texto: {}, pos: { pc: {}, tab: {}, mov: {} } });
  const copia = (o) => JSON.parse(JSON.stringify(o));

  let estado = vacio();
  let historial = [], rehacer = [];
  let editando = false, sel = null, caja = null, raf = 0;
  const avisos = { cambio: null };

  // ---- qué se puede editar -------------------------------------------------------------------------------------------
  const SEL_TEXTO = 'h1,h2,h3,p,li,dt,dd,.nota,.boton,.rotulo,.marca span,.enlaces a,.vista strong,.vista span,figcaption,.firma,.menu-btn';
  const SEL_DIBUJO = '.mascota:not(.pasea),.tinta,figure.iso,.ventana';
  const EXCLUIR = '#mapita .mapa-barra,#mapita .mapa-demo,#mapita .leyenda-mapa,#mapita .ficha-parcela,#mapa-aviso,.leyenda,.burbuja';

  function seccion(el) {
    const s = el.closest('header,main > section,footer');
    return s ? (s.id || s.className.split(' ')[0] || s.tagName.toLowerCase()) : 'pag';
  }
  function indexar() {
    const cuenta = {};
    $$(SEL_TEXTO).forEach((el) => {
      if (el.closest(EXCLUIR) || el.querySelector(SEL_TEXTO)) return;     // solo los textos «hoja», no los contenedores
      const k = seccion(el) + '.' + el.tagName.toLowerCase();
      cuenta[k] = (cuenta[k] || 0) + 1;
      el.dataset.ed = k + '.' + (cuenta[k] - 1);
      el.dataset.edTipo = 'texto';
    });
    $$(SEL_DIBUJO).forEach((el) => {
      const tipo = el.classList.contains('mascota') ? 'mascota' : el.classList.contains('tinta') ? 'tinta' : el.tagName.toLowerCase() === 'figure' ? 'ilustracion' : 'ventana';
      const k = seccion(el) + '.' + tipo;
      cuenta[k] = (cuenta[k] || 0) + 1;
      el.dataset.ed = k + '.' + (cuenta[k] - 1);
      el.dataset.edTipo = 'dibujo';
    });
  }

  // ---- limpiar el HTML que escribe la persona ------------------------------------------------------------------------
  const PERMITIDAS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN']);
  function limpiar(html) {
    const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    const pasa = (nodo) => {
      [...nodo.childNodes].forEach((h) => {
        if (h.nodeType === 3) return;
        if (h.nodeType !== 1 || !PERMITIDAS.has(h.tagName)) { h.replaceWith(...h.childNodes); return; }
        [...h.attributes].forEach((a) => { if (!(h.tagName === 'SPAN' && a.name === 'aria-hidden')) h.removeAttribute(a.name); });
        pasa(h);
      });
    };
    pasa(doc.body);
    return doc.body.innerHTML.replace(/&nbsp;/g, ' ');
  }

  // ---- aplicar y guardar ---------------------------------------------------------------------------------------------
  function aplicarPos(el, p) {
    const q = (n, v) => (v === undefined || v === null ? el.style.removeProperty(n) : el.style.setProperty(n, v));
    el.toggleAttribute('data-ed-o', !!(p && p.o));
    el.toggleAttribute('data-ed-t', !!(p && (p.x || p.y)));
    el.toggleAttribute('data-ed-s', !!(p && p.s && p.s !== 1));
    el.toggleAttribute('data-ed-f', !!(p && p.f && p.f !== 1));
    q('--ed-x', p && p.x ? String(p.x) : null);
    q('--ed-y', p && p.y ? String(p.y) : null);
    q('--ed-s', p && p.s && p.s !== 1 ? String(p.s) : null);
    q('--ed-f', p && p.f && p.f !== 1 ? String(p.f) : null);
  }
  function aplicar(conTexto) {
    const bp = vista();
    $$('[data-ed]').forEach((el) => {
      const k = el.dataset.ed;
      if (conTexto && el.dataset.edTipo === 'texto' && estado.texto[k] !== undefined && document.activeElement !== el) el.innerHTML = estado.texto[k];
      aplicarPos(el, estado.pos[bp][k]);
    });
  }
  const guardar = () => { try { localStorage.setItem(LS, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ } };
  function cambiado() { guardar(); if (avisos.cambio) avisos.cambio(); }
  function confirmar() {
    historial.push(JSON.stringify(estado)); if (historial.length > 120) historial.shift();
    rehacer = []; cambiado();
  }
  function posDe(el, crear) {
    const bp = vista(), k = el.dataset.ed;
    if (!estado.pos[bp][k] && crear) estado.pos[bp][k] = {};
    return estado.pos[bp][k];
  }
  function limpiarVacias() {
    for (const bp of Object.keys(estado.pos)) for (const k of Object.keys(estado.pos[bp])) {
      const p = estado.pos[bp][k];
      if (!p.x && !p.y && (!p.s || p.s === 1) && (!p.f || p.f === 1) && !p.o) delete estado.pos[bp][k];
    }
  }

  // ---- modo de edición -----------------------------------------------------------------------------------------------
  const CSS = `
html.ed-on .rv, html.ed-on .paso { opacity: 1 !important; transform: none !important; transition: none !important; }
html.ed-on .mascota { opacity: 1 !important; animation: none !important; transition: none !important; }
html.ed-on .mascota.pasea { display: none !important; }
html.ed-on [data-ed-tipo="dibujo"] { pointer-events: auto !important; cursor: move; }
html.ed-on [data-ed-tipo="dibujo"]:hover { outline: 2px dashed #1F6FA8; outline-offset: 2px; }
html.ed-on [data-ed-tipo="texto"] { cursor: text; -webkit-user-select: text; user-select: text; }
html.ed-on [data-ed-tipo="texto"]:hover { outline: 2px dashed #1F6FA8; outline-offset: 3px; }
html.ed-on [data-ed-tipo="texto"]:focus { outline: 2px solid #1F6FA8; outline-offset: 3px; }
html.ed-on .ed-sel { outline: 2px solid #1F6FA8 !important; outline-offset: 2px; }
html.ed-on [data-ed-o] { display: revert !important; opacity: .28 !important; outline: 2px dotted #C2412D; }
html.ed-on .barra { position: absolute; }
html.ed-on a, html.ed-on button { cursor: inherit; }
html.ed-arr, html.ed-arr * { -webkit-user-select: none !important; user-select: none !important; }
[data-ed-t] { translate: calc(var(--ed-x, 0) * min(1vw, ${UNIDAD_MAX}px)) calc(var(--ed-y, 0) * min(1vw, ${UNIDAD_MAX}px)); }
[data-ed-s] { scale: var(--ed-s, 1); }
[data-ed-f] { zoom: var(--ed-f, 1); }
html:not(.ed-on) [data-ed-o] { display: none !important; }
#ed-caja { position: absolute; z-index: 2147483000; pointer-events: none; }
#ed-caja i { position: absolute; width: 16px; height: 16px; background: #1F6FA8; border: 2px solid #fff; border-radius: 50%; pointer-events: auto; }
#ed-caja .ed-mover { left: -9px; top: -9px; cursor: move; display: none; width: 22px; height: 22px; border-radius: 7px; text-align: center; font: 700 14px/18px system-ui; color: #fff; font-style: normal; }
#ed-caja .ed-tam { right: -9px; bottom: -9px; cursor: nwse-resize; display: none; }
#ed-caja.es-texto .ed-mover { display: block; }
#ed-caja.es-dibujo .ed-tam { display: block; }
`;
  function inyectarCSS() {
    if ($('#ed-css')) return;
    const st = document.createElement('style'); st.id = 'ed-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  function elegir(el) {
    if (sel === el) return;
    if (sel) sel.classList.remove('ed-sel');
    sel = el;
    if (sel) sel.classList.add('ed-sel');
    pintarCaja();
    if (avisos.cambio) avisos.cambio();
  }
  function pintarCaja() {
    if (!caja) {
      caja = document.createElement('div'); caja.id = 'ed-caja';
      caja.innerHTML = '<i class="ed-mover" title="Arrastra para mover">⠿</i><i class="ed-tam" title="Arrastra para cambiar el tamaño"></i>';
      document.body.appendChild(caja);
      caja.addEventListener('pointerdown', (e) => {
        const i = e.target.closest('i'); if (!i || !sel) return;
        e.preventDefault(); e.stopPropagation();
        empezarArrastre(e, i.classList.contains('ed-tam') ? 'tam' : 'mover');
      });
    }
    cancelAnimationFrame(raf);
    const marca = () => {
      if (!sel || !editando) { caja.style.display = 'none'; return; }
      const r = sel.getBoundingClientRect();
      caja.style.display = 'block';
      caja.style.left = r.left + scrollX + 'px'; caja.style.top = r.top + scrollY + 'px';
      caja.style.width = r.width + 'px'; caja.style.height = r.height + 'px';
      caja.className = sel.dataset.edTipo === 'texto' ? 'es-texto' : 'es-dibujo';
      raf = requestAnimationFrame(marca);
    };
    marca();
  }

  function empezarArrastre(e, modo) {
    const el = sel; if (!el) return;
    const p0 = copia(posDe(el, false) || {});
    const x0 = e.clientX, y0 = e.clientY, u = unidadPx();
    const r0 = el.getBoundingClientRect();
    let movido = false;
    document.documentElement.classList.add('ed-arr'); getSelection().removeAllRanges();
    const mover = (ev) => {
      const p = posDe(el, true);
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (Math.abs(dx) + Math.abs(dy) > 3) movido = true;
      if (modo === 'mover') {
        p.x = Math.round(((p0.x || 0) + dx / u) * 100) / 100;
        p.y = Math.round(((p0.y || 0) + dy / u) * 100) / 100;
      } else {
        const base = (p0.s || 1), nuevo = Math.max(.2, Math.min(4, base * (r0.width + dx) / r0.width));
        p.s = Math.round(nuevo * 100) / 100;
      }
      aplicarPos(el, p);
    };
    const fin = () => {
      removeEventListener('pointermove', mover); removeEventListener('pointerup', fin);
      document.documentElement.classList.remove('ed-arr');
      if (movido) { limpiarVacias(); confirmar(); }
    };
    addEventListener('pointermove', mover); addEventListener('pointerup', fin);
  }

  function activar() {
    if (editando) return;
    editando = true;
    inyectarCSS(); indexar(); aplicar(true);
    document.documentElement.classList.add('ed-on');
    $$('[data-ed-tipo="texto"]').forEach((el) => {
      el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'true');
    });
    // clics: nada de navegar ni de ejecutar botones mientras se edita (el mini-mapa del inicio sigue funcionando)
    document.addEventListener('click', alClic, true);
    document.addEventListener('pointerdown', alPuntero, true);
    document.addEventListener('keydown', alTecla, true);
    document.addEventListener('focusin', alFoco);
    document.addEventListener('focusout', alDesenfoque);
    document.addEventListener('paste', alPegar, true);
    if (!historial.length) historial.push(JSON.stringify(estado));
    addEventListener('resize', alRedimensionar);
  }
  function desactivar() {
    if (!editando) return;
    editando = false;
    elegir(null);
    document.documentElement.classList.remove('ed-on');
    $$('[contenteditable]').forEach((el) => { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); });
    document.removeEventListener('click', alClic, true);
    document.removeEventListener('pointerdown', alPuntero, true);
    document.removeEventListener('keydown', alTecla, true);
    document.removeEventListener('focusin', alFoco);
    document.removeEventListener('focusout', alDesenfoque);
    document.removeEventListener('paste', alPegar, true);
    removeEventListener('resize', alRedimensionar);
    if (caja) caja.style.display = 'none';
  }

  let vistaAnterior = vista();
  function alRedimensionar() {
    if (vista() !== vistaAnterior) { vistaAnterior = vista(); aplicar(false); }
    if (avisos.cambio) avisos.cambio();
  }
  function alClic(e) {
    if (e.target.closest('#ed-caja,#ed-shell')) return;
    if (e.target.closest('#mapita') && !e.target.closest('[data-ed]')) return;
    const a = e.target.closest('a,button,summary');
    if (a || e.target.closest('[data-ed]')) { e.preventDefault(); e.stopPropagation(); }
  }
  function alPuntero(e) {
    if (e.target.closest('#ed-caja,#ed-shell')) return;
    const el = e.target.closest('[data-ed]');
    if (!el) { if (!e.target.closest('#mapita')) elegir(null); return; }
    elegir(el);
    if (el.dataset.edTipo === 'dibujo' && e.button === 0) { e.preventDefault(); empezarArrastre(e, 'mover'); }
  }
  function alFoco(e) {
    const el = e.target.closest && e.target.closest('[data-ed-tipo="texto"]');
    if (el) { elegir(el); el._antes = el.innerHTML; }
  }
  function alDesenfoque(e) {
    const el = e.target.closest && e.target.closest('[data-ed-tipo="texto"]');
    if (!el) return;
    const nuevo = limpiar(el.innerHTML);
    if (nuevo !== limpiar(el._antes || '')) { estado.texto[el.dataset.ed] = nuevo; confirmar(); }
  }
  function alPegar(e) {
    const el = e.target.closest && e.target.closest('[data-ed-tipo="texto"]'); if (!el) return;
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t.replace(/\s*\n+\s*/g, ' '));
  }
  function alTecla(e) {
    if (e.target.closest && e.target.closest('#ed-shell')) return;
    const el = e.target.closest && e.target.closest('[data-ed-tipo="texto"]');
    if (el) {
      if (e.key === ' ') { e.preventDefault(); document.execCommand('insertText', false, ' '); }     // dentro de un botón, el espacio lo «pulsaría»
      else if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      else if (e.key === 'Escape') { el.blur(); }
      return;
    }
    if (e.key === 'Escape') { elegir(null); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? api.rehacer() : api.deshacer(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); api.rehacer(); return; }
    if (!sel || sel.dataset.edTipo !== 'dibujo') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); api.ocultar(); return; }
    const paso = e.shiftKey ? 1 : .2, m = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (m) { e.preventDefault(); const p = posDe(sel, true); p.x = Math.round(((p.x || 0) + m[0]) * 100) / 100; p.y = Math.round(((p.y || 0) + m[1]) * 100) / 100; aplicarPos(sel, p); limpiarVacias(); confirmar(); }
  }

  // ---- API para la barra de herramientas -----------------------------------------------------------------------------
  const api = {
    get editando() { return editando; },
    vista: () => ({ clave: vista(), nombre: NOMBRE_VISTA[vista()], ancho: innerWidth }),
    onCambio(fn) { avisos.cambio = fn; },
    info() {
      const p = sel ? (posDe(sel, false) || {}) : null;
      return {
        vista: vista(), nombreVista: NOMBRE_VISTA[vista()], ancho: innerWidth,
        tipo: sel ? sel.dataset.edTipo : null, oculto: !!(p && p.o), modificado: !!(p && Object.keys(p).length) || !!(sel && estado.texto[sel.dataset.ed] !== undefined),
        puedeDeshacer: historial.length > 1, puedeRehacer: rehacer.length > 0, total: contar(),
      };
    },
    deshacer() {
      if (historial.length < 2) return;
      rehacer.push(historial.pop()); estado = JSON.parse(historial[historial.length - 1]);
      aplicar(true); cambiado();
    },
    rehacer() {
      if (!rehacer.length) return;
      const s = rehacer.pop(); historial.push(s); estado = JSON.parse(s);
      aplicar(true); cambiado();
    },
    tamano(d) {
      if (!sel) return;
      const p = posDe(sel, true);
      if (sel.dataset.edTipo === 'dibujo') p.s = Math.max(.2, Math.min(4, Math.round(((p.s || 1) + d) * 100) / 100));
      else p.f = Math.max(.5, Math.min(2.5, Math.round(((p.f || 1) + d) * 100) / 100));
      aplicarPos(sel, p); limpiarVacias(); confirmar();
    },
    ocultar() {
      if (!sel) return;
      const p = posDe(sel, true); p.o = !p.o; aplicarPos(sel, p); limpiarVacias(); confirmar();
    },
    restablecer() {
      if (!sel) return;
      const k = sel.dataset.ed;
      delete estado.pos[vista()][k];
      if (sel.dataset.edTipo === 'texto' && estado.texto[k] !== undefined) {
        delete estado.texto[k];
        sel.innerHTML = originales[k] !== undefined ? originales[k] : sel.innerHTML;
      }
      aplicarPos(sel, null); confirmar();
    },
    restablecerVista() {
      estado.pos[vista()] = {}; aplicar(false); confirmar();
    },
    restablecerTodo() {
      estado = vacio();
      $$('[data-ed-tipo="texto"]').forEach((el) => { if (originales[el.dataset.ed] !== undefined) el.innerHTML = originales[el.dataset.ed]; });
      aplicar(false); confirmar();
    },
    exportar() { return JSON.stringify(estado, null, 1); },
    importar(txt) {
      const d = JSON.parse(txt);
      if (!d || d.v !== 1 || !d.pos) throw new Error('Archivo no válido');
      estado = { v: 1, texto: d.texto || {}, pos: { pc: d.pos.pc || {}, tab: d.pos.tab || {}, mov: d.pos.mov || {} } };
      aplicar(true); confirmar();
    },
    activar, desactivar,
  };
  function contar() { return Object.keys(estado.texto).length + Object.values(estado.pos).reduce((n, v) => n + Object.keys(v).length, 0); }

  // textos tal como vienen de la página, para poder «Restablecer»
  const originales = {};
  function guardarOriginales() { $$('[data-ed-tipo="texto"]').forEach((el) => { originales[el.dataset.ed] = el.innerHTML; }); }

  // ---- arranque ------------------------------------------------------------------------------------------------------
  async function cargar() {
    let base = null;
    try { const r = await fetch('cambios.json', { cache: 'no-cache' }); if (r.ok) base = await r.json(); } catch (e) { /* sin cambios publicados */ }
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { /* ignorar */ }
    const d = local && local.v === 1 ? local : base;
    if (d && d.v === 1 && d.pos) estado = { v: 1, texto: d.texto || {}, pos: { pc: d.pos.pc || {}, tab: d.pos.tab || {}, mov: d.pos.mov || {} } };
  }
  async function iniciar() {
    inyectarCSS(); indexar(); guardarOriginales();
    await cargar();
    aplicar(true);
    window.SREd = api;
    if (esMarco) activar();
    addEventListener('resize', () => { if (!editando) aplicar(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  // ---- la envoltura (barra superior + vista del dispositivo) ---------------------------------------------------------
  if (esMarco) return;
  const ESTILO_SHELL = `
#ed-shell { position: fixed; inset: 0; z-index: 2147483600; display: flex; flex-direction: column; background: #2B3338; font: 500 14px/1.3 system-ui, 'Segoe UI', sans-serif; color: #fff; }
#ed-shell.directo { background: transparent; inset: 0 0 auto 0; pointer-events: none; }
#ed-shell * { box-sizing: border-box; -webkit-user-select: none; user-select: none; }
.ed-barra { pointer-events: auto; background: #1B2B33; padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.ed-barra strong { font-size: 15px; margin-right: 4px; }
.ed-grupo { display: flex; gap: 4px; align-items: center; background: rgba(255,255,255,.08); padding: 3px; border-radius: 10px; }
.ed-grupo.sep { margin-left: auto; }
.ed-barra button { font: inherit; color: #fff; background: transparent; border: 0; padding: 7px 11px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
.ed-barra button:hover:not(:disabled) { background: rgba(255,255,255,.16); }
.ed-barra button:disabled { opacity: .35; cursor: default; }
.ed-barra button.on { background: #1F6FA8; }
.ed-barra button.fuerte { background: #fff; color: #1B2B33; font-weight: 700; }
.ed-barra button.salir { background: #C2412D; }
.ed-estado { flex: 1 1 280px; min-width: 200px; color: #D6E6F1; }
.ed-estado b { color: #fff; }
.ed-lienzo { flex: 1; min-height: 0; display: flex; justify-content: center; padding: 12px; overflow: auto; }
.ed-lienzo iframe { border: 0; background: #fff; border-radius: 10px; height: 100%; outline: 1px solid rgba(255,255,255,.25); }
#ed-shell.directo .ed-lienzo { display: none; }
`;
  function abrirEditor() {
    if ($('#ed-shell')) return;
    const st = document.createElement('style'); st.id = 'ed-shell-css'; st.textContent = ESTILO_SHELL; document.head.appendChild(st);
    const sh = document.createElement('div'); sh.id = 'ed-shell';
    sh.innerHTML = `
<div class="ed-barra">
  <strong>Editor</strong>
  <div class="ed-grupo" role="group" aria-label="Vista">
    <button data-v="pc" class="on" title="Editar la versión de ordenador">Escritorio</button>
    <button data-v="tab" title="Editar la versión de tablet">Tablet</button>
    <button data-v="mov" title="Editar la versión de móvil">Móvil</button>
  </div>
  <div class="ed-estado" id="ed-estado">Haz clic en un texto para escribir. Arrastra los dibujos para moverlos.</div>
  <div class="ed-grupo" id="ed-elemento">
    <button data-a="menos" title="Más pequeño">A−</button><button data-a="mas" title="Más grande">A+</button>
    <button data-a="ocultar" title="Ocultar o volver a mostrar (Supr)">Ocultar</button>
    <button data-a="restablecer" title="Deja este elemento como estaba">Deshacer cambios del elemento</button>
  </div>
  <div class="ed-grupo">
    <button data-a="deshacer" title="Ctrl+Z">↶</button><button data-a="rehacer" title="Ctrl+Y">↷</button>
  </div>
  <div class="ed-grupo sep">
    <button data-a="descargar" class="fuerte" title="Descarga un archivo con todos tus cambios">Descargar cambios</button>
    <button data-a="copiar" title="Copia los cambios para pegarlos en el chat">Copiar</button>
    <button data-a="importar" title="Cargar un archivo de cambios">Importar</button>
    <button data-a="vaciar" title="Quita todos los cambios">Borrar todo</button>
    <button data-a="salir" class="salir">Salir</button>
  </div>
  <input type="file" accept=".json,application/json" id="ed-archivo" hidden>
</div>
<div class="ed-lienzo"><iframe title="Vista previa editable" id="ed-marco"></iframe></div>`;
    document.body.appendChild(sh);
    document.documentElement.style.overflow = 'hidden';
    const marco = $('#ed-marco', sh), estadoEl = $('#ed-estado', sh);
    let editor = null, directo = false;

    const url = location.href.split('#')[0] + '#sr-marco';
    marco.src = url;
    const anchos = { pc: '100%', tab: '820px', mov: '390px' };
    const ponerVista = (v) => {
      $$('[data-v]', sh).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
      if (!directo) marco.style.width = anchos[v];
    };
    const pintar = () => {
      if (!editor) return;
      const i = editor.info();
      const cual = i.tipo === 'texto' ? 'un texto' : i.tipo === 'dibujo' ? 'un dibujo' : null;
      estadoEl.innerHTML = `Vista <b>${i.nombreVista}</b> (${i.ancho}px) · ` + (cual ? `Seleccionado: <b>${cual}</b>${i.tipo === 'dibujo' ? ' — arrástralo, o usa la esquina para el tamaño' : ' — escribe encima, o usa ⠿ para moverlo'}` : 'Haz clic en un texto para escribir; arrastra los dibujos') + ` · ${i.total} cambio${i.total === 1 ? '' : 's'}`;
      const el = $('#ed-elemento', sh);
      $$('button', el).forEach((b) => { b.disabled = !cual; });
      const bo = $('[data-a="ocultar"]', sh); bo.textContent = i.oculto ? 'Mostrar' : 'Ocultar'; bo.disabled = !cual;
      $('[data-a="deshacer"]', sh).disabled = !i.puedeDeshacer; $('[data-a="rehacer"]', sh).disabled = !i.puedeRehacer;
      $$('[data-v]', sh).forEach((b) => b.classList.toggle('on', b.dataset.v === i.vista));
    };
    const conectar = (ed) => { editor = ed; ed.onCambio(pintar); pintar(); };

    // si la página no se puede abrir dentro de sí misma, se edita directamente con el ancho actual de la ventana
    const modoDirecto = () => {
      directo = true; sh.classList.add('directo'); marco.remove();
      $$('[data-v]', sh).forEach((b) => { b.disabled = true; });
      document.documentElement.style.overflow = '';
      $('.ed-barra', sh).style.position = 'relative';
      api.activar(); conectar(api);
      estadoEl.innerHTML = 'Editando con el ancho actual de la ventana: cambia el tamaño de la ventana para editar tablet o móvil.';
    };
    let intentos = 0;
    const espera = setInterval(() => {
      intentos++;
      try { const w = marco.contentWindow; if (w && w.SREd && w.SREd.editando) { clearInterval(espera); conectar(w.SREd); return; } } catch (e) { /* otro origen */ }
      if (intentos > 25) { clearInterval(espera); modoDirecto(); }
    }, 200);

    const hacer = (a) => {
      if (!editor) return;
      const mapa = { menos: () => editor.tamano(-.1), mas: () => editor.tamano(.1), ocultar: () => editor.ocultar(), restablecer: () => editor.restablecer(), deshacer: () => editor.deshacer(), rehacer: () => editor.rehacer() };
      if (mapa[a]) { mapa[a](); pintar(); return; }
      if (a === 'descargar') {
        const blob = new Blob([editor.exportar()], { type: 'application/json' });
        const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'cambios.json'; document.body.appendChild(l); l.click(); l.remove();
      } else if (a === 'copiar') {
        const t = editor.exportar();
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { estadoEl.textContent = 'Copiado. Pégalo en el chat y lo aplico a la web.'; }, () => { prompt('Copia este texto:', t); });
      } else if (a === 'importar') $('#ed-archivo', sh).click();
      else if (a === 'vaciar') { if (confirm('¿Quitar todos los cambios y volver a la web original?')) { editor.restablecerTodo(); pintar(); } }
      else if (a === 'salir') {
        clearInterval(espera);
        if (directo) api.desactivar();
        sh.remove(); st.remove(); document.documentElement.style.overflow = '';
      }
    };
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) ponerVista(b.dataset.v); else if (b.dataset.a) hacer(b.dataset.a);
    });
    $('#ed-archivo', sh).addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f || !editor) return;
      f.text().then((t) => { try { editor.importar(t); pintar(); } catch (err) { alert('No he podido leer ese archivo: ' + err.message); } });
      e.target.value = '';
    });
    ponerVista('pc');
  }

  // formas de abrir el editor
  addEventListener('keydown', (e) => { if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); abrirEditor(); } });
  let clics = 0, reloj = 0;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.firma')) return;
    clics++; clearTimeout(reloj); reloj = setTimeout(() => { clics = 0; }, 900);
    if (clics >= 3) { clics = 0; abrirEditor(); }
  });
  if (location.hash.includes('editar')) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', abrirEditor); else abrirEditor(); }
})();
