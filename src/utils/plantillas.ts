import { esFechaValida, formatFecha, normalizarPerfil } from './portal';
import { MAX_PDF_MB, type Participante } from './api';

/**
 * Plantillas del portal.
 *
 * Todas son funciones puras de sus datos a una cadena de HTML: no tocan el DOM,
 * no leen nada global y no cablean eventos. Eso las hace comprobables sin
 * navegador —de ahí las instantáneas de `plantillas.test.ts`— y deja a
 * `vistas.ts` con un solo trabajo, que es componerlas y conectar los eventos.
 *
 * Los datos llegan ya escapados desde `renderPortal`. Aquí no se vuelve a
 * escapar: hacerlo dos veces convertiría «Martínez &amp; Co» en
 * «Martínez &amp;amp; Co».
 */

export interface EstadoPortal {
  clase: 'aprobado' | 'revision' | 'pendiente';
  titulo: string;
  desc: string;
}

/**
 * El estado no es un campo: se deduce de dos banderas, y el orden importa.
 * Un pago aprobado manda sobre todo lo demás, y solo si no lo está tiene
 * sentido preguntar si ya envió comprobante.
 */
export function estadoDe(aprobado: boolean, tieneComprobante: boolean): EstadoPortal {
  if (aprobado) {
    return {
      clase: 'aprobado',
      titulo: 'Pago Aprobado',
      desc: 'Tu lugar está confirmado. Puedes descargar tu QR e imprimir tu gafete.',
    };
  }
  if (tieneComprobante) {
    return {
      clase: 'revision',
      titulo: 'En Revisión',
      desc: 'Recibimos tu comprobante. Nuestro equipo lo está verificando.',
    };
  }
  return {
    clase: 'pendiente',
    titulo: 'Pendiente de Comprobante',
    desc: 'Debes subir tu comprobante de pago para asegurar tu lugar.',
  };
}

export function bannerEstado(estado: EstadoPortal): string {
  return `
      <div class="estado-banner ${estado.clase}">
        <div class="estado-indicador"></div>
        <div class="estado-info">
          <div class="estado-titulo">${estado.titulo}</div>
          <div class="estado-desc">${estado.desc}</div>
        </div>
      </div>`;
}

/**
 * Datos del registro.
 *
 * Estaba escrito dos veces, una por rama de estado, y las dos copias ya habían
 * divergido: cada vista enseñaba los mismos datos con adornos distintos según
 * el estado del pago. Con una sola definición, esa deriva no puede repetirse.
 */
export function tarjetaDatos(p: Participante): string {
  return `
      <div class="card">
        <p class="card-title">Datos de tu registro</p>
        <div class="datos-grid">
          <div class="dato-item full">
            <span class="dato-label">Nombre completo</span>
            <span class="dato-valor">${p.nombre}</span>
          </div>
          <div class="dato-item">
            <span class="dato-label">ID de Participante</span>
            <span class="dato-valor id-participante">${p.id_participante}</span>
          </div>
          <div class="dato-item">
            <span class="dato-label">Perfil</span>
            <span class="dato-valor"><span class="perfil-badge" data-perfil="${normalizarPerfil(p.perfil)}">${p.perfil}</span></span>
          </div>
          <div class="dato-item full">
            <span class="dato-label">Taller asignado</span>
            <span class="dato-valor">${p.taller}</span>
          </div>
          <div class="dato-item">
            <span class="dato-label">Institución</span>
            <span class="dato-valor">${p.institucion}</span>
          </div>
          <div class="dato-item">
            <span class="dato-label">Fecha de registro</span>
            <span class="dato-valor dato-fecha">${formatFecha(p.fecha_registro)}</span>
          </div>
        </div>
      </div>`;
}

/** Hueco de la cuenta atrás. Lo rellena `iniciarCountdown` cada segundo. */
export function cuentaAtras(): string {
  return `
      <div class="countdown-wrapper">
        <div class="countdown-label">Tiempo restante para subir tu comprobante</div>
        <div id="cd-inner"></div>
      </div>`;
}

