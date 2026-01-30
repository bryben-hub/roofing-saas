const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/v1/pricing
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM line_item_catalog WHERE org_id = $1 OR org_id IS NULL ORDER BY category, code',
      [req.user.org_id]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/pricing/:code
router.put('/:code', async (req, res, next) => {
  try {
    const { unit_price } = req.body;

    const existing = await db.query(
      'SELECT * FROM line_item_catalog WHERE code = $1 AND org_id = $2',
      [req.params.code, req.user.org_id]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await db.query(
        'UPDATE line_item_catalog SET unit_price = $1, updated_at = NOW() WHERE code = $2 AND org_id = $3 RETURNING *',
        [unit_price, req.params.code, req.user.org_id]
      );
    } else {
      const defaultItem = await db.query(
        'SELECT * FROM line_item_catalog WHERE code = $1 AND org_id IS NULL',
        [req.params.code]
      );

      if (defaultItem.rows.length === 0) {
        return res.status(404).json({ error: 'Pricing item not found' });
      }

      const item = defaultItem.rows[0];
      result = await db.query(
        'INSERT INTO line_item_catalog (code, description, category, unit, unit_price, org_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [item.code, item.description, item.category, item.unit, unit_price, req.user.org_id]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
