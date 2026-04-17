const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const METRIC_BATCH_SIZE = 500;
const FLUSH_INTERVAL_MS = 1000;

export class NatsMetricBus {
  constructor(options = {}) {
    this.serverUrl = options.url || process.env.NATS_URL || 'nats://localhost:4222';
    this.credentials = options.credentials || null;
    this.connection = null;
    this.jetstream = null;
    this.subscriptions = new Map();
    this.metricBuffer = new Map();
    this.flushInterval = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.onMetricBatch = options.onMetricBatch || null;
    this.onError = options.onError || console.error;
  }

  async connect() {
    try {
      const nats = await import('nats').catch(() => null);
      if (!nats) {
        console.warn('[NATS] nats package not installed — using in-process message bus');
        this.connected = false;
        this.startInProcessBus();
        return;
      }

      const opts = { servers: this.serverUrl, maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS };
      if (this.credentials) opts.user = this.credentials.user;
      if (this.credentials?.pass) opts.pass = this.credentials.pass;
      if (this.credentials?.token) opts.token = this.credentials.token;

      this.connection = await nats.connect(opts);
      this.jetstream = this.connection.jetstream();
      this.connected = true;
      this.reconnectAttempts = 0;

      await this.ensureStreams();
      this.startFlushLoop();

      console.log(`[NATS] Connected to ${this.serverUrl}`);

      (async () => {
        for await (const status of this.connection.status()) {
          if (status.type === 'disconnect') {
            this.connected = false;
            console.warn('[NATS] Disconnected');
          } else if (status.type === 'reconnect') {
            this.connected = true;
            console.log('[NATS] Reconnected');
          }
        }
      })().catch(() => {});

    } catch (err) {
      console.warn(`[NATS] Connection failed: ${err.message} — using in-process bus`);
      this.connected = false;
      this.startInProcessBus();
    }
  }

  async ensureStreams() {
    if (!this.jetstream) return;
    const jsm = await this.connection.jetstreamManager();

    const streams = [
      { name: 'METRICS', subjects: ['metrics.>'], retention: 'limits', max_age: 7 * 24 * 60 * 60 * 1e9 },
      { name: 'CONTROL', subjects: ['control.>'], retention: 'limits', max_age: 24 * 60 * 60 * 1e9 },
      { name: 'EVENTS', subjects: ['events.>'], retention: 'limits', max_age: 30 * 24 * 60 * 60 * 1e9 },
    ];

    for (const stream of streams) {
      try {
        await jsm.streams.add({
          name: stream.name,
          subjects: stream.subjects,
          retention: stream.retention,
          max_age: stream.max_age,
          storage: 'file',
          num_replicas: 1,
        });
      } catch (err) {
        if (!err.message?.includes('already in use')) {
          console.warn(`[NATS] Stream ${stream.name}: ${err.message}`);
        }
      }
    }
  }

  startInProcessBus() {
    this.inProcessHandlers = new Map();
    this.startFlushLoop();
    console.log('[NATS] In-process message bus active');
  }

  startFlushLoop() {
    this.flushInterval = setInterval(() => this.flushMetrics(), FLUSH_INTERVAL_MS);
  }

  async publishMetric(runId, workerId, metricName, data) {
    const subject = `metrics.${runId}.${workerId}.${metricName}`;
    const payload = JSON.stringify({
      run_id: runId,
      worker_id: workerId,
      metric_name: metricName,
      timestamp: new Date().toISOString(),
      ...data,
    });

    if (this.connected && this.jetstream) {
      try {
        await this.jetstream.publish(subject, new TextEncoder().encode(payload));
      } catch (err) {
        this.bufferMetric(runId, payload);
      }
    } else {
      this.bufferMetric(runId, payload);
      this.deliverInProcess(subject, payload);
    }
  }

  async publishMetricBatch(runId, workerId, metrics) {
    for (const metric of metrics) {
      await this.publishMetric(runId, workerId, metric.name, metric);
    }
  }

  bufferMetric(runId, payload) {
    if (!this.metricBuffer.has(runId)) {
      this.metricBuffer.set(runId, []);
    }
    const buffer = this.metricBuffer.get(runId);
    buffer.push(payload);
    if (buffer.length >= METRIC_BATCH_SIZE) {
      this.flushRunMetrics(runId);
    }
  }

