import { getDatabase } from '../database/connection.js';
import { cacheGet, cacheSet, cacheDel, cacheKeys } from '../database/redis.js';
import { logger } from '../config/logger.js';
import type { Client, ClientStatus, IntentRecord } from '../types/index.js';
import type { Knex } from 'knex';

export class ClientService {
  private get db() { return getDatabase(); }

  async findByWhatsappId(whatsappId: string): Promise<Client | null> {
    const cached = await cacheGet<Client>(`client:wa:${whatsappId}`);
    if (cached) return cached;

    let client: Client | undefined;
    try {
      client = await this.db('clients as cl')
        .leftJoin('cities as c', 'cl.city_id', 'c.id')
        .leftJoin('users as u', 'cl.assigned_agent_id', 'u.id')
        .select('cl.*', 'c.name_ar as city_name', 'u.full_name_ar as agent_name')
        .where('cl.whatsapp_id', whatsappId)
        .first() as Client | undefined;
    } catch {
      // Enrichment columns (city_name/agent_name) may be absent — fall back to the
      // plain client row so a missing display column never breaks message handling.
      client = await this.db('clients')
        .where('whatsapp_id', whatsappId)
        .first() as Client | undefined;
    }

    if (client) {
      await cacheSet(`client:wa:${whatsappId}`, client, 1800);
    }

    return client ?? null;
  }

  async findOrCreateByWhatsapp(
    whatsappId: string,
    phone: string,
    name?: string
  ): Promise<{ client: Client; isNew: boolean }> {
    let client = await this.findByWhatsappId(whatsappId);
    if (client) return { client, isNew: false };

    const [newClient] = await this.db('clients')
      .insert({
        full_name: name ?? phone,
        phone,
        whatsapp_id: whatsappId,
        status: 'new',
        source: 'whatsapp',
        first_contact_at: new Date(),
        ai_profile: {},
        conversation_context: {},
        intent_history: [],
      })
      .returning('*') as Client[];

    if (!newClient) throw new Error('Failed to create client');
    logger.info('New client created', { phone, whatsappId });
    return { client: newClient, isNew: true };
  }

  async findById(id: string): Promise<Client | null> {
    const cached = await cacheGet<Client>(cacheKeys.clientProfile(id));
    if (cached) return cached;

    const client = await this.db('clients as cl')
      .leftJoin('cities as c', 'cl.city_id', 'c.id')
      .leftJoin('users as u', 'cl.assigned_agent_id', 'u.id')
      .select('cl.*', 'c.name_ar as city_name', 'u.full_name_ar as agent_name')
      .where('cl.id', id)
      .first() as Client | undefined;

    if (client) await cacheSet(cacheKeys.clientProfile(id), client, 1800);
    return client ?? null;
  }

  async update(id: string, data: Partial<Client>): Promise<Client> {
    const [updated] = await this.db('clients')
      .where('id', id)
      .update({ ...data, updated_at: new Date() })
      .returning('*') as Client[];

    if (!updated) throw new Error('Client not found');
    await cacheDel(cacheKeys.clientProfile(id), `client:wa:${updated.whatsapp_id}`);
    return updated;
  }

  async updateStatus(id: string, status: ClientStatus): Promise<void> {
    await this.db('clients').where('id', id).update({ status, updated_at: new Date() });
    await cacheDel(cacheKeys.clientProfile(id));
    logger.info('Client status updated', { id, status });
  }

  async updateFromAI(
    id: string,
    data: {
      name?: string;
      budget_max?: number;
      budget_min?: number;
      preferred_property_types?: string[];
      special_requirements?: string;
      city_id?: number;
      intent?: IntentRecord;
    }
  ): Promise<void> {
    const client = await this.findById(id);
    if (!client) return;

    const updates: Partial<Client> = {
      last_contact_at: new Date(),
      updated_at: new Date(),
    };

    if (data.name && client.full_name === client.phone) updates.full_name = data.name;
    if (data.budget_max) updates.budget_max = data.budget_max;
    if (data.budget_min) updates.budget_min = data.budget_min;
    if (data.preferred_property_types?.length) {
      updates.preferred_property_types = data.preferred_property_types as any;
    }
    if (data.special_requirements) updates.special_requirements = data.special_requirements;
    if (data.city_id) updates.city_id = data.city_id;

    if (data.intent) {
      let raw = client.intent_history ?? [];
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
      const intentHistory = Array.isArray(raw) ? [...raw] : [];
      intentHistory.push(data.intent);
      updates.intent_history = JSON.stringify(intentHistory.slice(-20)) as any;
    }

    // Build AI summary from extracted data
    (updates as any).ai_summary = this.buildClientSummary(client, data);

    // Auto-update status
    if (client.status === 'new') {
      updates.status = 'contacted';
    }

    await this.db('clients').where('id', id).update(updates);
    await cacheDel(cacheKeys.clientProfile(id), `client:wa:${client.whatsapp_id}`);
  }

