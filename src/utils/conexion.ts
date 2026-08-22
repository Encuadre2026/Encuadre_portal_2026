/**
 * Aviso de «sin conexión».
 *
 * Vive en su propio módulo, y no como un `<script>` suelto en el layout, por un
 * motivo concreto: Astro incrusta en el HTML los scripts pequeños que no
 * importan nada, y la política de seguridad del portal prohíbe los scripts en
 * línea (`script-src 'self'`). Un script incrustado no se ejecutaría y el aviso
 * no aparecería nunca. Al importarse como módulo, Astro lo emite como archivo
 * aparte. `verificar-salida.mjs` comprueba que en `dist/` no quede ninguno en
 * línea, para que esto no se rompa en silencio.
 */

/**
 * Muestra u oculta el aviso según el estado de la conexión y se queda
 * escuchando los cambios.
 *
 * Se usa el atributo `hidden` en lugar de un `style="display:none"`: los
 * estilos en línea son justo lo que obliga a relajar la política de seguridad.
 */
export function vigilarConexion(banner: HTMLElement | null): void {
  if (!banner) return;

  const actualizar = () => banner.toggleAttribute('hidden', navigator.onLine);

  window.addEventListener('online', actualizar);
  window.addEventListener('offline', actualizar);
  actualizar();
}
