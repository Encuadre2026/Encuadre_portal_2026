import { ErrorApi, MAX_PDF_BYTES, MAX_PDF_MB, subirComprobante, type Participante } from './api';
import { escapeHTML, getQrUrl, toast, iniciarCountdown, detenerCountdown } from './portal';
import { archivoElegido, estadoDe, paginaError, vistaAprobado, vistaPendiente } from './plantillas';

// Este módulo compone las plantillas y conecta los eventos. El HTML vive en
// `plantillas.ts`, que son funciones puras y por tanto comprobables sin
// navegador.

// ── Frontera de Seguridad ───────────────────────────────────────
//
// Las plantillas construyen HTML con cadenas y lo insertan con `innerHTML`, así
// que lo único que impide una inyección es que TODO campo de texto que venga
// del Worker pase por aquí antes de llegar a ellas.
//
// Estaba escrito en medio de `renderPortal`, que necesita un DOM y por tanto no
// se podía probar: era una disciplina que dependía de que nadie se despistara
// al añadir un campo. Sacarlo a una función pura permite que
// `vistas.test.ts` lo compruebe campo por campo.
//
// Si añades un campo de texto a `Participante`, añádelo también aquí. El tipo
// `CampoDeTexto` de la prueba lo detecta y deja de compilar hasta que lo hagas.
export function sanearParticipante(pRaw: Participante): Participante {
  return {
    ...pRaw,
    nombre: escapeHTML(pRaw.nombre || 'Participante sin nombre'),
    id_participante: escapeHTML(pRaw.id_participante || 'SIN-ID'),
    perfil: escapeHTML(pRaw.perfil || 'General'),
    taller: escapeHTML(pRaw.taller || 'Por asignar'),
    institucion: escapeHTML(pRaw.institucion || 'No especificada'),
    // `fecha_registro` y `fecha_expiracion` no se escapan porque no se pintan
    // en crudo: la primera pasa siempre por `formatFecha`, que devuelve lo que
    // produce `toLocaleDateString` —texto de fecha o «Invalid Date», nunca la
    // entrada—, y la segunda solo alimenta la cuenta atrás. Es seguro, pero por
    // cómo funciona el formateador, no por diseño: si algún día `formatFecha`
    // devolviera su argumento como respaldo, sería una inyección. La prueba
    // cubre las dos.
  };
}

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
  tokenPortal: string = '',
): Promise<void> {
  const main = document.getElementById('portal-main');
  if (!main) return;

  // Cada repintado sustituye el contenido de `main`, así que cualquier
  // temporizador que apuntara al DOM anterior se queda huérfano. Pararlo aquí
  // —y no en la rama que lo arranca— cubre también el camino que ya no tiene
  // cuenta atrás, que era justo el que la dejaba corriendo para siempre.
  detenerCountdown();

  const p = sanearParticipante(pRaw);

  const aprobado = p.pago_aprobado == 1 || p.pago_aprobado === true;
  const tieneComp = p.tiene_comprobante == 1 || p.tiene_comprobante === true;
  const estado = estadoDe(aprobado, tieneComp);

  if (aprobado) {
    // Un solo código, al tamaño mayor de los que hacen falta. Las tres
    // apariciones —tarjeta, gafete y descarga— son el mismo dibujo, y antes se
    // generaban por separado y en serie.
    const qr = await getQrUrl(p.id_participante, 500);
    main.innerHTML = vistaAprobado(p, estado, qr, baseUrl);
    cablearImprimir();
  } else {
    main.innerHTML = vistaPendiente(p, estado, tieneComp);
    if (!tieneComp && p.fecha_expiracion) iniciarCountdown(p.fecha_expiracion);
    if (!tieneComp) setupUpload(p, apiBase, baseUrl, tokenPortal);
  }
}

/**
 * Conecta el botón de impresión del gafete.
 *
 * Era un `onclick="window.print()"` dentro de la plantilla: el único manejador
 * inline que quedaba en el proyecto. Cablearlo aquí, como todo lo demás, es lo
 * que permite servir el portal con una CSP sin `unsafe-inline` (ver
 * `Layout.astro`), que es la defensa que más se agradece en una página que
 * construye su HTML con `innerHTML`.
 */
function cablearImprimir(): void {
  document.getElementById('btn-imprimir')?.addEventListener('click', () => window.print());
}

// ── Controlador de Eventos para Carga de PDF ────────────────────
// Gestiona el arrastrar, soltar, teclado (a11y), progreso visual y transición sin recarga
export function setupUpload(p: Participante, apiBase: string, baseUrl: string, tokenPortal: string): void {
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
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('drag-over');
  });
  area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    if (e.dataTransfer && e.dataTransfer.files[0]) procesar(e.dataTransfer.files[0]);
  });
  area.addEventListener('click', () => {
    input.click();
  });

  // Soporte de Accesibilidad (a11y): Activar selección con teclado (Enter o Espacio)
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) procesar(input.files[0]);
  });

  function procesar(f: File) {
    if (f.type !== 'application/pdf') {
      toast('Solo se aceptan archivos PDF.', 'error');
      return;
    }
    // El límite es el mismo que aplica el Worker. Antes eran 3 MB aquí y 5 allá,
    // así que un comprobante de 4 MB se rechazaba sin llegar a salir del navegador.
    if (f.size > MAX_PDF_BYTES) {
      toast(`El archivo supera los ${MAX_PDF_MB} MB.`, 'error');
      return;
    }
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
    const barra = document.getElementById('barra-fill');
    const txtPct = document.getElementById('txt-pct');
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

    /**
     * Repinta el portal con el estado nuevo, sin recargar la ventana.
     *
     * El fundido dura lo que dura y nada más. Antes había un `setTimeout(900)`
     * envolviendo a otro de 300: con la barra ya al 100 %, eran 1,2 s mirando
     * una pantalla que no cambiaba, y se leían como que algo se había colgado.
     */
    const repintar = (cambios: Partial<Participante>) => {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const main = document.getElementById('portal-main');
      const fundido = suave ? 200 : 0;

      if (main && suave) {
        main.style.transition = `opacity ${fundido}ms ease`;
        main.style.opacity = '0';
      }

      setTimeout(async () => {
        await renderPortal({ ...p, ...cambios }, apiBase, baseUrl, tokenPortal);
        if (main) {
          main.style.opacity = '1';
          // La transición era un estilo inline que se quedaba pegado al
          // elemento para siempre; se retira en cuanto ha servido.
          setTimeout(() => main.style.removeProperty('transition'), fundido);
        }
        window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
      }, fundido);
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
      const fallo = err instanceof ErrorApi ? err : new ErrorApi('No pudimos subir el comprobante. Intenta de nuevo.');

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
