import { v4 as uuidv4 } from 'uuid';
import * as dbv2 from './db-v2.js';

const HEARTBEAT_TIMEOUT_MS = 30000;
const SHARD_OVERHEAD_FACTOR = 1.05;

const activeDispatches = new Map();

export class WorkerPool {
  constructor() {
    this.healthCheckInterval = null;
  }

  async start() {
    this.healthCheckInterval = setInterval(() => this.pruneStaleWorkers(), 15000);
    console.log('[WorkerPool] Manager started');
  }

  stop() {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
  }

  async register(data) {
    const worker = await dbv2.registerWorker({
      name: data.name,
      region: data.region,
      provider: data.provider || 'kubernetes',
      capacity_vus: data.capacity_vus || 30000,
      version: data.version,
      capabilities: data.capabilities || ['http', 'websocket', 'grpc'],
      endpoint: data.endpoint,
      labels: data.labels || {},
    });
    await dbv2.updateWorkerStatus(worker.id, 'online', 0);
    console.log(`[WorkerPool] Worker registered: ${worker.name} (${worker.region})`);
    return worker;
  }

  async heartbeat(workerId, metrics) {
    await dbv2.insertWorkerHeartbeat({
      worker_id: workerId,
      cpu_percent: metrics.cpu_percent,
      memory_percent: metrics.memory_percent,
      memory_bytes: metrics.memory_bytes,
      active_vus: metrics.active_vus || 0,
      active_runs: metrics.active_runs || 0,
      network_rx_bytes: metrics.network_rx_bytes,
      network_tx_bytes: metrics.network_tx_bytes,
      status: metrics.status || 'healthy',
    });
    return { ack: true, timestamp: new Date().toISOString() };
  }

  async deregister(workerId) {
    await dbv2.updateWorkerStatus(workerId, 'offline', 0);
    console.log(`[WorkerPool] Worker deregistered: ${workerId}`);
  }

  async getAvailableWorkers(requirements = {}) {
    const workers = await dbv2.getWorkers({ status: 'online' });
    return workers.filter(w => {
      if (requirements.region && w.region !== requirements.region) return false;
      if (requirements.min_capacity && (w.capacity_vus - w.current_vus) < requirements.min_capacity) return false;
      if (requirements.capabilities) {
        const caps = Array.isArray(w.capabilities) ? w.capabilities : [];
        if (!requirements.capabilities.every(c => caps.includes(c))) return false;
      }
      if (w.last_heartbeat_at && Date.now() - new Date(w.last_heartbeat_at).getTime() > HEARTBEAT_TIMEOUT_MS) return false;
      return true;
    });
  }

  async getWorkersByRegion() {
    const workers = await dbv2.getWorkers({});
    const byRegion = {};
    for (const w of workers) {
      if (!byRegion[w.region]) byRegion[w.region] = [];
      byRegion[w.region].push(w);
    }
    return byRegion;
  }

  async pruneStaleWorkers() {
    const workers = await dbv2.getWorkers({ status: 'online' });
    const now = Date.now();
    for (const w of workers) {
      if (w.last_heartbeat_at && now - new Date(w.last_heartbeat_at).getTime() > HEARTBEAT_TIMEOUT_MS * 2) {
        await dbv2.updateWorkerStatus(w.id, 'stale', 0);
        console.warn(`[WorkerPool] Worker stale: ${w.name} (last heartbeat ${Math.round((now - new Date(w.last_heartbeat_at).getTime()) / 1000)}s ago)`);
      }
    }
  }

  async getPoolStatus() {
    const workers = await dbv2.getWorkers({});
    const byRegion = {};
    let totalCapacity = 0;
    let totalInUse = 0;
    let onlineCount = 0;

    for (const w of workers) {
      if (!byRegion[w.region]) {
        byRegion[w.region] = { workers: 0, online: 0, capacity_vus: 0, in_use_vus: 0 };
      }
      byRegion[w.region].workers++;
      if (w.status === 'online') {
        byRegion[w.region].online++;
        onlineCount++;
      }
      byRegion[w.region].capacity_vus += w.capacity_vus;
      byRegion[w.region].in_use_vus += w.current_vus;
      totalCapacity += w.capacity_vus;
      totalInUse += w.current_vus;
    }

    return {
      total_workers: workers.length,
      online_workers: onlineCount,
      total_capacity_vus: totalCapacity,
      in_use_vus: totalInUse,
      available_vus: totalCapacity - totalInUse,
      utilization_percent: totalCapacity > 0 ? (totalInUse / totalCapacity * 100).toFixed(1) : 0,
      regions: byRegion,
    };
  }
}

