import { HOJA_ANCHO, HOJA_ALTO, FONDO, ESCALA_MIN, ESCALA_MAX, LIMITE_MUNDO, LADO_MAXIMO_PNG } from './config.js';

const MULTIPLICADOR_BORRADOR = 3;
const FACTOR_PRESION_MAXIMO = 1.6;
const DPR_MAXIMO = 2;
const COLOR_PUNTOS = 'rgba(80, 70, 130, 0.2)';

export const HOJA = { x: 0, y: 0, w: HOJA_ANCHO, h: HOJA_ALTO };

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

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
  const fraccion = largoCuadrado === 0 ? 0 : limitar(proyeccion, 0, 1);
  return Math.hypot(punto[0] - (inicio[0] + fraccion * dx), punto[1] - (inicio[1] + fraccion * dy));
}

function anchoSegmento(trazo, presion) {
  const base = trazo.borrador ? trazo.grosor * MULTIPLICADOR_BORRADOR : trazo.grosor;
  return base * factorPresion(presion);
}

function prepararPincel(contexto, trazo) {
  contexto.globalCompositeOperation = trazo.borrador ? 'destination-out' : 'source-over';
  contexto.strokeStyle = trazo.borrador ? '#000' : trazo.color;
  contexto.fillStyle = contexto.strokeStyle;
  contexto.lineCap = 'round';
  contexto.lineJoin = 'round';
}

function dibujarTramoEn(contexto, trazo, desde) {
  const puntos = trazo.puntos;
  if (puntos.length === 0) return;
  prepararPincel(contexto, trazo);
  if (puntos.length === 1) {
    contexto.beginPath();
    contexto.arc(puntos[0][0], puntos[0][1], anchoSegmento(trazo, puntos[0][2]) / 2, 0, Math.PI * 2);
    contexto.fill();
    return;
  }
  for (let i = Math.max(desde, 1); i < puntos.length; i++) {
    const actual = puntos[i - 1];
    const siguiente = puntos[i];
    const anterior = puntos[i - 2] || actual;
    const inicio = puntoMedio(anterior, actual);
    const fin = puntoMedio(actual, siguiente);
    contexto.lineWidth = anchoSegmento(trazo, (actual[2] + siguiente[2]) / 2);
    contexto.beginPath();
    contexto.moveTo(inicio[0], inicio[1]);
    contexto.quadraticCurveTo(actual[0], actual[1], fin[0], fin[1]);
    contexto.stroke();
  }
}

function cerrarTrazoEn(contexto, trazo) {
  const puntos = trazo.puntos;
  if (puntos.length < 2) return;
  prepararPincel(contexto, trazo);
  const penultimo = puntos[puntos.length - 2];
  const ultimo = puntos[puntos.length - 1];
  const inicio = puntoMedio(penultimo, ultimo);
  contexto.lineWidth = anchoSegmento(trazo, ultimo[2]);
  contexto.beginPath();
  contexto.moveTo(inicio[0], inicio[1]);
  contexto.lineTo(ultimo[0], ultimo[1]);
  contexto.stroke();
}

function dibujarTrazoCompletoEn(contexto, trazo) {
  dibujarTramoEn(contexto, trazo, 0);
  if (trazo.cerrado) cerrarTrazoEn(contexto, trazo);
}

function intersecta(caja, rect) {
  return caja[0] <= rect.x + rect.w && caja[2] >= rect.x && caja[1] <= rect.y + rect.h && caja[3] >= rect.y;
}

export class Tablero {
  constructor(lienzo) {
    this.lienzo = lienzo;
    this.contexto = lienzo.getContext('2d');
    this.capa = document.createElement('canvas');
    this.contextoCapa = this.capa.getContext('2d');
    this.trazos = [];
    this.indice = new Map();
    this.vista = { x: 0, y: 0, escala: 1 };
    this.ancho = 0;
    this.alto = 0;
    this.dpr = 1;
    this.redibujoPendiente = false;
    this.animacion = null;
    this.alCambiarVista = null;
  }

