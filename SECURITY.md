# Seguridad

Este documento describe los mecanismos del **Portal del Participante** para
proteger los datos personales de quien consulta su registro.

## 1. Ninguna credencial en el paquete

El portal no se autentica con ningún secreto. Lo único que viaja en el paquete
que descarga el navegador es la URL pública del Worker (`PUBLIC_API_BASE`, con
el literal como respaldo en `src/pages/mi-registro.astro`).

Esto es deliberado, y responde a un incidente real: hasta agosto de 2026 la App
QR se autenticaba con `VITE_ADMIN_SECRET`, y Vite incrusta las variables
`VITE_*` en el paquete público. El secreto que abría el padrón completo viajaba
dentro de un archivo JavaScript que cualquiera podía descargar. **Ninguna
variable de entorno de este proyecto debe contener un secreto.**

## 2. El enlace es la credencial

Cada participante llega por un enlace con `?id=<token>`. Ese valor es un **token
opaco**, no el `id_participante`.

La distinción importa: el `id_participante` aparece impreso en el gafete y en el
código QR, así que es público y no autentica a nadie. Cuando el portal lo
enviaba para subir el comprobante, bastaba con leer el gafete de otra persona
para reemplazar su comprobante. Hoy `src/utils/api.ts` envía el token, y lo
documenta en el propio código para que no se revierta.

- El token se valida antes de tocar la red: `src/pages/mi-registro.astro`
  comprueba `/^[A-Za-z0-9-]+$/` y una longitud máxima de 30 caracteres. Esa
  comprobación vive dentro de un bloque `<script>` de un archivo `.astro`, que
  hasta ahora **el linter no miraba**: `npm run lint` solo recorría los `.ts`.
  Ya cubre los `.astro` (`eslint-plugin-astro`).
- Las páginas del portal se sirven con `noindex, nofollow` (`src/layouts/Layout.astro`),
  para que un enlace compartido por descuido no acabe indexado.
- Quien tenga el enlace ve el registro. No hay contraseña: el enlace se envía
  por correo a la dirección registrada y no debe reenviarse.

## 3. Inyección de HTML

Las plantillas de `src/utils/plantillas.ts` construyen HTML con cadenas de
plantilla y lo insertan con `innerHTML`. Lo que sostiene la seguridad es que
**todos** los campos que vienen de la API pasan por `escapeHTML()`
(`src/utils/portal.ts`) en la frontera, en `src/utils/vistas.ts`.

Esto es una disciplina, no una garantía del compilador: cualquier campo nuevo
que se olvide de escapar es un XSS. Al añadir un campo a una plantilla,
escápalo en `vistas.ts` y añade un caso a `plantillas.test.ts`.

`vistas.test.ts` convierte parte de esa disciplina en comprobación: el tipo
`CampoDeTexto` se deriva de `Participante`, así que al añadir un campo de texto
la prueba deja de compilar hasta que se le dé una carga maliciosa.

Un detalle que se arregló de camino: el perfil se pintaba como
`class="perfil-badge ${p.perfil}"`, es decir, texto del servidor dentro de un
atributo. Iba escapado, pero era una superficie innecesaria. Ahora pasa por
`normalizarPerfil()`, que solo puede devolver una de cinco etiquetas conocidas.

## 4. Política de seguridad de contenidos (CSP)

`src/layouts/Layout.astro` emite una CSP como `<meta>`. Es la segunda línea:
aunque se colara una etiqueta por un campo sin escapar, `script-src 'self'`
impide que el navegador ejecute lo que venga dentro.

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self' <origen del Worker>;
object-src 'none'; base-uri 'self'; form-action 'none'
```

Tres cosas que conviene saber antes de tocarla:

- **`style-src` conserva `unsafe-inline`.** Quedan atributos `style=""` en el
  esqueleto de carga. El riesgo de un estilo inyectado no se parece al de un
  script, y quitarlo del todo exigiría reescribir el esqueleto.
- **`frame-ancestors` no está.** Es la defensa contra el clickjacking y solo
  funciona como cabecera HTTP; en un `<meta>` el navegador la ignora. GitHub
  Pages no permite fijar cabeceras. Si el portal se muda a un servidor propio o
  detrás de Cloudflare, hay que servir esta política como cabecera y añadirla.
- **Ningún script en línea.** Astro incrusta en el HTML los scripts pequeños, y
  con esta política dejarían de ejecutarse **sin dar ningún error**. Por eso
  `astro.config.mjs` fija `assetsInlineLimit: 0` y
  `scripts/verificar-salida.mjs` comprueba que en `dist/` no quede ninguno.

## 5. Datos que nunca salen del navegador

El código QR se genera en el cliente con la biblioteca `qrcode`. No se envía el
`id_participante` a ningún servicio de terceros para dibujarlo, que es lo que
hacen las APIs de QR por URL.

## 6. CORS

El Worker solo acepta peticiones desde los orígenes que tiene configurados
—`futurologiaencuadre-2026.com` y `encuadre2026.github.io`—. A un origen
desconocido le devuelve la cabecera del sitio oficial, que su navegador
rechazará por no coincidir.

## Reportar un problema

Escribe a quien figure en el `MAINTAINERS.md` del repositorio principal
(`Encuadre_2026`). No abras un issue público con los detalles de una
vulnerabilidad sin explotar.
