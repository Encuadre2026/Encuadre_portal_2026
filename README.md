# Portal del Participante — 36 FTD Encuadre 2026

Portal web oficial para los participantes del 36 Encuentro Nacional de Escuelas de Diseño Gráfico (Encuadre 2026) con sede en Aguascalientes. Sistema desarrollado con Astro 7 y TypeScript para ofrecer un alto rendimiento, seguridad web mejorada y despliegue automatizado mediante GitHub Pages.

---

## Funcionalidades y Optimizaciones Principales

- **Consulta de Estado del Registro**: Visualización modular en tiempo real de la situación administrativa del participante:
  - **Pendiente de Comprobante**: Muestra un temporizador en vivo indicando la cuenta regresiva hasta el vencimiento para adjuntar el pago.
  - **En Revisión**: Confirma la recepción exitosa del comprobante digital y su verificación en proceso por el equipo administrativo.
  - **Pago Aprobado**: Habilita la descarga oficial del código QR y del gafete virtual para el acceso al evento.
- **Carga Eficiente de Comprobantes PDF (FormData)**:
  - Interfaz con soporte para arrastrar y soltar (drag and drop) con validación de formato y tamaño (máximo 5 MB, el mismo límite que aplica el Worker).
  - **Barra de Progreso Visual**: Animación fluida e indicación del porcentaje transferido en tiempo real vía red (XMLHttpRequest).
  - **Transición sin Recarga (UX)**: Al concluir exitosamente la subida de un comprobante, el sistema transita suavemente a la vista "En Revisión" sin ejecutar recargas bruscas en el navegador (location.reload).
  - **Transmisión Eficiente**: El archivo PDF viaja en formato crudo FormData (multipart/form-data), ahorrando hasta un 33% de ancho de banda y recursos de procesamiento respecto a envíos en Base64.
- **Generación Local de Códigos QR**: Los códigos QR de acceso se generan local y asíncronamente en la memoria del navegador utilizando la librería especializada qrcode, eliminando peticiones externas a servidores de terceros.
- **Gafete Virtual e Imprimible**: Plantilla calibrada y formateada mediante reglas CSS Print para su impresión directa en papel o exportación a documento PDF, integrando guías de corte e indicadores cromáticos por perfil.
- **Seguridad Web y Accesibilidad**:
  - Sanitización estricta de parámetros en la URL y respuestas de la API mediante la utilidad de prevención XSS (escapeHTML).
  - Integración de atributos estándar WAI-ARIA para lectores de pantalla y soporte completo para navegación asistida por teclado.
- **Estándar de Código en Español**: La arquitectura, variables, funciones y comentarios explicativos están redactados íntegramente en español técnico y claro para optimizar el mantenimiento y la colaboración en equipo.

---

## Estructura y Arquitectura Modular

```text
/
├── .github/workflows/         # Automatización de integración y despliegue (CI/CD)
├── public/                    # Activos estáticos
│   ├── fuentes/               # Tipografía local oficial Montserrat optimizada (WOFF2)
│   └── ...                    # Logotipos y recursos gráficos del evento
├── src/
│   ├── components/            # Componentes reutilizables de la interfaz en Astro
│   │   ├── Header.astro           # Cabecera superior con identidades gráficas oficiales
│   │   └── Spinner.astro          # Indicador rotativo de carga con soporte de accesibilidad
│   ├── layouts/               # Plantillas de estructura general
│   │   └── Layout.astro           # Esqueleto HTML5, metadatos SEO y contenedor para alertas
│   ├── pages/                 # Enrutamiento público del portal
│   │   ├── mi-registro.astro      # Controlador ligero de la vista principal del participante
│   │   ├── manifest.json.ts       # Manifiesto generado a partir de la base configurada
│   │   └── 404.astro              # Página de ruta no encontrada
│   │                              # (la redirección de «/» se declara en astro.config.mjs)
│   ├── styles/                # Sistema unified de diseño
│   │   └── portal.css             # Hoja de estilos única (Glassmorphism, variables HSL y Modo Print)
│   └── utils/                 # Módulos de lógica y tipado en TypeScript
│       ├── api.ts                 # Cliente del Worker: sesión, errores tipados, subida
│       ├── portal.ts              # Presentación: escapado XSS, fechas, QR, cuenta atrás
│       ├── conexion.ts            # Aviso de «sin conexión» (módulo aparte por la CSP)
│       ├── plantillas.ts          # HTML como funciones puras, comprobables sin navegador
│       ├── vistas.ts              # Composición y cableado de eventos sobre el DOM
│       ├── *.test.ts              # Pruebas con Vitest, incluidas instantáneas del HTML
│       └── vistas.dom.test.ts     # Repintado, temporizador y subida, sobre jsdom
├── scripts/
│   └── verificar-salida.mjs   # Comprobaciones sobre `dist/` (lo que depende de `base`)
├── .env.example               # Plantilla documentada de variables de entorno
├── astro.config.mjs           # Configuración de compilación para entorno estático
└── package.json               # Configuración de scripts y dependencias oficiales
```

