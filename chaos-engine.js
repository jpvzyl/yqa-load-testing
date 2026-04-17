import * as dbv2 from './db-v2.js';
import { getEvidenceStore } from './evidence-store.js';

export const FAULT_CATALOG = {
  network_latency: {
    name: 'Network Latency',
    description: 'Inject network delay using tc netem or Toxiproxy',
    params: { delay: '200ms', jitter: '50ms' },
    mechanisms: ['tc_netem', 'toxiproxy'],
    targets: ['service', 'connection'],
  },
  packet_loss: {
    name: 'Packet Loss',
    description: 'Drop a percentage of network packets',
    params: { loss_percent: 5 },
    mechanisms: ['tc_netem'],
    targets: ['service'],
  },
  bandwidth_throttle: {
    name: 'Bandwidth Throttle',
    description: 'Limit network bandwidth',
    params: { rate: '1mbit', burst: '32kbit' },
    mechanisms: ['tc_qdisc'],
    targets: ['service'],
  },
  connection_drop: {
    name: 'Connection Drop',
    description: 'Reset TCP connections to target',
    params: { probability: 0.1 },
    mechanisms: ['toxiproxy'],
    targets: ['service'],
  },
  slow_response: {
    name: 'Slow Response',
    description: 'Delay response body delivery',
    params: { delay: '500ms' },
    mechanisms: ['toxiproxy'],
    targets: ['service'],
  },
  dependency_blackhole: {
    name: 'Dependency Blackhole',
    description: 'DROP all traffic to a dependency',
    params: {},
    mechanisms: ['iptables'],
    targets: ['db', 'cache', 'external_api'],
  },
  dns_failure: {
    name: 'DNS Failure',
    description: 'Cause DNS resolution to fail',
    params: { duration: '60s' },
    mechanisms: ['resolver'],
    targets: ['cluster'],
  },
  pod_kill: {
    name: 'Pod Kill',
    description: 'Kill pods matching label selector',
    params: { count: 1, grace_period: '0s' },
    mechanisms: ['chaos_mesh', 'kubectl'],
    targets: ['deployment'],
  },
  container_pause: {
    name: 'Container Pause',
    description: 'Pause container to simulate CPU starvation',
    params: { duration: '30s' },
    mechanisms: ['chaos_mesh'],
    targets: ['deployment'],
  },
  memory_pressure: {
    name: 'Memory Pressure',
    description: 'Consume memory in target container',
    params: { workers: 4, size: '256MB' },
    mechanisms: ['chaos_mesh'],
    targets: ['deployment'],
  },
  disk_io_saturation: {
    name: 'Disk I/O Saturation',
    description: 'Saturate disk I/O on target',
    params: { workers: 4, size: '10MB' },
    mechanisms: ['chaos_mesh'],
    targets: ['deployment'],
  },
  clock_skew: {
    name: 'Clock Skew',
    description: 'Offset system clock on target',
    params: { offset: '5m' },
    mechanisms: ['chaos_mesh'],
    targets: ['deployment'],
  },
  cpu_stress: {
    name: 'CPU Stress',
    description: 'Consume CPU on target',
    params: { workers: 4, load: 80 },
    mechanisms: ['chaos_mesh', 'stress_ng'],
    targets: ['deployment'],
  },
  certificate_expiry: {
    name: 'Certificate Expiry',
    description: 'Simulate expired TLS certificate',
    params: {},
    mechanisms: ['envoy_filter'],
    targets: ['service'],
  },
};

export class ChaosEngine {
  constructor() {
    this.activeFaults = new Map();
    this.timers = new Map();
  }

  async createExperiment(data) {
    this.validateTimeline(data.fault_timeline);
    if (data.hypothesis) this.validateHypothesis(data.hypothesis);

    const experiment = await dbv2.createChaosExperiment({
      run_id: data.run_id,
      project_id: data.project_id,
      name: data.name,
      fault_timeline: data.fault_timeline,
      hypothesis: data.hypothesis,
      created_by: data.created_by,
    });

    return experiment;
  }

  validateTimeline(timeline) {
    if (!Array.isArray(timeline) || timeline.length === 0) {
      throw new Error('Fault timeline must be a non-empty array');
    }
    for (const event of timeline) {
      if (event.at === undefined) throw new Error('Each fault event needs an "at" offset');
      if (event.type === 'baseline' || event.type === 'recover') continue;
      if (!FAULT_CATALOG[event.type]) throw new Error(`Unknown fault type: ${event.type}`);
    }
  }

  validateHypothesis(hypothesis) {
    if (!hypothesis.statement) throw new Error('Hypothesis needs a statement');
    if (!hypothesis.metrics || !Array.isArray(hypothesis.metrics)) {
      throw new Error('Hypothesis needs a metrics array');
    }
    for (const m of hypothesis.metrics) {
      if (!m.name || !m.threshold || !m.comparator) {
        throw new Error('Each hypothesis metric needs name, threshold, and comparator');
      }
    }
  }

