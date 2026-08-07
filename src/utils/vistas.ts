import { 
  type Participante, 
  escapeHTML, 
  formatFecha, 
  perfilColor, 
  getQrUrl, 
  toast, 
  subirConProgreso,
  iniciarCountdown 
} from './portal';

// ── Renderizado de la Pantalla de Error ─────────────────────────
// Muestra mensajes ilustrados cuando un ID falta o no existe
export function renderError(titulo: string, desc: string, onRetry?: () => void): void {
  const main = document.getElementById('portal-main');
  if (!main) return;
  main.innerHTML = `
    <div class="error-page">
      <h1 class="error-title">${titulo}</h1>
      <p class="error-desc">${desc}</p>
      ${onRetry ? '<button class="btn btn-primary" id="btn-reintentar" aria-label="Reintentar la conexión">🔄 Reintentar</button>' : ''}
    </div>`;
  if (onRetry) {
    const btn = document.getElementById('btn-reintentar');
    if (btn) btn.addEventListener('click', onRetry);
  }
}

// ── Renderizado Principal del Dashboard ─────────────────────────
// Construye de forma segura y modular la vista del portal según el estado del pago
export async function renderPortal(
  pRaw: Participante,
  apiBase: string,
  baseUrl: string = '',
  tokenPortal: string = ''
): Promise<void> {
  const main = document.getElementById('portal-main');
  if (!main) return;

  // Sanitizar datos del usuario y asignar fallbacks
  const p: Participante = {
    ...pRaw,
    nombre: escapeHTML(pRaw.nombre || 'Participante sin nombre'),
    id_participante: escapeHTML(pRaw.id_participante || 'SIN-ID'),
    perfil: escapeHTML(pRaw.perfil || 'General'),
    taller: escapeHTML(pRaw.taller || 'Por asignar'),
    institucion: escapeHTML(pRaw.institucion || 'No especificada')
  };

  const aprobado = p.pago_aprobado == 1 || p.pago_aprobado === true;
  const tieneComp = p.tiene_comprobante == 1 || p.tiene_comprobante === true;
  const color = perfilColor(p.perfil);

  const qr280 = aprobado ? await getQrUrl(p.id_participante, 280) : '';
  const qr150 = aprobado ? await getQrUrl(p.id_participante, 150) : '';
  const qr500 = aprobado ? await getQrUrl(p.id_participante, 500) : '';

  // Determinar colores y títulos de estado
  let estadoClase, estadoTitulo, estadoDesc;
  if (aprobado) {
    estadoClase = 'aprobado';
    estadoTitulo = 'Pago Aprobado';
    estadoDesc   = 'Tu lugar está confirmado. Puedes descargar tu QR e imprimir tu gafete.';
  } else if (tieneComp) {
    estadoClase = 'revision';
    estadoTitulo = 'En Revisión';
    estadoDesc   = 'Recibimos tu comprobante. Nuestro equipo lo está verificando.';
  } else {
    estadoClase = 'pendiente';
    estadoTitulo = 'Pendiente de Comprobante';
    estadoDesc   = 'Debes subir tu comprobante de pago para asegurar tu lugar.';
  }

  // Generar bloque del temporizador (sólo en estado pendiente)
  const countdownHtml = (!aprobado && !tieneComp && p.fecha_expiracion) ? `
    <div class="countdown-wrapper">
      <div class="countdown-label">Tiempo restante para subir tu comprobante</div>
      <div id="cd-inner"></div>
    </div>` : '';

  // Generar bloque de carga de comprobante (sólo si no está aprobado)
  let uploadHtml = '';
  if (!aprobado) {
    if (tieneComp) {
      uploadHtml = `
        <div class="card upload-section">
          <p class="card-title">Comprobante de pago</p>
          <div class="upload-ya-enviado" style="margin:0; text-align:center; padding: 20px;">
            <strong>Comprobante recibido exitosamente.</strong><br><br>
            Nuestro equipo está verificando tu pago. Te notificaremos por correo cuando sea aprobado.
          </div>
        </div>`;
    } else {
      uploadHtml = `
        <div class="card upload-section">
          <p class="card-title">Comprobante de pago</p>
          <div class="upload-area" id="upload-area" role="button" tabindex="0" aria-label="Seleccionar o arrastrar archivo PDF de comprobante de pago">
            <input type="file" id="comp-input" accept="application/pdf" style="display:none" aria-hidden="true" />
            <svg class="upload-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p class="upload-text">Arrastra tu PDF aquí o haz clic para seleccionar</p>
            <p class="upload-hint">Solo archivos PDF &bull; Máximo 3 MB</p>
          </div>
          <div id="file-info" style="display:none"></div>
          <button class="btn btn-primary btn-full" id="btn-subir" disabled aria-label="Enviar comprobante de pago en formato PDF">Subir comprobante</button>
          <p style="font-size:11px;color:#555;margin-top:10px;text-align:center">
            También puedes responder el correo de confirmación adjuntando tu comprobante.
          </p>
        </div>`;
    }
  }

  // Renderizar HTML final según estado
  if (aprobado) {
    main.innerHTML = `
      <div class="dashboard-layout">
        
        <!-- Columna Izquierda: Información de Registro & QR Acceso -->
        <div class="dashboard-left">
          <div class="estado-banner ${estadoClase}" style="margin-bottom: 24px;">
            <div class="estado-indicador"></div>
            <div class="estado-info">
              <div class="estado-titulo">${estadoTitulo}</div>
              <div class="estado-desc">${estadoDesc}</div>
            </div>
          </div>

          <div class="card">
            <p class="card-title">Datos de tu registro</p>
            <div class="datos-grid">
              <div class="dato-item full">
                <span class="dato-label">Nombre completo</span>
                <span class="dato-valor">${p.nombre}</span>
              </div>
              <div class="dato-item">
                <span class="dato-label">ID de Participante</span>
                <span class="dato-valor id-participante">${p.id_participante} <button class="btn-copiar" data-copiar="${p.id_participante}" aria-label="Copiar ID al portapapeles" title="Copiar ID">📋</button></span>
              </div>
              <div class="dato-item">
                <span class="dato-label">Perfil</span>
                <span class="dato-valor"><span class="perfil-badge ${p.perfil}">${p.perfil}</span></span>
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
                <span class="dato-valor" style="font-size:13px">${formatFecha(p.fecha_registro)}</span>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: 24px;">
            <p class="card-title">Código QR de acceso</p>
            <div class="qr-wrapper">
              <div class="qr-img-box">
                <img id="qr-img" src="${qr280}" alt="QR ${p.id_participante}" width="240" height="240" />
              </div>
              <div>
                <div class="qr-id-label">ID de participante</div>
                <div class="qr-id-value">${p.id_participante}</div>
              </div>
              <a class="btn btn-outline" href="${qr500}" download="QR_${p.id_participante}.png" target="_blank" aria-label="Descargar código QR en alta resolución">
                Descargar QR
              </a>
            </div>
          </div>
        </div>

        <!-- Columna Derecha: Gafete Virtual e Imprimible -->
        <div class="dashboard-right">
          <div class="card gafete-print-section" style="position: sticky; top: 110px;">
            <p class="card-title">Tu gafete virtual</p>
            
            <div class="gafete-preview-wrapper">
              <div class="gafete-corte">
                <div class="gafete" style="border-top: 6px solid ${color}">
                  <div class="gafete-lanyard"><div class="gafete-hole"></div></div>
                  <div class="gafete-top">
                    <img class="gafete-logo" src="${baseUrl}/logo_futurologia_encuadre.png" alt="Encuadre 2026" />
                    <div class="gafete-evento">36 FTD &middot; Futurología &middot; Encuadre</div>
                    <div class="gafete-fecha">29, 30 y 31 de octubre de 2026 &middot; Aguascalientes</div>
                  </div>
                  <div class="gafete-body">
                    <div class="gafete-nombre">${p.nombre}</div>
                    <span class="gafete-perfil-badge" style="background:${color}">${p.perfil}</span>
                    <div class="gafete-taller-label">Taller</div>
                    <div class="gafete-taller-nombre">${p.taller}</div>
                    <div class="gafete-footer">
                      <div class="gafete-qr-small">
                        <img src="${qr150}" alt="QR ${p.id_participante}" width="100" height="100" />
                      </div>
                      <div>
                        <div class="gafete-id-label">ID de Participante</div>
                        <div class="gafete-id-value">${p.id_participante}</div>
                      </div>
                    </div>
                  </div>
                </div><!-- /gafete -->
              </div><!-- /gafete-corte -->
            </div><!-- /gafete-preview-wrapper -->

            <button class="btn btn-primary btn-full btn-imprimir" onclick="window.print()" aria-label="Imprimir tu gafete virtual">
              Imprimir gafete
            </button>
          </div>
        </div>

      </div>
    `;
  } else {
    // Si no está aprobado, mostrar interfaz de carga / cuenta regresiva
    main.innerHTML = `
      <div class="estado-banner ${estadoClase}" style="margin-bottom: 24px;">
        <div class="estado-indicador"></div>
        <div class="estado-info">
          <div class="estado-titulo">${estadoTitulo}</div>
          <div class="estado-desc">${estadoDesc}</div>
        </div>
      </div>

      ${countdownHtml}

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
            <span class="dato-valor"><span class="perfil-badge ${p.perfil}">${p.perfil}</span></span>
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
            <span class="dato-valor" style="font-size:13px">${formatFecha(p.fecha_registro)}</span>
          </div>
        </div>
      </div>

      ${uploadHtml}
    `;

    if (!tieneComp && p.fecha_expiracion) iniciarCountdown(p.fecha_expiracion);
    setupUpload(p, apiBase, baseUrl, tokenPortal);
  }

  configurarBotonesCopiar();
}

