import { ANCHO, ALTO, FONDO } from './config.js';

const DISTANCIA_MINIMA = 0.8;
const MULTIPLICADOR_BORRADOR = 3;

function factorPresion(presion) {
  return 0.4 + 1.2 * presion;
}

function puntoMedio(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
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
