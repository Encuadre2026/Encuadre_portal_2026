import QRCode from 'qrcode';

// Este módulo es de presentación: escapar, formatear, pintar. Lo que habla con
// el Worker —incluida la forma `Participante`— vive en `api.ts`, para que la
// vista no tenga que saber nada del transporte.

// ── Seguridad y Sanitización ────────────────────────────────────
// Elimina o convierte caracteres HTML peligrosos para prevenir ataques XSS
export function escapeHTML(str: string | number | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(
    /[&<>'"]/g,
    (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[match] || match,
  );
}

// ── Generación Local de Códigos QR ──────────────────────────────
// Genera de forma asíncrona un código QR en formato Data URL sin depender de APIs externas
export async function getQrUrl(valor: string, size: number): Promise<string> {
  try {
    return await QRCode.toDataURL(valor, {
      width: size,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('Error generando QR:', err);
    return '';
  }
}

// ── Notificaciones Visuales (Toast) ─────────────────────────────
// Crea y muestra pequeñas alertas flotantes temporales en la esquina del portal.
// El contenedor lleva `aria-live` (ver `Layout.astro`): los toasts son el único
// canal por el que se comunican los errores de subida, así que tienen que
// anunciarse solos a un lector de pantalla.
export function toast(msg: string, type: 'info' | 'success' | 'error' = 'info', ms = 4500): void {
  const ct = document.getElementById('toast-container');
  if (!ct) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  ct.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ── Formateadores y Perfiles ────────────────────────────────────
// Parsea fechas de la API asumiendo UTC si no traen zona horaria explícita (estándar Cloudflare D1)
function parsearFechaAPI(iso: string): Date {
  const normalizada = iso.replace(' ', 'T');
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(normalizada)) return new Date(normalizada);
  return new Date(normalizada + 'Z');
}

// Formatea fechas ISO a español mexicano legible (ej. lunes, 25 de mayo de 2026)
export function formatFecha(iso?: string): string {
  if (!iso) return '—';
  const d = parsearFechaAPI(iso);
  return d.toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Perfiles que el portal sabe distinguir.
 *
 * Antes esto era `perfilColor()`, que devolvía un hexadecimal. Los mismos
 * cuatro colores estaban además en `portal.css` como variables y una tercera
 * vez como literales `rgba()`: tres copias que había que mantener a mano.
 *
 * Ahora el TypeScript solo decide *qué* perfil es y el CSS pone el color. Lo
 * que sale de aquí es una etiqueta de un conjunto cerrado, así que también deja
 * de ser posible que el texto del servidor acabe dentro de un atributo.
 */
const PERFILES = ['estudiante', 'profesor', 'profesional', 'investigador'] as const;

export type Perfil = (typeof PERFILES)[number] | 'generico';

/**
 * Reduce el perfil que manda el servidor a una de esas etiquetas.
 *
 * Se ignoran mayúsculas, espacios sobrantes y acentos porque el valor viene de
 * captura manual: con `class="perfil-badge ${p.perfil}"`, un «estudiante» en
 * minúsculas o un «Profesional » con espacio final perdían el color y nadie se
 * enteraba, porque no es un error, es una regla CSS que no casa.
 */
export function normalizarPerfil(perfil: string | null | undefined): Perfil {
  const limpio = String(perfil ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (PERFILES as readonly string[]).includes(limpio) ? (limpio as Perfil) : 'generico';
}

// ── Temporizador (Cuenta Regresiva) ─────────────────────────────
//
// El intervalo es global porque solo puede haber una cuenta atrás en pantalla.
// Eso obliga a poder pararlo desde fuera: al subir el comprobante el portal se
// repinta en la vista «En revisión», que ya no tiene cuenta atrás y por tanto
// no vuelve a llamar a `iniciarCountdown`. Sin `detenerCountdown`, el intervalo
// anterior seguía corriendo un tick por segundo contra un elemento que ya no
// estaba en el documento, indefinidamente.
let cdInterval: number | null = null;

/** Para la cuenta atrás si hay alguna corriendo. Es idempotente. */
export function detenerCountdown(): void {
  if (cdInterval !== null) {
    window.clearInterval(cdInterval);
    cdInterval = null;
  }
}

const ESTRUCTURA_CUENTA = `
        <div class="countdown-digits">
          <div class="countdown-unit"><div class="countdown-num" data-unidad="d">--</div><div class="countdown-lbl">días</div></div>
          <div class="countdown-sep">:</div>
          <div class="countdown-unit"><div class="countdown-num" data-unidad="h">--</div><div class="countdown-lbl">horas</div></div>
          <div class="countdown-sep">:</div>
          <div class="countdown-unit"><div class="countdown-num" data-unidad="m">--</div><div class="countdown-lbl">min</div></div>
          <div class="countdown-sep">:</div>
          <div class="countdown-unit"><div class="countdown-num" data-unidad="s">--</div><div class="countdown-lbl">seg</div></div>
        </div>`;

export function iniciarCountdown(fechaSQL: string): void {
  detenerCountdown();
  const el = document.getElementById('cd-inner');
  if (!el) return;

  const destino = el;
  const vence = parsearFechaAPI(fechaSQL).getTime();

  // La estructura se construye una sola vez y después solo cambian los cuatro
  // números. Antes se rehacían doce elementos por segundo con `innerHTML`.
  el.innerHTML = ESTRUCTURA_CUENTA;
  const casillas = new Map<string, HTMLElement>(
    [...el.querySelectorAll<HTMLElement>('[data-unidad]')].map((n) => [n.dataset.unidad ?? '', n]),
  );

  const dosDigitos = (n: number) => String(Math.floor(n)).padStart(2, '0');
  const poner = (unidad: string, valor: number) => {
    const casilla = casillas.get(unidad);
    const texto = dosDigitos(valor);
    // Escribir solo cuando cambia evita que el lector de pantalla y el
    // repintado del navegador trabajen por nada tres de cada cuatro ticks.
    if (casilla && casilla.textContent !== texto) casilla.textContent = texto;
  };

  /** Pinta el estado actual. Devuelve `false` cuando ya no queda tiempo. */
  function tick(): boolean {
    const diff = vence - Date.now();
    if (diff <= 0) {
      destino.innerHTML =
        '<p class="countdown-expired">El plazo ha vencido. Contáctanos a la brevedad para conservar tu lugar.</p>';
      return false;
    }
    poner('d', diff / 86400000);
    poner('h', (diff / 3600000) % 24);
    poner('m', (diff / 60000) % 60);
    poner('s', (diff / 1000) % 60);
    return true;
  }

  // Si el plazo ya venció no se programa nada. Antes el `tick()` inicial corría
  // *antes* de que se asignara `cdInterval`, así que su `clearInterval` no
  // limpiaba nada y el intervalo arrancaba igual, reescribiendo el aviso de
  // vencimiento una vez por segundo para siempre.
  if (!tick()) return;

  cdInterval = window.setInterval(() => {
    if (!tick()) detenerCountdown();
  }, 1000);
}
