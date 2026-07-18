import { Request, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service.js';
import { logger } from '../config/logger.js';
import type { WhatsAppWebhookPayload } from '../types/index.js';

export const handleWhatsAppWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
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
