import { Router } from 'express';
import { handleWhatsAppWebhook, getWebhookStatus } from '../controllers/webhook.controller.js';

const router = Router();

router.post('/whatsapp', handleWhatsAppWebhook);
router.get('/status', getWebhookStatus);

export default router;
