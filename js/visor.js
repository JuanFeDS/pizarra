import { conectar } from './red.js';
import { HOJA, desaplanar } from './tablero.js';
import { $, estadoVisual } from './util.js';

const MARGEN_VER_TODO = 48;

export function iniciarVisor({ sala, tablero, estadoPresencia, actualizarAviso }) {
  const puntoEstado = $('estado');
  const botonModo = $('v-modo');
  let ultimaPeticion = 0;
  let modo = 'seguir';
  let remota = null;
  let temporizadorTodo = null;
  let red;

  function actualizarVista(animar = true) {
    const rect = modo === 'todo' ? tablero.cajaContenido() ?? HOJA : remota ?? HOJA;
    const destino = tablero.encuadrar(rect, modo === 'todo' ? MARGEN_VER_TODO : 0);
    if (!destino) return;
    if (animar) tablero.irA(destino, 200);
    else tablero.fijarVista(destino);
  }

  function reajustarSiVerTodo() {
    if (modo !== 'todo') return;
    clearTimeout(temporizadorTodo);
    temporizadorTodo = setTimeout(() => actualizarVista(true), 300);
  }

  function pedirEstado() {
    if (Date.now() - ultimaPeticion < 1000) return;
    ultimaPeticion = Date.now();
    red.enviar('hola');
  }

  function aplicarTrazo({ id, c, w, e, d, f }) {
    const trazo = tablero.nuevoTrazo({ id, color: c, grosor: w, borrador: e });
    tablero.agregarPuntos(trazo, desaplanar(d), { dibujar: false });
    if (f) tablero.cerrar(trazo, { dibujar: false });
  }

  red = conectar({
    sala,
    rol: 'visor',
    eventos: {
      pts: (carga) => {
        let trazo = tablero.porId(carga.id);
        if (!trazo) {
          if (carga.o !== 0) return pedirEstado();
          trazo = tablero.nuevoTrazo({ id: carga.id, color: carga.c, grosor: carga.w, borrador: carga.e });
        }
        if (carga.o !== trazo.puntos.length) return pedirEstado();
        tablero.agregarPuntos(trazo, desaplanar(carga.d));
        if (carga.f) tablero.cerrar(trazo);
        actualizarAviso();
        reajustarSiVerTodo();
      },
      fin: ({ id, n }) => {
        const trazo = tablero.porId(id);
        if (!trazo) return;
        if (trazo.puntos.length !== n) return pedirEstado();
        tablero.cerrar(trazo);
      },
      quitar: ({ ids }) => {
        ids.forEach((id) => tablero.quitarSinRedibujar(id));
        tablero.redibujar();
        actualizarAviso();
        reajustarSiVerTodo();
      },
      borrar: () => {
        tablero.vaciar();
        actualizarAviso();
        reajustarSiVerTodo();
      },
      estado: ({ inicio, trazos }) => {
        if (inicio) tablero.vaciar();
        trazos.forEach(aplicarTrazo);
        tablero.redibujar();
        actualizarAviso();
        reajustarSiVerTodo();
      },
      vista: ({ x, y, w, h }) => {
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
        remota = { x, y, w, h };
        if (modo === 'seguir') actualizarVista(true);
      },
    },
    alPresencia: (conteo) => {
      estadoPresencia.tabletPresente = conteo.tablet > 0;
      actualizarAviso();
    },
    alEstado: (estadoCanal) => {
      puntoEstado.dataset.estado = estadoVisual(estadoCanal);
      if (estadoCanal === 'LISTO') pedirEstado();
    },
    alUnirse: (rolNuevo) => {
      if (rolNuevo === 'tablet') setTimeout(pedirEstado, 500);
    },
  });

  $('texto-enlace').textContent = 'Sala';
  $('chip-sala').disabled = true;

  botonModo.addEventListener('click', () => {
    modo = modo === 'seguir' ? 'todo' : 'seguir';
    botonModo.querySelector('span').textContent = modo === 'seguir' ? 'Ver todo' : 'Seguir tablet';
    actualizarVista(true);
  });
  $('v-descargar').addEventListener('click', () => tablero.descargarPng('todo'));
  $('v-captura').addEventListener('click', () => tablero.descargarPng('vista'));
  $('v-pantalla').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  let temporizadorBarra;
  function mostrarBarra() {
    document.body.classList.remove('inactivo');
    clearTimeout(temporizadorBarra);
    temporizadorBarra = setTimeout(() => document.body.classList.add('inactivo'), 3500);
  }
  ['pointermove', 'pointerdown', 'keydown'].forEach((nombre) => window.addEventListener(nombre, mostrarBarra));
  mostrarBarra();
  actualizarAviso();

  return {
    alPrimerTamano: () => actualizarVista(false),
    alRedimensionar: () => actualizarVista(false),
  };
}
