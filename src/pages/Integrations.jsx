import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Puzzle, GitBranch, Bell, Mail, Globe, Copy,
  CheckCircle2, Save, Loader2, Webhook,
} from 'lucide-react';
import { cn } from '../lib/utils';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const GITHUB_YAML = `# .github/workflows/load-test.yml
name: Performance Test
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1-5'

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Load Test
        env:
          YQA_API_KEY: \${{ secrets.YQA_API_KEY }}
          YQA_BASE_URL: \${{ secrets.YQA_BASE_URL }}
        run: |
          curl -X POST "\${YQA_BASE_URL}/api/v1/tests/\${TEST_ID}/run" \\
            -H "Authorization: Bearer \${YQA_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -d '{"source": "ci", "commit": "GITHUB_SHA"}'`;

const GITLAB_YAML = `# .gitlab-ci.yml
load-test:
  stage: test
  image: alpine/curl
  only:
    - main
  script:
    - |
      curl -X POST "\${YQA_BASE_URL}/api/v1/tests/\${TEST_ID}/run" \\
        -H "Authorization: Bearer \${YQA_API_KEY}" \\
        -H "Content-Type: application/json" \\
        -d '{"source": "ci", "commit": "'$CI_COMMIT_SHA'"}'`;

function CodeBlock({ title, code, language = 'yaml' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-bg-primary border border-border/60 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
        <span className="text-xs font-medium text-text-muted">{title}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors">
          {copied ? <><CheckCircle2 className="w-3 h-3 text-success" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-text-secondary overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}

export default function Integrations() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState({
    slackWebhook: '',
    genericWebhook: '',
    email: '',
  });

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-4xl mx-auto">
      <div>
        <div className="flex items-center gap-3">
          <Puzzle className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Integrations</h1>
        </div>
        <p className="text-text-secondary mt-1">Connect Y-QA with your existing tools and workflows</p>
      </div>

      {/* CI/CD */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">CI/CD Integration</h2>
        </div>
        <p className="text-sm text-text-secondary">
          Trigger load tests automatically from your CI/CD pipeline. Add these configurations to run performance tests on every deployment.
        </p>
        <div className="space-y-4">
          <CodeBlock title="GitHub Actions" code={GITHUB_YAML} />
          <CodeBlock title="GitLab CI" code={GITLAB_YAML} />
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Notification Channels</h2>
        </div>
        <p className="text-sm text-text-secondary">
          Get notified when tests complete, SLAs are breached, or regressions are detected.
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-[#4A154B] flex items-center justify-center text-white text-xs font-bold">#</span>
              Slack Webhook URL
            </label>
            <input
              className={inputClass}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              value={config.slackWebhook}
              onChange={(e) => setConfig((c) => ({ ...c, slackWebhook: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Webhook className="w-4 h-4 text-text-muted" />
              Generic Webhook URL
            </label>
            <input
              className={inputClass}
              placeholder="https://your-server.com/webhook/yqa"
              value={config.genericWebhook}
              onChange={(e) => setConfig((c) => ({ ...c, genericWebhook: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Mail className="w-4 h-4 text-text-muted" />
              Email Notifications
            </label>
            <input
              className={inputClass}
              type="email"
              placeholder="team@company.com"
              value={config.email}
              onChange={(e) => setConfig((c) => ({ ...c, email: e.target.value }))}
            />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Configuration'}
        </button>
      </motion.div>
    </motion.div>
  );
}
