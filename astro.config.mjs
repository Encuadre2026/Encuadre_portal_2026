// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Ruta base del sitio.
 *
 * El portal vive en la raíz de su propio dominio, así que la base es `/`.
 *
 * Se declara una sola vez porque `base` no se aplica sola a todas partes:
 * Astro la antepone a la clave de un `redirect`, pero **no a su destino**. Con
 * el destino escrito a pelo, la raíz mandaba el navegador fuera del sitio y el
 * visitante acababa en el 404 de GitHub, no en el del portal.
 */
export const BASE = '/';

/**
 * La misma base sin la barra final: cadena vacía cuando el sitio vive en la
 * raíz del dominio, como ahora.
 *
 * Es la forma que hay que usar para construir rutas, y no `BASE`, porque todo
 * lo que la concatena le añade una ruta que ya empieza por `/`. Con `BASE` a
 * secas saldría `//mi-registro`, y eso el navegador no lo lee como una ruta de
 * este sitio, sino como el dominio `mi-registro` con el protocolo heredado. Es
 * el mismo criterio que ya seguían las plantillas al normalizar
 * `import.meta.env.BASE_URL`.
 */
export const RAIZ = BASE.replace(/\/$/, '');

/**
 * El dominio del sitio.
 *
 * Ojo: esto NO configura el dominio en GitHub Pages. Solo le dice a Astro qué
 * poner en las URL canónicas y en las etiquetas Open Graph.
 *
 * El dominio personalizado vive en Settings → Pages del repositorio, y ésa es
 * la única vía en un despliegue por workflow. Se probó a meter un archivo
 * `public/CNAME` en el artefacto, que es lo que funciona cuando Pages sirve
 * directamente de una rama: GitHub lo sirvió como un archivo más y dejó la
 * configuración de Pages intacta. El resultado fue un sitio compilado para la
 * raíz pero servido bajo la ruta vieja, con el HTML respondiendo 200 y todos
 * sus recursos 404.
 */
export default defineConfig({
  site: 'https://portal.futurologiaencuadre-2026.com',
  base: BASE,
  redirects: {
    '/': `${RAIZ}/mi-registro`,
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