---

## Comandos de Construcción y Desarrollo

Los siguientes comandos deben ejecutarse desde la terminal situada en el directorio raíz del proyecto:

| Comando | Descripción |
| :--- | :--- |
| `npm install` | Instala las dependencias del proyecto y genera el árbol de paquetes |
| `npm run dev` | Inicia el servidor de desarrollo local de forma interactiva (`http://localhost:4321`) |
| `npm run build` | Compila los activos finales en `./dist/` y comprueba la salida |
| `npm run preview` | Verifica de manera local el comportamiento de los archivos compilados |
| `npm run lint` | ESLint sobre `src/` y `scripts/`, incluidos los `.astro` |
| `npm run format` | Prettier sobre `src/`, `scripts/` y la configuración de la raíz |
| `npm run format:check` | Lo mismo sin escribir: falla si algo no está formateado |
| `npm run check` | `astro check`: la única comprobación que compila de verdad el TypeScript del navegador |
| `npm test` | Vitest: 87 pruebas. Las de DOM usan jsdom; el resto no necesita navegador |
| `npm run verificar` | Formato, lint, tipos y pruebas seguidos |
| `npm run verificar:salida` | Comprueba `dist/`: base, scripts en línea y manifiesto |

### Verificación antes de publicar

`verificacion.yml` corre en cada pull request, y `deploy.yml` repite lo mismo
como puerta antes de desplegar: si falla, no se publica.

Hasta agosto de 2026 el workflow solo compilaba. El linter y las pruebas ya
existían y **no los ejecutaba nadie**; `astro check` ni siquiera estaba
instalado, y en su primera pasada encontró cuatro errores de tipos.

El formato entró por el mismo camino. `npm run format` estaba roto de fábrica:
faltaba `prettier-plugin-astro`, así que Prettier no sabía leer los `.astro` y el
comando terminaba en error; mientras tanto, `portal.css` y `api.test.ts` habían
ido divergiendo de su propio formato sin que nada lo notara. Ahora el plugin
está instalado y `format:check` es una puerta más, para que no vuelva a pasar.

### Por qué TypeScript se queda en la 6

`npm outdated` ofrece TypeScript 7, y **no hay que aceptarlo todavía**. Se probó
en agosto de 2026 y rompe las dos puertas que más valen aquí:

- `astro check` no arranca: «The TypeScript module loaded (found 7.0.2) does not
  expose the programmatic API that `astro check` relies on». El compilador nativo
  de la 7 no publica esa API. Seguimiento:
  <https://github.com/withastro/roadmap/discussions/1321>
- `eslint` no arranca: «typescript-eslint does not support TS 7.0». Seguimiento:
  <https://github.com/typescript-eslint/typescript-eslint/issues/10940>

Los dos lo declaran además en sus `peerDependencies`: `@astrojs/check` pide
`^5.0.0 || ^6.0.0` y `typescript-eslint` pide `>=4.8.4 <6.1.0`, así que la
instalación solo pasa forzándola con `--legacy-peer-deps`.

