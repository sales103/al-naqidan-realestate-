import { getDatabase } from '../database/connection.js';
import { cacheGet, cacheSet, cacheDel, cacheKeys } from '../database/redis.js';
import { logger } from '../config/logger.js';
import type {
  Property,
  PropertySearchParams,
  PropertySearchResult,
  PropertyMedia,
} from '../types/index.js';
import crypto from 'crypto';

// =============================================================================
// Property Service
// =============================================================================

export class PropertyService {
  private get db() { return getDatabase(); }

  // The live database has repeatedly drifted from the migration files (columns
  // added by hand, or a migration written but not yet run — see kitchens/
  // living_rooms). Writing an unknown column raises 42703 and aborts the whole
  // request, so filter the payload down to columns that actually exist first.
  private async existingColumns(): Promise<Set<string>> {
    const rows = await this.db('information_schema.columns')
      .select('column_name')
      .where('table_name', 'properties')
      .andWhere('table_schema', this.db.raw('current_schema()'));
    return new Set(rows.map((r: any) => r.column_name));
  }

  private async filterToExistingColumns<T extends Record<string, any>>(data: T): Promise<Partial<T>> {
    const cols = await this.existingColumns();
    return Object.fromEntries(Object.entries(data).filter(([k]) => cols.has(k))) as Partial<T>;
  }

  async search(params: PropertySearchParams): Promise<PropertySearchResult> {
    const cacheKey = cacheKeys.propertySearch(
      crypto.createHash('md5').update(JSON.stringify(params)).digest('hex')
    );

    const cached = await cacheGet<PropertySearchResult>(cacheKey);
    if (cached) return cached;

    const query = this.db('properties as p')
      .leftJoin('cities as c', 'p.city_id', 'c.id')
      .leftJoin('districts as d', 'p.district_id', 'd.id')
      .leftJoin('users as u', 'p.assigned_agent_id', 'u.id')
      .select(
        'p.*',
        'c.name_ar as city_name',
        'd.name_ar as district_name',
        'u.full_name_ar as agent_name'
      )
      .where('p.status', 'available');

    if (params.property_type) query.where('p.property_type', params.property_type);
    if (params.city_ids?.length) query.whereIn('p.city_id', params.city_ids);
    if (params.district_ids?.length) query.whereIn('p.district_id', params.district_ids);
    if (params.purpose) query.where('p.purpose', params.purpose);
    if (params.price_min !== undefined) query.where('p.price', '>=', params.price_min);
    if (params.price_max !== undefined) query.where('p.price', '<=', params.price_max);
    if (params.area_min !== undefined) query.where('p.area_sqm', '>=', params.area_min);
    if (params.area_max !== undefined) query.where('p.area_sqm', '<=', params.area_max);
    if (params.rooms !== undefined) query.where('p.rooms', '>=', params.rooms);

    // Count total
    const countQuery = query.clone().clearSelect().count('p.id as count');
    const [{ count }] = await countQuery as any[];
    const total = parseInt(count, 10);

    // Apply sorting
    switch (params.sort_by) {
      case 'price_asc': query.orderBy('p.price', 'asc'); break;
      case 'price_desc': query.orderBy('p.price', 'desc'); break;
      case 'area_asc': query.orderBy('p.area_sqm', 'asc'); break;
      case 'newest': query.orderBy('p.created_at', 'desc'); break;
      case 'featured': default:
        query.orderByRaw('p.is_featured DESC, p.inquiry_count DESC, p.created_at DESC');
    }

    // Pagination
    const limit = params.limit ?? 10;
    const offset = params.offset ?? 0;
    query.limit(limit).offset(offset);

    const properties = await query as Property[];

    // Enrich with media
    const propertyIds = properties.map((p) => p.id);
    if (propertyIds.length > 0) {
      const media = await this.db('property_media')
        .whereIn('property_id', propertyIds)
        .orderBy(['property_id', 'sort_order']) as PropertyMedia[];

      const mediaMap = media.reduce<Record<string, PropertyMedia[]>>((acc, m) => {
        if (!acc[m.property_id]) acc[m.property_id] = [];
        acc[m.property_id]!.push(m);
        return acc;
      }, {});

      properties.forEach((p) => { p.media = mediaMap[p.id] ?? []; });
    }

    // Find alternatives if no results
    let alternatives: Property[] | undefined;
    if (properties.length === 0 && (params.price_max || params.property_type)) {
      alternatives = await this.findAlternatives(params);
    }

    const result: PropertySearchResult = { properties, total, alternatives, search_params: params };
    await cacheSet(cacheKey, result, 300); // 5 min cache

    return result;
  }

  async findAlternatives(params: PropertySearchParams): Promise<Property[]> {
    const relaxedParams: PropertySearchParams = {
      ...params,
      price_max: params.price_max ? params.price_max * 1.3 : undefined,
      city_ids: undefined, // expand city search
      limit: 3,
    };
    const result = await this.search(relaxedParams);
    return result.properties;
  }

  async findById(id: string): Promise<Property | null> {
    const cached = await cacheGet<Property>(cacheKeys.propertyDetail(id));
    if (cached) return cached;

    const property = await this.db('properties as p')
      .leftJoin('cities as c', 'p.city_id', 'c.id')
      .leftJoin('districts as d', 'p.district_id', 'd.id')
      .leftJoin('users as u', 'p.assigned_agent_id', 'u.id')
      .select('p.*', 'c.name_ar as city_name', 'd.name_ar as district_name', 'u.full_name_ar as agent_name')
      .where('p.id', id)
      .first() as Property | undefined;

    if (!property) return null;

    property.media = await this.db('property_media')
      .where('property_id', id)
      .orderBy('sort_order') as PropertyMedia[];

    await cacheSet(cacheKeys.propertyDetail(id), property, 600);
    return property;
  }

