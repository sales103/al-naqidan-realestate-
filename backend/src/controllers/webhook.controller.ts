import { Request, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { logger } from '../config/logger.js';
import type { WhatsAppWebhookPayload } from '../types/index.js';

export const handleWhatsAppWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Authenticate the webhook. Evolution v2 sends the *instance* token in the
    // apikey header, not the global API key, so accept either: the configured
    // global key, or any live per-instance token Evolution reports.
    const apikey = req.headers['apikey'] as string | undefined;
    const globalKey = process.env['EVOLUTION_API_KEY'];

    if (globalKey) {
      let authorized = apikey === globalKey;
      if (!authorized && apikey) {
        const tokens = await whatsappService.validInstanceTokens();
        authorized = tokens.has(apikey);
      }
      if (!authorized) {
        logger.warn('Webhook rejected: invalid apikey', {
          ip: req.ip,
          received: apikey ? apikey.slice(0, 8) + '...' : 'none',
        });
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
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
