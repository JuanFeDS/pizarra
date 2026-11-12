import { COLORES } from './config.js';
import { conectar } from './red.js';
import { HOJA, aplanar, desaplanar } from './tablero.js';
import { $, leerAlmacen, escribirAlmacen, nuevoId, enlaceVisor, estadoVisual } from './util.js';

const RADIO_BORRAR_TRAZO_PX = 10;
const MARGEN_ENCAJAR_PX = 48;
const FACTOR_ZOOM_BOTON = 1.4;
const INTERVALO_VISTA_MS = 100;
const NOMBRES_PUNTERO = { pen: 'lápiz', touch: 'dedo', mouse: 'ratón' };

export function iniciarTablet({ sala, tablero, actualizarAviso }) {
  const claveTrazos = `pizarra:trazos:${sala}`;
  const claveVista = `pizarra:vista:${sala}`;
  const sesion = {
    herramienta: 'lapiz',
    color: COLORES[0],
    grosor: Number(leerAlmacen('pizarra:grosor-pantalla')) || 4,
  };
  const historial = [];
  const rehacerPila = [];
  const toques = new Map();
  let activo = null;
  let gesto = null;
  let panRaton = null;
  let verLapiz = false;
  let red;

  const lienzo = $('lienzo');
  const lectura = $('lectura');
  const botonDeshacer = $('h-deshacer');
  const botonRehacer = $('h-rehacer');
  const botonBorrar = $('h-borrar');

  function serializar(trazo) {
    return {
      id: trazo.id,
      c: trazo.color,
      w: trazo.grosor,
      e: trazo.borrador,
      d: aplanar(trazo.puntos),
      f: trazo.cerrado,
    };
  }

  function guardarTrazos() {
    const cerrados = tablero.trazos.filter((trazo) => trazo.cerrado).map(serializar);
    escribirAlmacen(claveTrazos, JSON.stringify(cerrados));
  }

  function restaurarTrazos() {
    const crudo = leerAlmacen(claveTrazos);
    if (!crudo) return;
    try {
      for (const { id, c, w, e, d } of JSON.parse(crudo)) {
        const trazo = tablero.nuevoTrazo({ id, color: c, grosor: w, borrador: e });
        tablero.agregarPuntos(trazo, desaplanar(d), { dibujar: false });
        tablero.cerrar(trazo, { dibujar: false });
        historial.push({ tipo: 'dibujar', trazo });
      }
    } catch {
      escribirAlmacen(claveTrazos, '[]');
    }
  }

  function enviarEstado() {
    const lotes = [];
    let lote = [];
    let cuenta = 0;
    for (const trazo of tablero.trazos) {
      lote.push(serializar(trazo));
      cuenta += trazo.puntos.length;
      if (cuenta > 2000) {
        lotes.push(lote);
        lote = [];
        cuenta = 0;
      }
    }
    if (lote.length > 0 || lotes.length === 0) lotes.push(lote);
    lotes.forEach((trazos, indice) => red.enviar('estado', { inicio: indice === 0, trazos }));
  }

  let temporizadorVista = null;
  let vistaPendiente = false;
  function enviarVista() {
    vistaPendiente = false;
    if (!tablero.tieneTamano()) return;
    const { x, y, w, h } = tablero.rectVista();
    const redondear = (valor) => Math.round(valor * 10) / 10;
    red.enviar('vista', { x: redondear(x), y: redondear(y), w: redondear(w), h: redondear(h) });
  }
  function programarVista() {
    vistaPendiente = true;
    if (temporizadorVista) return;
    temporizadorVista = setTimeout(() => {
      temporizadorVista = null;
      if (vistaPendiente) enviarVista();
    }, INTERVALO_VISTA_MS);
  }

  let temporizadorGuardadoVista = null;
  function guardarVista() {
    clearTimeout(temporizadorGuardadoVista);
    temporizadorGuardadoVista = setTimeout(() => escribirAlmacen(claveVista, JSON.stringify(tablero.vista)), 300);
  }

  const nivel = $('z-nivel');
  tablero.alCambiarVista = () => {
    nivel.textContent = `${Math.round(tablero.vista.escala * 100)}%`;
    programarVista();
    guardarVista();
  };

  red = conectar({
    sala,
    rol: 'tablet',
    eventos: {
      hola: () => {
        enviarEstado();
        enviarVista();
      },
    },
    alPresencia: (conteo) => {
      $('espectadores').textContent = `${conteo.visor} viendo`;
    },
    alEstado: (estadoCanal) => {
      $('estado').dataset.estado = estadoVisual(estadoCanal);
      if (estadoCanal === 'LISTO') enviarVista();
    },
  });

  function actualizarBotones() {
    botonDeshacer.disabled = Boolean(activo) || historial.length === 0;
    botonRehacer.disabled = Boolean(activo) || rehacerPila.length === 0;
    botonBorrar.disabled = Boolean(activo) || tablero.trazos.length === 0;
    actualizarAviso();
  }

  function presionDe(evento) {
    if (sesion.herramienta === 'borrador') return 0.5;
    return evento.pointerType === 'pen' ? evento.pressure || 0.5 : 0.5;
  }

  function vaciarEnvio(accion) {
    accion.temporizador = null;
    const nuevos = accion.trazo.puntos.slice(accion.enviados);
    if (nuevos.length === 0) return;
    const { trazo } = accion;
    red.enviar('pts', {
      id: trazo.id,
      c: trazo.color,
      w: trazo.grosor,
      e: trazo.borrador,
      o: accion.enviados,
      d: aplanar(nuevos),
    });
    accion.enviados += nuevos.length;
  }

  function sumarPuntos(eventos) {
    const puntos = eventos.map((evento) => [...tablero.aMundo(evento.clientX, evento.clientY), presionDe(evento)]);
    tablero.agregarPuntos(activo.trazo, puntos, { minimo: 1 / tablero.vista.escala });
    if (!activo.temporizador) {
      const accion = activo;
      accion.temporizador = setTimeout(() => vaciarEnvio(accion), 70);
    }
  }

  function borrarTrazosEn(eventos) {
    const ids = [];
    const escala = tablero.vista.escala;
    for (const evento of eventos) {
      const punto = tablero.aMundo(evento.clientX, evento.clientY);
      for (const id of tablero.trazosCerca(punto, activo.anterior, RADIO_BORRAR_TRAZO_PX / escala, 6 / escala)) {
        const quitado = tablero.quitarSinRedibujar(id);
        if (!quitado) continue;
        activo.quitados.push(quitado);
        ids.push(id);
      }
      activo.anterior = punto;
    }
    if (ids.length > 0) {
      tablero.redibujar();
      red.enviar('quitar', { ids });
      actualizarAviso();
    }
  }

  function abortarTrazo() {
    if (!activo) return;
    const accion = activo;
    clearTimeout(accion.temporizador);
    activo = null;
    if (accion.modo === 'dibujar') {
      tablero.quitar(accion.trazo.id);
      red.enviar('quitar', { ids: [accion.trazo.id] });
    } else if (accion.quitados.length > 0) {
      for (const { trazo, indice } of [...accion.quitados].reverse()) tablero.insertar(indice, trazo);
      tablero.redibujar();
      enviarEstado();
    }
    actualizarBotones();
  }

  function centroDeToques() {
    const [a, b] = [...toques.values()];
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, distancia: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
  }

  function iniciarGesto() {
    const centro = centroDeToques();
    gesto = {
      distancia: centro.distancia,
      escala: tablero.vista.escala,
      mundo: tablero.aMundo(centro.x, centro.y),
    };
  }

  function actualizarGesto() {
    const centro = centroDeToques();
    const escala = tablero.limitarEscala(gesto.escala * (centro.distancia / gesto.distancia));
    const caja = lienzo.getBoundingClientRect();
    tablero.fijarVista({
      escala,
      x: gesto.mundo[0] - (centro.x - caja.left) / escala,
      y: gesto.mundo[1] - (centro.y - caja.top) / escala,
    });
  }

  function capturar(evento) {
    try {
      lienzo.setPointerCapture(evento.pointerId);
    } catch {
      /* el puntero ya no está activo: se sigue sin captura */
    }
  }

  lienzo.addEventListener('pointerdown', (evento) => {
    if (evento.pointerType === 'pen') {
      verLapiz = true;
      gesto = null;
    }
    if (evento.pointerType === 'mouse' && evento.button === 1) {
      evento.preventDefault();
      capturar(evento);
      panRaton = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, vista: { ...tablero.vista } };
      return;
    }
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;
    if (evento.pointerType === 'touch') {
      if (activo && activo.tipoPuntero !== 'touch') return;
      toques.set(evento.pointerId, [evento.clientX, evento.clientY]);
      if (toques.size === 2) {
        abortarTrazo();
        iniciarGesto();
        return;
      }
      if (toques.size > 2 || verLapiz || gesto) return;
    }
    if (activo) return;
    evento.preventDefault();
    capturar(evento);
    rehacerPila.length = 0;
    if (sesion.herramienta === 'trazo') {
      activo = { idPuntero: evento.pointerId, tipoPuntero: evento.pointerType, modo: 'borrar-trazo', quitados: [], anterior: null };
      actualizarBotones();
      borrarTrazosEn([evento]);
      return;
    }
    const trazo = tablero.nuevoTrazo({
      id: nuevoId(),
      color: sesion.color,
      grosor: sesion.grosor / tablero.vista.escala,
      borrador: sesion.herramienta === 'borrador',
    });
    activo = {
      idPuntero: evento.pointerId,
      tipoPuntero: evento.pointerType,
      modo: 'dibujar',
      trazo,
      temporizador: null,
      enviados: 0,
    };
    actualizarBotones();
    sumarPuntos([evento]);
  });

  lienzo.addEventListener('pointermove', (evento) => {
    if (evento.pointerType === 'pen' || evento.pointerType === 'mouse') {
      lectura.textContent = `${NOMBRES_PUNTERO[evento.pointerType]} · presión ${evento.pressure.toFixed(2)}`;
    }
    if (panRaton && evento.pointerId === panRaton.id) {
      const { escala } = panRaton.vista;
      tablero.fijarVista({
        escala,
        x: panRaton.vista.x - (evento.clientX - panRaton.x) / escala,
        y: panRaton.vista.y - (evento.clientY - panRaton.y) / escala,
      });
      return;
    }
    if (toques.has(evento.pointerId)) {
      toques.set(evento.pointerId, [evento.clientX, evento.clientY]);
      if (gesto && toques.size === 2 && !(activo && activo.tipoPuntero !== 'touch')) {
        actualizarGesto();
        return;
      }
    }
    if (!activo || evento.pointerId !== activo.idPuntero) return;
    const lista = evento.getCoalescedEvents ? evento.getCoalescedEvents() : [];
    const eventos = lista.length > 0 ? lista : [evento];
    if (activo.modo === 'borrar-trazo') borrarTrazosEn(eventos);
    else sumarPuntos(eventos);
  });

  function terminarPuntero(evento) {
    if (panRaton && evento.pointerId === panRaton.id) panRaton = null;
    toques.delete(evento.pointerId);
    if (toques.size < 2) gesto = null;
    if (!activo || evento.pointerId !== activo.idPuntero) return;
    const accion = activo;
    if (accion.modo === 'borrar-trazo') {
      if (accion.quitados.length > 0) historial.push({ tipo: 'borrar', items: accion.quitados });
    } else {
      clearTimeout(accion.temporizador);
      tablero.cerrar(accion.trazo);
      vaciarEnvio(accion);
      red.enviar('fin', { id: accion.trazo.id, n: accion.trazo.puntos.length });
      historial.push({ tipo: 'dibujar', trazo: accion.trazo });
    }
    activo = null;
    guardarTrazos();
    actualizarBotones();
  }
  lienzo.addEventListener('pointerup', terminarPuntero);
  lienzo.addEventListener('pointercancel', terminarPuntero);

  lienzo.addEventListener(
    'wheel',
    (evento) => {
      evento.preventDefault();
      tablero.zoomEn(evento.clientX, evento.clientY, Math.exp(-evento.deltaY * (evento.ctrlKey ? 0.006 : 0.0015)));
    },
    { passive: false },
  );

  function encajar() {
    const destino = tablero.encuadrar(tablero.cajaContenido() ?? HOJA, MARGEN_ENCAJAR_PX);
    if (destino) tablero.irA(destino, 220);
  }
  $('z-mas').addEventListener('click', () => tablero.irA(tablero.vistaZoomCentro(FACTOR_ZOOM_BOTON), 140));
  $('z-menos').addEventListener('click', () => tablero.irA(tablero.vistaZoomCentro(1 / FACTOR_ZOOM_BOTON), 140));
  nivel.addEventListener('click', encajar);
  $('z-captura').addEventListener('click', () => tablero.descargarPng('vista'));

  const botonEnfoque = $('z-enfoque');
  function alternarEnfoque(activar) {
    const enfoque = activar ?? !document.body.classList.contains('enfoque');
    document.body.classList.toggle('enfoque', enfoque);
    botonEnfoque.setAttribute('aria-pressed', String(enfoque));
    botonEnfoque.title = enfoque ? 'Mostrar barras' : 'Ocultar barras';
  }
  botonEnfoque.addEventListener('click', () => alternarEnfoque());
  window.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') alternarEnfoque(false);
  });

  botonDeshacer.addEventListener('click', () => {
    const accion = historial.pop();
    if (!accion || activo) return;
    if (accion.tipo === 'dibujar') {
      tablero.quitar(accion.trazo.id);
      red.enviar('quitar', { ids: [accion.trazo.id] });
    } else {
      for (const { trazo, indice } of [...accion.items].reverse()) tablero.insertar(indice, trazo);
      tablero.redibujar();
      enviarEstado();
    }
    rehacerPila.push(accion);
    guardarTrazos();
    actualizarBotones();
  });

  botonRehacer.addEventListener('click', () => {
    const accion = rehacerPila.pop();
    if (!accion || activo) return;
    if (accion.tipo === 'dibujar') {
      const original = accion.trazo;
      const restaurado = tablero.nuevoTrazo({
        id: original.id,
        color: original.color,
        grosor: original.grosor,
        borrador: original.borrador,
      });
      tablero.agregarPuntos(restaurado, original.puntos);
      tablero.cerrar(restaurado);
      red.enviar('pts', { ...serializar(restaurado), o: 0, f: true });
      historial.push({ tipo: 'dibujar', trazo: restaurado });
    } else {
      const items = accion.items.map(({ trazo }) => tablero.quitarSinRedibujar(trazo.id)).filter(Boolean);
      tablero.redibujar();
      red.enviar('quitar', { ids: items.map(({ trazo }) => trazo.id) });
      historial.push({ tipo: 'borrar', items });
    }
    guardarTrazos();
    actualizarBotones();
  });

  let temporizadorBorrar;
  const textoBorrar = $('texto-borrar');
  function restablecerBorrar() {
    textoBorrar.textContent = '';
    botonBorrar.classList.remove('herr--alerta');
  }
  botonBorrar.addEventListener('click', () => {
    if (textoBorrar.textContent === '') {
      textoBorrar.textContent = '¿Borrar todo?';
      botonBorrar.classList.add('herr--alerta');
      temporizadorBorrar = setTimeout(restablecerBorrar, 3000);
      return;
    }
    clearTimeout(temporizadorBorrar);
    restablecerBorrar();
    tablero.vaciar();
    historial.length = 0;
    rehacerPila.length = 0;
    red.enviar('borrar');
    guardarTrazos();
    actualizarBotones();
  });

  $('h-descargar').addEventListener('click', () => tablero.descargarPng('todo'));

  const botonLapiz = $('h-lapiz');
  const botonBorrador = $('h-borrador');
  const botonTrazo = $('h-trazo');
  function elegirHerramienta(nombre) {
    sesion.herramienta = nombre;
    botonLapiz.setAttribute('aria-pressed', String(nombre === 'lapiz'));
    botonBorrador.setAttribute('aria-pressed', String(nombre === 'borrador'));
    botonTrazo.setAttribute('aria-pressed', String(nombre === 'trazo'));
  }
  botonLapiz.addEventListener('click', () => elegirHerramienta('lapiz'));
  botonBorrador.addEventListener('click', () => elegirHerramienta('borrador'));
  botonTrazo.addEventListener('click', () => elegirHerramienta('trazo'));

  const contenedorColores = $('colores');
  const puntoGrosor = $('grosor-punto');
  function actualizarPuntoGrosor() {
    const lado = Math.min(sesion.grosor, 28);
    puntoGrosor.style.width = `${lado}px`;
    puntoGrosor.style.height = `${lado}px`;
    puntoGrosor.style.background = sesion.color;
  }
  for (const color of COLORES) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'color';
    boton.style.setProperty('--color', color);
    boton.setAttribute('role', 'radio');
    boton.setAttribute('aria-label', `Color ${color}`);
    boton.setAttribute('aria-checked', String(color === sesion.color));
    boton.addEventListener('click', () => {
      sesion.color = color;
      contenedorColores.querySelectorAll('.color').forEach((otro) => {
        otro.setAttribute('aria-checked', String(otro === boton));
      });
      elegirHerramienta('lapiz');
      actualizarPuntoGrosor();
    });
    contenedorColores.appendChild(boton);
  }

  const deslizador = $('grosor');
  deslizador.value = sesion.grosor;
  deslizador.addEventListener('input', () => {
    sesion.grosor = Number(deslizador.value);
    escribirAlmacen('pizarra:grosor-pantalla', String(sesion.grosor));
    actualizarPuntoGrosor();
  });
  actualizarPuntoGrosor();

  $('chip-sala').addEventListener('click', async () => {
    const enlace = enlaceVisor(sala);
    const texto = $('texto-enlace');
    try {
      await navigator.clipboard.writeText(enlace);
      texto.textContent = 'Enlace copiado';
    } catch {
      window.prompt('Copia este enlace y ábrelo en el computador:', enlace);
    }
    setTimeout(() => {
      texto.textContent = 'Copiar enlace';
    }, 2000);
  });

  restaurarTrazos();
  actualizarBotones();

  function vistaGuardada() {
    const crudo = leerAlmacen(claveVista);
    if (!crudo) return null;
    try {
      const { x, y, escala } = JSON.parse(crudo);
      return [x, y, escala].every(Number.isFinite) ? { x, y, escala } : null;
    } catch {
      return null;
    }
  }

  return {
    alPrimerTamano: () => {
      const guardada = vistaGuardada();
      const destino = guardada ?? tablero.encuadrar(HOJA, 0);
      if (destino) tablero.fijarVista(destino);
      tablero.redibujar();
      actualizarAviso();
    },
    alRedimensionar: (centro) => tablero.centrarEn(centro),
  };
}
