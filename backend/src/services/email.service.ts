import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

export interface EmailSettings {
  provider: 'resend' | 'smtp';
  // Resend
  resend_api_key?: string;
  resend_from?: string;
  // SMTP
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  // Shared
  from: string;
  from_name?: string;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  try {
    const db = getDatabase();
    const row = await db('system_settings').where('key', 'smtp').first();
    if (row?.value) {
      const v = row.value;

      if (v.provider === 'resend' && v.resend_api_key) {
        return {
          provider: 'resend',
          resend_api_key: v.resend_api_key,
          resend_from: v.resend_from,
          from: v.from ?? v.user ?? 'noreply@example.com',
          from_name: v.from_name ?? 'النقيدان للعقارات',
        };
      }

      if (v.host && v.user && v.password) {
        return {
          provider: 'smtp',
          host: v.host ?? 'smtp.gmail.com',
          port: Number(v.port ?? 587),
          user: v.user,
          password: v.password,
          from: v.from ?? v.user,
          from_name: v.from_name ?? 'النقيدان للعقارات',
        };
      }
    }
  } catch { /* fall through */ }

  return {
    provider: 'smtp',
    host: config.smtp.host,
    port: config.smtp.port,
    user: config.smtp.user,
    password: config.smtp.password,
    from: config.smtp.from,
    from_name: 'النقيدان للعقارات',
  };
}

async function sendViaResend(s: EmailSettings, to: string, subject: string, html: string): Promise<void> {
  const resend = new Resend(s.resend_api_key);
  const fromAddress = s.resend_from || 'onboarding@resend.dev';
  const fromLine = s.from_name ? `${s.from_name} <${fromAddress}>` : fromAddress;

  const { error } = await resend.emails.send({
    from: fromLine,
    to,
    subject,
    html,
    replyTo: s.from || undefined,
  });

  if (error) {
    throw new Error(error.message ?? 'Resend API error');
  }
}

async function sendViaSmtp(s: EmailSettings, to: string, subject: string, html: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.password },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });

  const from = `"${s.from_name ?? 'النظام'}" <${s.from}>`;
  await transport.sendMail({ from, to, subject, html });
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const s = await getEmailSettings();

  if (s.provider === 'resend') {
    await sendViaResend(s, to, subject, html);
  } else {
    await sendViaSmtp(s, to, subject, html);
  }

  logger.info('Email sent', { to, subject, provider: s.provider });
}

// Keep backward compatibility
export { getEmailSettings as getSmtpSettings };
