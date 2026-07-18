import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { dealService } from '../services/deal.service.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query as any;
    const agentId = req.user!.role === 'sales_agent' ? req.user!.user_id : undefined;
    const deals = await dealService.list({ agent_id: agentId, status });
    res.json({ success: true, data: deals });
  } catch (error) { next(error); }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await dealService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

router.post('/', authorize('super_admin','admin','sales_manager','sales_agent'), async (req, res, next) => {
  try {
    const data = z.object({
      client_id: z.string().uuid(),
      property_id: z.string().uuid(),
      assigned_agent_id: z.string().uuid().optional(),
      agreed_price: z.number().positive(),
      commission_percentage: z.number().min(0).max(100).optional(),
      payment_method: z.string().optional(),
      expected_close_date: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const deal = await dealService.create({
      ...data,
      status: 'draft',
      payment_schedule: [],
      commission_amount: data.commission_percentage
        ? (data.agreed_price * data.commission_percentage) / 100
        : undefined,
      created_by: req.user!.user_id,
    } as any);
    res.status(201).json({ success: true, data: deal });
  } catch (error) { next(error); }
});

router.patch('/:id/status', authorize('super_admin','admin','sales_manager'), async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['draft','pending_signature','signed','active','completed','cancelled','disputed']),
    }).parse(req.body);
    await dealService.updateStatus(req.params['id']!, status);
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
