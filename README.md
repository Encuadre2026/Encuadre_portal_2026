# 🎓 Portal del Participante — 36 FTD Encuadre 2026

Portal web oficial para los participantes del **36 Encuentro Nacional de Escuelas de Diseño Gráfico (Encuadre 2026)** con sede en Aguascalientes. Desarrollado con **Astro 7 + TypeScript** para un rendimiento ultrarrápido, alta seguridad, diseño dinámico y despliegue automatizado a través de GitHub Pages.

---

## ✨ Funcionalidades y Optimizaciones Principales

- **Consulta de Estado del Registro**: Visualización modular y en tiempo real de la situación del participante:
  - 🟠 **Pendiente de Comprobante**: Muestra un temporizador (cuenta regresiva) en vivo hasta el vencimiento para subir el pago.
  - 🔵 **En Revisión**: El comprobante fue recibido exitosamente y está siendo verificado por el equipo administrativo.
  - 🟢 **Pago Aprobado**: Habilita la descarga de códigos QR y el gafete virtual oficial para acceso al evento.
- **Carga Eficiente de Comprobantes PDF (FormData)**:
  - Soporte de *drag & drop* (arrastrar y soltar) con validación de tipo y peso (máximo 3 MB).
  - **Barra de Progreso Visual**: Animación neón fluida e indicación del porcentaje en vivo por red (`XMLHttpRequest`).
  - **Transición Sin Recargas (UX)**: Al completar la subida de un comprobante, el portal realiza una transición difumada hacia la vista *"En Revisión"* sin forzar recargas bruscas del navegador (`location.reload`).
  - **Transmisión Ligera**: El archivo PDF se transmite en formato crudo **FormData** (multipart), ahorrando 33% de ancho de banda y recursos de CPU frente a sistemas Base64 tradicionales.
- **Generación Local de Códigos QR**: Los códigos QR de acceso se generan local y asíncronamente en memoria usando la librería `qrcode`, eliminando la dependencia de servidores API externos de terceros.
- **Gafete Virtual e Imprimible**: Plantilla calibrada para impresión directa en papel o exportación a PDF, con cortes y colores de perfil personalizados.
- **Seguridad Web (XSS) y Accesibilidad (a11y)**:
  - Sanitización en vivo de parámetros y respuestas del servidor mediante la utilidad `escapeHTML()`.
  - Atributos estándar WAI-ARIA para lectores de pantalla y soporte de navegación con teclado (focos visibles y disparo por teclas *Enter/Espacio*).
- **Código en Español**: Todo el código web, funciones, variables y comentarios están escritos en un español claro, conciso y técnico para facilitar el trabajo colaborativo de todo el equipo de desarrollo.

---

## 🏛️ Estructura de la Arquitectura Modular

```text
/
├── .github/workflows/         # Automatización CI/CD para despliegue continuo en GitHub Pages
├── public/                    # Activos estáticos
│   ├── fuentes/               # Tipografía local oficial Montserrat optimizada (WOFF2)
│   └── ...                    # Logotipos e iconos del evento
├── src/
│   ├── components/            # Componentes reutilizables de Astro
│   │   ├── Header.astro           # Cabecera superior con identidades de marca
│   │   └── Spinner.astro          # Indicador rotativo de carga (accesible y animado)
│   ├── layouts/               # Plantillas de enmascarado global
│   │   └── Layout.astro           # Esqueleto HTML5, metadatos SEO y contenedor Toast
│   ├── pages/                 # Rutas públicas del portal
│   │   ├── index.astro            # Redirección inteligente de entrada
│   │   └── mi-registro.astro      # Controlador liviano (<50 líneas) de la vista principal
│   ├── styles/                # Sistema de diseño
│   │   └── portal.css             # Hoja de estilos única unificada (Glassmorphism, Neon Glow y Modo Print)
│   └── utils/                 # Módulos de lógica en TypeScript
│       ├── portal.ts              # Tipado estricto, sanitización XSS, progreso de red y temporizadores
│       └── vistas.ts              # Generador de templates HTML, controladores de eventos y transiciones UX
├── .env.example               # Plantilla documentada de variables de entorno para desarrollo
├── astro.config.mjs           # Configuración del compilador estático (GitHub Pages / Vite)
└── package.json               # Dependencias (Astro, TypeScript, QRCode)
```

---

## 💻 Comandos de Consola y Desarrollo

Sitúa tu terminal dentro de la carpeta del proyecto para usar las herramientas de construcción:

| Comando | Acción |
| :--- | :--- |
| `npm install` | Instala todas las dependencias del proyecto de forma reproducible |
| `npm run dev` | Inicia el servidor local en vivo (usualmente en `http://localhost:4321`) |
| `npm run build` | Valida el tipado TypeScript y compila el paquete de producción en `./dist/` |
| `npm run preview` | Previsualiza en un servidor local el empaquetado de producción resultante |

---

## ☁️ Integración con el Backend (Cloudflare Workers)

Este portal consulta y envía documentos a una API REST sin servidor gestionada en **Cloudflare Workers**, emparejada con Cloudflare D1 (Base de datos) y Cloudflare R2 (Almacenamiento de archivos PDF).

### Configurar entornos de desarrollo locales:
1. Duplica el archivo `.env.example` en la raíz con el nombre `.env`.
2. Modifica el parámetro `PUBLIC_API_BASE` hacia la URL del servidor local de pruebas:
   ```env
   PUBLIC_API_BASE=http://localhost:8787
   ```
*(Nota: Si el archivo `.env` no existe o no se declara al desplegar, el sistema asumirá automáticamente y de forma segura el endpoint oficial de producción en la nube).*

---

## 🤝 Compatibilidad en el Ecosistema Encuadre 2026

La arquitectura de este portal se mantiene sincronizada con los demás repositorios hermanos:
- `Encuadre_2026`: Mantiene las rutas url receptoras para los enlaces originados desde correos automatizados (Brevo).
- `app-qr`: Los códigos QR locales generan cadenas exactas y compatibles con el sistema de escaneo del evento.
- `Encuadre_Admin_2026`: El envío multipart FormData guarda documentos limpios y legibles inmediatamente por los moderadores y auditores del evento.
