import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database/connection.js';
import { cacheGet, cacheSet, cacheKeys } from '../database/redis.js';
import { propertyService } from '../services/property.service.js';
import { clientService } from '../services/client.service.js';
import { conversationService } from '../services/conversation.service.js';

export const getDashboardStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cached = await cacheGet(cacheKeys.dashboardStats());
    if (cached) { res.json({ success: true, data: cached }); return; }

    const db = getDatabase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch { return fallback; }
    };

    const [propertyStats, clientStats, conversationStats] = await Promise.all([
      safe(() => propertyService.getStats(), { total: 0, available: 0, reserved: 0, sold: 0, by_type: {} as Record<string, number> }),
      safe(() => clientService.getStats(), { total: 0, new: 0, active: 0, closed_won: 0, closed_lost: 0, by_status: {} as Record<string, number> }),
      safe(() => conversationService.getStats(), { total_messages_today: 0, ai_responses_today: 0, active_conversations: 0 }),
    ]);

    // New clients today/week/month
    const clientCounts = await safe(async () => {
      const [row] = await db('clients').select(
        db.raw('COUNT(*) FILTER (WHERE created_at >= ?) as today_clients', [today]),
        db.raw('COUNT(*) FILTER (WHERE created_at >= ?) as week_clients', [week]),
        db.raw('COUNT(*) FILTER (WHERE created_at >= ?) as month_clients', [month])
      ) as any[];
      return row;
    }, { today_clients: 0, week_clients: 0, month_clients: 0 });

    // Deals
    const dealStats = await safe(async () => {
      const [row] = await db('deals').select(
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(*) FILTER (WHERE status IN ('active','open','in_progress')) as active"),
        db.raw("COUNT(*) FILTER (WHERE status IN ('completed','closed','won')) as completed"),
        db.raw('SUM(COALESCE(agreed_price, final_price, price, 0)) FILTER (WHERE status IN (\'completed\',\'closed\',\'won\')) as total_revenue')
      ) as any[];
      return row;
    }, { total: 0, active: 0, completed: 0, total_revenue: 0 });

    // Top properties by inquiry
    const topProperties = await safe(() =>
      db('properties as p')
        .leftJoin('cities as c', 'p.city_id', 'c.id')
        .select('p.id', 'p.title_ar', 'p.inquiry_count', 'p.view_count', 'c.name_ar as city')
        .where('p.status', 'available')
        .orderBy('p.inquiry_count', 'desc')
        .limit(5)
    , []);

    // Message chart (last 7 days)
    const messageChart = await safe(() =>
      db('messages')
        .select(db.raw('DATE(created_at) as date'), db.raw('COUNT(*) as count'))
        .where('created_at', '>=', week)
        .groupByRaw('DATE(created_at)')
        .orderBy('date')
    , []);

    const totalClients = (clientStats as any).total ?? 0;
    const convertedClients = (clientStats as any).closed_won ?? 0;
    const conversionRate = totalClients > 0 ? (convertedClients / totalClients) * 100 : 0;

    const data = {
      properties: propertyStats,
      clients: {
        ...clientStats,
        new_today: parseInt(String(clientCounts.today_clients), 10) || 0,
        new_this_week: parseInt(String(clientCounts.week_clients), 10) || 0,
        new_this_month: parseInt(String(clientCounts.month_clients), 10) || 0,
      },
      conversations: conversationStats,
      deals: {
        total: parseInt(String(dealStats.total), 10) || 0,
        active: parseInt(String(dealStats.active), 10) || 0,
        completed: parseInt(String(dealStats.completed), 10) || 0,
        total_revenue: parseFloat(String(dealStats.total_revenue ?? 0)) || 0,
      },
      analytics: {
        conversion_rate: Math.round(conversionRate * 100) / 100,
        top_properties: topProperties,
        message_chart: messageChart,
      },
      generated_at: new Date(),
    };

    await cacheSet(cacheKeys.dashboardStats(), data, 300); // 5 min cache
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const getRecentActivity = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const limit = 20;

    const [recentClients, recentMessages, recentDeals] = await Promise.all([
      db('clients as cl')
        .leftJoin('users as u', 'cl.assigned_agent_id', 'u.id')
        .select('cl.id', 'cl.full_name', 'cl.phone', 'cl.status', 'cl.created_at', 'u.full_name_ar as agent')
        .orderBy('cl.created_at', 'desc')
        .limit(limit),

      db('messages as m')
        .join('conversations as cv', 'm.conversation_id', 'cv.id')
        .join('clients as cl', 'cv.client_id', 'cl.id')
        .select('m.id', 'm.direction', 'm.content', 'm.message_type', 'm.created_at', 'cl.full_name as client_name')
        .where('m.direction', 'inbound')
        .orderBy('m.created_at', 'desc')
        .limit(limit),

      db('deals as d')
        .join('clients as cl', 'd.client_id', 'cl.id')
        .join('properties as p', 'd.property_id', 'p.id')
        .select('d.id', 'd.deal_number', 'd.status', 'd.agreed_price', 'd.created_at', 'cl.full_name as client_name', 'p.title_ar as property_title')
        .orderBy('d.created_at', 'desc')
        .limit(10),
    ]);

    res.json({
      success: true,
      data: { recent_clients: recentClients, recent_messages: recentMessages, recent_deals: recentDeals },
    });
  } catch (error) { next(error); }
};
