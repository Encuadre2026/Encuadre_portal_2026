/**
 * Comprobaciones sobre el sitio ya compilado.
 *
 * Existe por un fallo que ninguna prueba podía ver. `astro.config.mjs` declaraba
 * `redirects: { '/': '/mi-registro' }`, y Astro antepone `base` a la clave de un
 * redirect pero **no a su destino**: la raíz del portal mandaba el navegador a
 * `https://encuadre2026.github.io/mi-registro`, fuera del sitio, y quien entraba
 * acababa en el 404 de GitHub. En `npm run dev` no se nota, porque el servidor
 * de desarrollo resuelve la ruta igual. Solo se ve en `dist/`.
 *
 * De ahí la regla: lo que dependa de `base` se comprueba sobre el artefacto
 * real, no sobre la intención del código.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
// La base se lee de la configuración, no se repite aquí: si se repitiera,
// esta comprobación aprobaría precisamente el error que busca.
import { RAIZ as base } from '../astro.config.mjs';

const DIST = 'dist';
const fallos = [];

/** Registra un fallo si la condición no se cumple. */
function exigir(condicion, descripcion, detalle) {
  if (!condicion) fallos.push(detalle ? `${descripcion}\n    ${detalle}` : descripcion);
}

// ── 1. La redirección de la raíz se queda dentro del sitio ──────
const indice = await readFile(join(DIST, 'index.html'), 'utf8');
const destino = indice.match(/url=([^"']+)/)?.[1];

exigir(destino, 'dist/index.html no contiene ninguna redirección');
exigir(
  destino?.startsWith(`${base}/`),
  'La redirección de la raíz sale fuera del sitio',
  `apunta a «${destino}» y debería empezar por «${base}/»`,
);

// ── 2. Ninguna referencia local se salta la base ────────────────
// Un `href="/algo"` o `src="/algo"` absoluto sin la base es un 404 en GitHub
// Pages. Se excluyen los data: URL y las direcciones absolutas.
const paginas = ['index.html', '404.html', join('mi-registro', 'index.html')];
for (const pagina of paginas) {
  const html = await readFile(join(DIST, pagina), 'utf8');
  const referencias = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  const huerfanas = referencias.filter((r) => !r.startsWith(`${base}/`) && r !== base);
  exigir(huerfanas.length === 0, `${pagina} tiene referencias que no respetan la base`, huerfanas.join(', '));
}

// ── 3. Ningún script en línea ───────────────────────────────────
// La CSP declara `script-src 'self'`, así que un script incrustado en el HTML
// no se ejecuta. Astro incrusta los scripts pequeños que no importan nada, de
// modo que basta con simplificar uno para romper la página sin ningún aviso:
// ni el compilador ni las pruebas ven la diferencia.
for (const pagina of paginas) {
  const html = await readFile(join(DIST, pagina), 'utf8');
  const enLinea = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(
    (m) => m[1].trim().length > 0,
  );
  exigir(
    enLinea.length === 0,
    `${pagina} tiene ${enLinea.length} script(s) en línea, que la CSP bloquea`,
    enLinea.map((m) => m[1].trim().slice(0, 80)).join(' … '),
  );
}

// ── 3. El manifiesto apunta a iconos que existen ────────────────
const manifiesto = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'));
const archivos = await readdir(DIST);

exigir(manifiesto.start_url.startsWith(`${base}/`), 'El manifiesto arranca fuera del sitio', manifiesto.start_url);

for (const icono of manifiesto.icons) {
  const nombre = icono.src.replace(`${base}/`, '');
  exigir(archivos.includes(nombre), `El manifiesto declara un icono que no existe: ${icono.src}`);
}

// Un icono `maskable` se recorta al círculo central: si es el mismo archivo que
// el `any`, en Android se ve un trozo del dibujo. Era el caso, y encima con el
// logotipo apaisado de 3174×708 declarado como 192×192.
const anyIcons = manifiesto.icons.filter((i) => i.purpose?.includes('any')).map((i) => i.src);
const maskables = manifiesto.icons.filter((i) => i.purpose?.includes('maskable')).map((i) => i.src);
exigir(maskables.length > 0, 'El manifiesto no declara ningún icono maskable');
exigir(
  maskables.every((m) => !anyIcons.includes(m)),
  'Un mismo archivo se declara como «any» y como «maskable»',
  'el maskable necesita más margen; reutilizarlo hace que Android lo recorte mal',
);

// ── Resultado ───────────────────────────────────────────────────
if (fallos.length > 0) {
  console.error(`\n✖ ${fallos.length} problema(s) en el sitio compilado:\n`);
  for (const f of fallos) console.error(`  · ${f}`);
  console.error('');
  process.exit(1);
}

console.log('✓ El sitio compilado respeta la base, y el manifiesto es coherente.');
