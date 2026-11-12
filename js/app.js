import { COLORES, ALFABETO_SALA } from './config.js';
import { Tablero, aplanar, desaplanar } from './tablero.js';
import { conectar } from './red.js';

const parametros = new URLSearchParams(location.search);
const salaEnUrl = (parametros.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const rol = parametros.get('rol') === 'tablet' ? 'tablet' : 'visor';

const $ = (id) => document.getElementById(id);

function leerAlmacen(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribirAlmacen(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* almacenamiento bloqueado: la app sigue funcionando sin recordar */
  }
}

function generarSala() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => ALFABETO_SALA[byte % ALFABETO_SALA.length]).join('');
}

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function enlaceVisor(sala) {
  return `${location.origin}${location.pathname}?sala=${sala}`;
}

function iniciarInicio() {
  let sala = leerAlmacen('pizarra:sala');
  if (!sala) {
    sala = generarSala();
    escribirAlmacen('pizarra:sala', sala);
  }
  $('sala-guardada').textContent = sala;
  $('abrir-tablet').href = `${location.pathname}?sala=${sala}&rol=tablet`;
  $('form-ver').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const codigo = $('entrada-sala').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (codigo) location.href = `${location.pathname}?sala=${codigo}`;
  });
}

function estadoVisual(estadoCanal) {
  if (estadoCanal === 'LISTO') return 'ok';
  if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(estadoCanal)) return 'error';
  return 'conectando';
}

function iniciarPizarra(sala) {
  document.body.dataset.vista = rol;
  $('inicio').hidden = true;
  $('pizarra').hidden = false;
  $('codigo-sala').textContent = sala;
  document.title = `Pizarra · ${sala}`;

  const lienzo = $('lienzo');
  const tablero = new Tablero(lienzo);
  const reajustar = () => tablero.ajustar($('escenario'));
  new ResizeObserver(reajustar).observe($('escenario'));
  reajustar();
  lienzo.addEventListener('contextmenu', (evento) => evento.preventDefault());

  const aviso = $('aviso');
  const estadoPuntos = { tabletPresente: false };
  function actualizarAviso() {
    if (tablero.trazos.length > 0) {
      aviso.hidden = true;
      return;
    }
    aviso.hidden = false;
    if (rol === 'tablet') {
      aviso.textContent = 'Dibuja aquí. Lo que hagas se ve en vivo en el computador.';
    } else {
      aviso.textContent = estadoPuntos.tabletPresente
        ? 'Listo. Empieza a dibujar en la tablet.'
        : 'Esperando la tablet…';
    }
  }

  $('v-descargar').addEventListener('click', () => tablero.descargarPng());
  $('v-pantalla').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  if (rol === 'tablet') iniciarTablet(sala, tablero, actualizarAviso);
  else iniciarVisor(sala, tablero, estadoPuntos, actualizarAviso);
}

function iniciarVisor(sala, tablero, estadoPuntos, actualizarAviso) {
  const puntoEstado = $('estado');
  let ultimaPeticion = 0;
  let red;

  function pedirEstado() {
    if (Date.now() - ultimaPeticion < 1000) return;
    ultimaPeticion = Date.now();
    red.enviar('hola');
  }

  function aplicarTrazo({ id, c, w, e, d, f }) {
    const trazo = tablero.nuevoTrazo({ id, color: c, grosor: w, borrador: e });
    tablero.agregarPuntos(trazo, desaplanar(d), false);
    if (f) tablero.cerrar(trazo);
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
        tablero.agregarPuntos(trazo, desaplanar(carga.d), false);
        if (carga.f) tablero.cerrar(trazo);
        actualizarAviso();
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
      },
      borrar: () => {
        tablero.vaciar();
        actualizarAviso();
      },
      estado: ({ inicio, trazos }) => {
        if (inicio) tablero.vaciar();
        trazos.forEach(aplicarTrazo);
        actualizarAviso();
      },
    },
    alPresencia: (conteo) => {
      estadoPuntos.tabletPresente = conteo.tablet > 0;
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

  let temporizadorBarra;
  function mostrarBarra() {
    document.body.classList.remove('inactivo');
    clearTimeout(temporizadorBarra);
    temporizadorBarra = setTimeout(() => document.body.classList.add('inactivo'), 3500);
  }
  ['pointermove', 'pointerdown', 'keydown'].forEach((nombre) => window.addEventListener(nombre, mostrarBarra));
  mostrarBarra();
  actualizarAviso();
}