  async executeTimeline(experimentId, runId, onFaultApplied, onFaultRemoved) {
    const pool = (await import('./db.js')).getPool();
    const result = await pool.query('SELECT * FROM chaos_experiments WHERE id = $1', [experimentId]);
    const experiment = result.rows[0];
    if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

    const timeline = experiment.fault_timeline;
    const runTimers = [];

    for (const event of timeline) {
      const offsetMs = this.parseOffset(event.at);
      const timer = setTimeout(async () => {
        if (event.type === 'baseline') {
          console.log(`[Chaos] t=${event.at}: Baseline period`);
          return;
        }
        if (event.type === 'recover') {
          console.log(`[Chaos] t=${event.at}: Recovery — removing all faults`);
          await this.removeAllFaults(runId);
          if (onFaultRemoved) onFaultRemoved({ type: 'recover', at: event.at });
          return;
        }

        console.log(`[Chaos] t=${event.at}: Applying ${event.type} to ${event.target}`);
        const faultId = await this.applyFault(runId, event);
        if (onFaultApplied) onFaultApplied(event);

        const evidence = getEvidenceStore();
        await evidence.storeChaosEvent(runId, {
          fault_type: event.type,
          target: event.target,
          params: event.params,
          applied_at: new Date().toISOString(),
        });

        if (event.duration) {
          const durationMs = this.parseOffset(event.duration);
          setTimeout(async () => {
            await this.removeFault(runId, faultId);
            if (onFaultRemoved) onFaultRemoved({ ...event, removed_at: new Date() });
          }, durationMs);
        }
      }, offsetMs);

      runTimers.push(timer);
    }

    this.timers.set(runId, runTimers);
    return { experiment_id: experimentId, scheduled_events: timeline.length };
  }

  async applyFault(runId, event) {
    const faultId = `${runId}-${event.type}-${Date.now()}`;
    const faultDef = FAULT_CATALOG[event.type];
    const mechanism = event.mechanism || faultDef.mechanisms[0];

    const faultRecord = {
      id: faultId,
      type: event.type,
      target: event.target,
      params: { ...faultDef.params, ...event.params },
      mechanism,
      applied_at: new Date(),
      status: 'active',
    };

    switch (mechanism) {
      case 'toxiproxy':
        faultRecord.command = this.buildToxiproxyCommand(event);
        break;
      case 'tc_netem':
        faultRecord.command = this.buildTcCommand(event);
        break;
      case 'chaos_mesh':
        faultRecord.manifest = this.buildChaosMeshManifest(event);
        break;
      case 'kubectl':
        faultRecord.command = this.buildKubectlCommand(event);
        break;
      default:
        faultRecord.command = `echo "Simulated fault: ${event.type}"`;
    }

    if (!this.activeFaults.has(runId)) this.activeFaults.set(runId, new Map());
    this.activeFaults.get(runId).set(faultId, faultRecord);

    console.log(`[Chaos] Fault applied: ${faultId} (${mechanism})`);
    return faultId;
  }

  async removeFault(runId, faultId) {
    const faults = this.activeFaults.get(runId);
    if (!faults || !faults.has(faultId)) return;
    faults.delete(faultId);
    console.log(`[Chaos] Fault removed: ${faultId}`);
  }

  async removeAllFaults(runId) {
    const faults = this.activeFaults.get(runId);
    if (faults) {
      for (const faultId of faults.keys()) {
        await this.removeFault(runId, faultId);
      }
    }
  }

  async evaluateHypothesis(experimentId, runId, runMetrics) {
    const pool = (await import('./db.js')).getPool();
    const result = await pool.query('SELECT hypothesis FROM chaos_experiments WHERE id = $1', [experimentId]);
    const hypothesis = result.rows[0]?.hypothesis;
    if (!hypothesis) return { evaluated: false, reason: 'No hypothesis defined' };

    const results = [];
    for (const metric of hypothesis.metrics) {
      const actual = this.extractMetricValue(metric.name, metric.percentile, runMetrics);
      const threshold = this.parseThreshold(metric.threshold);

      let passed;
      switch (metric.comparator) {
        case 'less_than': passed = actual < threshold; break;
        case 'greater_than': passed = actual > threshold; break;
        case 'less_than_or_equal': passed = actual <= threshold; break;
        case 'greater_than_or_equal': passed = actual >= threshold; break;
        case 'equals': passed = Math.abs(actual - threshold) < 0.001; break;
        default: passed = actual < threshold;
      }

      results.push({
        metric: metric.name,
        percentile: metric.percentile,
        expected: `${metric.comparator} ${metric.threshold}`,
        actual,
        threshold,
        passed,
      });
    }

    const overallPassed = results.every(r => r.passed);

    await dbv2.createChaosResult({
      experiment_id: experimentId,
      run_id: runId,
      fault_type: 'hypothesis_evaluation',
      fault_applied_at: new Date(),
      hypothesis_passed: overallPassed,
      impact_metrics: { results },
      observations: overallPassed
        ? `Hypothesis confirmed: "${hypothesis.statement}"`
        : `Hypothesis rejected: "${hypothesis.statement}" — ${results.filter(r => !r.passed).length} metric(s) exceeded threshold`,
    });

    return {
      hypothesis: hypothesis.statement,
      overall_passed: overallPassed,
      results,
    };
  }

