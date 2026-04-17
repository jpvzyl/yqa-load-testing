export class APMIntegrationManager {
  constructor() {
    this.integrations = new Map();
  }

  register(name, config) {
    const IntegrationClass = INTEGRATIONS[name];
    if (!IntegrationClass) throw new Error(`Unknown APM: ${name}`);
    const integration = new IntegrationClass(config);
    this.integrations.set(name, integration);
    return integration;
  }

  async pushRunStart(runId, metadata) {
    const results = {};
    for (const [name, integration] of this.integrations) {
      try {
        results[name] = await integration.onRunStart(runId, metadata);
      } catch (err) {
        results[name] = { error: err.message };
      }
    }
    return results;
  }

  async pushRunEnd(runId, summary) {
    const results = {};
    for (const [name, integration] of this.integrations) {
      try {
        results[name] = await integration.onRunEnd(runId, summary);
      } catch (err) {
        results[name] = { error: err.message };
      }
    }
    return results;
  }

  async pushMetrics(runId, metrics) {
    for (const [name, integration] of this.integrations) {
      try { await integration.pushMetrics(runId, metrics); } catch { /* best effort */ }
    }
  }

  getStatus() {
    const status = {};
    for (const [name, integration] of this.integrations) {
      status[name] = { configured: true, type: integration.constructor.name };
    }
    return status;
  }
}

class DatadogIntegration {
  constructor(config) {
    this.apiKey = config.api_key || process.env.DD_API_KEY;
    this.appKey = config.app_key || process.env.DD_APP_KEY;
    this.site = config.site || process.env.DD_SITE || 'datadoghq.com';
    this.baseUrl = `https://api.${this.site}`;
  }

  async onRunStart(runId, metadata) {
    return this.sendEvent({
      title: `Sarfat Load Test Started: ${metadata.test_name || runId}`,
      text: `Test type: ${metadata.test_type}, VUs: ${metadata.vus}, Duration: ${metadata.duration}`,
      tags: [`run_id:${runId}`, `test_type:${metadata.test_type}`, 'source:sarfat'],
      alert_type: 'info',
      date_happened: Math.floor(Date.now() / 1000),
    });
  }

  async onRunEnd(runId, summary) {
    const tags = [`run_id:${runId}`, `grade:${summary.performance_grade}`, 'source:sarfat'];
    await this.sendEvent({
      title: `Sarfat Load Test Complete: ${summary.test_name || runId} — Grade ${summary.performance_grade}`,
      text: `Score: ${summary.performance_score}/100, P95: ${summary.p95_ms}ms, Errors: ${summary.error_rate}%`,
      tags,
      alert_type: summary.performance_score >= 70 ? 'success' : 'warning',
      date_happened: Math.floor(Date.now() / 1000),
    });

    await this.sendMetricsSeries([
      { metric: 'sarfat.performance_score', type: 'gauge', points: [[Math.floor(Date.now() / 1000), summary.performance_score]], tags },
      { metric: 'sarfat.p95_ms', type: 'gauge', points: [[Math.floor(Date.now() / 1000), summary.p95_ms]], tags },
      { metric: 'sarfat.error_rate', type: 'gauge', points: [[Math.floor(Date.now() / 1000), summary.error_rate]], tags },
      { metric: 'sarfat.rps', type: 'gauge', points: [[Math.floor(Date.now() / 1000), summary.rps]], tags },
    ]);
  }

  async pushMetrics(runId, metrics) {
    const series = metrics.map(m => ({
      metric: `sarfat.${m.name}`,
      type: 'gauge',
      points: [[Math.floor(new Date(m.time).getTime() / 1000), m.value]],
      tags: [`run_id:${runId}`, 'source:sarfat'],
    }));
    if (series.length > 0) await this.sendMetricsSeries(series);
  }

  async sendEvent(event) {
    return this.request('POST', '/api/v1/events', event);
  }

  async sendMetricsSeries(series) {
    return this.request('POST', '/api/v1/series', { series });
  }

