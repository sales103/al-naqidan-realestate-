import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/sheets/export-properties
router.post('/export-properties', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const properties = await db('properties as p')
      .leftJoin('cities as c', 'p.city_id', 'c.id')
      .leftJoin('districts as d', 'p.district_id', 'd.id')
      .select('p.*', 'c.name_ar as city_name', 'd.name_ar as district_name')
      .where('p.status', '!=', 'archived').orderBy('p.created_at', 'desc').limit(1000);

    const headers = ['الكود','العنوان','النوع','السعر','المدينة','الحي','المساحة','الغرف','الحمامات','الحالة','الوصف'];
    const rows = properties.map((p: any) => [p.code??'',p.title_ar??'',p.property_type??'',p.price??'',p.city_name??'',p.district_name??'',p.area_sqm??'',p.rooms??'',p.bathrooms??'',p.status??'',(p.description_ar??'').replace(/\n/g,' ')]);
    const csv = [headers,...rows].map(r=>r.map((v:any)=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.json({ success: true, data: { csv, count: properties.length }, message: `تم تصدير ${properties.length} عقار` });
  } catch (error) { next(error); }
});

// POST /api/sheets/export-clients
router.post('/export-clients', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDatabase();
    const clients = await db('clients').orderBy('created_at', 'desc').limit(1000);
    const headers = ['الاسم','الجوال','واتساب','البريد','الحالة','الميزانية','الغرض','ملخص الطلب','تاريخ الإضافة'];
    const rows = clients.map((c: any) => [c.full_name_ar??c.full_name??'',c.phone??'',c.whatsapp_number??'',c.email??'',c.status??'',c.budget_max??'',c.purpose??'',c.ai_summary??'',(c.created_at?new Date(c.created_at).toLocaleDateString('ar-SA'):'')]);
    const csv = [headers,...rows].map(r=>r.map((v:any)=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.json({ success: true, data: { csv, count: clients.length }, message: `تم تصدير ${clients.length} عميل` });
  } catch (error) { next(error); }
});

// POST /api/sheets/upload-excel — upload Excel file and import
router.post('/upload-excel', upload.single('file'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'لم يتم رفع ملف' }); return; }
    const type = (req.body.type as string) ?? 'properties'; // 'properties' | 'clients'
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    if (!ws) { res.status(400).json({ success: false, error: 'الملف فارغ أو تالف' }); return; }
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const db = getDatabase();
    let imported = 0;

    if (type === 'clients') {
      for (const row of rows) {
        const phone = String(row['الجوال'] ?? row['phone'] ?? row['Phone'] ?? '').replace(/\D/g, '');
        if (!phone) continue;
        try {
          await db('clients').insert({
            full_name: String(row['الاسم'] ?? row['name'] ?? phone),
            full_name_ar: String(row['الاسم'] ?? row['name'] ?? ''),
            phone,
            whatsapp_id: phone + '@s.whatsapp.net',
            email: String(row['البريد'] ?? row['email'] ?? ''),
            status: 'new',
            source: 'excel_import',
            budget_max: parseFloat(String(row['الميزانية'] ?? row['budget'] ?? '0')) || null,
            purpose: String(row['الغرض'] ?? row['purpose'] ?? 'buy'),
            ai_summary: String(row['ملخص'] ?? row['notes'] ?? ''),
            first_contact_at: new Date(),
          }).onConflict('phone').ignore();
          imported++;
        } catch { /* skip invalid */ }
      }
    } else {
      // properties
      const riyadhCity = await db('cities').where('name_ar', 'like', '%الرياض%').first();

      const typeMap: Record<string, string> = {
        'شقة': 'apartment', 'apartment': 'apartment',
        'فيلا': 'villa', 'villa': 'villa',
        'أرض': 'land', 'ارض': 'land', 'land': 'land',
        'مبنى': 'building', 'عمارة': 'building', 'building': 'building',
        'مكتب': 'office', 'office': 'office',
        'محل': 'showroom', 'showroom': 'showroom',
        'مستودع': 'warehouse', 'warehouse': 'warehouse',
        'مزرعة': 'farm', 'farm': 'farm',
        'other': 'other',
      };

      for (const row of rows) {
        const title = String(row['العنوان'] ?? row['title'] ?? '');
        if (!title) continue;
        const rawType = String(row['النوع'] ?? row['type'] ?? '').trim();
        const property_type = typeMap[rawType] ?? 'apartment';
        try {
          await db('properties').insert({
            title: title,
            title_ar: title,
            type: property_type,
            status: 'available',
            price: parseFloat(String(row['السعر'] ?? row['price'] ?? '0')) || 0,
            area: parseFloat(String(row['المساحة'] ?? row['area'] ?? '0')) || null,
            bedrooms: parseInt(String(row['الغرف'] ?? row['rooms'] ?? '0')) || null,
            bathrooms: parseInt(String(row['الحمامات'] ?? row['bathrooms'] ?? '0')) || null,
            city: riyadhCity?.name_ar ?? 'الرياض',
            description_ar: String(row['الوصف'] ?? row['description'] ?? ''),
            is_featured: false,
          });
          imported++;
        } catch (err: any) {
          console.error('[IMPORT] row error:', err?.message, JSON.stringify(row));
        }
      }
    }

    res.json({ success: true, data: { imported, total: rows.length }, message: `تم استيراد ${imported} من ${rows.length} سجل` });
  } catch (error) { next(error); }
});

// POST /api/sheets/import-properties (legacy CSV)
router.post('/import-properties', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { csvData } = req.body as { csvData?: string };
    if (!csvData) { res.json({ success: true, data: { imported: 0 }, message: 'أرسل البيانات في حقل csvData' }); return; }
    const db = getDatabase();
    const lines = csvData.trim().split('\n').slice(1);
    let imported = 0;
    const riyadhCity = await db('cities').where('name_ar', 'like', '%الرياض%').first();
    for (const line of lines) {
      const cols = line.split(',').map((c: string) => c.replace(/^"|"$/g, '').trim());
      if (!cols[0]) continue;
      try {
        await db('properties').insert({ title_ar: cols[0]??'', title_en: cols[1]??'', property_type: (cols[2]??'apartment') as any, price: parseFloat(cols[3]??'0')||0, city_id: riyadhCity?.id, area_sqm: parseFloat(cols[5]??'0')||null, rooms: parseInt(cols[6]??'0')||null, bathrooms: parseInt(cols[7]??'0')||null, status: (cols[8]??'available') as any, description_ar: cols[9]??'', listing_type: 'sale' }).onConflict().ignore();
        imported++;
      } catch { /* skip */ }
    }
    res.json({ success: true, data: { imported }, message: `تم استيراد ${imported} عقار` });
  } catch (error) { next(error); }
});

export default router;