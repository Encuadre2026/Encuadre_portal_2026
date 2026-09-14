import { ErrorApi, MAX_PDF_BYTES, MAX_PDF_MB, subirComprobante, type Participante } from './api';
import { escapeHTML, esFechaValida, getQrUrl, toast, iniciarCountdown, detenerCountdown } from './portal';
import {
  archivoElegido,
  asisteAlEncuentro,
  esSinCuota,
  estadoDe,
  paginaError,
  vistaAprobado,
  vistaPendiente,
  vistaSoloDatos,
} from './plantillas';

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
//
// **No es idempotente.** Aplicarla dos veces escapa dos veces, y «Martínez & Co»
// acaba leyéndose «Martínez &amp; Co» en pantalla. Lo que circula por el portal
// después de esta frontera es texto ya escapado: si algo tiene que volver a
// entrar por `renderPortal` —el repintado tras subir el comprobante—, lo que se
// guarda para ello es el participante original, no el saneado.
export function sanearParticipante(pRaw: Participante): Participante {
  return {
    ...pRaw,
    nombre: escapeHTML(pRaw.nombre || 'Participante sin nombre'),
    id_participante: escapeHTML(pRaw.id_participante || 'SIN-ID'),
    perfil: escapeHTML(pRaw.perfil || 'General'),
    taller: escapeHTML(pRaw.taller || 'Por asignar'),
    institucion: escapeHTML(pRaw.institucion || 'No especificada'),
    // Se conserva el «no hay respuesta» tal cual —`null` o ausente— en lugar de
    // convertirlo en cadena vacía: `tallerDe` distingue entre «prefiere este
    // taller» y «no se le preguntó», y esa diferencia decide el rótulo.
    taller_preferencia: pRaw.taller_preferencia ? escapeHTML(pRaw.taller_preferencia) : pRaw.taller_preferencia,
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
  const requierePago = !esSinCuota(p);
  const asiste = asisteAlEncuentro(p);
  const estado = estadoDe(aprobado, tieneComp, { requierePago, asiste });

  // Dos registros no tienen ninguna llave que entregar: el de quien dijo que no
  // asiste —el QR es la puerta del Encuentro, y dárselo le haría creer que se
  // le espera— y el de la asamblea mientras nadie ha revisado su acreditación.
  // Van antes que la rama del pago porque ninguno de los dos debe dinero, así
  // que el estado del pago no dice nada útil sobre ellos.
  const esperaAprobacion = !requierePago && !aprobado;
  if (!asiste || esperaAprobacion) {
    main.innerHTML = vistaSoloDatos(p, estado);
    return;
  }

  if (aprobado) {
    // Un solo código, al tamaño mayor de los que hacen falta. Las tres
    // apariciones —tarjeta, gafete y descarga— son el mismo dibujo, y antes se
    // generaban por separado y en serie.
    const qr = await getQrUrl(p.id_participante, 500);
    main.innerHTML = vistaAprobado(p, estado, qr, baseUrl);
    cablearImprimir();
  } else {
    main.innerHTML = vistaPendiente(p, estado, tieneComp);
    // La fecha no basta con que esté: si no se puede parsear, la cuenta atrás
    // se llenaba de `NaN` y seguía haciéndolo un tick por segundo.
    if (!tieneComp && esFechaValida(p.fecha_expiracion)) iniciarCountdown(p.fecha_expiracion);
    // Se cablea en los dos casos. Quien ya envió su comprobante tiene los
    // mismos campos, plegados tras el botón de reemplazo, y hasta que no se
    // cablearon aquí no había forma de sustituir un comprobante desde el
    // portal. Se le entrega el participante **sin sanear**: el formulario
    // repinta el portal al terminar la subida, y ese repintado vuelve a pasar
    // por la frontera de escapado de aquí arriba.
    setupUpload(pRaw, apiBase, baseUrl, tokenPortal);
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

/**
 * Abre y cierra los campos de subida de quien ya envió un comprobante.
 *
 * No hace nada en la pantalla de quien todavía no ha enviado ninguno: ahí el
 * botón no existe y el formulario ya está a la vista.
 *
 * El foco viaja con la vista en los dos sentidos. El control que se acaba de
 * pulsar se esconde cada vez —abrir oculta el aviso, cerrar oculta la zona—,
 * así que sin moverlo quien navega con teclado se queda en un elemento que ya
 * no está y el recorrido vuelve a empezar por el principio del documento.
 *
 * Cerrar descarta el archivo elegido, y por eso lo limpia `setupUpload`, que es
 * quien guarda esa variable: si no, al reabrir seguía en pantalla la ficha del
 * archivo anterior con el botón listo para enviarlo, que es justo lo que acaba
 * de decirse que no.
 */
function cablearReemplazo(limpiarSeleccion: () => void): void {
  const abrir = document.getElementById('btn-reemplazar');
  const cerrar = document.getElementById('btn-cancelar-reemplazo');
  const zona = document.getElementById('zona-reemplazo');
  const aviso = document.getElementById('aviso-reemplazo');
  if (!abrir || !zona || !aviso) return;

  abrir.addEventListener('click', () => {
    zona.classList.remove('oculto');
    aviso.classList.add('oculto');
    abrir.setAttribute('aria-expanded', 'true');
    document.getElementById('upload-area')?.focus();
  });

  cerrar?.addEventListener('click', () => {
    limpiarSeleccion();
    zona.classList.add('oculto');
    aviso.classList.remove('oculto');
    abrir.setAttribute('aria-expanded', 'false');
    abrir.focus();
  });
}

// ── Controlador de Eventos para Carga de PDF ────────────────────
// Gestiona el arrastrar, soltar, teclado (a11y), progreso visual y transición sin recarga
export function setupUpload(pRaw: Participante, apiBase: string, baseUrl: string, tokenPortal: string): void {
  const inputOpcional = document.getElementById('comp-input') as HTMLInputElement | null;
  const area = document.getElementById('upload-area');
  const infoOpcional = document.getElementById('file-info');
  const btnOpcional = document.getElementById('btn-subir') as HTMLButtonElement | null;
  if (!inputOpcional || !area || !infoOpcional || !btnOpcional) return;

  // Se rebautizan tras la guarda porque dentro de las funciones anidadas
  // TypeScript no conserva el estrechamiento y volvía a verlos como nulos.
  const input = inputOpcional;
  const info = infoOpcional;
  const btn = btnOpcional;
  // Solo existe en la pantalla del reemplazo.
  const btnCancelar = document.getElementById('btn-cancelar-reemplazo') as HTMLButtonElement | null;

  let archivo: File | null = null;
  let enviando = false;

  // Lo que diga el botón al llegar, que depende de la pantalla: «Subir
  // comprobante» la primera vez y «Reemplazar comprobante» después. Antes se
  // reponía con el primero escrito a mano, así que un fallo de red en un
  // reemplazo dejaba el botón rebautizado a mitad del flujo.
  const rotuloOriginal = btn.textContent ?? 'Subir comprobante';

  /** Devuelve el formulario a como estaba antes de elegir nada. */
  function olvidarArchivo(): void {
    archivo = null;
    // También el campo, no solo la variable: el navegador solo emite «change»
    // cuando el valor cambia, así que dejando el anterior puesto, volver a
    // elegir EL MISMO archivo no avisaba a nadie y el formulario se quedaba
    // mudo, con el botón apagado y sin más salida que recargar la página.
    input.value = '';
    info.classList.add('oculto');
    info.innerHTML = '';
    btn.disabled = true;
  }

  // Solo encuentra algo que cablear en la pantalla del reemplazo; en la otra,
  // el formulario ya está abierto y no hay nada que plegar.
  cablearReemplazo(olvidarArchivo);

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
    if (f.type !== 'application/pdf') return rechazar('Solo se aceptan archivos PDF.');
    // El límite es el mismo que aplica el Worker. Antes eran 3 MB aquí y 5 allá,
    // así que un comprobante de 4 MB se rechazaba sin llegar a salir del navegador.
    if (f.size > MAX_PDF_BYTES) return rechazar(`El archivo supera los ${MAX_PDF_MB} MB.`);
    archivo = f;
    info.classList.remove('oculto');
    info.innerHTML = archivoElegido(escapeHTML(f.name), (f.size / 1048576).toFixed(2));
    btn.disabled = false;
  }

  /**
   * Explica por qué no vale y deja el campo listo para volver a intentarlo.
   *
   * Lo segundo importa tanto como lo primero: sin vaciar el campo, quien
   * exportaba otra vez su comprobante con el mismo nombre —lo más natural tras
   * leer «supera los 5 MB»— y lo volvía a elegir no recibía respuesta alguna,
   * porque para el navegador el valor no había cambiado.
   */
  function rechazar(motivo: string): void {
    toast(motivo, 'error');
    input.value = '';
  }

  btn.addEventListener('click', async () => {
    if (!archivo || enviando) return;
    enviando = true;
    btn.disabled = true;
    btn.textContent = 'Subiendo...';
    // La petición ya no se puede retirar, así que el botón de cancelar dejaría
    // el formulario plegado mientras el archivo termina de subirse igualmente:
    // prometería «dejar el comprobante que ya envié» justo cuando eso ha dejado
    // de estar en su mano.
    if (btnCancelar) btnCancelar.disabled = true;

    // Mostrar barra de progreso
    const boxProg = document.getElementById('box-progreso');
    const barra = document.getElementById('barra-fill');
    const txtPct = document.getElementById('txt-pct');
    if (boxProg) boxProg.classList.remove('oculto');

    /** Deja el formulario listo para otro intento. */
    const permitirOtroIntento = () => {
      enviando = false;
      btn.disabled = false;
      btn.textContent = rotuloOriginal;
      if (btnCancelar) btnCancelar.disabled = false;
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
        // Se repinta desde el participante original. Con el saneado, cada
        // repintado volvía a escapar lo ya escapado.
        await renderPortal({ ...pRaw, ...cambios }, apiBase, baseUrl, tokenPortal);
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
