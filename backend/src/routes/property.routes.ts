import { Router } from 'express';
import {
  searchProperties, getProperty, createProperty,
  updateProperty, deleteProperty, getPropertyStats, getCities, getDistricts,
  createCity, createDistrict,
} from '../controllers/property.controller.js';
import { authenticate, authorize, pagination } from '../middleware/auth.middleware.js';

const router = Router();

const MANAGE_ROLES = ['super_admin', 'admin', 'sales_manager'] as const;

router.get('/', pagination, searchProperties);
router.get('/stats', authenticate, getPropertyStats);
router.get('/cities', getCities);
router.post('/cities', authenticate, authorize(...MANAGE_ROLES), createCity);
router.get('/cities/:cityId/districts', getDistricts);
router.post('/cities/:cityId/districts', authenticate, authorize(...MANAGE_ROLES), createDistrict);
router.get('/:id', getProperty);
router.post('/', authenticate, authorize('super_admin','admin','sales_manager','sales_agent'), createProperty);
router.put('/:id', authenticate, authorize('super_admin','admin','sales_manager','sales_agent'), updateProperty);
router.delete('/:id', authenticate, authorize('super_admin','admin','sales_manager'), deleteProperty);

export default router;