  redimensionar() {
    const ancho = this.lienzo.clientWidth;
    const alto = this.lienzo.clientHeight;
    if (ancho <= 0 || alto <= 0) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAXIMO);
    if (ancho === this.ancho && alto === this.alto && dpr === this.dpr) return false;
    this.ancho = ancho;
    this.alto = alto;
    this.dpr = dpr;
    for (const lienzo of [this.lienzo, this.capa]) {
      lienzo.width = Math.round(ancho * dpr);
      lienzo.height = Math.round(alto * dpr);
    }
    this.redibujar();
    return true;
  }

  tieneTamano() {
    return this.ancho > 0 && this.alto > 0;
  }

  rectVista() {
    return { x: this.vista.x, y: this.vista.y, w: this.ancho / this.vista.escala, h: this.alto / this.vista.escala };
  }

  centroMundo() {
    const rect = this.rectVista();
    return [rect.x + rect.w / 2, rect.y + rect.h / 2];
  }

  centrarEn(centro) {
    const { escala } = this.vista;
    this.fijarVista({ escala, x: centro[0] - this.ancho / 2 / escala, y: centro[1] - this.alto / 2 / escala });
  }

  encuadrar(rect, margenPixeles = 0) {
    if (!this.tieneTamano() || !(rect.w > 0) || !(rect.h > 0)) return null;
    const disponibleAncho = Math.max(1, this.ancho - 2 * margenPixeles);
    const disponibleAlto = Math.max(1, this.alto - 2 * margenPixeles);
    const escala = limitar(Math.min(disponibleAncho / rect.w, disponibleAlto / rect.h), ESCALA_MIN, ESCALA_MAX);
    return {
      escala,
      x: rect.x + rect.w / 2 - this.ancho / 2 / escala,
      y: rect.y + rect.h / 2 - this.alto / 2 / escala,
    };
  }

  limitarEscala(escala) {
    return limitar(escala, ESCALA_MIN, ESCALA_MAX);
  }

  fijarVista({ x, y, escala }) {
    if (![x, y, escala].every(Number.isFinite)) return;
    this.vista = {
      escala: this.limitarEscala(escala),
      x: limitar(x, -LIMITE_MUNDO, LIMITE_MUNDO),
      y: limitar(y, -LIMITE_MUNDO, LIMITE_MUNDO),
    };
    this.programarRedibujo();
    this.alCambiarVista?.();
  }

  irA(destino, duracion = 180) {
    cancelAnimationFrame(this.animacion);
    const origen = { ...this.vista };
    const inicio = performance.now();
    const paso = (ahora) => {
      const avance = Math.min(1, (ahora - inicio) / duracion);
      const suave = 1 - (1 - avance) ** 3;
      this.fijarVista({
        x: origen.x + (destino.x - origen.x) * suave,
        y: origen.y + (destino.y - origen.y) * suave,
        escala: origen.escala + (destino.escala - origen.escala) * suave,
      });
      if (avance < 1) this.animacion = requestAnimationFrame(paso);
    };
    if (duracion <= 0) this.fijarVista(destino);
    else this.animacion = requestAnimationFrame(paso);
  }

  aMundo(clienteX, clienteY) {
    const caja = this.lienzo.getBoundingClientRect();
    return [
      this.vista.x + (clienteX - caja.left) / this.vista.escala,
      this.vista.y + (clienteY - caja.top) / this.vista.escala,
    ];
  }

  zoomEn(clienteX, clienteY, factor) {
    const escala = this.limitarEscala(this.vista.escala * factor);
    const caja = this.lienzo.getBoundingClientRect();
    const mundo = this.aMundo(clienteX, clienteY);
    this.fijarVista({
      escala,
      x: mundo[0] - (clienteX - caja.left) / escala,
      y: mundo[1] - (clienteY - caja.top) / escala,
    });
  }

  vistaZoomCentro(factor) {
    const escala = this.limitarEscala(this.vista.escala * factor);
    const centro = this.centroMundo();
    return { escala, x: centro[0] - this.ancho / 2 / escala, y: centro[1] - this.alto / 2 / escala };
  }

  aplicarTransformada(contexto) {
    const escala = this.dpr * this.vista.escala;
    contexto.setTransform(escala, 0, 0, escala, -escala * this.vista.x, -escala * this.vista.y);
  }

  programarRedibujo() {
    if (this.redibujoPendiente) return;
    this.redibujoPendiente = true;
    requestAnimationFrame(() => {
      this.redibujoPendiente = false;
      this.redibujar();
    });
  }

  redibujar() {
    if (!this.tieneTamano()) return;
    this.contextoCapa.setTransform(1, 0, 0, 1, 0, 0);
    this.contextoCapa.clearRect(0, 0, this.capa.width, this.capa.height);
    this.aplicarTransformada(this.contextoCapa);
    const visible = this.rectVista();
    for (const trazo of this.trazos) {
      if (trazo.caja && intersecta(trazo.caja, visible)) dibujarTrazoCompletoEn(this.contextoCapa, trazo);
    }
    this.presentar();
  }

  presentar() {
    const contexto = this.contexto;
    contexto.setTransform(1, 0, 0, 1, 0, 0);
    contexto.globalCompositeOperation = 'source-over';
    contexto.fillStyle = FONDO;
    contexto.fillRect(0, 0, this.lienzo.width, this.lienzo.height);
    this.dibujarPuntos(contexto);
    contexto.drawImage(this.capa, 0, 0);
  }

  dibujarPuntos(contexto) {
    const { escala, x, y } = this.vista;
    let espacio = 100;
    while (espacio * escala < 28) espacio *= 2;
    while (espacio * escala >= 56 && espacio > 12) espacio /= 2;
    const radio = 1.5 * this.dpr;
    contexto.fillStyle = COLOR_PUNTOS;
    for (let mundoX = Math.ceil(x / espacio) * espacio; (mundoX - x) * escala < this.ancho; mundoX += espacio) {
      for (let mundoY = Math.ceil(y / espacio) * espacio; (mundoY - y) * escala < this.alto; mundoY += espacio) {
        contexto.beginPath();
        contexto.arc((mundoX - x) * escala * this.dpr, (mundoY - y) * escala * this.dpr, radio, 0, Math.PI * 2);
        contexto.fill();
      }
    }
  }

  porId(id) {
    return this.indice.get(id);
  }

  nuevoTrazo({ id, color, grosor, borrador }) {
    const trazo = { id, color, grosor, borrador: Boolean(borrador), puntos: [], cerrado: false, caja: null };
    this.trazos.push(trazo);
    this.indice.set(id, trazo);
    return trazo;
  }

  ampliarCaja(trazo, desde) {
    const margen = (anchoSegmento(trazo, 1) * FACTOR_PRESION_MAXIMO) / 1.6;
    for (let i = desde; i < trazo.puntos.length; i++) {
      const [x, y] = trazo.puntos[i];
      if (!trazo.caja) {
        trazo.caja = [x - margen, y - margen, x + margen, y + margen];
      } else {
        trazo.caja[0] = Math.min(trazo.caja[0], x - margen);
        trazo.caja[1] = Math.min(trazo.caja[1], y - margen);
        trazo.caja[2] = Math.max(trazo.caja[2], x + margen);
        trazo.caja[3] = Math.max(trazo.caja[3], y + margen);
      }
    }
  }

  agregarPuntos(trazo, puntos, { minimo = 0, dibujar = true } = {}) {
    const desde = trazo.puntos.length;
    for (const punto of puntos) {
      const ultimo = trazo.puntos[trazo.puntos.length - 1];
      if (minimo > 0 && ultimo && Math.hypot(punto[0] - ultimo[0], punto[1] - ultimo[1]) < minimo) continue;
      trazo.puntos.push(punto);
    }
    this.ampliarCaja(trazo, desde);
    if (dibujar && this.tieneTamano()) {
      this.aplicarTransformada(this.contextoCapa);
      dibujarTramoEn(this.contextoCapa, trazo, desde);
      this.presentar();
    }
    return trazo.puntos.length - desde;
  }

  cerrar(trazo, { dibujar = true } = {}) {
    if (trazo.cerrado) return;
    trazo.cerrado = true;
    if (dibujar && this.tieneTamano()) {
      this.aplicarTransformada(this.contextoCapa);
      cerrarTrazoEn(this.contextoCapa, trazo);
      this.presentar();
    }
  }

  quitar(id) {
    const quitado = this.quitarSinRedibujar(id);
    if (quitado) this.redibujar();
    return quitado?.trazo ?? null;
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

  trazosCerca(punto, anterior, radio, paso) {
    const muestras = [punto];
    if (anterior) {
      const largo = Math.hypot(punto[0] - anterior[0], punto[1] - anterior[1]);
      const pasos = Math.floor(largo / paso);
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
    this.redibujar();
  }

  cajaContenido() {
    let caja = null;
    for (const trazo of this.trazos) {
      if (trazo.borrador || !trazo.caja) continue;
      if (!caja) caja = [...trazo.caja];
      else {
        caja[0] = Math.min(caja[0], trazo.caja[0]);
        caja[1] = Math.min(caja[1], trazo.caja[1]);
        caja[2] = Math.max(caja[2], trazo.caja[2]);
        caja[3] = Math.max(caja[3], trazo.caja[3]);
      }
    }
    return caja ? { x: caja[0], y: caja[1], w: caja[2] - caja[0], h: caja[3] - caja[1] } : null;
  }

  descargarPng(modo = 'todo') {
    const area = modo === 'vista' ? this.rectVista() : this.cajaContenido() ?? HOJA;
    const margen = modo === 'vista' ? 0 : 40;
    const rect = { x: area.x - margen, y: area.y - margen, w: area.w + 2 * margen, h: area.h + 2 * margen };
    const lado = Math.max(rect.w, rect.h);
    const escala = Math.min(limitar(2400 / lado, 0.5, 3), LADO_MAXIMO_PNG / lado);
    const salida = document.createElement('canvas');
    salida.width = Math.max(1, Math.ceil(rect.w * escala));
    salida.height = Math.max(1, Math.ceil(rect.h * escala));
    const capa = document.createElement('canvas');
    capa.width = salida.width;
    capa.height = salida.height;
    const contextoCapa = capa.getContext('2d');
    contextoCapa.setTransform(escala, 0, 0, escala, -rect.x * escala, -rect.y * escala);
    for (const trazo of this.trazos) dibujarTrazoCompletoEn(contextoCapa, trazo);
    const contextoSalida = salida.getContext('2d');
    contextoSalida.fillStyle = FONDO;
    contextoSalida.fillRect(0, 0, salida.width, salida.height);
    contextoSalida.drawImage(capa, 0, 0);
    salida.toBlob((blob) => {
      if (!blob) {
        window.alert('No se pudo generar la imagen: el dibujo es demasiado grande para este dispositivo.');
        return;
      }
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
