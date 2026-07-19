import { Router } from 'express';
import { listClients, getClient, createClient, updateClient, getClientStats, addClientNote } from '../controllers/client.controller.js';
import { authenticate, authorize, pagination } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.get('/', pagination, listClients);
router.get('/stats', getClientStats);
router.post('/', authorize('super_admin','admin','sales_manager','sales_agent','customer_service'), createClient);
router.get('/:id', getClient);
router.put('/:id', authorize('super_admin','admin','sales_manager','sales_agent','customer_service'), updateClient);
router.post('/:id/notes', addClientNote);

export default router;
