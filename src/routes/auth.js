const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

// POST /api/v1/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('first_name').trim().notEmpty(),
  body('last_name').trim().notEmpty(),
  body('company_name').trim().notEmpty(),
  body('phone').optional().trim(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, first_name, last_name, company_name, phone } = req.body;

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const orgResult = await client.query(
        'INSERT INTO organizations (name, phone, email) VALUES ($1, $2, $3) RETURNING *',
        [company_name, phone, email]
      );
      const org = orgResult.rows[0];

      const passwordHash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        'INSERT INTO users (email, password_hash, first_name, last_name, phone, role, org_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, first_name, last_name, role, org_id',
        [email, passwordHash, first_name, last_name, phone, 'admin', org.id]
      );
      const user = userResult.rows[0];

      await client.query('COMMIT');

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role },
        organization: { id: org.id, name: org.name }
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

// POST /api/v1/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await db.query(
      'SELECT u.*, o.name as org_name FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role },
      organization: { id: user.org_id, name: user.org_name }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT o.* FROM organizations o WHERE o.id = $1',
      [req.user.org_id]
    );

    res.json({
      user: req.user,
      organization: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
