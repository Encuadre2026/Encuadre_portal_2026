# Portal del Participante — 36 FTD Encuadre 2026

Portal web oficial para los participantes del 36 Encuentro Nacional de Escuelas de Diseño Gráfico (Encuadre 2026) con sede en Aguascalientes. Sistema desarrollado con Astro 7 y TypeScript para ofrecer un alto rendimiento, seguridad web mejorada y despliegue automatizado mediante GitHub Pages.

---

## Funcionalidades y Optimizaciones Principales

- **Consulta de Estado del Registro**: Visualización modular en tiempo real de la situación administrativa del participante:
  - **Pendiente de Comprobante**: Muestra un temporizador en vivo indicando la cuenta regresiva hasta el vencimiento para adjuntar el pago.
  - **En Revisión**: Confirma la recepción exitosa del comprobante digital y su verificación en proceso por el equipo administrativo.
  - **Pago Aprobado**: Habilita la descarga oficial del código QR y del gafete virtual para el acceso al evento.
- **Carga Eficiente de Comprobantes PDF (FormData)**:
  - Interfaz con soporte para arrastrar y soltar (drag and drop) con validación de formato y tamaño (máximo 3 MB).
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
│   │   ├── index.astro            # Redirección de entrada al dashboard
│   │   └── mi-registro.astro      # Controlador ligero de la vista principal del participante
│   ├── styles/                # Sistema unified de diseño
│   │   └── portal.css             # Hoja de estilos única (Glassmorphism, variables HSL y Modo Print)
│   └── utils/                 # Módulos de lógica y tipado en TypeScript
│       ├── portal.ts              # Definiciones de interfaces, sanitización XSS y red
│       └── vistas.ts              # Controladores del DOM, transiciones de estado y eventos
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
| `npm run build` | Ejecuta la validación estricta de TypeScript y compila los activos finales en `./dist/` |
| `npm run preview` | Permite verificar de manera local el comportamiento de los archivos compilados en producción |

---

## Integración con Backend en la Nube

Este proyecto interactúa directamente con una arquitectura sin servidor desplegada en Cloudflare Workers, apoyada por una base de datos relacional Cloudflare D1 y almacenamiento para documentos de pago en Cloudflare R2.

### Configuración para pruebas en desarrollo:
1. Copia el archivo `.env.example` del directorio raíz con el nombre `.env`.
2. Asigna al valor de `PUBLIC_API_BASE` la dirección de tu servidor de pruebas o entorno local:
   ```env
   PUBLIC_API_BASE=http://localhost:8787
   ```
*(Nota: En ausencia de la variable o en despliegues automatizados de producción, el sistema resolverá de forma predeterminada al endpoint oficial del evento).*

---

## Compatibilidad en el Ecosistema Encuadre 2026

La estructura de este repositorio mantiene interoperabilidad estricta con los sistemas complementarios del congreso:
- **Encuadre_2026**: Compatible con las redirecciones del sistema automatizado de correos electrónicos (Brevo) hacia las vistas del portal.
- **app-qr**: Las cadenas cifradas generadas localmente por los códigos QR corresponden de manera exacta al protocolo esperado por la aplicación de control de acceso física.
- **Encuadre_Admin_2026**: Los archivos subidos vía FormData se indexan e interpretan íntegramente de forma legible por los administradores del evento a través del panel de control oficial.
