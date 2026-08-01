import QRCode from 'qrcode';

// ── Interfaces de Datos ─────────────────────────────────────────
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

// ── Seguridad y Sanitización ────────────────────────────────────
// Elimina o convierte caracteres HTML peligrosos para prevenir ataques XSS
export function escapeHTML(str: string | number | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(/[&<>'"]/g, (match) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[match] || match);
}

// ── Generación Local de Códigos QR ──────────────────────────────
// Genera de forma asíncrona un código QR en formato Data URL sin depender de APIs externas
export async function getQrUrl(valor: string, size: number): Promise<string> {
  try {
    return await QRCode.toDataURL(valor, { 
      width: size, 
      margin: 1, 
      color: { dark: '#000000', light: '#ffffff' } 
    });
  } catch (err) {
    console.error('Error generando QR:', err);
    return '';
  }
}

// ── Notificaciones Visuales (Toast) ─────────────────────────────
// Crea y muestra pequeñas alertas flotantes temporales en la esquina del portal
export function toast(msg: string, type: 'info' | 'success' | 'error' = 'info', ms: number = 4500): void {
  const ct = document.getElementById('toast-container');
  if (!ct) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  ct.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ── Formateadores y Estilos de Perfil ───────────────────────────
// Formatea fechas ISO a español mexicano legible (ej. lunes, 25 de mayo de 2026)
export function formatFecha(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Asigna colores neón distintivos según el perfil del usuario para gafete y badges
export function perfilColor(perfil: string): string {
  const colores: Record<string, string> = { 
    Estudiante: '#0a84ff', 
    Profesor: '#30d158', 
    Profesional: '#ff9f0a', 
    Investigador: '#bf5af2' 
  };
  return colores[perfil] || '#6b7280';
}

// Envía datos del comprobante como FormData cruda (33% más ligero que Base64) reportando el porcentaje en vivo
export function subirConProgreso(
  url: string, 
  data: FormData | Record<string, unknown>, 
  onProgress: (porcentaje: number) => void
): Promise<{ success?: boolean; message?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    // Al usar FormData, no especificamos Content-Type para permitir que el navegador inyecte su límite (boundary)
    let body: FormData | string;
    if (!(data instanceof FormData)) {
      xhr.setRequestHeader('Content-Type', 'application/json');
      body = JSON.stringify(data);
    } else {
      body = data;
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const porcentaje = Math.round((e.loaded / e.total) * 100);
        onProgress(porcentaje);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ success: true });
        }
      } else {
        reject(new Error(`Error de HTTP: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Error de conexión a la red'));
    xhr.send(body);
  });
}

// ── Temporizador (Cuenta Regresiva) ─────────────────────────────
// Controla la cuenta regresiva en vivo para participantes pendientes de comprobante
let cdInterval: number | null = null;

export function iniciarCountdown(fechaSQL: string): void {
  const el = document.getElementById('cd-inner');
  if (!el) return;

  function tick() {
    const diff = new Date(fechaSQL.replace(' ', 'T') + 'Z').getTime() - Date.now();
    if (diff <= 0 && el) {
      if (cdInterval) clearInterval(cdInterval);
      el.innerHTML = `<p class="countdown-expired">El plazo ha vencido. Contáctanos a la brevedad para conservar tu lugar.</p>`;
      return;
    }
    const d = String(Math.floor(diff / 86400000)).padStart(2, '0');
    const h = String(Math.floor((diff / 3600000) % 24)).padStart(2, '0');
    const m = String(Math.floor((diff / 60000) % 60)).padStart(2, '0');
    const s = String(Math.floor((diff / 1000) % 60)).padStart(2, '0');
    if (el) {
      el.innerHTML = `
        <div class="countdown-digits">
          <div class="countdown-unit"><div class="countdown-num">${d}</div><div class="countdown-lbl">días</div></div>
          <div class="countdown-sep">:</div>
          <div class="countdown-unit"><div class="countdown-num">${h}</div><div class="countdown-lbl">horas</div></div>
          <div class="countdown-sep">:</div>
          <div class="countdown-unit"><div class="countdown-num">${m}</div><div class="countdown-lbl">min</div></div>
          <div class="countdown-sep">:</div>
          <div class="countdown-unit"><div class="countdown-num">${s}</div><div class="countdown-lbl">seg</div></div>
        </div>`;
    }
  }
  tick();
  cdInterval = window.setInterval(tick, 1000);
}
