const db = require('../config/database');

async function runMigrations() {
  console.log('Running migrations...');

  await db.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      address_line1 VARCHAR(255),
      address_line2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(50),
      zip_code VARCHAR(20),
      logo_url TEXT,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(50) DEFAULT 'user',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      address_line1 VARCHAR(255),
      address_line2 VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(50),
      zip_code VARCHAR(20),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      created_by_id UUID REFERENCES users(id),
      job_number VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'lead',
      property_address_line1 VARCHAR(255) NOT NULL,
      property_address_line2 VARCHAR(255),
      property_city VARCHAR(100) NOT NULL,
      property_state VARCHAR(50) NOT NULL,
      property_zip VARCHAR(20) NOT NULL,
      is_insurance_job BOOLEAN DEFAULT false,
      claim_number VARCHAR(100),
      deductible NUMERIC(10,2) DEFAULT 0,
      total_estimate NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      proposal_date DATE,
      sold_date DATE,
      scheduled_date DATE,
      completed_date DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS job_measurements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
      measurement_source VARCHAR(50),
      hover_report_id VARCHAR(100),
      total_roof_sqft NUMERIC(10,2),
      ridges_lf NUMERIC(10,2),
      hips_lf NUMERIC(10,2),
      valleys_lf NUMERIC(10,2),
      rakes_lf NUMERIC(10,2),
      eaves_lf NUMERIC(10,2),
      flashing_lf NUMERIC(10,2),
      step_flashing_lf NUMERIC(10,2),
      drip_edge_lf NUMERIC(10,2),
      leak_barrier_lf NUMERIC(10,2),
      ridge_cap_lf NUMERIC(10,2),
      starter_lf NUMERIC(10,2),
      pitch_predominant VARCHAR(20),
      pitch_4_6_sqft NUMERIC(10,2),
      pitch_7_9_sqft NUMERIC(10,2),
      pitch_10_plus_sqft NUMERIC(10,2),
      stories INTEGER DEFAULT 1,
      pipe_collars_count INTEGER DEFAULT 0,
      rain_caps_count INTEGER DEFAULT 0,
      passive_vents_count INTEGER DEFAULT 0,
      power_vents_count INTEGER DEFAULT 0,
      skylights_count INTEGER DEFAULT 0,
      chimneys_count INTEGER DEFAULT 0,
      satellites_count INTEGER DEFAULT 0,
      existing_layers INTEGER DEFAULT 1,
      has_gutters BOOLEAN DEFAULT false,
      gutter_lf NUMERIC(10,2),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS estimates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
      created_by_id UUID REFERENCES users(id),
      version INTEGER DEFAULT 1,
      name VARCHAR(255),
      estimate_type VARCHAR(50) DEFAULT 'standard',
      status VARCHAR(50) DEFAULT 'draft',
      subtotal NUMERIC(12,2) DEFAULT 0,
      total NUMERIC(12,2) DEFAULT 0,
      deductible NUMERIC(10,2) DEFAULT 0,
      claim_total NUMERIC(12,2),
      supplement_requested BOOLEAN DEFAULT false,
      sent_at TIMESTAMP,
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS estimate_line_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE,
      line_item_catalog_id UUID,
      description VARCHAR(500) NOT NULL,
      category VARCHAR(100),
      quantity NUMERIC(10,2) NOT NULL,
      unit VARCHAR(50) NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL,
      total_price NUMERIC(12,2) NOT NULL,
      section VARCHAR(100),
      sort_order INTEGER DEFAULT 0,
      is_included BOOLEAN DEFAULT true,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS line_item_catalog (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      description VARCHAR(500) NOT NULL,
      category VARCHAR(100),
      unit VARCHAR(50) NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_org ON jobs(org_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(org_id);
    CREATE INDEX IF NOT EXISTS idx_estimates_job ON estimates(job_id);
  `);

  console.log('Migrations complete!');
  process.exit(0);
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
