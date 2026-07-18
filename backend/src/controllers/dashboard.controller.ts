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

    const [
      propertyStats,
      clientStats,
      conversationStats,
    ] = await Promise.all([
      propertyService.getStats(),
      clientService.getStats(),
      conversationService.getStats(),
    ]);

    // New clients today/week/month
    const [{ today_clients, week_clients, month_clients }] = await db('clients').select(
      db.raw('COUNT(*) FILTER (WHERE created_at >= ?) as today_clients', [today]),
      db.raw('COUNT(*) FILTER (WHERE created_at >= ?) as week_clients', [week]),
      db.raw('COUNT(*) FILTER (WHERE created_at >= ?) as month_clients', [month])
    ) as any[];

    // Deals
    const [dealStats] = await db('deals').select(
      db.raw('COUNT(*) as total'),
      db.raw("COUNT(*) FILTER (WHERE status = 'active') as active"),
      db.raw("COUNT(*) FILTER (WHERE status = 'completed') as completed"),
      db.raw("SUM(agreed_price) FILTER (WHERE status = 'completed') as total_revenue")
    ) as any[];

    // Top properties by inquiry
    const topProperties = await db('properties as p')
      .leftJoin('cities as c', 'p.city_id', 'c.id')
      .select('p.id', 'p.code', 'p.title_ar', 'p.inquiry_count', 'p.view_count', 'c.name_ar as city')
      .where('p.status', 'available')
      .orderBy('p.inquiry_count', 'desc')
      .limit(5);

    // Top districts
    const topDistricts = await db('properties as p')
      .leftJoin('districts as d', 'p.district_id', 'd.id')
      .select('d.name_ar as district')
      .count('p.id as count')
      .where('p.status', 'available')
      .groupBy('d.name_ar')
      .orderBy('count', 'desc')
      .limit(5);

    // Monthly messages chart (last 7 days)
    const messageChart = await db('messages')
      .select(db.raw('DATE(created_at) as date'), db.raw('COUNT(*) as count'))
      .where('created_at', '>=', week)
      .groupByRaw('DATE(created_at)')
      .orderBy('date');

    // Conversion rate
    const totalClients = clientStats.total;
    const convertedClients = clientStats.closed_won;
    const conversionRate = totalClients > 0 ? (convertedClients / totalClients) * 100 : 0;

    const data = {
      properties: propertyStats,
      clients: {
        ...clientStats,
        new_today: parseInt(today_clients, 10),
        new_this_week: parseInt(week_clients, 10),
        new_this_month: parseInt(month_clients, 10),
      },
      conversations: conversationStats,
      deals: {
        total: parseInt(dealStats.total, 10),
        active: parseInt(dealStats.active, 10),
        completed: parseInt(dealStats.completed, 10),
        total_revenue: parseFloat(dealStats.total_revenue ?? 0),
      },
      analytics: {
        conversion_rate: Math.round(conversionRate * 100) / 100,
        top_properties: topProperties,
        top_districts: topDistricts,
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
