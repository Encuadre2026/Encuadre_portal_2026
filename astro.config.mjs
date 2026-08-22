// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Ruta base del sitio dentro de GitHub Pages.
 *
 * Se declara una sola vez porque `base` no se aplica sola a todas partes:
 * Astro la antepone a la clave de un `redirect`, pero **no a su destino**. Con
 * el destino escrito a pelo, `/Encuadre_portal_2026/` mandaba el navegador a
 * `/mi-registro` —fuera del sitio— y el visitante acababa en el 404 de GitHub,
 * no en el del portal.
 */
export const BASE = '/Encuadre_portal_2026';

export default defineConfig({
  site: 'https://Encuadre2026.github.io',
  base: BASE,
  redirects: {
    '/': `${BASE}/mi-registro`,
  },
  vite: {
    build: {
      /**
       * Nada de incrustar en el HTML.
       *
       * Astro mete dentro de la página los scripts pequeños que no importan
       * nada (`plugin-scripts.js` lo decide con este mismo límite). La política
       * de seguridad del portal declara `script-src 'self'`, así que un script
       * incrustado no se ejecuta: el aviso de «sin conexión» desaparecía sin
       * dar ningún error, ni al compilar ni en las pruebas.
       *
       * `scripts/verificar-salida.mjs` lo comprueba sobre `dist/`, porque esto
       * depende de un umbral de tamaño y podría volver con cualquier cambio.
       */
      assetsInlineLimit: 0,
    },
  },
});
