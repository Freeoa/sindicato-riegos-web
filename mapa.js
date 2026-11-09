// Sindicato de Riegos. Mapa de ejemplo del inicio: un mapa de verdad (Leaflet + foto aérea del IGN) con contornos reales del
// Catastro público de Mallén. Los regantes, contadores y consumos son inventados. Datos en data/mapa-demo.js (tools/mapa_demo.mjs).
(() => {
  'use strict';
  const D = window.MAPA_DEMO, L = window.L, cont = document.getElementById('mapa-demo');
  if (!D || !L || !cont) return;

  const COL = ['#2E8B57', '#C2417A', '#1F9FB0', '#D9503A', '#E0A030', '#6B7FD7', '#8C6D3F', '#7A4FA8', '#3C9A8E', '#B5654A'];
  const AZUL = ['#D6E6F1', '#9CC4E4', '#4A9AD2', '#1F6FA8', '#0F3550'];
  const nf = new Intl.NumberFormat('es-ES');
  const ha = (a) => (a / 10000).toFixed(2).replace('.', ',');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => document.querySelector(s);
  const el = { n: $('#mp-n'), p: $('#mp-p'), m: $('#mp-m'), u: $('#mp-u'), b: $('#mp-b'), dot: $('#mp-dot') };
  const leyenda = $('#mapa-leyenda'), buscar = $('#mapa-q'), aviso = $('#mapa-aviso');

  // cinco tramos por quintiles del agua consumida (igual que el programa)
  const valores = D.parcelas.filter((p) => p.s && p.s.m3 !== null).map((p) => p.s.m3).sort((a, b) => a - b);
  const TOPES = [1, 2, 3, 4].map((k) => valores[Math.floor(valores.length * k / 5)]);
  const MAX = valores[valores.length - 1];
  const tramo = (v) => TOPES.filter((t) => v >= t).length;

  const mapa = L.map(cont, {
    zoomSnap: 0.5, minZoom: 15, maxZoom: 19, zoomControl: true, attributionControl: true,
    scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false,
  });
  mapa.attributionControl.setPrefix(false);
  const pnoa = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?request=getTile&layer=OI.OrthoimageCoverage&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileCol={x}&TileRow={y}&format=image/jpeg',
    { maxZoom: 19, attribution: 'Foto aérea © IGN PNOA · Contornos: Dirección General del Catastro' });
  const sinFondo = L.layerGroup();
  let fallos = 0;
  pnoa.on('tileerror', () => { if (++fallos > 3) cont.classList.add('sin-fondo'); }).on('tileload', () => { fallos = 0; cont.classList.remove('sin-fondo'); });
  pnoa.addTo(mapa);
  L.control.layers({ 'Foto aérea': pnoa, 'Sin fondo': sinFondo }, null, { position: 'topright' }).addTo(mapa);
  const limites = L.latLngBounds(D.caja);
  mapa.setMaxBounds(limites.pad(0.35));
  // la rueda solo acerca el mapa cuando se ha hecho clic en él, para no atrapar el desplazamiento de la página
  mapa.on('click', () => mapa.scrollWheelZoom.enable());
  cont.addEventListener('mouseleave', () => mapa.scrollWheelZoom.disable());

  let modo = 'quien', actual = null, mostrado = 0, raf = 0;
  const capas = new Map();      // ref -> capa
  const aLatLng = (c) => c.map((pol) => pol.map((anillo) => anillo.map(([x, y]) => [y, x])));

  function estilo(p, sel) {
    const s = p.s;
    let e;
    if (!s) e = { color: '#F2D24B', weight: 1.2, fillColor: '#F2D24B', fillOpacity: 0.02 };
    else if (modo === 'quien') e = { color: COL[s.g], weight: 2, fillColor: COL[s.g], fillOpacity: 0.55 };
    else e = s.m3 === null ? { color: '#5A6469', weight: 1.5, fillColor: '#8C969B', fillOpacity: 0.6 } : { color: '#164F78', weight: 1.5, fillColor: AZUL[tramo(s.m3)], fillOpacity: 0.78 };
    if (sel) e = { ...e, color: '#FFFFFF', weight: 4 };
    return e;
  }
  const refActual = () => (actual ? actual.r : null);
  function popup(p) {
    const s = p.s;
    const pie = '<small class="ori">Contorno: Dirección General del Catastro (INSPIRE)</small>';
    if (!s) return `<b>Parcela ${p.n}</b><br>Polígono ${p.p} · ${ha(p.a)} ha<br><small>${p.r}</small><br><em>Sin regante en este ejemplo</em><br>${pie}`;
    const agua = s.m3 === null ? 'Sin contador' : `Agua 2026: <b>${nf.format(s.m3)} m³</b> (${s.l} lecturas) · ${nf.format(Math.round(s.m3 / (p.a / 10000)))} m³/ha`;
    return `<b>${D.regantes[s.g]}</b><br>${s.f} · polígono ${p.p}, parcela ${p.n}<br><small>${p.r}</small><br>${ha(p.a)} ha · ${s.c} · riego ${s.r.toLowerCase()}<br>${agua}<br>${pie}`;
  }

  function contar(a, b) {
    cancelAnimationFrame(raf);
    const t0 = performance.now(), dur = reducido ? 0 : 450;
    const paso = (t) => { const k = dur ? Math.min(1, (t - t0) / dur) : 1; mostrado = Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))); el.m.textContent = nf.format(mostrado); if (k < 1) raf = requestAnimationFrame(paso); };
    raf = requestAnimationFrame(paso);
  }
  function ficha(p, anima) {
    const s = p.s;
    el.n.textContent = s ? D.regantes[s.g] : 'Sin regante en este ejemplo';
    el.p.textContent = s ? `${s.f} · polígono ${p.p}, parcela ${p.n}` : `Polígono ${p.p}, parcela ${p.n}`;
    el.dot.style.background = !s ? '#F2D24B' : modo === 'quien' ? COL[s.g] : s.m3 === null ? '#8C969B' : AZUL[tramo(s.m3)];
    if (!s || s.m3 === null) { cancelAnimationFrame(raf); el.m.textContent = s ? 'Sin contador' : '…'; el.u.textContent = s ? ' no hay lecturas' : ' no está en el sindicato'; el.b.style.width = '0'; }
    else { el.u.textContent = ' m³ este año'; if (anima) contar(mostrado, s.m3); else el.m.textContent = nf.format(s.m3); el.b.style.width = Math.round(s.m3 / MAX * 100) + '%'; }
  }
  function elegir(p, { abrir = true, volar = false, anima = true } = {}) {
    const anterior = actual; actual = p;
    if (anterior && capas.has(anterior.r)) capas.get(anterior.r).setStyle(estilo(anterior, false));
    const c = capas.get(p.r); c.setStyle(estilo(p, true)); c.bringToFront();
    ficha(p, anima);
    if (volar) mapa.flyToBounds(c.getBounds(), { maxZoom: 18, padding: [60, 60], duration: reducido ? 0 : 0.7 });
    if (abrir) c.openPopup();
  }
  function pintar() {
    D.parcelas.forEach((p) => capas.get(p.r).setStyle(estilo(p, p.r === refActual())));
    if (actual) ficha(actual, false);
    leyendaPintar();
  }
  function leyendaPintar() {
    if (modo === 'quien') { leyenda.innerHTML = '<span>Cada color es un regante. En amarillo, las parcelas que no son del sindicato.</span>'; return; }
    const rango = (i) => (i === 0 ? `hasta ${nf.format(TOPES[0])}` : i === 4 ? `más de ${nf.format(TOPES[3])}` : `${nf.format(TOPES[i - 1])}–${nf.format(TOPES[i])}`);
    leyenda.innerHTML = AZUL.map((c, i) => `<span><i style="background:${c}"></i>${rango(i)} m³</span>`).join('') + '<span><i style="background:#8C969B"></i>Sin contador</span>';
  }

  D.parcelas.forEach((p) => {
    const capa = L.polygon(aLatLng(p.c), estilo(p, false)).addTo(mapa);
    capa.bindPopup(() => popup(p), { maxWidth: 260, autoPanPadding: [24, 24] });
    capa.bindTooltip(p.n, { permanent: true, direction: 'center', className: 'mapa-num', opacity: 1 });
    capa.on('click', () => { parar(); elegir(p, { abrir: true }); });
    capas.set(p.r, capa);
  });
  const propias = L.featureGroup(D.parcelas.filter((p) => p.s).map((p) => capas.get(p.r)));
  const encuadre = () => mapa.fitBounds(propias.getBounds(), { padding: [6, 6], maxZoom: 18 });
  encuadre();
  const numeros = () => cont.classList.toggle('con-num', mapa.getZoom() >= 17);
  mapa.on('zoomend', numeros); numeros();

  // modos de color
  const chips = [...document.querySelectorAll('#mapita .chip')];
  chips.forEach((b) => b.addEventListener('click', () => { parar(); modo = b.dataset.modo; chips.forEach((c) => c.setAttribute('aria-pressed', String(c === b))); pintar(); }));

  // buscar por número de parcela
  if (buscar) {
    const ir = () => {
      const q = buscar.value.trim().replace(/^0+/, '');
      if (!q) { aviso.textContent = ''; return; }
      const p = D.parcelas.find((x) => x.n === q) || D.parcelas.find((x) => x.r.toLowerCase() === buscar.value.trim().toLowerCase());
      if (!p) { aviso.textContent = `No hay ninguna parcela «${q}» en este mapa de ejemplo.`; return; }
      aviso.textContent = ''; parar(); elegir(p, { abrir: true, volar: true });
    };
    buscar.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
    $('#mapa-ir').addEventListener('click', ir);
  }

  // sin tocar nada, la ficha recorre alguna parcela del sindicato para llamar la atención; se para al primer gesto
  const mias = D.parcelas.filter((p) => p.s && p.s.m3 !== null);
  const centro = limites.getCenter();
  mias.sort((a, b) => Math.hypot(a.c[0][0][0][0] - centro.lng, a.c[0][0][0][1] - centro.lat) - Math.hypot(b.c[0][0][0][0] - centro.lng, b.c[0][0][0][1] - centro.lat));
  let auto = 0;
  function parar() { clearInterval(auto); auto = 0; }
  pintar();
  elegir(mias[0], { abrir: false, anima: false });
  if (!reducido) {
    let k = 0;
    auto = setInterval(() => { if (document.hidden) return; k = (k + 1) % Math.min(mias.length, 12); elegir(mias[k], { abrir: false }); }, 3200);
  }
  cont.addEventListener('pointerdown', parar, { once: true });
  setTimeout(() => { mapa.invalidateSize(); encuadre(); }, 400);
})();
