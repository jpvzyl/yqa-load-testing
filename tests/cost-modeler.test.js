import { describe, it, expect } from 'vitest';
import { CostModeler } from '../cost-modeler.js';

const modeler = new CostModeler();

describe('CostModeler.inferInfrastructure', () => {
  it('returns small tier for low RPS', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 50 });
    expect(infra.compute[0].type).toBe('t3.medium');
    expect(infra.compute[0].count).toBe(2);
  });

  it('returns medium tier for moderate RPS', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 500 });
    expect(infra.compute[0].type).toBe('c6i.large');
    expect(infra.compute[0].count).toBe(4);
  });

  it('returns large tier for high RPS', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 5000 });
    expect(infra.compute[0].type).toBe('c6i.xlarge');
    expect(infra.compute[0].count).toBe(8);
  });

  it('returns xlarge tier for very high RPS', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 20000 });
    expect(infra.compute[0].type).toBe('c6i.2xlarge');
    expect(infra.compute[0].count).toBe(16);
  });
});

describe('CostModeler.calculateCurrentCost', () => {
  it('calculates monthly = hourly * 730', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 50 });
    const cost = modeler.calculateCurrentCost(infra, 'aws');
    expect(cost.hourly).toBeGreaterThan(0);
    // monthly = hourly * 730 + data transfer
    const expectedMonthly = cost.hourly * 730 + cost.breakdown.data_transfer.monthly;
    expect(cost.monthly).toBeCloseTo(expectedMonthly, 1);
  });

  it('includes compute, database, cache, and LB breakdown', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 500 });
    const cost = modeler.calculateCurrentCost(infra, 'aws');
    expect(cost.breakdown).toHaveProperty('compute');
    expect(cost.breakdown).toHaveProperty('database');
    expect(cost.breakdown).toHaveProperty('cache');
    expect(cost.breakdown).toHaveProperty('load_balancer');
    expect(cost.breakdown).toHaveProperty('data_transfer');
  });
});

describe('CostModeler.scaleInfrastructure', () => {
  it('scales compute linearly', () => {
    const base = { compute: [{ type: 't3.medium', count: 2 }] };
    const scaled = modeler.scaleInfrastructure(base, 3);
    expect(scaled.compute[0].count).toBe(6);
  });

  it('scales database sub-linearly (sqrt)', () => {
    const base = { database: [{ type: 'db.t3.medium', count: 1 }] };
    const scaled = modeler.scaleInfrastructure(base, 4);
    // ceil(1 * sqrt(4)) = ceil(2) = 2, but max(1, 2) = 2
    expect(scaled.database[0].count).toBe(2);
  });

  it('does not reduce counts below the base', () => {
    const base = { database: [{ type: 'db.t3.medium', count: 4 }] };
    const scaled = modeler.scaleInfrastructure(base, 1);
    expect(scaled.database[0].count).toBeGreaterThanOrEqual(4);
  });
});

describe('CostModeler.buildScalingCurve', () => {
  it('returns all multiplier steps', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 100 });
    const summary = { http_reqs_per_second: 100 };
    const curve = modeler.buildScalingCurve(infra, summary, 'aws');
    const multipliers = curve.map(p => p.multiplier);
    expect(multipliers).toEqual([1, 1.5, 2, 3, 5, 7, 10, 15, 20]);
  });

  it('cost increases monotonically', () => {
    const infra = modeler.inferInfrastructure({ http_reqs_per_second: 100 });
    const summary = { http_reqs_per_second: 100 };
    const curve = modeler.buildScalingCurve(infra, summary, 'aws');
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].monthly_cost).toBeGreaterThanOrEqual(curve[i - 1].monthly_cost);
    }
  });
});

describe('Cloud pricing data', () => {
  it('has pricing for aws, gcp, and azure', () => {
    for (const provider of ['aws', 'gcp', 'azure']) {
      const infra = { compute: [{ type: 't3.medium', count: 1 }] };
      const cost = modeler.calculateCurrentCost(infra, provider);
      expect(cost.monthly).toBeGreaterThan(0);
    }
  });
});