/**
 * Aviso que ocupa el lugar del código cuando no se pudo generar.
 *
 * `getQrUrl` devuelve una cadena vacía si la biblioteca falla, y un `src=""` no
 * es un hueco: el navegador lo resuelve contra la URL actual, así que volvía a
 * pedir la propia página —token incluido— para pintarla como si fuese una
 * imagen, y el enlace de descarga bajaba ese HTML renombrado a `.png`.
 */
const AVISO_SIN_QR = `<p class="qr-no-disponible">
            No pudimos generar tu código QR en este dispositivo. Vuelve a cargar la página;
            si aun así no aparece, en el acceso basta con tu ID de participante.
          </p>`;

/**
 * Tarjeta del QR de acceso.
 *
 * Recibe un único data URL. Antes se generaban tres códigos —280, 150 y 500 px—
 * del mismo `id_participante` y encima en serie, con tres `await` seguidos. Un
 * QR es el mismo dibujo a cualquier tamaño, así que basta con generarlo una vez
 * grande y dejar que `width`/`height` lo escalen: además se ve más nítido en
 * pantallas de alta densidad y al imprimir el gafete.
 */
export function tarjetaQr(p: Participante, qr: string): string {
  const codigo = qr
    ? `<div class="qr-img-box">
            <img id="qr-img" src="${qr}" alt="QR ${p.id_participante}" width="240" height="240" />
          </div>`
    : AVISO_SIN_QR;

  const descarga = qr
    ? `<a class="btn btn-outline" href="${qr}" download="QR_${p.id_participante}.png" aria-label="Descargar código QR en alta resolución">
            Descargar QR
          </a>`
    : '';

  return `
      <div class="card card-separada">
        <p class="card-title">Código QR de acceso</p>
        <div class="qr-wrapper">
          ${codigo}
          <div>
            <div class="qr-id-label">ID de participante</div>
            <div class="qr-id-value">${p.id_participante}</div>
          </div>
          ${descarga}
        </div>
      </div>`;
}

export function gafete(p: Participante, qr: string, baseUrl: string): string {
  // Sin código no se pinta el recuadro blanco vacío: el gafete sigue sirviendo
  // con el ID, que es lo que se teclea en el acceso si el QR no se puede leer.
  const qrChico = qr
    ? `<div class="gafete-qr-small">
                    <img src="${qr}" alt="QR ${p.id_participante}" width="100" height="100" />
                  </div>`
    : '';

  return `
      <div class="card gafete-print-section gafete-sticky">
        <p class="card-title">Tu gafete virtual</p>

        <div class="gafete-preview-wrapper">
          <div class="gafete-corte">
            <div class="gafete" data-perfil="${normalizarPerfil(p.perfil)}">
              <div class="gafete-lanyard"><div class="gafete-hole"></div></div>
              <div class="gafete-top">
                <img class="gafete-logo" src="${baseUrl}/logo_futurologia_encuadre.webp" alt="Encuadre 2026" />
                <div class="gafete-evento">36 FTD &middot; Futurología &middot; Encuadre</div>
                <div class="gafete-fecha">29, 30 y 31 de octubre de 2026 &middot; Aguascalientes</div>
              </div>
              <div class="gafete-body">
                <div class="gafete-nombre">${p.nombre}</div>
                <span class="gafete-perfil-badge">${p.perfil}</span>
                <div class="gafete-taller-label">Taller</div>
                <div class="gafete-taller-nombre">${p.taller}</div>
                <div class="gafete-footer">
                  ${qrChico}
                  <div>
                    <div class="gafete-id-label">ID de Participante</div>
                    <div class="gafete-id-value">${p.id_participante}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-full btn-imprimir" id="btn-imprimir" type="button" aria-label="Imprimir tu gafete virtual">
          Imprimir gafete
        </button>
      </div>`;
}

