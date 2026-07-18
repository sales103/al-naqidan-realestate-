import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import type { SendMessagePayload, Property } from '../types/index.js';
import { formatPropertiesResponse } from '../ai/agent.js';

export class WhatsAppService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.whatsapp.evolutionUrl}/`,
      headers: {
        apikey: config.whatsapp.evolutionApiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async sendText(to: string, text: string): Promise<string> {
    try {
      const response = await this.client.post(
        `message/sendText/${config.whatsapp.instanceName}`,
        { number: to, text }
      );
      logger.info('WhatsApp text sent', { to, length: text.length });
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.error('WhatsApp send text failed', { to, error: error.message });
      throw error;
    }
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<string> {
    try {
      const response = await this.client.post(
        `message/sendMedia/${config.whatsapp.instanceName}`,
        {
          number: to,
          mediatype: 'image',
          media: imageUrl,
          caption: caption ?? '',
        }
      );
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.error('WhatsApp send image failed', { to, error: error.message });
      throw error;
    }
  }

  async sendDocument(to: string, url: string, fileName: string, caption?: string): Promise<string> {
    try {
      const response = await this.client.post(
        `message/sendMedia/${config.whatsapp.instanceName}`,
        {
          number: to,
          mediatype: 'document',
          media: url,
          fileName,
          caption: caption ?? '',
        }
      );
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.error('WhatsApp send document failed', { to, error: error.message });
      throw error;
    }
  }

  async sendLocation(to: string, lat: number, lng: number, name?: string, address?: string): Promise<string> {
    try {
      const response = await this.client.post(
        `message/sendLocation/${config.whatsapp.instanceName}`,
        { number: to, latitude: lat, longitude: lng, name, address }
      );
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.error('WhatsApp send location failed', { to, error: error.message });
      throw error;
    }
  }

  async sendProperties(to: string, properties: Property[], searchSummary: string): Promise<void> {
    const textMessage = formatPropertiesResponse(properties, searchSummary);
    await this.sendText(to, textMessage);

    // Send main image for each property (max 3)
    for (const prop of properties.slice(0, 3)) {
      if (prop.main_image_url) {
        const caption = `🏠 ${prop.title_ar ?? prop.title}\n📍 ${prop.district_name ?? ''} - ${prop.city_name ?? ''}\n💰 ${prop.price?.toLocaleString('ar-SA') ?? ''} ريال\n🔗 ${prop.code}`;
        await this.sendImage(to, prop.main_image_url, caption);
        await this.delay(500);
      }

      // Send location if available
      if (prop.latitude && prop.longitude) {
        await this.sendLocation(
          to,
          prop.latitude,
          prop.longitude,
          prop.title_ar ?? prop.title,
          prop.address
        );
        await this.delay(500);
      }
    }
  }

  async downloadMedia(messageId: string): Promise<Buffer> {
    try {
      const response = await this.client.get(
        `chat/getBase64FromMediaMessage/${config.whatsapp.instanceName}`,
        { params: { message: messageId } }
      );
      const base64 = response.data.base64 as string;
      return Buffer.from(base64.split(',').pop() ?? base64, 'base64');
    } catch (error: any) {
      logger.error('Media download failed', { messageId, error: error.message });
      throw error;
    }
  }

  async markAsRead(messageId: string, chatId: string): Promise<void> {
    try {
      await this.client.post(`chat/readMessages/${config.whatsapp.instanceName}`, {
        readMessages: [{ id: messageId, fromMe: false, remoteJid: chatId }],
      });
    } catch {
      // Non-critical, don't throw
    }
  }

  async getInstanceStatus(): Promise<{ state: string; connected: boolean }> {
    try {
      const response = await this.client.get(
        `instance/connectionState/${config.whatsapp.instanceName}`
      );
      return {
        state: response.data.instance?.state ?? 'unknown',
        connected: response.data.instance?.state === 'open',
      };
    } catch {
      return { state: 'error', connected: false };
    }
  }


  async sendButtons(to: string, title: string, body: string, buttons: { id: string; text: string }[]): Promise<void> {
    try {
      await this.client.post(
        `message/sendButtons/${config.whatsapp.instanceName}`,
        {
          number: to,
          title,
          description: body,
          footer: 'مكتب النقيدان العقاري',
          buttons: buttons.map(b => ({
            buttonId: b.id,
            buttonText: { displayText: b.text },
            type: 1,
          })),
        }
      );
    } catch {
      // Fallback to text if buttons not supported
      const text = `${title}\n${body}\n\n${buttons.map((b, i) => `${['1️⃣','2️⃣','3️⃣','4️⃣'][i] ?? `${i+1}.`} ${b.text}`).join('\n')}`;
      await this.sendText(to, text);
    }
  }

  getRiyadhGreeting(): string {
    const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
    const riyadhHour = new Date(utc + 3 * 3600000).getHours();
    if (riyadhHour >= 5 && riyadhHour < 12) return 'صباح الخير ☀️';
    if (riyadhHour >= 12 && riyadhHour < 17) return 'مساء الخير 🌤️';
    if (riyadhHour >= 17 && riyadhHour < 22) return 'مساء النور 🌙';
    return 'أهلاً بك 👋';
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const whatsappService = new WhatsAppService();
