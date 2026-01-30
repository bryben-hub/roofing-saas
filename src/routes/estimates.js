const express = require('express');
const router = express.Router();
const db = require('../config/database');
const estimatorService = require('../services/estimator');

// GET /api/v1/estimates
router.get('/', async (req, res, next) => {
  try {
    const { job_id } = req.query;
    let query = 'SELECT e.*, j.job_number, j.property_address_line1, c.first_name as customer_first_name, c.last_name as customer_last_name FROM estimates e JOIN jobs j ON e.job_id = j.id LEFT JOIN customers c ON j.customer_id = c.id WHERE j.org_id = $1';
    const params = [req.user.org_id];

    if (job_id) {
      query += ' AND e.job_id = $2';
      params.push(job_id);
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/estimates/:id
router.get('/:id', async (req, res, next) => {
  try {
    const estimateResult = await db.query(
      'SELECT e.*, j.job_number, j.property_address_line1, j.property_city, j.property_state, j.claim_number, j.deductible, c.first_name as customer_first_name, c.last_name as customer_last_name, c.email as customer_email, c.phone as customer_phone FROM estimates e JOIN jobs j ON e.job_id = j.id LEFT JOIN customers c ON j.customer_id = c.id WHERE e.id = $1 AND j.org_id = $2',
      [req.params.id, req.user.org_id]
    );

    if (estimateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    const lineItemsResult = await db.query('SELECT * FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order, created_at', [req.params.id]);

    res.json({
      ...estimateResult.rows[0],
      line_items: lineItemsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/estimates/generate/:jobId
router.post('/generate/:jobId', async (req, res, next) => {
  try {
    const jobId = req.params.jobId;
    const { name, estimate_type } = req.body;

    const jobCheck = await db.query('SELECT id, deductible FROM jobs WHERE id = $1 AND org_id = $2', [jobId, req.user.org_id]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const generated = await estimatorService.generateEstimate(jobId, req.user.org_id);

    const versionResult = await db.query('SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM estimates WHERE job_id = $1', [jobId]);
    const version = versionResult.rows[0].next_version;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const estimateResult = await client.query(
        "INSERT INTO estimates (job_id, version, name, estimate_type, subtotal, total, deductible, status, created_by_id) VALUES ($1, $2, $3, $4, $5, $5, $6, 'draft', $7) RETURNING *",
        [jobId, version, name || 'Estimate v' + version, estimate_type || 'standard', generated.subtotal, jobCheck.rows[0].deductible || 0, req.user.id]
      );

      const estimate = estimateResult.rows[0];

      for (const item of generated.line_items) {
        await client.query(
          'INSERT INTO estimate_line_items (estimate_id, description, category, quantity, unit, unit_price, total_price, section, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [estimate.id, item.description, item.category, item.quantity, item.unit, item.unit_price, item.total_price, item.section, item.sort_order]
        );
      }

      await client.query("UPDATE jobs SET total_estimate = $1, status = CASE WHEN status IN ('lead', 'measuring') THEN 'estimating' ELSE status END, updated_at = NOW() WHERE id = $2", [generated.subtotal, jobId]);

      await client.query('COMMIT');

      res.status(201).json({
        estimate: estimate,
        line_items: generated.line_items,
        summary: generated.summary
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/estimates/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, status, deductible } = req.body;

    const result = await db.query(
      'UPDATE estimates SET name = COALESCE($1, name), status = COALESCE($2, status), deductible = COALESCE($3, deductible), updated_at = NOW() WHERE id = $4 AND job_id IN (SELECT id FROM jobs WHERE org_id = $5) RETURNING *',
      [name, status, deductible, req.params.id, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