  async findByCode(code: string): Promise<Property | null> {
    const property = await this.db('properties as p')
      .leftJoin('cities as c', 'p.city_id', 'c.id')
      .leftJoin('districts as d', 'p.district_id', 'd.id')
      .select('p.*', 'c.name_ar as city_name', 'd.name_ar as district_name')
      .whereRaw('UPPER(p.code) = UPPER(?)', [code])
      .first() as Property | undefined;

    return property ?? null;
  }

  // features/amenities/nearby_places are JSONB — node-postgres sends a bare JS
  // array as a Postgres array literal, not JSON, which the jsonb column then
  // rejects. `tags` is a real TEXT[] column and must stay a plain array.
  private static readonly JSONB_ARRAY_COLUMNS = ['features', 'amenities', 'nearby_places'];

  private stringifyJsonbArrays<T extends Record<string, any>>(data: T): T {
    const out: Record<string, any> = { ...data };
    for (const col of PropertyService.JSONB_ARRAY_COLUMNS) {
      if (Array.isArray(out[col])) out[col] = JSON.stringify(out[col]);
    }
    return out as T;
  }

  async create(data: Omit<Property, 'id' | 'code' | 'created_at' | 'updated_at' | 'view_count' | 'inquiry_count'>): Promise<Property> {
    const payload = await this.filterToExistingColumns(this.stringifyJsonbArrays(data));
    const [property] = await this.db('properties').insert(payload).returning('*') as Property[];
    if (!property) throw new Error('Failed to create property');
    await cacheDel(cacheKeys.dashboardStats());
    return property;
  }

  async update(id: string, data: Partial<Property>): Promise<Property> {
    const payload = await this.filterToExistingColumns(this.stringifyJsonbArrays({ ...data, updated_at: new Date() }));
    const [property] = await this.db('properties')
      .where('id', id)
      .update(payload)
      .returning('*') as Property[];
    if (!property) throw new Error('Property not found');
    await cacheDel(cacheKeys.propertyDetail(id));
    return property;
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.db('properties').where('id', id).increment('view_count', 1);
  }

  async incrementInquiryCount(id: string): Promise<void> {
    await this.db('properties').where('id', id).increment('inquiry_count', 1);
  }

  async searchByText(text: string, limit = 5): Promise<Property[]> {
    return this.db('properties as p')
      .leftJoin('cities as c', 'p.city_id', 'c.id')
      .leftJoin('districts as d', 'p.district_id', 'd.id')
      .select('p.*', 'c.name_ar as city_name', 'd.name_ar as district_name')
      .where('p.status', 'available')
      .whereRaw(
        `to_tsvector('arabic', coalesce(p.title_ar,'') || ' ' || coalesce(p.description_ar,'')) @@ plainto_tsquery('arabic', ?)`,
        [text]
      )
      .orWhere('p.title_ar', 'ilike', `%${text}%`)
      .orWhere('p.code', 'ilike', `%${text}%`)
      .orderByRaw('p.is_featured DESC')
      .limit(limit) as unknown as Property[];
  }

  async getCities(): Promise<{ id: number; name_ar: string; name_en: string }[]> {
    const cached = await cacheGet<{ id: number; name_ar: string; name_en: string }[]>(cacheKeys.cityList());
    if (cached) return cached;

    const cities = await this.db('cities').where('is_active', true).orderBy('name_ar');
    await cacheSet(cacheKeys.cityList(), cities, 3600);
    return cities;
  }

  async getDistricts(cityId: number): Promise<{ id: number; name_ar: string; direction?: string }[]> {
    return this.db('districts').where({ city_id: cityId, is_active: true }).orderBy('name_ar');
  }

  async resolveCityId(cityName: string): Promise<number | undefined> {
    const city = await this.db('cities')
      .where('is_active', true)
      .whereRaw('name_ar ILIKE ?', [`%${cityName}%`])
      .orWhereRaw('name_en ILIKE ?', [`%${cityName}%`])
      .first();
    return city?.id;
  }

  async resolveDistrictId(districtName: string, cityId?: number): Promise<number | undefined> {
    const query = this.db('districts')
      .where('is_active', true)
      .whereRaw('name_ar ILIKE ?', [`%${districtName}%`]);
    if (cityId) query.where('city_id', cityId);
    const district = await query.first();
    return district?.id;
  }

  async getStats(): Promise<{
    total: number;
    available: number;
    reserved: number;
    sold: number;
    by_type: Record<string, number>;
  }> {
    const [totals] = await this.db('properties')
      .select(
        this.db.raw('COUNT(*) as total'),
        this.db.raw("COUNT(*) FILTER (WHERE status = 'available') as available"),
        this.db.raw("COUNT(*) FILTER (WHERE status = 'reserved') as reserved"),
        this.db.raw("COUNT(*) FILTER (WHERE status = 'sold') as sold")
      ) as any[];

    const byType = await this.db('properties')
      .select('property_type')
      .count('id as count')
      .groupBy('property_type') as { property_type: string; count: string }[];

    return {
      total: parseInt(totals.total, 10),
      available: parseInt(totals.available, 10),
      reserved: parseInt(totals.reserved, 10),
      sold: parseInt(totals.sold, 10),
      by_type: Object.fromEntries(byType.map((r) => [r.property_type, parseInt(r.count, 10)])),
    };
  }
}

export const propertyService = new PropertyService();