**Condición para revisarlo:** que `@astrojs/check` y `typescript-eslint` publiquen
soporte para TS 7 en sus `peerDependencies`. Hasta entonces, subir TypeScript
cambia dos comprobaciones que funcionan por una versión que no aporta nada al
portal. Sin esta nota escrita, el aviso de `npm outdated` invita a repetir el
experimento cada pocos meses.

### Por qué se comprueba también el sitio compilado

Hay fallos que ninguna de esas tres puertas puede ver, porque no están en el
código sino en lo que sale de él:

- La redirección de `/` apuntaba a `/mi-registro` en vez de
  `/Encuadre_portal_2026/mi-registro`. Astro antepone `base` a la clave de un
  redirect, pero no a su destino, así que la raíz del portal mandaba a la gente
  al 404 de GitHub. En `npm run dev` funcionaba, porque el servidor de
  desarrollo resuelve la ruta igual.
- Astro incrusta en el HTML los scripts pequeños, y la política de seguridad
  (`script-src 'self'`) no los ejecuta. Un script incrustado desaparece sin
  error.

`scripts/verificar-salida.mjs` comprueba las dos cosas sobre `dist/`, además de
que el manifiesto apunte a iconos que existan y que el `maskable` no sea el
mismo archivo que el normal. Corre al final de `npm run build`, así que tanto el
pull request como el despliegue pasan por él.

---

## Integración con Backend en la Nube

Este proyecto interactúa directamente con una arquitectura sin servidor desplegada en Cloudflare Workers, apoyada por una base de datos relacional Cloudflare D1 y almacenamiento para documentos de pago en Cloudflare R2.

### El contrato

Toda respuesta del Worker lleva `ok`; los errores llevan además `codigo` —un
identificador estable— y `mensaje` —el texto que se le enseña a la persona—.
`src/utils/api.ts` lo traduce a un `ErrorApi` con esos dos campos.

Esto importa más de lo que parece. Antes la subida rechazaba cualquier respuesta
que no fuese 2xx y quien la llamaba enseñaba «Error de conexión» pasara lo que
pasara, de modo que estos cuatro casos se veían idénticos:

| El servidor decía | La persona leía |
| --- | --- |
| El comprobante supera el tamaño máximo de 5 MB | Error de conexión |
| El archivo debe ser un PDF | Error de conexión |
| Enlace no válido. Usa el que recibiste por correo | Error de conexión |
| Tu pago ya fue aprobado | Error de conexión |

Ahora se muestra el motivo real, y el pago ya aprobado deja de ser un callejón
sin salida: en vez de un error, el portal se repinta con el gafete y el QR.

### Configuración para pruebas en desarrollo:
1. Copia el archivo `.env.example` del directorio raíz con el nombre `.env`.
2. Descomenta `PUBLIC_API_BASE` y apúntalo a tu servidor de pruebas o entorno local:
   ```env
   PUBLIC_API_BASE=http://localhost:8787
   ```

La línea viene comentada a propósito. Antes `.env.example` traía escrita la URL
de producción, así que copiarlo tal cual dejaba el entorno de desarrollo
hablando con la base de datos real. En ausencia de la variable —y en el
despliegue automatizado— el portal resuelve al endpoint oficial del evento, que
lleva escrito como respaldo en `src/pages/mi-registro.astro`.

---

## Compatibilidad en el Ecosistema Encuadre 2026

La estructura de este repositorio mantiene interoperabilidad estricta con los sistemas complementarios del congreso:
- **Encuadre_2026**: Compatible con las redirecciones del sistema automatizado de correos electrónicos (Brevo) hacia las vistas del portal.
- **app-qr**: el código QR contiene el `id_participante` en texto plano —no va cifrado— y es exactamente lo que espera la aplicación de control de acceso al escanearlo.
- **Encuadre_Admin_2026**: Los archivos subidos vía FormData se indexan e interpretan íntegramente de forma legible por los administradores del evento a través del panel de control oficial.
