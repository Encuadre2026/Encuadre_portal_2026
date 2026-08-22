import type { APIRoute } from 'astro';

/**
 * Manifiesto de la aplicación web.
 *
 * Se genera en vez de escribirse a mano en `public/` por dos motivos que ya
 * habían fallado:
 *
 * 1. Las rutas llevaban `/Encuadre_portal_2026/` escrito literalmente en cuatro
 *    sitios. La base vive en `astro.config.mjs`; duplicarla significa que al
 *    cambiarla —o al montar el portal en el dominio propio— el manifiesto
 *    apunta a recursos que no existen, y sin ningún error visible.
 * 2. El icono declarado como `192x192` era el logotipo apaisado de 3174×708.
 *    Ni era cuadrado ni medía eso, y como `maskable` Android lo recortaba al
 *    círculo seguro dejando ver un trozo del centro.
 *
 * Los iconos `any` y `maskable` se declaran por separado a propósito: el
 * segundo necesita que el contenido quepa en el 80 % central, así que lleva más
 * margen y no sirve como icono normal.
 */

// `BASE_URL` llega con barra final o sin ella según la configuración; se
// normaliza para no acabar generando `//favicon.svg`.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

const manifiesto = {
  name: 'Portal del Participante — Encuadre 2026',
  short_name: 'Encuadre 2026',
  description: 'Consulta el estado de tu registro, descarga tu QR e imprime tu gafete para el 36 FTD Encuadre 2026.',
  start_url: `${base}/mi-registro`,
  scope: `${base}/`,
  display: 'standalone',
  background_color: '#151515',
  theme_color: '#151515',
  orientation: 'portrait',
  icons: [
    { src: `${base}/icono-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}/icono-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: `${base}/icono-maskable-512.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

export const GET: APIRoute = () =>
  new Response(JSON.stringify(manifiesto, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
