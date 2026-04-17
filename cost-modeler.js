import * as dbv2 from './db-v2.js';

const CLOUD_PRICING = {
  aws: {
    compute: {
      't3.medium':  { vcpu: 2, mem_gb: 4,  hourly: 0.0416 },
      't3.large':   { vcpu: 2, mem_gb: 8,  hourly: 0.0832 },
      'c6i.large':  { vcpu: 2, mem_gb: 4,  hourly: 0.085 },
      'c6i.xlarge': { vcpu: 4, mem_gb: 8,  hourly: 0.170 },
      'c6i.2xlarge':{ vcpu: 8, mem_gb: 16, hourly: 0.340 },
      'm6i.large':  { vcpu: 2, mem_gb: 8,  hourly: 0.096 },
      'm6i.xlarge': { vcpu: 4, mem_gb: 16, hourly: 0.192 },
      'r6i.large':  { vcpu: 2, mem_gb: 16, hourly: 0.126 },
    },
    rds: {
      'db.t3.medium':  { hourly: 0.068 },
      'db.r6g.large':  { hourly: 0.260 },
      'db.r6g.xlarge': { hourly: 0.520 },
      'db.r6g.2xlarge':{ hourly: 1.040 },
    },
    elasticache: {
      'cache.t3.medium': { hourly: 0.068 },
      'cache.r6g.large': { hourly: 0.250 },
    },
    alb: { hourly: 0.0225, per_lcu: 0.008 },
    nat_gateway: { hourly: 0.045, per_gb: 0.045 },
    data_transfer: { per_gb: 0.09 },
  },
  gcp: {
    compute: {
      'e2-medium':    { vcpu: 2, mem_gb: 4,  hourly: 0.0335 },
      'e2-standard-2':{ vcpu: 2, mem_gb: 8,  hourly: 0.0670 },
      'c2-standard-4':{ vcpu: 4, mem_gb: 16, hourly: 0.209 },
      'c2-standard-8':{ vcpu: 8, mem_gb: 32, hourly: 0.418 },
      'n2-standard-2':{ vcpu: 2, mem_gb: 8,  hourly: 0.0971 },
    },
    rds: {
      'db-custom-2-8192': { hourly: 0.129 },
      'db-custom-4-16384':{ hourly: 0.258 },
    },
  },
  azure: {
    compute: {
      'B2s':     { vcpu: 2, mem_gb: 4,  hourly: 0.0416 },
      'D2s_v5':  { vcpu: 2, mem_gb: 8,  hourly: 0.096 },
      'D4s_v5':  { vcpu: 4, mem_gb: 16, hourly: 0.192 },
      'F4s_v2':  { vcpu: 4, mem_gb: 8,  hourly: 0.169 },
    },
  },
};

