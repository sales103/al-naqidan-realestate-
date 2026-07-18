#!/usr/bin/env ts-node
/**
 * سكريبت استيراد العقارات من ملف Excel/CSV
 * الاستخدام: ts-node scripts/import-properties.ts --file properties.csv
 */

import fs from 'fs';
import path from 'path';
import csv from 'csv-parse/sync';
import { initDatabase, getDatabase, closeDatabase } from '../backend/src/database/connection.js';

interface PropertyRow {
  title_ar: string;
  property_type: string;
  purpose: string;
  city: string;
  district: string;
  address: string;
  area_sqm: string;
  rooms: string;
  bathrooms: string;
  price: string;
  description_ar: string;
  google_maps_url: string;
  latitude: string;
  longitude: string;
  features: string;
  tags: string;
  owner_name: string;
  owner_phone: string;
  commission_percentage: string;
}

const propertyTypeMap: Record<string, string> = {
  'أرض': 'land', 'land': 'land',
  'شقة': 'apartment', 'apartment': 'apartment',
  'فيلا': 'villa', 'villa': 'villa',
  'عمارة': 'building', 'building': 'building',
  'مكتب': 'office', 'office': 'office',
  'معرض': 'showroom', 'showroom': 'showroom',
  'مستودع': 'warehouse', 'warehouse': 'warehouse',
  'مزرعة': 'farm', 'farm': 'farm',
  'مشروع استثماري': 'investment_project', 'investment_project': 'investment_project',
};

async function importProperties(filePath: string): Promise<void> {
  console.log(`📂 Importing from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  await initDatabase();
  const db = getDatabase();

  const content = fs.readFileSync(filePath, 'utf-8');
  const records: PropertyRow[] = csv.parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    encoding: 'utf8',
  });

  console.log(`📊 Found ${records.length} records to import`);

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    try {
      // Resolve city
      const city = await db('cities').whereILike('name_ar', `%${row.city}%`).first();
      const cityId = city?.id;

      // Resolve district
      let districtId: number | undefined;
      if (row.district && cityId) {
        const district = await db('districts').where('city_id', cityId).whereILike('name_ar', `%${row.district}%`).first();
        districtId = district?.id;
      }

      // Handle owner
      let ownerId: string | undefined;
      if (row.owner_name && row.owner_phone) {
        const existingOwner = await db('property_owners').where('phone', row.owner_phone).first();
        if (existingOwner) {
          ownerId = existingOwner.id;
        } else {
          const [owner] = await db('property_owners').insert({
            full_name: row.owner_name,
            phone: row.owner_phone,
          }).returning('id');
          ownerId = owner?.id;
        }
      }

      const features = row.features ? row.features.split(',').map((f) => f.trim()).filter(Boolean) : [];
      const tags = row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const propertyType = propertyTypeMap[row.property_type] ?? 'other';

      await db('properties').insert({
        title: row.title_ar,
        title_ar: row.title_ar,
        description_ar: row.description_ar || null,
        property_type: propertyType,
        purpose: row.purpose === 'إيجار' ? 'rent' : 'sale',
        status: 'available',
        city_id: cityId || null,
        district_id: districtId || null,
        address: row.address || null,
        google_maps_url: row.google_maps_url || null,
        latitude: row.latitude ? parseFloat(row.latitude) : null,
        longitude: row.longitude ? parseFloat(row.longitude) : null,
        area_sqm: row.area_sqm ? parseFloat(row.area_sqm) : null,
        rooms: row.rooms ? parseInt(row.rooms, 10) : null,
        bathrooms: row.bathrooms ? parseInt(row.bathrooms, 10) : null,
        price: row.price ? parseFloat(row.price) : null,
        features: JSON.stringify(features),
        amenities: JSON.stringify([]),
        nearby_places: JSON.stringify([]),
        tags,
        owner_id: ownerId || null,
        commission_percentage: row.commission_percentage ? parseFloat(row.commission_percentage) : null,
        negotiable: true,
        currency: 'SAR',
        is_featured: false,
      });

      success++;
      if (i % 10 === 0) console.log(`✅ Imported ${success}/${records.length}...`);
    } catch (error: any) {
      failed++;
      errors.push(`Row ${i + 2}: ${row.title_ar} - ${error.message}`);
    }
  }

  console.log(`\n📈 Import Complete:`);
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('\n⚠️  Errors:');
    errors.forEach((e) => console.log(`  - ${e}`));
  }

  await closeDatabase();
}

// CSV Template generator
async function generateTemplate(): Promise<void> {
  const template = [
    'title_ar,property_type,purpose,city,district,address,area_sqm,rooms,bathrooms,price,description_ar,google_maps_url,latitude,longitude,features,tags,owner_name,owner_phone,commission_percentage',
    'شقة فاخرة في الملقا,شقة,بيع,الرياض,الملقا,حي الملقا شارع الأمير محمد,180,4,3,1200000,شقة فاخرة بإطلالة مميزة,,24.7136,46.6753,"مسبح,موقف سيارات,حديقة","فاخر,مميز",محمد العتيبي,+966500000001,2.5',
    'أرض تجارية,أرض,بيع,جدة,الزهراء,حي الزهراء,1000,,,2500000,أرض تجارية في موقع مميز,,21.5433,39.1728,"واجهتان,ركنية","تجاري,مميز",خالد الشمري,+966500000002,3',
  ].join('\n');

  fs.writeFileSync('properties-template.csv', template, 'utf-8');
  console.log('✅ Template generated: properties-template.csv');
}

const args = process.argv.slice(2);
if (args.includes('--template')) {
  generateTemplate();
} else {
  const fileIndex = args.indexOf('--file');
  const filePath = fileIndex !== -1 ? args[fileIndex + 1] : args[0];
  if (!filePath) {
    console.error('Usage: ts-node import-properties.ts --file <path.csv>');
    console.error('       ts-node import-properties.ts --template');
    process.exit(1);
  }
  importProperties(filePath).catch(console.error);
}
