import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

function contarRoles(estadoPresencia) {
  const conteo = { tablet: 0, visor: 0 };
  for (const sesiones of Object.values(estadoPresencia)) {
    for (const sesion of sesiones) {
      if (sesion.rol in conteo) conteo[sesion.rol] += 1;
    }
  }
  return conteo;
}

export function conectar({ sala, rol, eventos, alPresencia, alEstado, alUnirse }) {
  const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 40 } },
  });
  const identificador = `${rol}-${Math.random().toString(36).slice(2, 10)}`;
  const canal = cliente.channel(`pizarra:${sala}`, {
    config: { broadcast: { self: false }, presence: { key: identificador } },
  });

  for (const [evento, manejador] of Object.entries(eventos)) {
    canal.on('broadcast', { event: evento }, ({ payload }) => manejador(payload));
  }
  canal.on('presence', { event: 'sync' }, () => alPresencia(contarRoles(canal.presenceState())));
  canal.on('presence', { event: 'join' }, ({ newPresences }) => {
    for (const sesion of newPresences) alUnirse?.(sesion.rol);
  });

  canal.subscribe(async (estado) => {
    alEstado(estado);
    if (estado === 'SUBSCRIBED') {
      await canal.track({ rol });
      alEstado('LISTO');
    }
  });

  return {
    enviar: (evento, payload = {}) => canal.send({ type: 'broadcast', event: evento, payload }),
    cerrar: () => cliente.removeChannel(canal),
  };
}
