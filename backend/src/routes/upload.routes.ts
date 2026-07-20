import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { uploadImageBuffer } from '../services/upload.service.js';

const router = Router();
router.use(authenticate);

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('صيغة غير مدعومة — استخدم JPG أو PNG أو WEBP'));
      return;
    }
    cb(null, true);
  },
});

// POST /api/uploads/image — single property photo, returns a permanent Cloudinary URL
router.post(
  '/image',
  authorize('super_admin', 'admin', 'sales_manager', 'sales_agent'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'لم يتم رفع ملف' });
        return;
      }
      const { url } = await uploadImageBuffer(req.file.buffer);
      res.json({ success: true, data: { url } });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/uploads/images — multiple property photos at once
router.post(
  '/images',
  authorize('super_admin', 'admin', 'sales_manager', 'sales_agent'),
  upload.array('files', 10),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) {
        res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' });
        return;
      }
      const results = await Promise.all(files.map((f) => uploadImageBuffer(f.buffer)));
      res.json({ success: true, data: { urls: results.map((r) => r.url) } });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
