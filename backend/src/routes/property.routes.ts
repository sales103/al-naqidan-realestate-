import { Router } from 'express';
import {
  searchProperties, getProperty, createProperty,
  updateProperty, deleteProperty, getPropertyStats, getCities, getDistricts,
} from '../controllers/property.controller.js';
import { authenticate, authorize, pagination } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', pagination, searchProperties);
router.get('/stats', authenticate, getPropertyStats);
router.get('/cities', getCities);
router.get('/cities/:cityId/districts', getDistricts);
router.get('/:id', getProperty);
router.post('/', authenticate, authorize('super_admin','admin','sales_manager','sales_agent'), createProperty);
router.put('/:id', authenticate, authorize('super_admin','admin','sales_manager','sales_agent'), updateProperty);
router.delete('/:id', authenticate, authorize('super_admin','admin','sales_manager'), deleteProperty);

export default router;
