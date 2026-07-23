import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDatabase } from '../database/connection.js';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { parseLatLngFromMapsUrl } from '../utils/geo.js';

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

    // Sheets often open with a merged title/subtitle before the real header row,
    // and sheet_to_json would otherwise treat that decoration as the headers.
    // Scan the first 20 rows for the one that looks like a header.
    const HEADER_HINTS = [
      'العنوان', 'النوع', 'نوع العقار', 'السعر', 'المساحة', 'الغرف', 'عدد الغرف',
      'الحي', 'المدينة', 'الحالة', 'حالة العقار', 'الإيجار', 'الكود', 'رقم العقار',
      'المطبخ', 'الصالة', 'المميزات',
      'الاسم', 'الجوال', 'البريد', 'الميزانية',
      'title', 'type', 'price', 'area', 'rooms', 'city', 'status', 'name', 'phone',
    ];
    // blankrows must stay true so matrix indices line up with real sheet rows,
    // which is what `range` below expects.
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });

    let headerRow = 0;
    let bestScore = 0;
    for (let i = 0; i < Math.min(matrix.length, 20); i++) {
      const cells = (matrix[i] ?? []).map((c) => String(c).trim());
      const score = cells.filter((c) => HEADER_HINTS.some((h) => c.includes(h))).length;
      if (score > bestScore) { bestScore = score; headerRow = i; }
    }
    if (bestScore < 2) {
      res.status(400).json({
        success: false,
        error: 'لم يتم العثور على صف رؤوس الأعمدة. تأكد أن الملف يحتوي أعمدة مثل: النوع، السعر، المساحة، الغرف',
      });
      return;
    }

    const rows: any[] = XLSX.utils.sheet_to_json(ws, {
      range: headerRow,
      defval: '',
      blankrows: false,
    });
    const db = getDatabase();
    let imported = 0;
    const failures: string[] = [];

    let skipped = 0;

    if (type === 'clients') {
      for (const row of rows) {
        const phone = String(row['الجوال'] ?? row['phone'] ?? row['Phone'] ?? '').replace(/\D/g, '');
        if (!phone) continue;
        try {
          const inserted = await db('clients').insert({
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
          }).onConflict('phone').ignore().returning('id');

          if (inserted.length > 0) imported++;
          else skipped++;   // already on file — not a failure, but not an import either
        } catch (err: any) {
          // A duplicate whatsapp_id reaches here rather than the onConflict
          // clause above, and is still just an existing client.
          if (err?.code === '23505') { skipped++; continue; }
          if (failures.length < 5) failures.push(`${phone}: ${err?.message ?? 'خطأ غير معروف'}`);
        }
      }
    } else {
      // The live database has drifted from the migration files — it carries columns
      // that neither 001 nor 002 defines (e.g. a NOT NULL `type`), added by hand.
      // So read the real column list and send only what actually exists, rather than
      // hardcoding a set that is wrong on one side or the other.
      const colRows = await db('information_schema.columns')
        .select('column_name', 'is_nullable', 'column_default')
        .where('table_name', 'properties')
        .andWhere('table_schema', db.raw('current_schema()'));
      const existingCols = new Set<string>(colRows.map((c: any) => c.column_name));

      // Columns the table insists on that we have no value for. Without this the
      // whole file fails with the same 23502 repeated once per row.
      const requiredCols = colRows
        .filter((c: any) => c.is_nullable === 'NO' && c.column_default === null)
        .map((c: any) => c.column_name as string);

      const typeMap: Record<string, string> = {
        'شقة': 'apartment', 'شقة سكنية': 'apartment', 'apartment': 'apartment',
        'فيلا': 'villa', 'villa': 'villa',
        'بيت': 'villa', 'بيت شعبي': 'villa',
        'أرض': 'land', 'ارض': 'land', 'land': 'land',
        'مبنى': 'building', 'عمارة': 'building', 'building': 'building',
        'مكتب': 'office', 'office': 'office',
        'محل': 'showroom', 'صالة': 'showroom', 'صالة تجارية': 'showroom', 'showroom': 'showroom',
        'مستودع': 'warehouse', 'warehouse': 'warehouse',
        'مزرعة': 'farm', 'استراحة': 'farm', 'farm': 'farm',
        'other': 'other',
      };

      const statusMap: Record<string, string> = {
        'متاحة': 'available', 'متاح': 'available', 'available': 'available',
        'مؤجر': 'rented', 'مؤجرة': 'rented', 'rented': 'rented',
        'مباع': 'sold', 'مباعة': 'sold', 'sold': 'sold',
        'محجوز': 'reserved', 'محجوزة': 'reserved', 'reserved': 'reserved',
      };

      const batchStamp = Date.now().toString(36).toUpperCase();
      let rowIndex = 1;

      for (const row of rows) {
        // Support multiple possible column names
        const rawType  = String(row['النوع'] ?? row['نوع العقار'] ?? row['type'] ?? '').trim();
        const district = String(row['الحي'] ?? row['district'] ?? '').trim();
        const cityName = String(row['المدينة'] ?? row['city'] ?? 'بريدة').trim() || 'بريدة';

        const explicitTitle = String(row['العنوان'] ?? row['title'] ?? '').trim();
        const title = explicitTitle || (rawType && district ? `${rawType} - ${district}` : rawType);
        if (!title) continue;
        // Skip summary/total rows that sit at the bottom of formatted sheets
        if (/الإجمالي|الاجمالي|المتوسط|total/i.test(title)) continue;

        const property_type = typeMap[rawType] ?? 'apartment';

        // Category for the bot's filtering. Prefer explicit columns; otherwise
        // read it out of the type text, which is where these sheets normally
        // record it ("شقة عزاب", "بيت مدخل خاص").
        const catText = `${rawType} ${String(row['الفئة'] ?? row['occupancy'] ?? '')}`.trim();
        const entText = `${rawType} ${String(row['المدخل'] ?? row['entrance'] ?? '')}`.trim();
        const occupancy_type =
          /عزاب|عزّاب|singles?/i.test(catText) ? 'singles'
          : /عوائل|عوايل|عائل|famil/i.test(catText) ? 'family'
          : null;
        const entrance_type =
          /مدخل\s*خاص|مستقل|private/i.test(entText) ? 'private'
          : /مدخل\s*مشترك|shared/i.test(entText) ? 'shared'
          : null;

        const rawStatus = String(row['الحالة'] ?? row['حالة العقار'] ?? row['status'] ?? 'متاحة').trim();
        const status = statusMap[rawStatus] ?? 'available';

        // Explicit الغرض column wins; otherwise infer from a rent-named price column
        const rawPurpose = String(row['الغرض'] ?? row['purpose'] ?? '').trim();
        const hasRentCol = 'الإيجار السنوي (ر.س)' in row || 'الإيجار السنوي' in row || 'الإيجار' in row;
        const purpose = /إيجار|ايجار|rent/i.test(rawPurpose)
          ? 'rent'
          : /بيع|sale/i.test(rawPurpose)
            ? 'sale'
            : (hasRentCol ? 'rent' : 'sale');

        const price = parseFloat(String(
          row['السعر'] ?? row['الإيجار السنوي (ر.س)'] ?? row['الإيجار السنوي'] ??
          row['الإيجار'] ?? row['price'] ?? '0'
        ).replace(/,/g, '')) || 0;

        const area = parseFloat(String(
          row['المساحة'] ?? row['المساحة (م²)'] ?? row['area'] ?? '0'
        ).replace(/,/g, '')) || null;

        const rooms = parseInt(String(row['الغرف'] ?? row['عدد الغرف'] ?? row['rooms'] ?? '0')) || null;
        const bathrooms = parseInt(String(row['الحمامات'] ?? row['bathrooms'] ?? '0')) || null;
        const kitchens = parseInt(String(row['المطبخ'] ?? row['عدد المطابخ'] ?? row['kitchens'] ?? '0')) || null;
        const living_rooms = parseInt(String(row['الصالة'] ?? row['عدد الصالات'] ?? row['living_rooms'] ?? '0')) || null;

        const rawFeatures = String(row['المميزات'] ?? row['features'] ?? '').trim();
        const features = rawFeatures ? rawFeatures.split(/[,،|]/).map((f) => f.trim()).filter(Boolean) : [];

        const google_maps_url = String(row['الموقع'] ?? row['رابط الموقع'] ?? row['الخريطة'] ?? row['google_maps_url'] ?? '').trim() || null;
        const coords = parseLatLngFromMapsUrl(google_maps_url);

        // floor_number is INTEGER — map Arabic ordinals, ignore non-numeric ("أرضي+علوي")
        const rawFloor = String(row['الدور'] ?? row['floor'] ?? '').trim();
        const floorMap: Record<string, number> = {
          'الأرضي': 0, 'أرضي': 0, 'الارضي': 0, 'ارضي': 0,
          'الأول': 1, 'الاول': 1, 'الثاني': 2, 'الثالث': 3,
          'الرابع': 4, 'الخامس': 5, 'دور واحد': 1,
        };
        const floor_number = floorMap[rawFloor] ?? (parseInt(rawFloor) || null);

        const notes = String(row['ملاحظات'] ?? row['الوصف'] ?? row['description'] ?? '').trim();
        // Keep the sheet's floor/district text in the description so nothing is lost
        const descParts = [notes, rawFloor ? `الدور: ${rawFloor}` : '', district ? `الحي: ${district}` : ''];
        const description_ar = descParts.filter(Boolean).join(' | ');

        // Resolve city
        let cityRow = await db('cities').where('name_ar', 'like', `%${cityName}%`).first();
        if (!cityRow) cityRow = await db('cities').where('name_ar', 'like', '%بريدة%').first();
        if (!cityRow) cityRow = await db('cities').where('name_ar', 'like', '%الرياض%').first();

        // Resolve district
        let districtRow = null;
        if (district && cityRow) {
          districtRow = await db('districts')
            .where('city_id', cityRow.id)
            .where('name_ar', 'like', `%${district.replace('حي ', '')}%`)
            .first();
        }

        // 002_reconcile_existing_db.sql adds `code` with no generating trigger, so it
        // must be supplied here or the listing ends up with no code at all.
        const sheetCode = String(row['الكود'] ?? row['رقم العقار'] ?? row['code'] ?? '').trim();
        const code = (sheetCode || `IMP-${batchStamp}-${rowIndex}`).slice(0, 50);
        rowIndex++;

        // Superset of every spelling this table has carried. Legacy duplicates
        // (type/area/bedrooms/city/listing_type) are filled too, because some are
        // NOT NULL on the live database; unknown ones are dropped below.
        const candidate: Record<string, any> = {
          code,
          title,
          title_ar: title,
          title_en: title,
          property_type,
          type: property_type,
          purpose,
          listing_type: purpose,
          status,
          city_id: cityRow?.id ?? null,
          city: cityRow?.name_ar ?? cityName,
          district_id: districtRow?.id ?? null,
          district: district || null,
          area_sqm: area,
          area,
          rooms,
          bedrooms: rooms,
          bathrooms,
          kitchens,
          living_rooms,
          // JSONB column — a bare JS array sent through node-postgres is read
          // as a Postgres array literal, not JSON, and the jsonb column rejects it.
          features: JSON.stringify(features),
          google_maps_url,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          floor_number,
          price,
          occupancy_type,
          entrance_type,
          currency: 'SAR',
          negotiable: true,
          description_ar,
          description: description_ar,
          is_featured: false,
          inquiry_count: 0,
          view_count: 0,
        };

        const payload: Record<string, any> = {};
        for (const [k, v] of Object.entries(candidate)) {
          if (existingCols.has(k)) payload[k] = v;
        }

        const missingRequired = requiredCols.filter(
          (c) => !(c in payload) || payload[c] === null || payload[c] === undefined
        );
        if (missingRequired.length) {
          if (failures.length < 5) {
            failures.push(`${title}: عمود إلزامي بلا قيمة في القاعدة: ${missingRequired.join(', ')}`);
          }
          continue;
        }

        try {
          await db('properties').insert(payload);
          imported++;
        } catch (err: any) {
          console.error('[IMPORT] row error:', err?.message, JSON.stringify(row));
          if (failures.length < 5) failures.push(`${title}: ${err?.message ?? 'خطأ غير معروف'}`);
        }
      }
    }

    // Surface why rows were rejected — a silent "0 imported" hides the real cause.
    const parts = [`تم استيراد ${imported} من ${rows.length} سجل`];
    if (skipped) parts.push(`${skipped} سجل موجود مسبقاً (تم تخطيه)`);
    if (failures.length) parts.push(`سبب الفشل: ${failures.join(' | ')}`);
    res.json({
      success: true,
      data: { imported, skipped, total: rows.length, failures },
      message: parts.join('. '),
    });
  } catch (error) { next(error); }
});

// POST /api/sheets/import-properties (retired)
//
// This accepted raw CSV and split each line on ',', so any quoted field
// containing a comma — descriptions routinely do — shifted every subsequent
// column and wrote corrupted rows. It also inserted a hardcoded column set the
// live schema has since drifted away from, and counted rows skipped by
// onConflict().ignore() as successful imports.
//
// /upload-excel supersedes it: it detects the header row, adapts to the actual
// table columns, and reports per-row failures. Returning an explicit error is
// safer than leaving a path that quietly corrupts a client's data.
router.post('/import-properties', async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({
    success: false,
    error: 'هذه الطريقة لم تعد مدعومة. استخدم رفع ملف Excel من صفحة الاستيراد.',
  });
});

export default router;