export class CostModeler {
  async estimateCosts(runId, projectId, options = {}) {
    const pool = (await import('./db.js')).getPool();
    const runResult = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runId]);
    const run = runResult.rows[0];
    if (!run) throw new Error('Run not found');

    const summary = run.k6_summary || {};
    const provider = options.provider || 'aws';
    const region = options.region || 'us-east-1';
    const infrastructure = options.infrastructure || this.inferInfrastructure(summary);

    const currentCost = this.calculateCurrentCost(infrastructure, provider);
    const costPerRequest = summary.http_reqs > 0
      ? currentCost.monthly / (summary.http_reqs * 730)
      : 0;

    const scalingCurve = this.buildScalingCurve(infrastructure, summary, provider);

    const estimate = await dbv2.createCostEstimate({
      run_id: runId,
      project_id: projectId,
      provider,
      region,
      current_monthly_cost: currentCost.monthly,
      cost_per_request: costPerRequest,
      cost_at_2x: scalingCurve.find(p => p.multiplier === 2)?.monthly_cost || currentCost.monthly * 2,
      cost_at_5x: scalingCurve.find(p => p.multiplier === 5)?.monthly_cost || currentCost.monthly * 5,
      cost_at_10x: scalingCurve.find(p => p.multiplier === 10)?.monthly_cost || currentCost.monthly * 10,
      scaling_curve: scalingCurve,
      infrastructure_breakdown: currentCost.breakdown,
      recommendations: this.generateRecommendations(currentCost, scalingCurve, summary),
    });

    return estimate;
  }

  inferInfrastructure(summary) {
    const rps = summary.http_reqs_per_second || summary.http_reqs || 0;
    let tier;
    if (rps < 100) tier = 'small';
    else if (rps < 1000) tier = 'medium';
    else if (rps < 10000) tier = 'large';
    else tier = 'xlarge';

    const infra = {
      small: {
        compute: [{ type: 't3.medium', count: 2 }],
        database: [{ type: 'db.t3.medium', count: 1 }],
        cache: [{ type: 'cache.t3.medium', count: 1 }],
        load_balancer: 1,
      },
      medium: {
        compute: [{ type: 'c6i.large', count: 4 }],
        database: [{ type: 'db.r6g.large', count: 1 }],
        cache: [{ type: 'cache.r6g.large', count: 1 }],
        load_balancer: 1,
      },
      large: {
        compute: [{ type: 'c6i.xlarge', count: 8 }],
        database: [{ type: 'db.r6g.xlarge', count: 2 }],
        cache: [{ type: 'cache.r6g.large', count: 2 }],
        load_balancer: 2,
      },
      xlarge: {
        compute: [{ type: 'c6i.2xlarge', count: 16 }],
        database: [{ type: 'db.r6g.2xlarge', count: 3 }],
        cache: [{ type: 'cache.r6g.large', count: 4 }],
        load_balancer: 3,
      },
    };

    return infra[tier];
  }

  calculateCurrentCost(infrastructure, provider) {
    const pricing = CLOUD_PRICING[provider] || CLOUD_PRICING.aws;
    const breakdown = {};
    let totalHourly = 0;

    if (infrastructure.compute) {
      let computeHourly = 0;
      for (const inst of infrastructure.compute) {
        const price = pricing.compute[inst.type]?.hourly || 0.10;
        computeHourly += price * inst.count;
      }
      breakdown.compute = { hourly: computeHourly, monthly: computeHourly * 730, instances: infrastructure.compute };
      totalHourly += computeHourly;
    }

    if (infrastructure.database) {
      let dbHourly = 0;
      for (const inst of infrastructure.database) {
        const price = pricing.rds?.[inst.type]?.hourly || 0.10;
        dbHourly += price * inst.count;
      }
      breakdown.database = { hourly: dbHourly, monthly: dbHourly * 730, instances: infrastructure.database };
      totalHourly += dbHourly;
    }

    if (infrastructure.cache) {
      let cacheHourly = 0;
      for (const inst of infrastructure.cache) {
        const price = pricing.elasticache?.[inst.type]?.hourly || 0.068;
        cacheHourly += price * inst.count;
      }
      breakdown.cache = { hourly: cacheHourly, monthly: cacheHourly * 730, instances: infrastructure.cache };
      totalHourly += cacheHourly;
    }

    if (infrastructure.load_balancer) {
      const lbCost = (pricing.alb?.hourly || 0.0225) * infrastructure.load_balancer;
      breakdown.load_balancer = { hourly: lbCost, monthly: lbCost * 730, count: infrastructure.load_balancer };
      totalHourly += lbCost;
    }

    const dataCostMonthly = 100 * (pricing.data_transfer?.per_gb || 0.09);
    breakdown.data_transfer = { monthly: dataCostMonthly, estimated_gb: 100 };
    const totalMonthly = totalHourly * 730 + dataCostMonthly;

    return {
      hourly: totalHourly,
      monthly: parseFloat(totalMonthly.toFixed(2)),
      annual: parseFloat((totalMonthly * 12).toFixed(2)),
      breakdown,
    };
  }

  buildScalingCurve(infrastructure, summary, provider) {
    const multipliers = [1, 1.5, 2, 3, 5, 7, 10, 15, 20];
    const baseRps = summary.http_reqs_per_second || summary.http_reqs || 100;
    const curve = [];

    for (const mult of multipliers) {
      const targetRps = Math.round(baseRps * mult);
      const scaledInfra = this.scaleInfrastructure(infrastructure, mult);
      const cost = this.calculateCurrentCost(scaledInfra, provider);

      curve.push({
        multiplier: mult,
        target_rps: targetRps,
        monthly_cost: cost.monthly,
        annual_cost: cost.annual,
        cost_per_request: cost.monthly / (targetRps * 2.628e6),
        infrastructure: scaledInfra,
      });
    }

    return curve;
  }

  scaleInfrastructure(base, multiplier) {
    const scaled = JSON.parse(JSON.stringify(base));

    if (scaled.compute) {
      for (const inst of scaled.compute) {
        inst.count = Math.ceil(inst.count * multiplier);
      }
    }
    if (scaled.database) {
      for (const inst of scaled.database) {
        inst.count = Math.max(inst.count, Math.ceil(inst.count * Math.sqrt(multiplier)));
      }
    }
    if (scaled.cache) {
      for (const inst of scaled.cache) {
        inst.count = Math.max(inst.count, Math.ceil(inst.count * Math.sqrt(multiplier)));
      }
    }
    if (scaled.load_balancer) {
      scaled.load_balancer = Math.max(scaled.load_balancer, Math.ceil(scaled.load_balancer * Math.log2(multiplier + 1)));
    }

    return scaled;
  }

  generateRecommendations(currentCost, scalingCurve, summary) {
    const recs = [];

    if (currentCost.breakdown.compute?.monthly > currentCost.monthly * 0.6) {
      recs.push({
        category: 'compute',
        action: 'Consider spot/preemptible instances for stateless workloads — potential 60-70% savings',
        savings_estimate: `$${(currentCost.breakdown.compute.monthly * 0.6).toFixed(0)}/mo`,
      });
    }

    if (currentCost.breakdown.database?.monthly > currentCost.monthly * 0.3) {
      recs.push({
        category: 'database',
        action: 'Evaluate reserved instance pricing for databases — 30-50% savings with 1-year commitment',
        savings_estimate: `$${(currentCost.breakdown.database.monthly * 0.35).toFixed(0)}/mo`,
      });
    }

    const costAt2x = scalingCurve.find(p => p.multiplier === 2);
    if (costAt2x && costAt2x.monthly_cost > currentCost.monthly * 2.5) {
      recs.push({
        category: 'architecture',
        action: 'Scaling is super-linear — review architecture for horizontal scaling improvements (caching, read replicas, async processing)',
        impact: `2x traffic costs ${(costAt2x.monthly_cost / currentCost.monthly).toFixed(1)}x more`,
      });
    }

    if (summary.http_req_duration_avg > 200) {
      recs.push({
        category: 'performance',
        action: `Average response time of ${summary.http_req_duration_avg.toFixed(0)}ms is high — optimizing to <100ms could reduce compute costs by 30-50%`,
        impact: 'Faster responses = fewer instances needed for same throughput',
      });
    }

    return recs;
  }
}

export const costModeler = new CostModeler();
