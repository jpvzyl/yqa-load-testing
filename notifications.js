const PROVIDERS = {
  slack: sendSlack,
  webhook: sendWebhook,
  email: sendEmail,
};

export async function notify(event, data, config) {
  if (!config || !config.enabled) return;

  const results = [];
  for (const channel of config.channels || []) {
    const provider = PROVIDERS[channel.type];
    if (!provider) continue;

    try {
      await provider(event, data, channel);
      results.push({ type: channel.type, success: true });
    } catch (err) {
      console.warn(`[Notifications] ${channel.type} failed: ${err.message}`);
      results.push({ type: channel.type, success: false, error: err.message });
    }
  }
  return results;
}

export function formatTestComplete(run, analysis) {
  const score = run.performance_score;
  const grade = run.performance_grade;
  const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '🔴';
  const testName = run.test_name || 'Load Test';
  const duration = run.duration_ms ? (run.duration_ms / 1000).toFixed(1) + 's' : 'N/A';
  const summary = run.k6_summary || {};

  return {
    title: `${emoji} Load Test Complete: ${testName}`,
    text: `Score: ${score}/100 (${grade}) | Duration: ${duration}`,
    fields: [
      { name: 'Test Type', value: run.test_type || 'load', inline: true },
      { name: 'Score', value: `${score}/100 (${grade})`, inline: true },
      { name: 'Avg Response', value: summary.http_req_duration_avg ? summary.http_req_duration_avg.toFixed(0) + 'ms' : 'N/A', inline: true },
      { name: 'P95 Response', value: summary.http_req_duration_p95 ? summary.http_req_duration_p95.toFixed(0) + 'ms' : 'N/A', inline: true },
      { name: 'Error Rate', value: summary.http_req_failed_rate ? (summary.http_req_failed_rate * 100).toFixed(2) + '%' : '0%', inline: true },
      { name: 'Total Requests', value: summary.http_reqs?.toLocaleString() || 'N/A', inline: true },
    ],
    bottlenecks: analysis?.pass1?.bottlenecks?.slice(0, 3) || [],
    recommendation: analysis?.pass3?.go_nogo_recommendation || 'N/A',
    color: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444',
  };
}

export function formatRegression(run, regression) {
  return {
    title: `🔴 Performance Regression Detected: ${run.test_name || 'Load Test'}`,
    text: regression.summary,
    fields: regression.regressions?.map(r => ({
      name: r.label,
      value: `${r.current_value.toFixed(2)} (was ${r.historical_mean.toFixed(2)}, ${r.change_from_mean_percent > 0 ? '+' : ''}${r.change_from_mean_percent}%)`,
      inline: true,
    })) || [],
    color: '#ef4444',
  };
}

async function sendSlack(event, data, channel) {
  if (!channel.webhook_url) throw new Error('Slack webhook URL required');

  const message = typeof data === 'string' ? { text: data } : {
    text: data.title,
    attachments: [{
      color: data.color || '#3b82f6',
      title: data.title,
      text: data.text,
      fields: (data.fields || []).map(f => ({
        title: f.name,
        value: f.value,
        short: f.inline,
      })),
      footer: 'Y-QA Load Testing Platform',
      ts: Math.floor(Date.now() / 1000),
    }],
  };

  const response = await fetch(channel.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack API returned ${response.status}`);
  }
}

async function sendWebhook(event, data, channel) {
  if (!channel.url) throw new Error('Webhook URL required');

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const headers = {
    'Content-Type': 'application/json',
    ...(channel.headers || {}),
  };

  if (channel.secret) {
    const { createHmac } = await import('crypto');
    const body = JSON.stringify(payload);
    headers['X-Signature'] = createHmac('sha256', channel.secret).update(body).digest('hex');
  }

  const response = await fetch(channel.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}`);
  }
}

async function sendEmail(_event, data, channel) {
  console.log(`[Notifications] Email notification to ${channel.to}: ${data.title || data}`);
}