/** Confirmación de que el comprobante ya llegó y está en revisión. */
export function comprobanteRecibido(): string {
  return `
      <div class="card upload-section">
        <p class="card-title">Comprobante de pago</p>
        <div class="upload-ya-enviado upload-ya-enviado-aviso">
          <strong>Comprobante recibido exitosamente.</strong><br><br>
          Nuestro equipo está verificando tu pago. Te notificaremos por correo cuando sea aprobado.
        </div>
      </div>`;
}

/** Formulario de subida. Los eventos los cablea `setupUpload`. */
export function formularioComprobante(): string {
  return `
      <div class="card upload-section">
        <p class="card-title">Comprobante de pago</p>
        <div class="upload-area" id="upload-area" role="button" tabindex="0" aria-label="Seleccionar o arrastrar archivo PDF de comprobante de pago">
          <input type="file" id="comp-input" accept="application/pdf" class="oculto" aria-hidden="true" />
          <svg class="upload-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p class="upload-text">Arrastra tu PDF aquí o haz clic para seleccionar</p>
          <p class="upload-hint">Solo archivos PDF &bull; Máximo ${MAX_PDF_MB} MB</p>
        </div>
        <div id="file-info" class="oculto"></div>
        <button class="btn btn-primary btn-full" id="btn-subir" disabled aria-label="Enviar comprobante de pago en formato PDF">Subir comprobante</button>
        <p class="upload-nota">
          Solo archivos PDF. Si tienes algún problema para subirlo, contáctanos.
        </p>
      </div>`;
}

/** Ficha del archivo elegido, con la barra de progreso todavía oculta. */
export function archivoElegido(nombreEscapado: string, megas: string): string {
  return `
      <div class="upload-archivo-seleccionado">
        <span class="upload-archivo-nombre">${nombreEscapado}</span>
        <span class="upload-archivo-size">${megas} MB</span>
      </div>
      <div id="box-progreso" class="oculto" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Progreso de subida">
        <div class="upload-progreso-wrapper">
          <div class="upload-progreso-barra" id="barra-fill"></div>
        </div>
        <div class="upload-progreso-texto">
          <span>Subiendo archivo...</span>
          <span id="txt-pct">0%</span>
        </div>
      </div>`;
}

export function paginaError(titulo: string, desc: string, conReintento: boolean): string {
  return `
      <div class="error-page">
        <h1 class="error-title">${titulo}</h1>
        <p class="error-desc">${desc}</p>
        ${conReintento ? '<button class="btn btn-primary" id="btn-reintentar" aria-label="Reintentar la conexión">🔄 Reintentar</button>' : ''}
      </div>`;
}

/** Vista completa de quien ya tiene el pago aprobado. */
export function vistaAprobado(p: Participante, estado: EstadoPortal, qr: string, baseUrl: string): string {
  return `
    <div class="dashboard-layout">
      <div class="dashboard-left">
        ${bannerEstado(estado)}
        ${tarjetaDatos(p)}
        ${tarjetaQr(p, qr)}
      </div>
      <div class="dashboard-right">
        ${gafete(p, qr, baseUrl)}
      </div>
    </div>`;
}

/** Vista de quien todavía no tiene el pago aprobado. */
export function vistaPendiente(p: Participante, estado: EstadoPortal, tieneComprobante: boolean): string {
  // La fecha tiene que ser legible, no solo estar presente: una cadena que no
  // se puede parsear pintaba el rótulo «Tiempo restante» sobre un contador de
  // `NaN` que además no paraba nunca.
  const cuenta = !tieneComprobante && esFechaValida(p.fecha_expiracion) ? cuentaAtras() : '';
  const comprobante = tieneComprobante ? comprobanteRecibido() : formularioComprobante();
  return `
    ${bannerEstado(estado)}
    ${cuenta}
    ${tarjetaDatos(p)}
    ${comprobante}`;
}
