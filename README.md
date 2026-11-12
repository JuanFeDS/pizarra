# Pizarra

Dibuja en la tablet y míralo en vivo en el computador, sin iniciar sesión en nada. Sitio estático: HTML, CSS y JavaScript sin build, publicado en GitHub Pages.

## Cómo se usa

1. En la tablet abre `juanfeds.com/pizarra` y toca **Abrir mi pizarra**. La sala se recuerda en el navegador, así que el enlace del visor no cambia.
2. Toca el código de sala para copiar el enlace del visor y ábrelo en el computador (o escribe el código en «Ver una pizarra»).
3. Comparte esa pestaña en Teams. En el visor la barra se oculta sola a los pocos segundos.

Herramientas de la tablet: lápiz con sensibilidad a la presión, borrador de píxeles, borrador de trazo completo, 6 colores, grosor, deshacer, rehacer, borrar todo y descargar PNG.

**Zoom y desplazamiento:** pellizca con dos dedos para acercar y mover el plano (rueda del ratón para zoom, botón central para mover). Los botones flotantes abajo a la derecha alejan, acercan, encajan todo el dibujo (toca el porcentaje), descargan lo que ves y ocultan las barras para ganar espacio (Esc las vuelve a mostrar). El grosor se mide en píxeles de pantalla: al acercarte, las líneas salen más finas.

**Visor:** sigue lo que ves en la tablet. «Ver todo» le muestra el dibujo completo y «Seguir tablet» vuelve a seguirte. Descarga todo el dibujo o solo la vista actual.

## Cómo funciona

- El plano es ilimitado (±20 000 unidades); la vista inicial encuadra una hoja de 1920×1080. Cada pantalla tiene su propio zoom y los trazos viajan en coordenadas del plano.
- La tablet envía su recuadro visible (`vista`, ~10 veces por segundo como máximo) y el visor lo encuadra en su pantalla.
- Los trazos viajan por Supabase Realtime (Broadcast + Presence) en el canal `pizarra:<sala>`, agrupados cada ~70 ms. No hay tablas ni almacenamiento en servidor.
- Un visor que entra tarde pide el estado completo (`hola`) y la tablet se lo reenvía. La tablet guarda sus trazos en `localStorage` por sala para sobrevivir a una recarga.
- El código de sala es de 8 caracteres aleatorios: quien tenga el enlace puede ver la pizarra. No usar para información confidencial.

## Header del sitio

El header de juanfeds.com se carga con `https://juanfeds.com/shared/site-header.js` (ver `docs/header-compartido.md` en el repo del portafolio). La tool solo deja el espacio con `--alto-cabecera`.

## Desarrollo local

```bash
python -m http.server 8765
```

Abre `http://localhost:8765/` (los módulos ES no cargan desde `file://`).

## Configuración

`js/config.js` apunta al proyecto de Supabase `pdf_reader` (compartido para las tools) con su clave `anon`, que es pública por diseño.
