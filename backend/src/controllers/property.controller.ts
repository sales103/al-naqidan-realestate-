import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { propertyService } from '../services/property.service.js';
import { AppError } from '../middleware/error.middleware.js';
import type { PropertySearchParams } from '../types/index.js';

const searchSchema = z.object({
  property_type: z.enum(['land','apartment','villa','building','office','showroom','warehouse','farm','investment_project','other']).optional(),
  city_id: z.coerce.number().optional(),
  district_id: z.coerce.number().optional(),
  price_min: z.coerce.number().min(0).optional(),
  price_max: z.coerce.number().min(0).optional(),
  area_min: z.coerce.number().min(0).optional(),
  area_max: z.coerce.number().min(0).optional(),
  rooms: z.coerce.number().min(0).optional(),
  purpose: z.enum(['sale','rent','both']).optional(),
  sort_by: z.enum(['price_asc','price_desc','newest','area_asc','featured']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

const createSchema = z.object({
  title: z.string().min(3),
  title_ar: z.string().optional(),
  description: z.string().optional(),
  description_ar: z.string().optional(),
  property_type: z.enum(['land','apartment','villa','building','office','showroom','warehouse','farm','investment_project','other']),
  purpose: z.enum(['sale','rent','both']).default('sale'),
  status: z.enum(['available','reserved','sold','rented','under_maintenance','coming_soon','hidden']).default('available'),
  city_id: z.number().optional(),
  district_id: z.number().optional(),
  address: z.string().optional(),
  google_maps_url: z.string().url().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  area_sqm: z.number().positive().optional(),
  rooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  floor_number: z.number().int().optional(),
  total_floors: z.number().int().optional(),
  parking_spaces: z.number().int().min(0).optional(),
  age_years: z.number().int().min(0).optional(),
  price: z.number().positive().optional(),
  negotiable: z.boolean().default(true),
  features: z.array(z.string()).default([]),
  amenities: z.array(z.string()).default([]),
  owner_id: z.string().uuid().optional(),
  assigned_agent_id: z.string().uuid().optional(),
  commission_percentage: z.number().min(0).max(100).optional(),
  is_featured: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  available_from: z.string().optional(),
});

export const searchProperties = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = searchSchema.parse(req.query);
    const searchParams: PropertySearchParams = {
      property_type: params.property_type,
      city_ids: params.city_id ? [params.city_id] : undefined,
      district_ids: params.district_id ? [params.district_id] : undefined,
      price_min: params.price_min,
      price_max: params.price_max,
      area_min: params.area_min,
      area_max: params.area_max,
      rooms: params.rooms,
      purpose: params.purpose,
      sort_by: params.sort_by,
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
    };

    const result = await propertyService.search(searchParams);

    res.json({
      success: true,
      data: result.properties,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: result.total,
        total_pages: Math.ceil(result.total / params.limit),
      },
      alternatives: result.alternatives,
    });
  } catch (error) { next(error); }
};

export const getProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const property = await propertyService.findById(req.params['id']!);
    if (!property) throw new AppError(404, 'العقار غير موجود');
    await propertyService.incrementViewCount(property.id);
    res.json({ success: true, data: property });
  } catch (error) { next(error); }
};

export const createProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createSchema.parse(req.body);
    const property = await propertyService.create({
      ...data,
      created_by: req.user!.user_id,
      currency: 'SAR',
      is_featured: data.is_featured,
      negotiable: data.negotiable,
      features: data.features,
      amenities: data.amenities,
      nearby_places: [],
      tags: data.tags,
    } as any);

    res.status(201).json({ success: true, data: property });
  } catch (error) { next(error); }
};

export const updateProperty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = createSchema.partial().parse(req.body);
    const property = await propertyService.update(req.params['id']!, data as any);
    res.json({ success: true, data: property });
  } catch (error) { next(error); }
};

export const getPropertyStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await propertyService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const getCities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cities = await propertyService.getCities();
    res.json({ success: true, data: cities });
  } catch (error) { next(error); }
};

export const getDistricts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const districts = await propertyService.getDistricts(parseInt(req.params['cityId']!));
    res.json({ success: true, data: districts });
  } catch (error) { next(error); }
};