  async flushMetrics() {
    for (const [runId] of this.metricBuffer) {
      await this.flushRunMetrics(runId);
    }
  }

  async flushRunMetrics(runId) {
    const buffer = this.metricBuffer.get(runId);
    if (!buffer || buffer.length === 0) return;

    const batch = buffer.splice(0, METRIC_BATCH_SIZE);
    if (this.onMetricBatch) {
      try {
        const parsed = batch.map(b => {
          try { return JSON.parse(b); } catch { return null; }
        }).filter(Boolean);
        await this.onMetricBatch(runId, parsed);
      } catch (err) {
        this.onError(`[NATS] Batch handler error: ${err.message}`);
      }
    }

    if (buffer.length === 0) {
      this.metricBuffer.delete(runId);
    }
  }

  async publishControl(action, data) {
    const subject = `control.${action}`;
    const payload = JSON.stringify({ action, timestamp: new Date().toISOString(), ...data });

    if (this.connected && this.connection) {
      this.connection.publish(subject, new TextEncoder().encode(payload));
    } else {
      this.deliverInProcess(subject, payload);
    }
  }

  async publishEvent(eventType, data) {
    const subject = `events.${eventType}`;
    const payload = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), ...data });

    if (this.connected && this.connection) {
      this.connection.publish(subject, new TextEncoder().encode(payload));
    } else {
      this.deliverInProcess(subject, payload);
    }
  }

  async subscribe(subject, handler) {
    if (this.connected && this.connection) {
      const sub = this.connection.subscribe(subject);
      this.subscriptions.set(subject, sub);
      (async () => {
        for await (const msg of sub) {
          try {
            const data = JSON.parse(new TextDecoder().decode(msg.data));
            handler(data, msg);
          } catch (err) {
            this.onError(`[NATS] Message parse error: ${err.message}`);
          }
        }
      })().catch(() => {});
    } else {
      if (!this.inProcessHandlers) this.inProcessHandlers = new Map();
      if (!this.inProcessHandlers.has(subject)) this.inProcessHandlers.set(subject, []);
      this.inProcessHandlers.get(subject).push(handler);
    }
  }

  async subscribeToRunMetrics(runId, handler) {
    await this.subscribe(`metrics.${runId}.>`, handler);
  }

  async subscribeToControl(handler) {
    await this.subscribe('control.>', handler);
  }

  deliverInProcess(subject, payload) {
    if (!this.inProcessHandlers) return;
    for (const [pattern, handlers] of this.inProcessHandlers) {
      if (this.matchSubject(pattern, subject)) {
        const data = JSON.parse(payload);
        for (const handler of handlers) {
          try { handler(data); } catch (err) { this.onError(err); }
        }
      }
    }
  }

  matchSubject(pattern, subject) {
    if (pattern === subject) return true;
    if (pattern.endsWith('.>')) {
      return subject.startsWith(pattern.slice(0, -2));
    }
    const patParts = pattern.split('.');
    const subParts = subject.split('.');
    if (patParts.length !== subParts.length) return false;
    return patParts.every((p, i) => p === '*' || p === subParts[i]);
  }

  async unsubscribe(subject) {
    const sub = this.subscriptions.get(subject);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(subject);
    }
    if (this.inProcessHandlers) {
      this.inProcessHandlers.delete(subject);
    }
  }

  async close() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flushMetrics();
    for (const [, sub] of this.subscriptions) {
      sub.unsubscribe();
    }
    if (this.connection) {
      await this.connection.drain();
    }
    this.connected = false;
    console.log('[NATS] Connection closed');
  }

  getStatus() {
    return {
      connected: this.connected,
      server: this.serverUrl,
      mode: this.connected ? 'jetstream' : 'in-process',
      subscriptions: this.subscriptions.size + (this.inProcessHandlers?.size || 0),
      buffered_runs: this.metricBuffer.size,
      buffered_metrics: Array.from(this.metricBuffer.values()).reduce((sum, b) => sum + b.length, 0),
    };
  }
}

let defaultBus = null;

export function getMetricBus(options) {
  if (!defaultBus) {
    defaultBus = new NatsMetricBus(options);
  }
  return defaultBus;
}

export async function initializeMetricBus(options) {
  const bus = getMetricBus(options);
  await bus.connect();
  return bus;
}
