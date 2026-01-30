const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

// GET /api/v1/customers
router.get('/', async (req, res, next) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT * FROM customers WHERE org_id = $1';
    const params = [req.user.org_id];

    if (search) {
      query += " AND (first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)";
      params.push('%' + search + '%');
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await db.query(query, params);
    res.json({ customers: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/customers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM customers WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.org_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/customers
router.post('/', [
  body('first_name').trim().notEmpty(),
  body('last_name').trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { first_name, last_name, email, phone, address_line1, address_line2, city, state, zip_code, notes } = req.body;

    const result = await db.query(
      'INSERT INTO customers (org_id, first_name, last_name, email, phone, address_line1, address_line2, city, state, zip_code, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
      [req.user.org_id, first_name, last_name, email, phone, address_line1, address_line2, city, state, zip_code, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/customers/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { first_name, last_name, email, phone, address_line1, address_line2, city, state, zip_code, notes } = req.body;

    const result = await db.query(
      'UPDATE customers SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), email = COALESCE($3, email), phone = COALESCE($4, phone), address_line1 = COALESCE($5, address_line1), address_line2 = COALESCE($6, address_line2), city = COALESCE($7, city), state = COALESCE($8, state), zip_code = COALESCE($9, zip_code), notes = COALESCE($10, notes), updated_at = NOW() WHERE id = $11 AND org_id = $12 RETURNING *',
      [first_name, last_name, email, phone, address_line1, address_line2, city, state, zip_code, notes, req.params.id, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/customers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM customers WHERE id = $1 AND org_id = $2 RETURNING id',
      [req.params.id, req.user.org_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
