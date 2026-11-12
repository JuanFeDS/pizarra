import { ALFABETO_SALA } from './config.js';

export const $ = (id) => document.getElementById(id);

export function leerAlmacen(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function escribirAlmacen(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* almacenamiento bloqueado: la app sigue funcionando sin recordar */
  }
}

export function generarSala() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => ALFABETO_SALA[byte % ALFABETO_SALA.length]).join('');
}

export function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function enlaceVisor(sala) {
  return `${location.origin}${location.pathname}?sala=${sala}`;
}

export function estadoVisual(estadoCanal) {
  if (estadoCanal === 'LISTO') return 'ok';
  if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(estadoCanal)) return 'error';
  return 'conectando';
}
