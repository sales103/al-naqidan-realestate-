import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { appointmentService } from '../services/appointment.service.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  client_id: z.string().uuid(),
  property_id: z.string().uuid().optional(),
  assigned_agent_id: z.string().uuid().optional(),
  title: z.string().min(3),
  description: z.string().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().positive().default(60),
  location: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', authorize('super_admin','admin','sales_manager','sales_agent'), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const appt = await appointmentService.create({
      ...data,
      status: 'scheduled',
      scheduled_at: new Date(data.scheduled_at),
      created_by: req.user!.user_id,
    } as any);
    res.status(201).json({ success: true, data: appt });
  } catch (error) { next(error); }
});

router.get('/upcoming', async (req, res, next) => {
  try {
    const agentId = req.user!.role === 'sales_agent' ? req.user!.user_id : undefined;
    const appts = await appointmentService.getUpcoming(agentId);
    res.json({ success: true, data: appts });
  } catch (error) { next(error); }
});

router.get('/client/:clientId', async (req, res, next) => {
  try {
    const appts = await appointmentService.listForClient(req.params['clientId']!);
    res.json({ success: true, data: appts });
  } catch (error) { next(error); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status, result } = z.object({
      status: z.enum(['scheduled','confirmed','completed','cancelled','no_show']),
      result: z.string().optional(),
    }).parse(req.body);
    await appointmentService.updateStatus(req.params['id']!, status, result);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.post('/reminders', async (_req, res, next) => {
  try {
    await appointmentService.sendReminders();
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
