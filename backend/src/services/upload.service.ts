import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    throw new Error('Cloudinary غير مُهيّأ — أضف CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET في متغيرات البيئة');
  }
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
  configured = true;
}

/**
 * Uploads a buffer to Cloudinary and returns a permanent HTTPS URL.
 * Railway's own filesystem is wiped on every redeploy, so property photos
 * cannot live on local disk — they must land in durable storage the first time.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  folder: string = 'al-naqidan/properties'
): Promise<{ url: string; publicId: string }> {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        // Cap dimensions and auto-compress — WhatsApp doesn't need original-resolution photos.
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }],
      },
      (error, result) => {
        if (error || !result) {
          logger.error('Cloudinary upload failed', { error: error?.message });
          reject(error ?? new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (e: any) {
    logger.warn('Cloudinary delete failed', { publicId, error: e?.message });
  }
}
