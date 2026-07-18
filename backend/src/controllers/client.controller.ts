import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { clientService } from '../services/client.service.js';
import { AppError } from '../middleware/error.middleware.js';

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

export const getClient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const client = await clientService.findById(req.params['id']!);
    if (!client) throw new AppError(404, 'العميل غير موجود');
    res.json({ success: true, data: client });
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
