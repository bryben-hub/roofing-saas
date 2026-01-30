const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

const toNum = (val) => (val === '' || val === null || val === undefined) ? null : Number(val);
const toInt = (val) => (val === '' || val === null || val === undefined) ? null : parseInt(val, 10);

// GET /api/v1/jobs
router.get('/', async (req, res, next) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT j.*, c.first_name as customer_first_name, c.last_name as customer_last_name, c.phone as customer_phone, c.email as customer_email FROM jobs j LEFT JOIN customers c ON j.customer_id = c.id WHERE j.org_id = $1';
    const params = [req.user.org_id];

    if (status && status !== 'all') {
      if (status === 'active') {
        query += " AND j.status NOT IN ('complete', 'cancelled')";
      } else {
        params.push(status);
        query += ' AND j.status = $' + params.length;
      }
    }

    if (search) {
      params.push('%' + search + '%');
      query += ' AND (j.job_number ILIKE $' + params.length + ' OR j.property_address_line1 ILIKE $' + params.length + ' OR c.first_name ILIKE $' + params.length + ' OR c.last_name ILIKE $' + params.length + ')';
    }

    params.push(limit);
    query += ' ORDER BY j.created_at DESC LIMIT $' + params.length;
    params.push(offset);
    query += ' OFFSET $' + params.length;

    const result = await db.query(query, params);
    res.json({ jobs: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/jobs/:id
router.get('/:id', async (req, res, next) => {
  try {
    const jobResult = await db.query(
      'SELECT j.*, c.first_name as customer_first_name, c.last_name as customer_last_name, c.phone as customer_phone, c.email as customer_email, c.address_line1 as customer_address FROM jobs j LEFT JOIN customers c ON j.customer_id = c.id WHERE j.id = $1 AND j.org_id = $2',
      [req.params.id, req.user.org_id]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    const measurementsResult = await db.query('SELECT * FROM job_measurements WHERE job_id = $1', [req.params.id]);
    job.measurements = measurementsResult.rows[0] || null;

    const estimatesResult = await db.query('SELECT * FROM estimates WHERE job_id = $1 ORDER BY version DESC', [req.params.id]);
    job.estimates = estimatesResult.rows;

    res.json(job);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/jobs
router.post('/', [
  body('customer_id').isUUID(),
  body('property_address_line1').trim().notEmpty(),
  body('property_city').trim().notEmpty(),
  body('property_state').trim().notEmpty(),
  body('property_zip').trim().notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { customer_id, property_address_line1, property_address_line2, property_city, property_state, property_zip, is_insurance_job, claim_number, deductible, notes } = req.body;

    const customerCheck = await db.query('SELECT id FROM customers WHERE id = $1 AND org_id = $2', [customer_id, req.user.org_id]);
    if (customerCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Customer not found' });
    }

    const yearPrefix = new Date().getFullYear().toString().slice(-2);
    const countResult = await db.query("SELECT COUNT(*) FROM jobs WHERE org_id = $1 AND job_number LIKE $2", [req.user.org_id, yearPrefix + '-%']);
    const jobNum = yearPrefix + '-' + String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0');

    const result = await db.query(
      'INSERT INTO jobs (org_id, customer_id, job_number, property_address_line1, property_address_line2, property_city, property_state, property_zip, is_insurance_job, claim_number, deductible, notes, created_by_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
      [req.user.org_id, customer_id, jobNum, property_address_line1, property_address_line2, property_city, property_state, property_zip, is_insurance_job || false, claim_number, deductible, notes, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/jobs/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { property_address_line1, property_address_line2, property_city, property_state, property_zip, status, is_insurance_job, claim_number, deductible, notes } = req.body;

    const result = await db.query(
      'UPDATE jobs SET property_address_line1 = COALESCE($1, property_address_line1), property_address_line2 = COALESCE($2, property_address_line2), property_city = COALESCE($3, property_city), property_state = COALESCE($4, property_state), property_zip = COALESCE($5, property_zip), status = COALESCE($6, status), is_insurance_job = COALESCE($7, is_insurance_job), claim_number = COALESCE($8, claim_number), deductible = COALESCE($9, deductible), notes = COALESCE($10, notes), updated_at = NOW() WHERE id = $11 AND org_id = $12 RETURNING *',
      [property_address_line1, property_address_line2, property_city, property_state, property_zip, status, is_insurance_job, claim_number, deductible, notes, req.params.id, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/jobs/:id/measurements
router.post('/:id/measurements', async (req, res, next) => {
  try {
    const jobCheck = await db.query('SELECT id FROM jobs WHERE id = $1 AND org_id = $2', [req.params.id, req.user.org_id]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { measurement_source, hover_report_id, pitch_predominant, has_gutters, notes } = req.body;

    const total_roof_sqft = toNum(req.body.total_roof_sqft);
    const ridges_lf = toNum(req.body.ridges_lf);
    const hips_lf = toNum(req.body.hips_lf);
    const valleys_lf = toNum(req.body.valleys_lf);
    const rakes_lf = toNum(req.body.rakes_lf);
    const eaves_lf = toNum(req.body.eaves_lf);
    const flashing_lf = toNum(req.body.flashing_lf);
    const step_flashing_lf = toNum(req.body.step_flashing_lf);
    const drip_edge_lf = toNum(req.body.drip_edge_lf);
    const leak_barrier_lf = toNum(req.body.leak_barrier_lf);
    const ridge_cap_lf = toNum(req.body.ridge_cap_lf);
    const starter_lf = toNum(req.body.starter_lf);
    const pitch_4_6_sqft = toNum(req.body.pitch_4_6_sqft);
    const pitch_7_9_sqft = toNum(req.body.pitch_7_9_sqft);
    const pitch_10_plus_sqft = toNum(req.body.pitch_10_plus_sqft);
    const stories = toInt(req.body.stories);
    const pipe_collars_count = toInt(req.body.pipe_collars_count);
    const rain_caps_count = toInt(req.body.rain_caps_count);
    const passive_vents_count = toInt(req.body.passive_vents_count);
    const power_vents_count = toInt(req.body.power_vents_count);
    const skylights_count = toInt(req.body.skylights_count);
    const chimneys_count = toInt(req.body.chimneys_count);
    const satellites_count = toInt(req.body.satellites_count);
    const existing_layers = toInt(req.body.existing_layers);
    const gutter_lf = toNum(req.body.gutter_lf);

    const result = await db.query(
      'INSERT INTO job_measurements (job_id, measurement_source, hover_report_id, total_roof_sqft, ridges_lf, hips_lf, valleys_lf, rakes_lf, eaves_lf, flashing_lf, step_flashing_lf, drip_edge_lf, leak_barrier_lf, ridge_cap_lf, starter_lf, pitch_predominant, pitch_4_6_sqft, pitch_7_9_sqft, pitch_10_plus_sqft, stories, pipe_collars_count, rain_caps_count, passive_vents_count, power_vents_count, skylights_count, chimneys_count, satellites_count, existing_layers, has_gutters, gutter_lf, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31) ON CONFLICT (job_id) DO UPDATE SET measurement_source = EXCLUDED.measurement_source, hover_report_id = EXCLUDED.hover_report_id, total_roof_sqft = EXCLUDED.total_roof_sqft, ridges_lf = EXCLUDED.ridges_lf, hips_lf = EXCLUDED.hips_lf, valleys_lf = EXCLUDED.valleys_lf, rakes_lf = EXCLUDED.rakes_lf, eaves_lf = EXCLUDED.eaves_lf, flashing_lf = EXCLUDED.flashing_lf, step_flashing_lf = EXCLUDED.step_flashing_lf, drip_edge_lf = EXCLUDED.drip_edge_lf, leak_barrier_lf = EXCLUDED.leak_barrier_lf, ridge_cap_lf = EXCLUDED.ridge_cap_lf, starter_lf = EXCLUDED.starter_lf, pitch_predominant = EXCLUDED.pitch_predominant, pitch_4_6_sqft = EXCLUDED.pitch_4_6_sqft, pitch_7_9_sqft = EXCLUDED.pitch_7_9_sqft, pitch_10_plus_sqft = EXCLUDED.pitch_10_plus_sqft, stories = EXCLUDED.stories, pipe_collars_count = EXCLUDED.pipe_collars_count, rain_caps_count = EXCLUDED.rain_caps_count, passive_vents_count = EXCLUDED.passive_vents_count, power_vents_count = EXCLUDED.power_vents_count, skylights_count = EXCLUDED.skylights_count, chimneys_count = EXCLUDED.chimneys_count, satellites_count = EXCLUDED.satellites_count, existing_layers = EXCLUDED.existing_layers, has_gutters = EXCLUDED.has_gutters, gutter_lf = EXCLUDED.gutter_lf, notes = EXCLUDED.notes, updated_at = NOW() RETURNING *',
      [req.params.id, measurement_source, hover_report_id, total_roof_sqft, ridges_lf, hips_lf, valleys_lf, rakes_lf, eaves_lf, flashing_lf, step_flashing_lf, drip_edge_lf, leak_barrier_lf, ridge_cap_lf, starter_lf, pitch_predominant, pitch_4_6_sqft, pitch_7_9_sqft, pitch_10_plus_sqft, stories, pipe_collars_count, rain_caps_count, passive_vents_count, power_vents_count, skylights_count, chimneys_count, satellites_count, existing_layers, has_gutters, gutter_lf, notes]
    );

    await db.query("UPDATE jobs SET status = CASE WHEN status = 'lead' THEN 'measuring' ELSE status END, updated_at = NOW() WHERE id = $1", [req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/jobs/:id/measurements
router.get('/:id/measurements', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM job_measurements WHERE job_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Measurements not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/jobs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM jobs WHERE id = $1 AND org_id = $2 RETURNING id', [req.params.id, req.user.org_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ message: 'Job deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
