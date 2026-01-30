const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { authenticate } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const jobRoutes = require('./routes/jobs');
const estimateRoutes = require('./routes/estimates');
const pricingRoutes = require('./routes/pricing');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

const apiV1 = '/api/v1';

app.use(apiV1 + '/auth', authRoutes);
app.use(apiV1 + '/customers', authenticate, customerRoutes);
app.use(apiV1 + '/jobs', authenticate, jobRoutes);
app.use(apiV1 + '/estimates', authenticate, estimateRoutes);
app.use(apiV1 + '/pricing', authenticate, pricingRoutes);

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Roofing SaaS API running on port ' + PORT);
});
