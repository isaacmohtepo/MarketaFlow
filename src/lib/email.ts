import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "MarketaFlow <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Sanitiza el subject para evitar CRLF injection. Aunque Resend SDK ya
 * escapa internamente, hacer defense-in-depth strip-eando \r/\n/Tab evita
 * sorpresas si en algún momento construimos headers manualmente o
 * cambiamos de provider.
 *
 * También trunca a 200 chars para que no exploten clientes de email
 * lentos/raros.
 */
function sanitizeSubject(subject: string): string {
  return subject.replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
}

/** Valida que el "to" sea un email simple — sin múltiples destinatarios
 *  separados por coma (que también podrían usarse para inyección si el
 *  caller los construye desde input de usuario). */
function isValidSingleEmail(addr: string): boolean {
  if (addr.includes(",") || addr.includes(";") || /[\r\n]/.test(addr)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  // Saltar emails para invitados con email auto-generado
  if (payload.to.endsWith("@guest.local")) return;

  if (!isValidSingleEmail(payload.to)) {
    console.error("Email rechazado por to inválido:", payload.to);
    return;
  }

  const subject = sanitizeSubject(payload.subject);

  if (!resend) {
    console.log("📧 [email-stub] →", payload.to, "·", subject);
    console.log(payload.text ?? payload.html.replace(/<[^>]+>/g, " ").slice(0, 200));
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: payload.to,
      subject,
      html: payload.html,
      text: payload.text,
    });
  } catch (err) {
    console.error("Email send failed:", err);
  }
}

export function appUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${APP_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
