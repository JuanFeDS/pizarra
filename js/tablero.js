import { ANCHO, ALTO, FONDO } from './config.js';

const DISTANCIA_MINIMA = 0.8;
const MULTIPLICADOR_BORRADOR = 3;

function factorPresion(presion) {
  return 0.4 + 1.2 * presion;
}

function puntoMedio(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function distanciaASegmento(punto, inicio, fin) {
  const dx = fin[0] - inicio[0];
  const dy = fin[1] - inicio[1];
  const largoCuadrado = dx * dx + dy * dy;
  const proyeccion = ((punto[0] - inicio[0]) * dx + (punto[1] - inicio[1]) * dy) / (largoCuadrado || 1);
  const fraccion = largoCuadrado === 0 ? 0 : Math.max(0, Math.min(1, proyeccion));
  return Math.hypot(punto[0] - (inicio[0] + fraccion * dx), punto[1] - (inicio[1] + fraccion * dy));
}

export class Tablero {
  constructor(lienzo) {
    this.lienzo = lienzo;
    this.lienzo.width = ANCHO;
    this.lienzo.height = ALTO;
    this.contexto = lienzo.getContext('2d');
    this.contexto.lineCap = 'round';
    this.contexto.lineJoin = 'round';
    this.trazos = [];
    this.indice = new Map();
    this.limpiarLienzo();
  }

  limpiarLienzo() {
    this.contexto.fillStyle = FONDO;
    this.contexto.fillRect(0, 0, ANCHO, ALTO);
  }

  ajustar(contenedor) {
    const estilo = getComputedStyle(contenedor);
    const ancho = contenedor.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    const alto = contenedor.clientHeight - parseFloat(estilo.paddingTop) - parseFloat(estilo.paddingBottom);
    const escala = Math.min(ancho / ANCHO, alto / ALTO);
    this.lienzo.style.width = `${Math.floor(ANCHO * escala)}px`;
    this.lienzo.style.height = `${Math.floor(ALTO * escala)}px`;
    contenedor.style.setProperty('--lienzo-ancho', this.lienzo.style.width);
    contenedor.style.setProperty('--lienzo-alto', this.lienzo.style.height);
  }

  aCoordenadasTablero(clienteX, clienteY) {
    const caja = this.lienzo.getBoundingClientRect();
    return [
      ((clienteX - caja.left) / caja.width) * ANCHO,
      ((clienteY - caja.top) / caja.height) * ALTO,
    ];
  }

  porId(id) {
    return this.indice.get(id);
  }

  nuevoTrazo({ id, color, grosor, borrador }) {
    const trazo = { id, color, grosor, borrador: Boolean(borrador), puntos: [], cerrado: false };
    this.trazos.push(trazo);
    this.indice.set(id, trazo);
    return trazo;
  }

  agregarPuntos(trazo, puntos, filtrar = true) {
    const desde = trazo.puntos.length;
    for (const punto of puntos) {
      const ultimo = trazo.puntos[trazo.puntos.length - 1];
      if (filtrar && ultimo && Math.hypot(punto[0] - ultimo[0], punto[1] - ultimo[1]) < DISTANCIA_MINIMA) {
        continue;
      }
      trazo.puntos.push(punto);
    }
    this.dibujarTramo(trazo, desde);
    return trazo.puntos.length - desde;
  }

  cerrar(trazo) {
    if (trazo.cerrado) return;
    trazo.cerrado = true;
    const puntos = trazo.puntos;
    if (puntos.length < 2) return;
    this.prepararPincel(trazo);
    const penultimo = puntos[puntos.length - 2];
    const ultimo = puntos[puntos.length - 1];
    const inicio = puntoMedio(penultimo, ultimo);
    this.contexto.lineWidth = this.anchoSegmento(trazo, ultimo[2]);
    this.contexto.beginPath();
    this.contexto.moveTo(inicio[0], inicio[1]);
    this.contexto.lineTo(ultimo[0], ultimo[1]);
    this.contexto.stroke();
  }

  quitar(id) {
    const trazo = this.indice.get(id);
    if (!trazo) return null;
    this.trazos = this.trazos.filter((otro) => otro.id !== id);
    this.indice.delete(id);
    this.redibujar();
    return trazo;
  }

  quitarSinRedibujar(id) {
    const posicion = this.trazos.findIndex((trazo) => trazo.id === id);
    if (posicion === -1) return null;
    const [trazo] = this.trazos.splice(posicion, 1);
    this.indice.delete(id);
    return { trazo, indice: posicion };
  }

  insertar(posicion, trazo) {
    this.trazos.splice(posicion, 0, trazo);
    this.indice.set(trazo.id, trazo);
  }

  trazosCerca(punto, anterior, radio) {
    const muestras = [punto];
    if (anterior) {
      const largo = Math.hypot(punto[0] - anterior[0], punto[1] - anterior[1]);
      const pasos = Math.floor(largo / 6);
      for (let i = 1; i <= pasos; i++) {
        const fraccion = i / (pasos + 1);
        muestras.push([
          anterior[0] + (punto[0] - anterior[0]) * fraccion,
          anterior[1] + (punto[1] - anterior[1]) * fraccion,
        ]);
      }
    }
    const golpeados = [];
    for (const trazo of this.trazos) {
      if (trazo.borrador) continue;
      const alcance = radio + trazo.grosor / 2;
      const puntos = trazo.puntos;
      const toca = muestras.some((muestra) => {
        if (puntos.length === 1) {
          return Math.hypot(muestra[0] - puntos[0][0], muestra[1] - puntos[0][1]) <= alcance;
        }
        for (let i = 1; i < puntos.length; i++) {
          if (distanciaASegmento(muestra, puntos[i - 1], puntos[i]) <= alcance) return true;
        }
        return false;
      });
      if (toca) golpeados.push(trazo.id);
    }
    return golpeados;
  }

  vaciar() {
    this.trazos = [];
    this.indice.clear();
    this.limpiarLienzo();
  }

  redibujar() {
    this.limpiarLienzo();
    for (const trazo of this.trazos) {
      this.dibujarTramo(trazo, 0);
      if (trazo.cerrado) {
        trazo.cerrado = false;
        this.cerrar(trazo);
      }
    }
  }

  prepararPincel(trazo) {
    this.contexto.strokeStyle = trazo.borrador ? FONDO : trazo.color;
    this.contexto.fillStyle = this.contexto.strokeStyle;
    this.contexto.lineCap = 'round';
    this.contexto.lineJoin = 'round';
  }

  anchoSegmento(trazo, presion) {
    const base = trazo.borrador ? trazo.grosor * MULTIPLICADOR_BORRADOR : trazo.grosor;
    return base * factorPresion(presion);
  }

  dibujarTramo(trazo, desde) {
    const puntos = trazo.puntos;
    if (puntos.length === 0) return;
    this.prepararPincel(trazo);
    if (puntos.length === 1) {
      this.contexto.beginPath();
      this.contexto.arc(puntos[0][0], puntos[0][1], this.anchoSegmento(trazo, puntos[0][2]) / 2, 0, Math.PI * 2);
      this.contexto.fill();
      return;
    }
    for (let i = Math.max(desde, 1); i < puntos.length; i++) {
      const actual = puntos[i - 1];
      const siguiente = puntos[i];
      const anterior = puntos[i - 2] || actual;
      const inicio = puntoMedio(anterior, actual);
      const fin = puntoMedio(actual, siguiente);
      this.contexto.lineWidth = this.anchoSegmento(trazo, (actual[2] + siguiente[2]) / 2);
      this.contexto.beginPath();
      this.contexto.moveTo(inicio[0], inicio[1]);
      this.contexto.quadraticCurveTo(actual[0], actual[1], fin[0], fin[1]);
      this.contexto.stroke();
    }
  }

  descargarPng() {
    this.lienzo.toBlob((blob) => {
      const ahora = new Date();
      const pad = (valor) => String(valor).padStart(2, '0');
      const nombre = `pizarra-${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}-${pad(ahora.getHours())}${pad(ahora.getMinutes())}.png`;
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = nombre;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
    }, 'image/png');
  }
}

export function aplanar(puntos) {
  const plano = [];
  for (const [x, y, presion] of puntos) {
    plano.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(presion * 100) / 100);
  }
  return plano;
}

export function desaplanar(plano) {
  const puntos = [];
  for (let i = 0; i + 2 < plano.length; i += 3) {
    puntos.push([plano[i], plano[i + 1], plano[i + 2]]);
  }
  return puntos;
}
