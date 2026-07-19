import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { clientService } from '../services/client.service.js';
import { AppError } from '../middleware/error.middleware.js';

const createSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().min(9),
  email: z.string().email().optional(),
  budget_max: z.number().min(0).optional(),
  purpose: z.enum(['buy','rent','invest']).optional(),
  preferred_property_types: z.array(z.string()).optional(),
  special_requirements: z.string().optional(),
  status: z.enum(['new','contacted','interested','viewing_scheduled','negotiating','contract_pending','closed_won','closed_lost','on_hold','follow_up']).default('new'),
  source: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  full_name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  city_id: z.number().optional(),
  district: z.string().optional(),
  budget_min: z.number().min(0).optional(),
  budget_max: z.number().min(0).optional(),
  preferred_property_types: z.array(z.string()).optional(),
  special_requirements: z.string().optional(),
  status: z.enum(['new','contacted','interested','viewing_scheduled','negotiating','contract_pending','closed_won','closed_lost','on_hold','follow_up']).optional(),
  assigned_agent_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  next_follow_up_at: z.string().datetime().optional(),
});

export const listClients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, agent_id, search } = req.query as Record<string, string>;
    const { page, limit } = req.pagination!;

    const result = await clientService.list({
      status: status as any,
      agent_id,
      search,
      page,
      limit,
    });

    res.json({
      success: true,
      data: result.clients,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) { next(error); }
};

export const createClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createSchema.parse(req.body);
    const db = (await import('../database/connection.js')).getDatabase();
    const phone = data.phone.replace(/\D/g, '');
    const [client] = await db('clients').insert({
      full_name: data.full_name,
      phone,
      whatsapp_id: phone + '@s.whatsapp.net',
      email: data.email ?? null,
      budget_max: data.budget_max ?? null,
      purpose: data.purpose ?? 'buy',
      preferred_property_types: data.preferred_property_types ?? null,
      special_requirements: data.special_requirements ?? null,
      notes: data.notes ?? null,
      status: data.status,
      source: data.source ?? 'manual',
      first_contact_at: new Date(),
    }).returning('*');
    res.status(201).json({ success: true, data: client });
  } catch (error) { next(error); }
};

export const getClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const client = await clientService.findById(req.params['id']!);
    if (!client) throw new AppError(404, 'العميل غير موجود');
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
};

export const getClientMatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { getDatabase } = await import('../database/connection.js');
    const db = getDatabase();
    const client = await clientService.findById(req.params['id']!);
    if (!client) throw new AppError(404, 'العميل غير موجود');

    const query = db('properties as p')
      .leftJoin('cities as c', 'p.city_id', 'c.id')
      .select('p.*', 'c.name_ar as city_name')
      .where('p.status', 'available')
      .limit(10);

    if ((client as any).budget_max) query.where('p.price', '<=', (client as any).budget_max);
    if ((client as any).city_id) query.where('p.city_id', (client as any).city_id);

    const types: string[] = (client as any).preferred_property_types ?? [];
    if (types.length > 0) query.whereIn('p.property_type', types);

    query.orderByRaw('p.is_featured DESC, p.inquiry_count DESC');

    const properties = await query;
    res.json({ success: true, data: properties, total: properties.length });
  } catch (error) { next(error); }
};

export const updateClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = updateSchema.parse(req.body);
    const client = await clientService.update(req.params['id']!, data as any);
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
};

export const getClientStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await clientService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const addClientNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { content, is_private } = z.object({
      content: z.string().min(1),
      is_private: z.boolean().default(false),
    }).parse(req.body);

    const db = (await import('../database/connection.js')).getDatabase();
    const [note] = await db('client_notes').insert({
      client_id: req.params['id'],
      content,
      is_private,
      created_by: req.user!.user_id,
    }).returning('*');

    res.status(201).json({ success: true, data: note });
  } catch (error) { next(error); }
};
