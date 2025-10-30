import pool from '../config/dbconn.js';

/**
 * Create a new report
 */
export const createReport = async (req, res) => {
  try {
    const { targetId, targetType, reason, description } = req.body;
    
    // Validate required fields
    if (!targetId || !targetType || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: targetId, targetType, and reason are required'
      });
    }
    
    // Get reporter ID from session or authenticated user
    const reporterId = req.user?.username || 'anonymous';
    
    // Insert report into database
    const query = `
      INSERT INTO reports (reporter_id, report_type, target_id, reason, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING report_id, created_at
    `;
    
    const values = [reporterId, targetType, targetId, reason, description];
    const result = await pool.query(query, values);
    
    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      data: {
        reportId: result.rows[0].report_id,
        createdAt: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit report. Please try again later.'
    });
  }
};

/**
 * Get all reports (admin only)
 */
export const getAllReports = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    const query = `
      SELECT r.*, u.display_name as reporter_name
      FROM reports r
      LEFT JOIN users u ON r.reporter_id = u.username
      ORDER BY r.created_at DESC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reports'
    });
  }
};

/**
 * Update report status (admin only)
 */
export const updateReportStatus = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    const { reportId } = req.params;
    const { status, reviewNotes } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: pending, reviewed, resolved, dismissed'
      });
    }
    
    const query = `
      UPDATE reports 
      SET status = $1, review_notes = $2, reviewed_by = $3, updated_at = CURRENT_TIMESTAMP
      WHERE report_id = $4
      RETURNING *
    `;
    
    const values = [status, reviewNotes || null, req.user.username, reportId];
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Report status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update report status'
    });
  }
};

export default {
  createReport,
  getAllReports,
  updateReportStatus
};