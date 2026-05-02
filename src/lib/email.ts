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

export async function sendEmail(payload: EmailPayload): Promise<void> {
  // Saltar emails para invitados con email auto-generado
  if (payload.to.endsWith("@guest.local")) return;

  if (!resend) {
    console.log("📧 [email-stub] →", payload.to, "·", payload.subject);
    console.log(payload.text ?? payload.html.replace(/<[^>]+>/g, " ").slice(0, 200));
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: payload.to,
      subject: payload.subject,
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
