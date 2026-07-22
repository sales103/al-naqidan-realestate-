import { Request, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service.js';
import { logger } from '../config/logger.js';
import type { WhatsAppWebhookPayload } from '../types/index.js';

export const handleWhatsAppWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Verify the request comes from our Evolution API instance
    const apikey = req.headers['apikey'] as string | undefined;
    const expectedKey = process.env['EVOLUTION_API_KEY'];

    // Log the incoming key for debugging (first 8 chars only)
    if (expectedKey && apikey !== expectedKey) {
      logger.warn('Webhook rejected: invalid apikey', {
        ip: req.ip,
        received: apikey ? apikey.slice(0, 8) + '...' : 'none',
        expected_prefix: expectedKey ? expectedKey.slice(0, 8) + '...' : 'not-set',
      });
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Respond immediately to prevent timeout
    res.status(200).json({ success: true });

    // Process asynchronously
    const payload = req.body as WhatsAppWebhookPayload;
    conversationService.handleWebhook(payload).catch((err) => {
      logger.error('Async webhook processing failed', { error: err.message });
    });
  } catch (error) {
    next(error);
  }
};

export const getWebhookStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: { status: 'active', timestamp: new Date() } });
};