// ── Botón de copiar ID al portapapeles ──────────────────────────────
function configurarBotonesCopiar(): void {
  document.querySelectorAll<HTMLButtonElement>('.btn-copiar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const valor = btn.dataset.copiar || '';
      try {
        await navigator.clipboard.writeText(valor);
        const original = btn.textContent;
        btn.textContent = '✓';
        toast('ID copiado al portapapeles', 'success');
        setTimeout(() => { btn.textContent = original; }, 1500);
      } catch {
        toast('No se pudo copiar al portapapeles', 'error');
      }
    });
  });
}

// ── Controlador de Eventos para Carga de PDF ────────────────────
// Gestiona el arrastrar, soltar, teclado (a11y), progreso visual y transición sin recarga
export function setupUpload(
  p: Participante,
  apiBase: string,
  baseUrl: string,
  tokenPortal: string
): void {
  const input = document.getElementById('comp-input') as HTMLInputElement | null;
  const area  = document.getElementById('upload-area');
  const info  = document.getElementById('file-info');
  const btn   = document.getElementById('btn-subir') as HTMLButtonElement | null;
  if (!input || !area || !info || !btn) return;

  let archivo: File | null = null;
  let enviando = false;

  // Soporte para Arrastrar y Soltar (Drag & Drop)
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', e => { 
    e.preventDefault(); 
    area.classList.remove('drag-over'); 
    if (e.dataTransfer && e.dataTransfer.files[0]) procesar(e.dataTransfer.files[0]); 
  });
  area.addEventListener('click', () => { input.click(); });

  // Soporte de Accesibilidad (a11y): Activar selección con teclado (Enter o Espacio)
  area.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', () => { if (input.files && input.files[0]) procesar(input.files[0]); });

  function procesar(f: File) {
    if (f.type !== 'application/pdf') { toast('Solo se aceptan archivos PDF.', 'error'); return; }
    if (f.size > 3 * 1024 * 1024)   { toast('El archivo supera los 3 MB.', 'error'); return; }
    archivo = f;
    const mb = (f.size / 1048576).toFixed(2);
    info.style.display = 'block';
    info.innerHTML = `
      <div class="upload-archivo-seleccionado">
        <span class="upload-archivo-nombre">${escapeHTML(f.name)}</span>
        <span class="upload-archivo-size">${mb} MB</span>
      </div>
      <!-- Barra de Progreso Visual (oculta inicialmente) -->
      <div id="box-progreso" style="display:none;" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Progreso de subida">
        <div class="upload-progreso-wrapper">
          <div class="upload-progreso-barra" id="barra-fill"></div>
        </div>
        <div class="upload-progreso-texto">
          <span>Subiendo archivo...</span>
          <span id="txt-pct">0%</span>
        </div>
      </div>
    `;
    btn.disabled = false;
  }

  btn.addEventListener('click', async () => {
    if (!archivo || enviando) return;
    enviando = true;
    btn.disabled = true;
    btn.textContent = 'Subiendo...';
    
    // Mostrar barra de progreso
    const boxProg = document.getElementById('box-progreso');
    const barra   = document.getElementById('barra-fill');
    const txtPct  = document.getElementById('txt-pct');
    if (boxProg) boxProg.style.display = 'block';

    try {
      // Construcción de FormData para envío multipart rápido y crudo (ahorras 33% de peso y CPU)
      const formData = new FormData();
      // El token es la credencial. El id_participante es público y no autentica:
      // enviarlo permitía que cualquiera reemplazara el comprobante de otra persona.
      formData.append('token', tokenPortal);
      formData.append('comprobante', archivo);
      formData.append('comprobantePdfNombre', archivo.name);
      
      const res = await subirConProgreso(
        `${apiBase}/api/participante/comprobante`,
        formData,
        (pct) => {
          if (barra) barra.style.width = `${pct}%`;
          if (txtPct) txtPct.textContent = `${pct}%`;
          if (boxProg) boxProg.setAttribute('aria-valuenow', String(pct));
        }
      );

      if (res && res.success) {
        if (barra) barra.style.width = '100%';
        if (txtPct) txtPct.textContent = '100%';
        toast('Comprobante enviado. Tu registro está en revisión.', 'success', 6000);
        
        // Transición fluida del DOM sin recarga de ventana (sin location.reload)
        setTimeout(() => {
          const main = document.getElementById('portal-main');
          if (main) main.style.transition = 'opacity 0.3s ease';
          if (main) main.style.opacity = '0';
          setTimeout(async () => {
            await renderPortal({ ...p, tiene_comprobante: true }, apiBase, baseUrl, tokenPortal);
            if (main) main.style.opacity = '1';
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          }, 300);
        }, 900);

      } else {
        toast((res && res.message) || 'Error al subir el comprobante.', 'error');
        enviando = false;
        btn.disabled = false;
        btn.textContent = 'Subir comprobante';
      }
    } catch {
      toast('Error de conexión. Intenta de nuevo.', 'error');
      enviando = false;
      btn.disabled = false;
      btn.textContent = 'Subir comprobante';
    }
  });
}
