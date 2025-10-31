import express from 'express';
import reportsController from '../controllers/reports.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = express.Router();

// POST /api/reports - Create a new report
router.post('/reports', authenticate, reportsController.createReport);

// GET /api/reports - Get all reports (admin only)
router.get('/reports', authenticate, reportsController.getAllReports);

// PUT /api/reports/:reportId - Update report status (admin only)
router.put('/reports/:reportId', authenticate, reportsController.updateReportStatus);

export default router;