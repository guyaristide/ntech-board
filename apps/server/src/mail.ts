import nodemailer from 'nodemailer';
import { env } from './env';

/**
 * Envoi des e-mails (lien de connexion, invitation) par SMTP, ici le relais Brevo.
 * Sans SMTP_HOST (développement), le message est affiché dans la console.
 */
const transport = env.mail.host
  ? nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      requireTLS: !env.mail.secure,
      auth: env.mail.user ? { user: env.mail.user, pass: env.mail.password } : undefined,
    })
  : null;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const layout = (
  title: string,
  body: string,
  cta: { label: string; url: string },
  origin: string,
) => `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f7f7f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#37352f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:8px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td><img src="${origin}/brand/neiba-technologies.png" alt="Neiba Technologies" width="120" style="display:block;margin-bottom:24px"></td></tr>
<tr><td><h1 style="margin:0 0 12px;font-size:20px">${esc(title)}</h1>${body}
<p style="margin:24px 0"><a href="${cta.url}" style="display:inline-block;padding:10px 18px;background:#2383e2;color:#fff;border-radius:4px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>
<p style="margin:0;color:#8a8984;font-size:12px">Si le bouton ne fonctionne pas, copiez ce lien : <br>${esc(cta.url)}</p></td></tr>
</table><p style="color:#8a8984;font-size:12px;margin-top:16px">NTECH Board · un outil NTECH SARL</p>
</td></tr></table></body></html>`;

/** Vérifie la connexion au relais SMTP au démarrage et l'écrit dans les logs (sans le mot de passe). */
export async function checkMail() {
  if (!transport) {
    console.log('[mail] SMTP_HOST vide : les e-mails ne partent pas, les liens sont écrits dans les logs.');
    return;
  }
  const where = `${env.mail.host}:${env.mail.port} (utilisateur ${env.mail.user || 'aucun'}, expéditeur ${env.mail.from})`;
  if (!env.mail.password)
    console.warn(`[mail] SMTP_PASSWORD vide : l'authentification sur ${where} va échouer.`);
  try {
    await transport.verify();
    console.log(`[mail] Connexion SMTP vérifiée : ${where}`);
  } catch (e) {
    console.error(`[mail] Connexion SMTP impossible : ${where} : ${(e as Error).message}`);
  }
}

export async function sendMail(to: string, subject: string, html: string, text: string) {
  if (!transport) {
    console.log(`\n[mail] À : ${to}\n[mail] Objet : ${subject}\n${text}\n`);
    return;
  }
  const info = await transport.sendMail({ from: env.mail.from, to, subject, html, text });
  console.log(`[mail] Accepté par le relais pour ${to} : ${info.response} (id ${info.messageId})`);
}

export function sendLoginLink(to: string, board: string, url: string, origin: string, minutes: number) {
  const body = `<p style="margin:0;line-height:1.5">Cliquez sur le bouton pour vous connecter à <strong>${esc(board)}</strong>. Ce lien est valable ${minutes} minutes et ne sert qu'une fois.</p>`;
  return sendMail(
    to,
    `Votre lien de connexion · ${board}`,
    layout('Connexion à NTECH Board', body, { label: 'Me connecter', url }, origin),
    `Connexion à ${board}\n\nOuvrez ce lien (valable ${minutes} minutes, une seule fois) :\n${url}`,
  );
}

export function sendInvitation(
  to: string,
  board: string,
  by: string,
  role: string,
  url: string,
  origin: string,
) {
  const body = `<p style="margin:0;line-height:1.5">${esc(by)} vous invite sur <strong>${esc(board)}</strong> en tant que ${esc(role.toLowerCase())}. Vous y retrouverez le backlog des user stories et le programme des ateliers.</p>`;
  return sendMail(
    to,
    `Invitation · ${board}`,
    layout('Vous êtes invité sur NTECH Board', body, { label: 'Accéder au tableau', url }, origin),
    `${by} vous invite sur ${board} (${role}).\n\nPour vous connecter, ouvrez ${url} et saisissez votre adresse e-mail.`,
  );
}
