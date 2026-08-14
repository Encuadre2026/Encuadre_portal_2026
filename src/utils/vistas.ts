import {
  ErrorApi,
  MAX_PDF_BYTES,
  MAX_PDF_MB,
  subirComprobante,
  type Participante,
} from './api';
import { escapeHTML, getQrUrl, toast, iniciarCountdown } from './portal';
import {
  archivoElegido,
  estadoDe,
  paginaError,
  vistaAprobado,
  vistaPendiente,
} from './plantillas';

// Este módulo compone las plantillas y conecta los eventos. El HTML vive en
// `plantillas.ts`, que son funciones puras y por tanto comprobables sin
// navegador.

// ── Renderizado de la Pantalla de Error ─────────────────────────
// Muestra mensajes ilustrados cuando un ID falta o no existe
export function renderError(titulo: string, desc: string, onRetry?: () => void): void {
  const main = document.getElementById('portal-main');
  if (!main) return;
  main.innerHTML = paginaError(titulo, desc, Boolean(onRetry));
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
  const estado = estadoDe(aprobado, tieneComp);

  if (aprobado) {
    // Los tres tamaños solo hacen falta cuando hay acceso que enseñar: el
    // grande para la tarjeta, el pequeño para el gafete y el de descarga.
    const qr = {
      grande: await getQrUrl(p.id_participante, 280),
      pequeno: await getQrUrl(p.id_participante, 150),
      descarga: await getQrUrl(p.id_participante, 500),
    };
    main.innerHTML = vistaAprobado(p, estado, qr, baseUrl);
  } else {
    main.innerHTML = vistaPendiente(p, estado, tieneComp);
    if (!tieneComp && p.fecha_expiracion) iniciarCountdown(p.fecha_expiracion);
    if (!tieneComp) setupUpload(p, apiBase, baseUrl, tokenPortal);
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
  const area = document.getElementById('upload-area');
  const infoOpcional = document.getElementById('file-info');
  const btnOpcional = document.getElementById('btn-subir') as HTMLButtonElement | null;
  if (!input || !area || !infoOpcional || !btnOpcional) return;

  // Se rebautizan tras la guarda porque dentro de las funciones anidadas
  // TypeScript no conserva el estrechamiento y volvía a verlos como nulos.
  const info = infoOpcional;
  const btn = btnOpcional;

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
    // El límite es el mismo que aplica el Worker. Antes eran 3 MB aquí y 5 allá,
    // así que un comprobante de 4 MB se rechazaba sin llegar a salir del navegador.
    if (f.size > MAX_PDF_BYTES) { toast(`El archivo supera los ${MAX_PDF_MB} MB.`, 'error'); return; }
    archivo = f;
    info.classList.remove('oculto');
    info.innerHTML = archivoElegido(escapeHTML(f.name), (f.size / 1048576).toFixed(2));
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
    if (boxProg) boxProg.classList.remove('oculto');

    /** Deja el formulario listo para otro intento. */
    const permitirOtroIntento = () => {
      enviando = false;
      btn.disabled = false;
      btn.textContent = 'Subir comprobante';
      if (boxProg) boxProg.classList.add('oculto');
      if (barra) barra.style.width = '0%';
      if (txtPct) txtPct.textContent = '0%';
    };

    /** Repinta el portal con el estado nuevo, sin recargar la ventana. */
    const repintar = (cambios: Partial<Participante>) => {
      setTimeout(() => {
        const main = document.getElementById('portal-main');
        if (main) {
          main.style.transition = 'opacity 0.3s ease';
          main.style.opacity = '0';
        }
        setTimeout(async () => {
          await renderPortal({ ...p, ...cambios }, apiBase, baseUrl, tokenPortal);
          if (main) main.style.opacity = '1';
          const prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollTo({ top: 0, behavior: prefiereMenosMovimiento ? 'auto' : 'smooth' });
        }, 300);
      }, 900);
    };

    try {
      const mensaje = await subirComprobante(apiBase, tokenPortal, archivo, (pct) => {
        if (barra) barra.style.width = `${pct}%`;
        if (txtPct) txtPct.textContent = `${pct}%`;
        if (boxProg) boxProg.setAttribute('aria-valuenow', String(pct));
      });

      if (barra) barra.style.width = '100%';
      if (txtPct) txtPct.textContent = '100%';
      toast(mensaje, 'success', 6000);
      repintar({ tiene_comprobante: true });
    } catch (err) {
      // El servidor explica con precisión qué pasó —no es un PDF, pesa
      // demasiado, el enlace no vale— y antes los cuatro casos se enseñaban
      // como «Error de conexión», así que la persona reintentaba sin saber qué
      // corregir. Ahora se muestra su motivo.
      const fallo =
        err instanceof ErrorApi
          ? err
          : new ErrorApi('No pudimos subir el comprobante. Intenta de nuevo.');

      // Si el pago ya estaba aprobado no hay nada que reintentar: lo que
      // procede es enseñarle su acceso, no un error.
      if (fallo.codigo === 'PAGO_YA_APROBADO') {
        toast(fallo.message, 'info', 6000);
        repintar({ pago_aprobado: true });
        return;
      }

      toast(fallo.message, 'error', 6000);
      permitirOtroIntento();
    }
  });
}
