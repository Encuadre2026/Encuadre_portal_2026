/**
 * Cliente de la API del Worker.
 *
 * Hasta ahora el portal tiraba a la basura lo que respondía el servidor: la
 * subida rechazaba cualquier respuesta que no fuese 2xx y quien la llamaba
 * enseñaba «Error de conexión. Intenta de nuevo.» pasara lo que pasara. El
 * Worker explica con precisión qué ocurrió —el archivo no es un PDF, pesa
 * demasiado, el enlace no vale, el pago ya estaba aprobado— y el participante
 * veía en los cuatro casos un fallo de red, así que reintentaba; en el del pago
 * ya aprobado, reintentaba algo que no iba a funcionar nunca.
 *
 * La API trae un contrato uniforme: toda respuesta lleva `ok`, y los errores
 * además `codigo` y `mensaje`. `mensaje` es el texto que se le enseña a la
 * persona; `codigo` es para que el portal decida cómo reaccionar sin comparar
 * cadenas en español.
 */

export interface Participante {
  id_participante: string;
  nombre: string;
  perfil: string;
  taller: string;
  institucion: string;
  fecha_registro: string;
  fecha_expiracion?: string;
  pago_aprobado: number | boolean;
  tiene_comprobante: number | boolean;
}

/**
 * Tamaño máximo del comprobante.
 *
 * Tiene que ser el mismo número que `MAX_PDF_BYTES` en el Worker. No lo era: el
 * portal cortaba en 3 MB lo que el servidor aceptaba hasta 5, así que un
 * comprobante de 4 MB se rechazaba sin llegar a salir del navegador.
 */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export const MAX_PDF_MB = MAX_PDF_BYTES / 1024 / 1024;

/** Un error de la API, con el código que permite distinguirlo. */
export class ErrorApi extends Error {
  codigo?: string;
  status: number;

  constructor(mensaje: string, codigo?: string, status = 0) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.status = status;
  }

  /** No se pudo hablar con el servidor: reintentar tiene sentido. */
  get esDeRed(): boolean {
    return this.status === 0;
  }
}

interface CuerpoApi {
  ok?: boolean;
  codigo?: string;
  mensaje?: string;
  /**
   * TODO(contrato-v1): retirar cuando el Worker deje de emitir el alias inglés.
   * Es compatibilidad transitoria con el contrato viejo, no parte del actual.
   * Condición para borrarlo: que `mensaje` venga en todas las respuestas de
   * error del Worker en producción. Sin una condición escrita, este tipo de
   * puente se queda diez años.
   */
  message?: string;
  participante?: Participante;
  [clave: string]: unknown;
}

/**
 * Saca el motivo de una respuesta fallida.
 *
 * Se leen `mensaje` y `message` porque durante la transición del contrato
 * conviven las dos claves; cuando el Worker retire los alias, la segunda
 * simplemente deja de aparecer.
 */
function motivoDelError(cuerpo: CuerpoApi | null, status: number): ErrorApi {
  const mensaje = cuerpo?.mensaje || cuerpo?.message || 'No pudimos completar la operación. Intenta de nuevo.';
  return new ErrorApi(mensaje, cuerpo?.codigo, status);
}