  extractMetricValue(metricName, percentile, runMetrics) {
    const summary = runMetrics?.k6_summary || {};
    if (percentile) {
      const key = `${metricName}_p${percentile}`;
      return summary[key] || summary[`http_req_duration_p${percentile}`] || 0;
    }
    return summary[metricName] || summary.http_req_duration_avg || 0;
  }

  parseThreshold(threshold) {
    if (typeof threshold === 'number') return threshold;
    const str = String(threshold);
    if (str.endsWith('ms')) return parseFloat(str);
    if (str.endsWith('s')) return parseFloat(str) * 1000;
    if (str.endsWith('%')) return parseFloat(str) / 100;
    return parseFloat(str);
  }

  parseOffset(offset) {
    if (typeof offset === 'number') return offset;
    const str = String(offset);
    if (str.endsWith('ms')) return parseInt(str);
    if (str.endsWith('s')) return parseInt(str) * 1000;
    if (str.endsWith('m')) return parseInt(str) * 60000;
    if (str.endsWith('h')) return parseInt(str) * 3600000;
    return parseInt(str);
  }

  buildToxiproxyCommand(event) {
    const params = { ...FAULT_CATALOG[event.type]?.params, ...event.params };
    const target = event.target || 'upstream';
    switch (event.type) {
      case 'network_latency':
        return `toxiproxy-cli toxic add -t latency -a latency=${parseInt(params.delay)} -a jitter=${parseInt(params.jitter || 0)} ${target}`;
      case 'connection_drop':
        return `toxiproxy-cli toxic add -t reset_peer -a timeout=0 ${target}`;
      case 'slow_response':
        return `toxiproxy-cli toxic add -t slow_close -a delay=${parseInt(params.delay)} ${target}`;
      default:
        return `echo "Toxiproxy: ${event.type}"`;
    }
  }

  buildTcCommand(event) {
    const params = { ...FAULT_CATALOG[event.type]?.params, ...event.params };
    const iface = event.interface || 'eth0';
    switch (event.type) {
      case 'network_latency':
        return `tc qdisc add dev ${iface} root netem delay ${params.delay} ${params.jitter || ''}`;
      case 'packet_loss':
        return `tc qdisc add dev ${iface} root netem loss ${params.loss_percent}%`;
      case 'bandwidth_throttle':
        return `tc qdisc add dev ${iface} root tbf rate ${params.rate} burst ${params.burst} latency 400ms`;
      default:
        return `echo "tc: ${event.type}"`;
    }
  }

  buildChaosMeshManifest(event) {
    const params = { ...FAULT_CATALOG[event.type]?.params, ...event.params };
    const selector = event.target || 'app=target';

    const base = {
      apiVersion: 'chaos-mesh.org/v1alpha1',
      metadata: { name: `sarfat-${event.type}-${Date.now()}`, namespace: 'default' },
      spec: {
        selector: { labelSelectors: this.parseLabelSelector(selector) },
        mode: 'one',
        duration: event.duration || '60s',
      },
    };

    switch (event.type) {
      case 'pod_kill':
        return { ...base, kind: 'PodChaos', spec: { ...base.spec, action: 'pod-kill', gracePeriod: parseInt(params.grace_period) || 0 } };
      case 'container_pause':
        return { ...base, kind: 'PodChaos', spec: { ...base.spec, action: 'container-kill' } };
      case 'memory_pressure':
        return { ...base, kind: 'StressChaos', spec: { ...base.spec, stressors: { memory: { workers: params.workers, size: params.size } } } };
      case 'cpu_stress':
        return { ...base, kind: 'StressChaos', spec: { ...base.spec, stressors: { cpu: { workers: params.workers, load: params.load } } } };
      case 'disk_io_saturation':
        return { ...base, kind: 'IOChaos', spec: { ...base.spec, action: 'mixed', attr: { size: parseInt(params.size) * 1024 * 1024 } } };
      case 'clock_skew':
        return { ...base, kind: 'TimeChaos', spec: { ...base.spec, timeOffset: params.offset } };
      default:
        return base;
    }
  }

  buildKubectlCommand(event) {
    const params = { ...FAULT_CATALOG[event.type]?.params, ...event.params };
    if (event.type === 'pod_kill') {
      return `kubectl delete pod -l ${event.target} --grace-period=${parseInt(params.grace_period) || 0} --wait=false`;
    }
    return `echo "kubectl: ${event.type}"`;
  }

  parseLabelSelector(selector) {
    const labels = {};
    for (const part of selector.split(',')) {
      const [key, value] = part.trim().split('=');
      if (key && value) labels[key.trim()] = value.trim();
    }
    return labels;
  }

  cleanup(runId) {
    this.removeAllFaults(runId);
    const timers = this.timers.get(runId);
    if (timers) {
      for (const timer of timers) clearTimeout(timer);
      this.timers.delete(runId);
    }
  }
}

export const chaosEngine = new ChaosEngine();