  private buildClientSummary(client: Client, newData: { budget_max?: number; budget_min?: number; preferred_property_types?: string[]; special_requirements?: string; city_id?: number; intent?: any }): string {
    const parts: string[] = [];
    const types = newData.preferred_property_types ?? (client.preferred_property_types as any) ?? [];
    const typeStr = Array.isArray(types) ? types.join('، ') : String(types ?? '');
    if (typeStr) parts.push(`يبحث عن: ${typeStr}`);
    const budgetMax = newData.budget_max ?? client.budget_max;
    const budgetMin = newData.budget_min ?? client.budget_min;
    if (budgetMax && budgetMin) parts.push(`الميزانية: ${Number(budgetMin).toLocaleString('ar-SA')} - ${Number(budgetMax).toLocaleString('ar-SA')} ر.س`);
    else if (budgetMax) parts.push(`الميزانية: حتى ${Number(budgetMax).toLocaleString('ar-SA')} ر.س`);
    const req = newData.special_requirements ?? client.special_requirements;
    if (req) parts.push(`متطلبات: ${req}`);
    const intent = newData.intent?.intent ?? '';
    if (intent === 'appointment_request') parts.push('يريد موعد معاينة');
    if (intent === 'human_agent_request') parts.push('⚠️ طلب التحدث مع موظف');
    return parts.length ? parts.join(' | ') : 'عميل جديد — لم تُحدد الاحتياجات بعد';
  }

  async scheduleFollowUp(clientId: string, type: string, scheduledAt: Date): Promise<void> {
    // Cancel existing pending follow-ups of same type
    await this.db('follow_ups')
      .where({ client_id: clientId, follow_up_type: type, status: 'pending' })
      .update({ is_cancelled: true, cancel_reason: 'rescheduled' });

    await this.db('follow_ups').insert({
      client_id: clientId,
      follow_up_type: type,
      scheduled_at: scheduledAt,
      status: 'pending',
    });
  }

  async cancelFollowUps(clientId: string, reason: string): Promise<void> {
    await this.db('follow_ups')
      .where({ client_id: clientId, status: 'pending' })
      .update({ is_cancelled: true, cancel_reason: reason });
  }

  async getPendingFollowUps(before: Date): Promise<(Client & { follow_up_id: string; follow_up_type: string })[]> {
    return this.db('follow_ups as f')
      .join('clients as cl', 'f.client_id', 'cl.id')
      .select('cl.*', 'f.id as follow_up_id', 'f.follow_up_type')
      .where('f.status', 'pending')
      .where('f.is_cancelled', false)
      .where('f.scheduled_at', '<=', before);
  }

  async list(filters: {
    status?: ClientStatus;
    agent_id?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ clients: Client[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const query = this.db('clients as cl')
      .leftJoin('cities as c', 'cl.city_id', 'c.id')
      .leftJoin('users as u', 'cl.assigned_agent_id', 'u.id')
      .select('cl.*', 'c.name_ar as city_name', 'u.full_name_ar as agent_name');

    if (filters.status) query.where('cl.status', filters.status);
    if (filters.agent_id) query.where('cl.assigned_agent_id', filters.agent_id);
    if (filters.search) {
      query.where((qb: Knex.QueryBuilder) => {
        qb.whereILike('cl.full_name', `%${filters.search}%`)
          .orWhereILike('cl.phone', `%${filters.search}%`);
      });
    }

    const countQuery = this.db('clients as cl');
    if (filters.status) countQuery.where('cl.status', filters.status);
    if (filters.agent_id) countQuery.where('cl.assigned_agent_id', filters.agent_id);
    if (filters.search) {
      countQuery.where((qb: Knex.QueryBuilder) => {
        qb.whereILike('cl.full_name', `%${filters.search}%`)
          .orWhereILike('cl.phone', `%${filters.search}%`);
      });
    }
    const [{ count }] = await countQuery.count('cl.id as count') as any[];
    const clients = await query.orderBy('cl.updated_at', 'desc').limit(limit).offset(offset) as Client[];

    return { clients, total: parseInt(count, 10) };
  }

  async getStats(): Promise<{
    total: number;
    new: number;
    active: number;
    closed_won: number;
    closed_lost: number;
    by_status: Record<string, number>;
  }> {
    const [row] = await this.db('clients').select(
      this.db.raw('COUNT(*) as total'),
      this.db.raw("COUNT(*) FILTER (WHERE status = 'new') as new"),
      this.db.raw("COUNT(*) FILTER (WHERE status IN ('contacted','interested','viewing_scheduled','negotiating')) as active"),
      this.db.raw("COUNT(*) FILTER (WHERE status = 'closed_won') as closed_won"),
      this.db.raw("COUNT(*) FILTER (WHERE status = 'closed_lost') as closed_lost")
    ) as any[];

    const byStatus = await this.db('clients').select('status').count('id as count').groupBy('status') as any[];

    return {
      total: parseInt(row.total, 10),
      new: parseInt(row.new, 10),
      active: parseInt(row.active, 10),
      closed_won: parseInt(row.closed_won, 10),
      closed_lost: parseInt(row.closed_lost, 10),
      by_status: Object.fromEntries(byStatus.map((r: any) => [r.status, parseInt(r.count, 10)])),
    };
  }
}

export const clientService = new ClientService();
