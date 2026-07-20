import { getDatabase } from '../database/connection.js';
import { logger } from '../config/logger.js';
import { whatsappService } from './whatsapp.service.js';
import type { Appointment, AppointmentStatus } from '../types/index.js';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export class AppointmentService {
  private get db() { return getDatabase(); }

  async create(data: Omit<Appointment, 'id' | 'created_at' | 'updated_at' | 'reminder_sent'>): Promise<Appointment> {
    const [appt] = await this.db('appointments').insert({
      ...data,
      reminder_sent: false,
    }).returning('*') as Appointment[];

    if (!appt) throw new Error('Failed to create appointment');

    // Notify client via WhatsApp
    const client = await this.db('clients').where('id', data.client_id).first();
    if (client) {
      const dateStr = format(new Date(data.scheduled_at), "EEEE d MMMM yyyy 'الساعة' HH:mm", { locale: ar });
      const msg = `*تأكيد موعدك*\n\nأهلاً ${client.full_name}،\nتم تحديد موعدك:\n${data.title}\n${dateStr}\n${data.location ? data.location + '\n' : ''}نتطلع للقائك.\n\nشركة النقيدان للاستثمارات العقارية`;
      await whatsappService.sendText(client.phone, msg).catch((err) =>
        logger.warn('Failed to notify client of appointment', { err })
      );
    }

    logger.info('Appointment created', { appointmentId: appt.id, clientId: data.client_id });
    return appt;
  }

  async updateStatus(id: string, status: AppointmentStatus, result?: string): Promise<void> {
    await this.db('appointments').where('id', id).update({ status, result, updated_at: new Date() });
  }

  async listForClient(clientId: string): Promise<Appointment[]> {
    return this.db('appointments').where('client_id', clientId).orderBy('scheduled_at', 'desc');
  }

  async getUpcoming(agentId?: string): Promise<Appointment[]> {
    const query = this.db('appointments as a')
      .join('clients as cl', 'a.client_id', 'cl.id')
      .leftJoin('properties as p', 'a.property_id', 'p.id')
      .select('a.*', 'cl.full_name as client_name', 'cl.phone as client_phone', 'p.title_ar as property_title')
      .where('a.scheduled_at', '>', new Date())
      .where('a.status', 'scheduled')
      .orderBy('a.scheduled_at');

    if (agentId) query.where('a.assigned_agent_id', agentId);
    return query;
  }

  async sendReminders(): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    const now = new Date();

    const appointments = await this.db('appointments as a')
      .join('clients as cl', 'a.client_id', 'cl.id')
      .select('a.*', 'cl.full_name as client_name', 'cl.phone as client_phone')
      .where('a.scheduled_at', '>', now)
      .where('a.scheduled_at', '<', tomorrow)
      .where('a.reminder_sent', false)
      .where('a.status', 'scheduled');

    for (const appt of appointments) {
      try {
        const dateStr = format(new Date(appt.scheduled_at), "EEEE d MMMM 'الساعة' HH:mm", { locale: ar });
        const msg = `*تذكير بموعد غداً*\n\nأهلاً ${appt.client_name}،\nتذكير بموعدكم:\n${appt.title}\n${dateStr}\n${appt.location ? appt.location : ''}\n\nنتطلع للقائك.`;
        await whatsappService.sendText(appt.client_phone, msg);
        await this.db('appointments').where('id', appt.id).update({ reminder_sent: true });
      } catch (err) {
        logger.warn('Failed to send appointment reminder', { appointmentId: appt.id, err });
      }
    }

    logger.info(`Sent ${appointments.length} appointment reminders`);
  }
}

export const appointmentService = new AppointmentService();