function iniciarTablet(sala, tablero, actualizarAviso) {
  const claveTrazos = `pizarra:trazos:${sala}`;
  const sesion = {
    herramienta: 'lapiz',
    color: COLORES[0],
    grosor: Number(leerAlmacen('pizarra:grosor')) || 6,
  };
  const historial = [];
  const rehacerPila = [];
  const RADIO_BORRAR_TRAZO = 18;
  let activo = null;
  let verLapiz = false;
  let red;

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
        tablero.agregarPuntos(trazo, desaplanar(d), false);
        tablero.cerrar(trazo);
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

  red = conectar({
    sala,
    rol: 'tablet',
    eventos: { hola: enviarEstado },
    alPresencia: (conteo) => {
      $('espectadores').textContent =
        `${conteo.visor} viendo`;
    },
    alEstado: (estadoCanal) => {
      $('estado').dataset.estado = estadoVisual(estadoCanal);
    },
  });

  const botonDeshacer = $('h-deshacer');
  const botonRehacer = $('h-rehacer');
  const botonBorrar = $('h-borrar');
  function actualizarBotones() {
    botonDeshacer.disabled = Boolean(activo) || historial.length === 0;
    botonRehacer.disabled = Boolean(activo) || rehacerPila.length === 0;
    botonBorrar.disabled = Boolean(activo) || tablero.trazos.length === 0;
    actualizarAviso();
  }

  restaurarTrazos();
  actualizarBotones();

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
    const puntos = eventos.map((evento) => [
      ...tablero.aCoordenadasTablero(evento.clientX, evento.clientY),
      presionDe(evento),
    ]);
    tablero.agregarPuntos(activo.trazo, puntos);
    if (!activo.temporizador) {
      const accion = activo;
      accion.temporizador = setTimeout(() => vaciarEnvio(accion), 70);
    }
  }

  function borrarTrazosEn(eventos) {
    const ids = [];
    for (const evento of eventos) {
      const punto = tablero.aCoordenadasTablero(evento.clientX, evento.clientY);
      for (const id of tablero.trazosCerca(punto, activo.anterior, RADIO_BORRAR_TRAZO)) {
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

  const lienzo = $('lienzo');
  const lectura = $('lectura');
  const nombresPuntero = { pen: 'lápiz', touch: 'dedo', mouse: 'ratón' };

  lienzo.addEventListener('pointerdown', (evento) => {
    if (evento.pointerType === 'pen') verLapiz = true;
    if (evento.pointerType === 'touch' && verLapiz) return;
    if (activo) return;
    evento.preventDefault();
    lienzo.setPointerCapture(evento.pointerId);
    if (sesion.herramienta === 'trazo') {
      activo = { idPuntero: evento.pointerId, modo: 'borrar-trazo', quitados: [], anterior: null };
      rehacerPila.length = 0;
      actualizarBotones();
      borrarTrazosEn([evento]);
      return;
    }
    const trazo = tablero.nuevoTrazo({
      id: nuevoId(),
      color: sesion.color,
      grosor: sesion.grosor,
      borrador: sesion.herramienta === 'borrador',
    });
    activo = { idPuntero: evento.pointerId, modo: 'dibujar', trazo, temporizador: null, enviados: 0 };
    rehacerPila.length = 0;
    actualizarBotones();
    sumarPuntos([evento]);
  });

  lienzo.addEventListener('pointermove', (evento) => {
    if (evento.pointerType === 'pen' || evento.pointerType === 'mouse') {
      lectura.textContent = `${nombresPuntero[evento.pointerType]} · presión ${evento.pressure.toFixed(2)}`;
    }
    if (!activo || evento.pointerId !== activo.idPuntero) return;
    const lista = evento.getCoalescedEvents ? evento.getCoalescedEvents() : [];
    const eventos = lista.length > 0 ? lista : [evento];
    if (activo.modo === 'borrar-trazo') borrarTrazosEn(eventos);
    else sumarPuntos(eventos);
  });

  function terminarTrazo(evento) {
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
  lienzo.addEventListener('pointerup', terminarTrazo);
  lienzo.addEventListener('pointercancel', terminarTrazo);

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
      tablero.agregarPuntos(restaurado, original.puntos, false);
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
  function restablecerBorrar() {
    textoBorrar.textContent = '';
    botonBorrar.classList.remove('herr--alerta');
  }

  $('h-descargar').addEventListener('click', () => tablero.descargarPng());

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
    escribirAlmacen('pizarra:grosor', String(sesion.grosor));
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
}

if (salaEnUrl) iniciarPizarra(salaEnUrl);
else iniciarInicio();
