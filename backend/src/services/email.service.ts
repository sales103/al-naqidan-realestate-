import nodemailer from 'nodemailer';
import { getDatabase } from '../database/connection.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  from_name?: string;
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  try {
    const db = getDatabase();
    const row = await db('system_settings').where('key', 'smtp').first();
    if (row?.value?.host && row?.value?.user && row?.value?.password) {
      return {
        host:      row.value.host     ?? 'smtp.gmail.com',
        port:      Number(row.value.port ?? 587),
        user:      row.value.user,
        password:  row.value.password,
        from:      row.value.from     ?? row.value.user,
        from_name: row.value.from_name ?? 'النقيدان للعقارات',
      };
    }
  } catch { /* fall through */ }

  // Fallback to environment variables
  return {
    host:      config.smtp.host,
    port:      config.smtp.port,
    user:      config.smtp.user,
    password:  config.smtp.password,
    from:      config.smtp.from,
    from_name: 'النقيدان للعقارات',
  };
}

export async function createMailer() {
  const s = await getSmtpSettings();
  return {
    transport: nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465,
      auth: { user: s.user, pass: s.password },
    }),
    from: `"${s.from_name ?? 'النظام'}" <${s.from}>`,
  };
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const { transport, from } = await createMailer();
  await transport.sendMail({ from, to, subject, html });
  logger.info('Email sent', { to, subject });
}