/** Consulta el registro asociado a un token de portal. */
export async function obtenerParticipante(apiBase: string, token: string, signal?: AbortSignal): Promise<Participante> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/participante?id=${encodeURIComponent(token)}`, { signal });
  } catch {
    throw new ErrorApi('No pudimos conectarnos al servidor. Intenta de nuevo en unos momentos.');
  }

  let cuerpo: CuerpoApi | null = null;
  try {
    cuerpo = (await res.json()) as CuerpoApi;
  } catch {
    // Un cuerpo ilegible no debe tapar el estado que sí conocemos.
  }

  if (!res.ok || cuerpo?.ok === false) throw motivoDelError(cuerpo, res.status);

  // Lo que decide es que venga el participante, no la bandera `encontrado` del
  // contrato viejo: el Worker puede seguir emitiéndola, pero el portal no la lee.
  if (!cuerpo?.participante) {
    throw new ErrorApi('No encontramos ningún registro para este enlace.', 'NO_ENCONTRADO', res.status);
  }

  return cuerpo.participante;
}

/**
 * Cuánto se tolera **sin avanzar** antes de dar la subida por muerta.
 *
 * Ojo con la diferencia: `xhr.timeout` mide el tiempo *total* de la petición, y
 * estaba en 30 s. Un comprobante de 5 MB —el máximo que se acepta— tarda unos
 * 40 s por una subida de 1 Mbps, que es lo normal en el wifi de un campus o en
 * datos móviles saturados. Es decir, abortaba subidas que iban perfectamente y
 * enseñaba «La subida tardó demasiado», justo en el escenario más probable el
 * día del evento.
 *
 * Lo que sí indica un problema real es que deje de haber progreso. Este
 * temporizador se reinicia con cada aviso de avance, así que una subida lenta
 * puede tardar lo que necesite mientras siga moviéndose.
 */
const INACTIVIDAD_MS = 60_000;

/**
 * Transporte de la subida.
 *
 * Se separa a propósito de la decisión sobre el resultado: su único trabajo es
 * entregar el archivo informando del avance y devolver lo que respondió el
 * servidor, sea lo que sea. Juzgar si eso es un éxito o un fallo —y con qué
 * mensaje— es asunto de quien llama, que es exactamente la confusión que hacía
 * que ningún error del Worker llegase al participante.
 */
function enviarConProgreso(
  url: string,
  cuerpo: FormData,
  onProgress: (porcentaje: number) => void,
): Promise<{ status: number; cuerpo: CuerpoApi | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    // Con FormData no se fija Content-Type: lo pone el navegador con su
    // separador (boundary).

    let vigilante: ReturnType<typeof setTimeout> | undefined;
    let terminado = false;

    const detenerVigilante = () => {
      if (vigilante !== undefined) clearTimeout(vigilante);
      vigilante = undefined;
    };

    /** Cierra la promesa una sola vez y deja de vigilar. */
    const finalizar = (accion: () => void) => {
      if (terminado) return;
      terminado = true;
      detenerVigilante();
      accion();
    };

    const reiniciarVigilante = () => {
      detenerVigilante();
      vigilante = setTimeout(() => {
        finalizar(() => {
          xhr.abort();
          reject(new ErrorApi('La subida se quedó sin avanzar. Revisa tu conexión e intenta de nuevo.'));
        });
      }, INACTIVIDAD_MS);
    };

    xhr.upload.onprogress = (e) => {
      reiniciarVigilante();
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    // El archivo ya salió entero, pero el Worker todavía tiene que guardarlo en
    // R2 y responder. Ese tramo también cuenta como actividad.
    xhr.upload.onload = reiniciarVigilante;
    xhr.onprogress = reiniciarVigilante;

    xhr.onload = () =>
      finalizar(() => {
        let parseado: CuerpoApi | null = null;
        try {
          parseado = JSON.parse(xhr.responseText) as CuerpoApi;
        } catch {
          // Respuesta sin JSON legible; el estado sigue siendo informativo.
        }
        resolve({ status: xhr.status, cuerpo: parseado });
      });

    // Solo se rechaza cuando de verdad no hubo respuesta.
    xhr.onerror = () =>
      finalizar(() => reject(new ErrorApi('No pudimos conectarnos al servidor. Revisa tu conexión.')));

    reiniciarVigilante();
    xhr.send(cuerpo);
  });
}

/**
 * Sube el comprobante de pago.
 *
 * Devuelve el mensaje de confirmación del servidor y lanza `ErrorApi` con el
 * suyo cuando algo falla, para que el portal pueda enseñar el motivo real.
 */
export async function subirComprobante(
  apiBase: string,
  token: string,
  archivo: File,
  onProgress: (porcentaje: number) => void,
): Promise<string> {
  const formData = new FormData();
  // El token es la credencial. El id_participante es público y no autentica:
  // enviarlo permitía que cualquiera reemplazara el comprobante de otra persona.
  formData.append('token', token);
  formData.append('comprobante', archivo);
  formData.append('comprobantePdfNombre', archivo.name);

  const { status, cuerpo } = await enviarConProgreso(`${apiBase}/api/participante/comprobante`, formData, onProgress);

  const correcto = status >= 200 && status < 300 && cuerpo?.ok !== false;
  if (!correcto) throw motivoDelError(cuerpo, status);

  return cuerpo?.mensaje || cuerpo?.message || 'Comprobante recibido. Tu registro está en revisión.';
}
