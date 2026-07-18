import { getDatabase } from '../database/connection.js';
import { logger } from '../config/logger.js';
import { clientService } from './client.service.js';
import type { Deal, ContractStatus } from '../types/index.js';

export class DealService {
  private get db() { return getDatabase(); }

  async create(data: Omit<Deal, 'id' | 'deal_number' | 'created_at' | 'updated_at'>): Promise<Deal> {
    const [deal] = await this.db('deals').insert(data).returning('*') as Deal[];
    if (!deal) throw new Error('Failed to create deal');

    // Update client status
    await clientService.updateStatus(data.client_id, 'contract_pending');

    // Update property status
    if (data.status === 'active' || data.status === 'signed') {
      await this.db('properties').where('id', data.property_id).update({ status: 'reserved' });
    }

    logger.info('Deal created', { dealId: deal.id, dealNumber: deal.deal_number });
    return deal;
  }

  async updateStatus(id: string, status: ContractStatus): Promise<void> {
    const deal = await this.db('deals').where('id', id).first() as Deal;
    if (!deal) throw new Error('Deal not found');

    await this.db('deals').where('id', id).update({
      status,
      actual_close_date: status === 'completed' ? new Date() : null,
      updated_at: new Date(),
    });

    // Update related entities
    if (status === 'completed') {
      await clientService.updateStatus(deal.client_id, 'closed_won');
      await this.db('properties').where('id', deal.property_id).update({ status: 'sold' });
      await clientService.cancelFollowUps(deal.client_id, 'deal completed');
      logger.info('Deal completed', { dealId: id, dealNumber: deal.deal_number });
    } else if (status === 'cancelled') {
      await clientService.updateStatus(deal.client_id, 'closed_lost');
      await this.db('properties').where('id', deal.property_id).update({ status: 'available' });
    }
  }

  async list(filters: { agent_id?: string; status?: ContractStatus }): Promise<Deal[]> {
    const query = this.db('deals as d')
      .join('clients as cl', 'd.client_id', 'cl.id')
      .join('properties as p', 'd.property_id', 'p.id')
      .leftJoin('users as u', 'd.assigned_agent_id', 'u.id')
      .select('d.*', 'cl.full_name as client_name', 'p.title_ar as property_title', 'p.code as property_code', 'u.full_name_ar as agent_name')
      .orderBy('d.created_at', 'desc');

    if (filters.agent_id) query.where('d.assigned_agent_id', filters.agent_id);
    if (filters.status) query.where('d.status', filters.status);

    return query;
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    completed: number;
    total_revenue: number;
    avg_deal_value: number;
  }> {
    const [row] = await this.db('deals').select(
      this.db.raw('COUNT(*) as total'),
      this.db.raw("COUNT(*) FILTER (WHERE status = 'active') as active"),
      this.db.raw("COUNT(*) FILTER (WHERE status = 'completed') as completed"),
      this.db.raw("SUM(agreed_price) FILTER (WHERE status = 'completed') as total_revenue"),
      this.db.raw("AVG(agreed_price) FILTER (WHERE status = 'completed') as avg_deal_value")
    ) as any[];

    return {
      total: parseInt(row.total, 10),
      active: parseInt(row.active, 10),
      completed: parseInt(row.completed, 10),
      total_revenue: parseFloat(row.total_revenue ?? 0),
      avg_deal_value: parseFloat(row.avg_deal_value ?? 0),
    };
  }
}

export const dealService = new DealService();
