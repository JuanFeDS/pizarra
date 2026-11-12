import { Tablero } from './tablero.js';
import { iniciarTablet } from './tablet.js';
import { iniciarVisor } from './visor.js';
import { $, leerAlmacen, escribirAlmacen, generarSala } from './util.js';

const parametros = new URLSearchParams(location.search);
const salaEnUrl = (parametros.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const rol = parametros.get('rol') === 'tablet' ? 'tablet' : 'visor';

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

function iniciarPizarra(sala) {
  document.body.dataset.vista = rol;
  $('inicio').hidden = true;
  $('pizarra').hidden = false;
  $('codigo-sala').textContent = sala;
  document.title = `Pizarra · ${sala}`;

  const lienzo = $('lienzo');
  const tablero = new Tablero(lienzo);
  lienzo.addEventListener('contextmenu', (evento) => evento.preventDefault());
  const aviso = $('aviso');
  const estadoPresencia = { tabletPresente: false };
  function actualizarAviso() {
    if (tablero.trazos.length > 0) {
      aviso.hidden = true;
      return;
    }
    aviso.hidden = false;
    if (rol === 'tablet') {
      aviso.textContent = 'Dibuja aquí. Lo que hagas se ve en vivo en el computador.';
    } else {
      aviso.textContent = estadoPresencia.tabletPresente
        ? 'Listo. Empieza a dibujar en la tablet.'
        : 'Esperando la tablet…';
    }
  }

  const controlador =
    rol === 'tablet'
      ? iniciarTablet({ sala, tablero, actualizarAviso })
      : iniciarVisor({ sala, tablero, estadoPresencia, actualizarAviso });

  let inicializado = false;
  new ResizeObserver(() => {
    const centro = tablero.centroMundo();
    if (!tablero.redimensionar()) return;
    if (inicializado) {
      controlador.alRedimensionar(centro);
    } else {
      inicializado = true;
      controlador.alPrimerTamano();
    }
  }).observe($('escenario'));
}

if (salaEnUrl) iniciarPizarra(salaEnUrl);
else iniciarInicio();