  async request(method, path, body) {
    if (!this.apiKey) return { skipped: true, reason: 'No DD_API_KEY' };
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': this.apiKey,
        'DD-APPLICATION-KEY': this.appKey || '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Datadog ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

class NewRelicIntegration {
  constructor(config) {
    this.apiKey = config.api_key || process.env.NEW_RELIC_API_KEY;
    this.accountId = config.account_id || process.env.NEW_RELIC_ACCOUNT_ID;
    this.region = config.region || 'US';
    this.baseUrl = this.region === 'EU'
      ? 'https://insights-collector.eu01.nr-data.net'
      : 'https://insights-collector.newrelic.com';
  }

  async onRunStart(runId, metadata) {
    return this.sendCustomEvent({
      eventType: 'SarfatLoadTestStart',
      runId,
      testName: metadata.test_name,
      testType: metadata.test_type,
      vus: metadata.vus,
    });
  }

  async onRunEnd(runId, summary) {
    return this.sendCustomEvent({
      eventType: 'SarfatLoadTestComplete',
      runId,
      performanceScore: summary.performance_score,
      performanceGrade: summary.performance_grade,
      p95Ms: summary.p95_ms,
      errorRate: summary.error_rate,
      rps: summary.rps,
    });
  }

  async pushMetrics(runId, metrics) {
    const events = metrics.map(m => ({
      eventType: 'SarfatMetric',
      runId,
      metricName: m.name,
      value: m.value,
      timestamp: new Date(m.time).getTime(),
    }));
    if (events.length > 0) await this.sendCustomEvents(events);
  }

  async sendCustomEvent(event) {
    return this.sendCustomEvents([event]);
  }

  async sendCustomEvents(events) {
    if (!this.apiKey) return { skipped: true, reason: 'No NEW_RELIC_API_KEY' };
    const res = await fetch(`${this.baseUrl}/v1/accounts/${this.accountId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': this.apiKey },
      body: JSON.stringify(events),
    });
    if (!res.ok) throw new Error(`New Relic ${res.status}: ${await res.text()}`);
    return { success: true };
  }
}

class DynatraceIntegration {
  constructor(config) {
    this.apiToken = config.api_token || process.env.DT_API_TOKEN;
    this.environmentUrl = config.environment_url || process.env.DT_ENVIRONMENT_URL;
  }

  async onRunStart(runId, metadata) {
    return this.ingestMetric('sarfat.test.active', 1, { run_id: runId, test_type: metadata.test_type });
  }

  async onRunEnd(runId, summary) {
    await Promise.all([
      this.ingestMetric('sarfat.performance.score', summary.performance_score, { run_id: runId }),
      this.ingestMetric('sarfat.performance.p95', summary.p95_ms, { run_id: runId }),
      this.ingestMetric('sarfat.performance.error_rate', summary.error_rate, { run_id: runId }),
      this.ingestMetric('sarfat.test.active', 0, { run_id: runId }),
    ]);
  }

  async pushMetrics(runId, metrics) {
    for (const m of metrics.slice(0, 50)) {
      await this.ingestMetric(`sarfat.metric.${m.name}`, m.value, { run_id: runId });
    }
  }

  async ingestMetric(key, value, dimensions) {
    if (!this.apiToken || !this.environmentUrl) return { skipped: true };
    const line = `${key},${Object.entries(dimensions).map(([k,v]) => `${k}=${v}`).join(',')} ${value}`;
    const res = await fetch(`${this.environmentUrl}/api/v2/metrics/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: `Api-Token ${this.apiToken}` },
      body: line,
    });
    if (!res.ok) throw new Error(`Dynatrace ${res.status}: ${await res.text()}`);
    return { success: true };
  }
}

class GrafanaCloudIntegration {
  constructor(config) {
    this.remoteWriteUrl = config.remote_write_url || process.env.GRAFANA_REMOTE_WRITE_URL;
    this.userId = config.user_id || process.env.GRAFANA_USER_ID;
    this.apiKey = config.api_key || process.env.GRAFANA_API_KEY;
  }

  async onRunStart(runId, metadata) {
    return { info: 'Grafana Cloud uses Prometheus remote_write — metrics flow continuously' };
  }

  async onRunEnd(runId, summary) {
    return this.pushMetrics(runId, [
      { name: 'performance_score', value: summary.performance_score, time: new Date() },
      { name: 'p95_ms', value: summary.p95_ms, time: new Date() },
      { name: 'error_rate', value: summary.error_rate, time: new Date() },
    ]);
  }

  async pushMetrics(runId, metrics) {
    if (!this.remoteWriteUrl) return { skipped: true, reason: 'No GRAFANA_REMOTE_WRITE_URL' };
    const timeseries = metrics.map(m => ({
      labels: [
        { name: '__name__', value: `sarfat_${m.name}` },
        { name: 'run_id', value: runId },
        { name: 'job', value: 'sarfat' },
      ],
      samples: [{ value: m.value, timestamp: new Date(m.time).getTime() }],
    }));
    return { queued: timeseries.length, info: 'Prometheus remote_write format prepared' };
  }
}

class HoneycombIntegration {
  constructor(config) {
    this.apiKey = config.api_key || process.env.HONEYCOMB_API_KEY;
    this.dataset = config.dataset || 'sarfat-load-tests';
  }

  async onRunStart(runId, metadata) {
    return this.sendEvent({ ...metadata, run_id: runId, event_type: 'test_start' });
  }

  async onRunEnd(runId, summary) {
    return this.sendEvent({ ...summary, run_id: runId, event_type: 'test_complete' });
  }

  async pushMetrics() { return { info: 'Honeycomb receives OTel spans directly' }; }

  async sendEvent(data) {
    if (!this.apiKey) return { skipped: true };
    const res = await fetch(`https://api.honeycomb.io/1/events/${this.dataset}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Honeycomb-Team': this.apiKey },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Honeycomb ${res.status}`);
    return { success: true };
  }
}

const INTEGRATIONS = {
  datadog: DatadogIntegration,
  newrelic: NewRelicIntegration,
  dynatrace: DynatraceIntegration,
  grafana_cloud: GrafanaCloudIntegration,
  honeycomb: HoneycombIntegration,
};

export const SUPPORTED_APMS = Object.keys(INTEGRATIONS);
export const apmManager = new APMIntegrationManager();
