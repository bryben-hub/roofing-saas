const db = require('../config/database');

class EstimatorService {
  async generateEstimate(jobId, orgId) {
    const measurementsResult = await db.query('SELECT * FROM job_measurements WHERE job_id = $1', [jobId]);

    if (measurementsResult.rows.length === 0) {
      throw new Error('No measurements found for this job');
    }

    const m = measurementsResult.rows[0];

    const pricingResult = await db.query(
      'SELECT DISTINCT ON (code) * FROM line_item_catalog WHERE org_id = $1 OR org_id IS NULL ORDER BY code, org_id NULLS LAST',
      [orgId]
    );

    const pricing = {};
    pricingResult.rows.forEach(item => {
      pricing[item.code] = item;
    });

    const lineItems = [];
    let sortOrder = 0;

    const squares = Math.ceil((m.total_roof_sqft || 0) / 100);
    const wasteFactor = 1.15;

    // REMOVAL
    if (m.existing_layers && m.existing_layers >= 1) {
      const removalPrice = pricing['TEAR_OFF']?.unit_price || 85;
      lineItems.push({
        code: 'TEAR_OFF',
        description: 'Remove existing roofing (' + m.existing_layers + ' layer' + (m.existing_layers > 1 ? 's' : '') + ')',
        category: 'removal',
        quantity: squares,
        unit: 'SQ',
        unit_price: removalPrice * m.existing_layers,
        total_price: Math.round(squares * removalPrice * m.existing_layers * 100) / 100,
        section: 'Removal',
        sort_order: sortOrder++
      });

      const dumpsterPrice = pricing['DUMPSTER']?.unit_price || 650;
      const dumpsterQty = Math.ceil(squares / 30);
      lineItems.push({
        code: 'DUMPSTER',
        description: 'Dumpster & disposal',
        category: 'removal',
        quantity: dumpsterQty,
        unit: 'EA',
        unit_price: dumpsterPrice,
        total_price: dumpsterQty * dumpsterPrice,
        section: 'Removal',
        sort_order: sortOrder++
      });
    }

    // INSTALLATION - Shingles
    const shinglePrice = pricing['SHINGLE_ARCH']?.unit_price || 165;
    lineItems.push({
      code: 'SHINGLE_ARCH',
      description: 'Architectural shingles (30-year)',
      category: 'installation',
      quantity: Math.ceil(squares * wasteFactor),
      unit: 'SQ',
      unit_price: shinglePrice,
      total_price: Math.round(Math.ceil(squares * wasteFactor) * shinglePrice * 100) / 100,
      section: 'Installation',
      sort_order: sortOrder++
    });

    // Underlayment
    const underlayPrice = pricing['UNDERLAYMENT']?.unit_price || 55;
    lineItems.push({
      code: 'UNDERLAYMENT',
      description: 'Synthetic underlayment',
      category: 'installation',
      quantity: Math.ceil(squares * wasteFactor),
      unit: 'SQ',
      unit_price: underlayPrice,
      total_price: Math.round(Math.ceil(squares * wasteFactor) * underlayPrice * 100) / 100,
      section: 'Installation',
      sort_order: sortOrder++
    });

    // Drip edge
    if (m.drip_edge_lf && m.drip_edge_lf > 0) {
      const dripPrice = pricing['DRIP_EDGE']?.unit_price || 3.50;
      lineItems.push({
        code: 'DRIP_EDGE',
        description: 'Drip edge',
        category: 'installation',
        quantity: Math.ceil(m.drip_edge_lf * 1.1),
        unit: 'LF',
        unit_price: dripPrice,
        total_price: Math.round(Math.ceil(m.drip_edge_lf * 1.1) * dripPrice * 100) / 100,
        section: 'Installation',
        sort_order: sortOrder++
      });
    }

    // Ridge cap
    if (m.ridge_cap_lf && m.ridge_cap_lf > 0) {
      const ridgePrice = pricing['RIDGE_CAP']?.unit_price || 8.50;
      lineItems.push({
        code: 'RIDGE_CAP',
        description: 'Ridge cap shingles',
        category: 'installation',
        quantity: Math.ceil(m.ridge_cap_lf),
        unit: 'LF',
        unit_price: ridgePrice,
        total_price: Math.round(Math.ceil(m.ridge_cap_lf) * ridgePrice * 100) / 100,
        section: 'Installation',
        sort_order: sortOrder++
      });
    }

    // Starter strip
    if (m.starter_lf && m.starter_lf > 0) {
      const starterPrice = pricing['STARTER']?.unit_price || 3.25;
      lineItems.push({
        code: 'STARTER',
        description: 'Starter strip',
        category: 'installation',
        quantity: Math.ceil(m.starter_lf * 1.1),
        unit: 'LF',
        unit_price: starterPrice,
        total_price: Math.round(Math.ceil(m.starter_lf * 1.1) * starterPrice * 100) / 100,
        section: 'Installation',
        sort_order: sortOrder++
      });
    }

    // Valleys
    if (m.valleys_lf && m.valleys_lf > 0) {
      const valleyPrice = pricing['VALLEY_METAL']?.unit_price || 12;
      lineItems.push({
        code: 'VALLEY_METAL',
        description: 'Valley metal',
        category: 'installation',
        quantity: Math.ceil(m.valleys_lf),
        unit: 'LF',
        unit_price: valleyPrice,
        total_price: Math.round(Math.ceil(m.valleys_lf) * valleyPrice * 100) / 100,
        section: 'Installation',
        sort_order: sortOrder++
      });
    }

    // Step flashing
    if (m.step_flashing_lf && m.step_flashing_lf > 0) {
      const stepPrice = pricing['STEP_FLASH']?.unit_price || 8;
      lineItems.push({
        code: 'STEP_FLASH',
        description: 'Step flashing',
        category: 'installation',
        quantity: Math.ceil(m.step_flashing_lf),
        unit: 'LF',
        unit_price: stepPrice,
        total_price: Math.round(Math.ceil(m.step_flashing_lf) * stepPrice * 100) / 100,
        section: 'Installation',
        sort_order: sortOrder++
      });
    }

    // ACCESSORIES
    if (m.pipe_collars_count && m.pipe_collars_count > 0) {
      const pipePrice = pricing['PIPE_COLLAR']?.unit_price || 45;
      lineItems.push({
        code: 'PIPE_COLLAR',
        description: 'Pipe collar/boot',
        category: 'accessories',
        quantity: m.pipe_collars_count,
        unit: 'EA',
        unit_price: pipePrice,
        total_price: m.pipe_collars_count * pipePrice,
        section: 'Accessories',
        sort_order: sortOrder++
      });
    }

    if (m.passive_vents_count && m.passive_vents_count > 0) {
      const ventPrice = pricing['VENT_PASSIVE']?.unit_price || 85;
      lineItems.push({
        code: 'VENT_PASSIVE',
        description: 'Passive roof vent',
        category: 'accessories',
        quantity: m.passive_vents_count,
        unit: 'EA',
        unit_price: ventPrice,
        total_price: m.passive_vents_count * ventPrice,
        section: 'Accessories',
        sort_order: sortOrder++
      });
    }

    if (m.power_vents_count && m.power_vents_count > 0) {
      const powerVentPrice = pricing['VENT_POWER']?.unit_price || 350;
      lineItems.push({
        code: 'VENT_POWER',
        description: 'Power attic vent',
        category: 'accessories',
        quantity: m.power_vents_count,
        unit: 'EA',
        unit_price: powerVentPrice,
        total_price: m.power_vents_count * powerVentPrice,
        section: 'Accessories',
        sort_order: sortOrder++
      });
    }

    if (m.skylights_count && m.skylights_count > 0) {
      const skylightPrice = pricing['SKYLIGHT_REFL']?.unit_price || 250;
      lineItems.push({
        code: 'SKYLIGHT_REFL',
        description: 'Re-flash skylight',
        category: 'accessories',
        quantity: m.skylights_count,
        unit: 'EA',
        unit_price: skylightPrice,
        total_price: m.skylights_count * skylightPrice,
        section: 'Accessories',
        sort_order: sortOrder++
      });
    }

    if (m.chimneys_count && m.chimneys_count > 0) {
      const chimneyPrice = pricing['CHIMNEY_FLASH']?.unit_price || 450;
      lineItems.push({
        code: 'CHIMNEY_FLASH',
        description: 'Chimney flashing',
        category: 'accessories',
        quantity: m.chimneys_count,
        unit: 'EA',
        unit_price: chimneyPrice,
        total_price: m.chimneys_count * chimneyPrice,
        section: 'Accessories',
        sort_order: sortOrder++
      });
    }

    if (m.satellites_count && m.satellites_count > 0) {
      const satPrice = pricing['SATELLITE_REMOUNT']?.unit_price || 75;
      lineItems.push({
        code: 'SATELLITE_REMOUNT',
        description: 'Satellite dish re-mount',
        category: 'accessories',
        quantity: m.satellites_count,
        unit: 'EA',
        unit_price: satPrice,
        total_price: m.satellites_count * satPrice,
        section: 'Accessories',
        sort_order: sortOrder++
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.total_price, 0);

    return {
      line_items: lineItems,
      subtotal: Math.round(subtotal * 100) / 100,
      summary: {
        total_sqft: m.total_roof_sqft,
        squares: squares,
        waste_factor: wasteFactor
      }
    };
  }
}

module.exports = new EstimatorService();
