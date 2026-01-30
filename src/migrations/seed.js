const db = require('../config/database');

async function seed() {
  console.log('Seeding database...');

  const existing = await db.query('SELECT COUNT(*) FROM line_item_catalog WHERE org_id IS NULL');
  if (parseInt(existing.rows[0].count) > 0) {
    console.log('Pricing catalog already seeded');
    process.exit(0);
  }

  const items = [
    { code: 'TEAR_OFF', description: 'Remove existing roofing (per layer)', category: 'removal', unit: 'SQ', price: 85 },
    { code: 'DUMPSTER', description: 'Dumpster & debris disposal', category: 'removal', unit: 'EA', price: 650 },
    { code: 'SHINGLE_ARCH', description: 'Architectural shingles (30-year)', category: 'installation', unit: 'SQ', price: 165 },
    { code: 'SHINGLE_3TAB', description: '3-tab shingles (25-year)', category: 'installation', unit: 'SQ', price: 125 },
    { code: 'UNDERLAYMENT', description: 'Synthetic underlayment', category: 'installation', unit: 'SQ', price: 55 },
    { code: 'ICE_WATER', description: 'Ice & water shield', category: 'installation', unit: 'SQ', price: 95 },
    { code: 'DRIP_EDGE', description: 'Drip edge', category: 'installation', unit: 'LF', price: 3.50 },
    { code: 'RIDGE_CAP', description: 'Ridge cap shingles', category: 'installation', unit: 'LF', price: 8.50 },
    { code: 'STARTER', description: 'Starter strip', category: 'installation', unit: 'LF', price: 3.25 },
    { code: 'VALLEY_METAL', description: 'Valley metal', category: 'installation', unit: 'LF', price: 12 },
    { code: 'STEP_FLASH', description: 'Step flashing', category: 'installation', unit: 'LF', price: 8 },
    { code: 'PIPE_COLLAR', description: 'Pipe collar/boot', category: 'accessories', unit: 'EA', price: 45 },
    { code: 'VENT_PASSIVE', description: 'Passive roof vent', category: 'accessories', unit: 'EA', price: 85 },
    { code: 'VENT_POWER', description: 'Power attic vent', category: 'accessories', unit: 'EA', price: 350 },
    { code: 'RIDGE_VENT', description: 'Ridge vent', category: 'accessories', unit: 'LF', price: 12 },
    { code: 'SKYLIGHT_REFL', description: 'Re-flash skylight', category: 'accessories', unit: 'EA', price: 250 },
    { code: 'CHIMNEY_FLASH', description: 'Chimney flashing', category: 'accessories', unit: 'EA', price: 450 },
    { code: 'SATELLITE_REMOUNT', description: 'Satellite dish re-mount', category: 'accessories', unit: 'EA', price: 75 },
  ];

  for (const item of items) {
    await db.query(
      'INSERT INTO line_item_catalog (code, description, category, unit, unit_price) VALUES ($1, $2, $3, $4, $5)',
      [item.code, item.description, item.category, item.unit, item.price]
    );
  }

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