export class ShardDistributor {
  async planDistribution(runId, totalVus, regions = [], requirements = {}) {
    const pool = new WorkerPool();
    let availableWorkers;

    if (regions.length > 0) {
      const allWorkers = [];
      for (const region of regions) {
        const regionWorkers = await pool.getAvailableWorkers({ ...requirements, region });
        allWorkers.push(...regionWorkers);
      }
      availableWorkers = allWorkers;
    } else {
      availableWorkers = await pool.getAvailableWorkers(requirements);
    }

    if (availableWorkers.length === 0) {
      throw new Error('No available workers in the pool');
    }

    const totalAvailable = availableWorkers.reduce((sum, w) => sum + (w.capacity_vus - w.current_vus), 0);
    if (totalAvailable < totalVus) {
      throw new Error(`Insufficient capacity: need ${totalVus} VUs, only ${totalAvailable} available`);
    }

    const shards = [];
    let remaining = totalVus;
    const sortedWorkers = availableWorkers.sort((a, b) =>
      (b.capacity_vus - b.current_vus) - (a.capacity_vus - a.current_vus)
    );

    for (let i = 0; i < sortedWorkers.length && remaining > 0; i++) {
      const worker = sortedWorkers[i];
      const available = worker.capacity_vus - worker.current_vus;
      const assignable = Math.min(remaining, Math.floor(available / SHARD_OVERHEAD_FACTOR));
      if (assignable <= 0) continue;

      shards.push({
        worker_id: worker.id,
        worker_name: worker.name,
        worker_region: worker.region,
        worker_endpoint: worker.endpoint,
        vus_assigned: assignable,
        shard_index: shards.length,
      });
      remaining -= assignable;
    }

    if (remaining > 0) {
      throw new Error(`Could not distribute all VUs: ${remaining} remaining`);
    }

    return {
      run_id: runId,
      total_vus: totalVus,
      total_shards: shards.length,
      shards,
      estimated_cost_per_hour: this.estimateSpotCost(shards),
    };
  }

  async executeDistribution(runId, plan) {
    const dispatch = { run_id: runId, shards: [], status: 'dispatching', created_at: new Date() };
    activeDispatches.set(runId, dispatch);

    for (const shard of plan.shards) {
      const dbShard = await dbv2.createTestShard({
        run_id: runId,
        worker_id: shard.worker_id,
        shard_index: shard.shard_index,
        total_shards: plan.total_shards,
        vus_assigned: shard.vus_assigned,
      });
      dispatch.shards.push({ ...shard, id: dbShard.id, status: 'pending' });
    }

    dispatch.status = 'dispatched';
    return dispatch;
  }

  async onShardComplete(shardId, result) {
    await dbv2.updateTestShard(shardId, {
      status: result.success ? 'complete' : 'failed',
      completed_at: new Date(),
      k6_summary: result.summary,
      error_output: result.error,
      metrics_count: result.metrics_count || 0,
    });
  }

  estimateSpotCost(shards) {
    const costPerVuHour = 0.000002;
    return shards.reduce((total, s) => total + s.vus_assigned * costPerVuHour, 0);
  }
}

export class MetricAggregator {
  aggregateShardSummaries(shardSummaries) {
    if (shardSummaries.length === 0) return null;
    if (shardSummaries.length === 1) return shardSummaries[0];

    const merged = {};
    const allKeys = new Set();
    for (const s of shardSummaries) {
      if (s) Object.keys(s).forEach(k => allKeys.add(k));
    }

    for (const key of allKeys) {
      const values = shardSummaries.map(s => s?.[key]).filter(v => v !== undefined && v !== null);
      if (values.length === 0) continue;

      if (typeof values[0] === 'number') {
        if (key.includes('count') || key.includes('reqs') || key.includes('iterations') || key.includes('bytes') || key.includes('data_')) {
          merged[key] = values.reduce((a, b) => a + b, 0);
        } else if (key.includes('max')) {
          merged[key] = Math.max(...values);
        } else if (key.includes('min')) {
          merged[key] = Math.min(...values);
        } else {
          merged[key] = values.reduce((a, b) => a + b, 0) / values.length;
        }
      } else {
        merged[key] = values[0];
      }
    }

    return merged;
  }
}

export function getActiveDispatches() {
  return Array.from(activeDispatches.values());
}

export function getDispatch(runId) {
  return activeDispatches.get(runId) || null;
}

export const workerPool = new WorkerPool();
export const shardDistributor = new ShardDistributor();
export const metricAggregator = new MetricAggregator();
