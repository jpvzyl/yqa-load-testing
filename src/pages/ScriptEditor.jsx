import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Editor from '@monaco-editor/react';
import {
  Play, Save, Loader2, AlertCircle, CheckCircle2, FileCode2,
  ChevronDown, Zap,
} from 'lucide-react';
import { tests } from '../lib/api';

const TEMPLATES = [
  {
    id: 'basic_load',
    label: 'Basic Load Test',
    script: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://test-api.k6.io/public/crocodiles/');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
`,
  },
  {
    id: 'stress_test',
    label: 'Stress Test (Ramping)',
    script: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const res = http.get('__TARGET_URL__');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
`,
  },
  {
    id: 'spike_test',
    label: 'Spike Test',
    script: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '10s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '10s', target: 10 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const res = http.get('__TARGET_URL__');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(0.5);
}
`,
  },
  {
    id: 'soak_test',
    label: 'Soak Test',
    script: `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5m', target: 50 },
    { duration: '1h', target: 50 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<1500'],
  },
};

export default function () {
  const res = http.get('__TARGET_URL__');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(2);
}
`,
  },
  {
    id: 'api_crud',
    label: 'API CRUD Operations',
    script: `import http from 'k6/http';
import { check, group, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '1m',
};

const BASE_URL = '__TARGET_URL__';
const headers = { 'Content-Type': 'application/json' };

export default function () {
  let id;

  group('Create', () => {
    const res = http.post(BASE_URL, JSON.stringify({ name: 'test' }), { headers });
    check(res, { 'created': (r) => r.status === 201 });
    id = res.json('id');
  });

  group('Read', () => {
    const res = http.get(\`\${BASE_URL}/\${id}\`);
    check(res, { 'fetched': (r) => r.status === 200 });
  });

  group('Update', () => {
    const res = http.put(\`\${BASE_URL}/\${id}\`, JSON.stringify({ name: 'updated' }), { headers });
    check(res, { 'updated': (r) => r.status === 200 });
  });

  group('Delete', () => {
    const res = http.del(\`\${BASE_URL}/\${id}\`);
    check(res, { 'deleted': (r) => r.status === 200 || r.status === 204 });
  });

  sleep(1);
}
`,
  },
];

export default function ScriptEditor() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const testId = searchParams.get('testId');

  const [script, setScript] = useState(TEMPLATES[0].script);
  const [testName, setTestName] = useState('');
  const [loading, setLoading] = useState(!!testId);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [valid, setValid] = useState(true);
  const [currentTestId, setCurrentTestId] = useState(testId);

  useEffect(() => {
    if (!testId) { setLoading(false); return; }
    tests.get(testId)
      .then((res) => {
        setScript(res.data.script || '');
        setTestName(res.data.name || '');
        setCurrentTestId(testId);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load test'))
      .finally(() => setLoading(false));
  }, [testId]);

  const handleEditorChange = useCallback((value) => {
    setScript(value || '');
    setSaved(false);
    setValid(value?.includes('export default') ?? false);
  }, []);

  const handleTemplate = (templateId) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (tpl) { setScript(tpl.script); setSaved(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (currentTestId) {
        await tests.update(currentTestId, { script, name: testName || undefined });
      } else {
        const res = await tests.create({
          name: testName || 'Untitled Script',
          script,
          script_source: 'script_editor',
        });
        setCurrentTestId(res.data?.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!currentTestId) await handleSave();
    if (!currentTestId && !error) return;
    setRunning(true);
    try {
      const res = await tests.run(currentTestId);
      navigate(`/live/${res.data?.id || currentTestId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start run');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="w-72 shrink-0 flex flex-col gap-4">
        <div className="glass-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-accent" />
            <h2 className="font-semibold text-text-primary">Script Editor</h2>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Test Name</label>
            <input
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
              placeholder="My Load Test"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Template</label>
            <div className="relative">
              <select
                className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/60 transition-colors"
                onChange={(e) => handleTemplate(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>Choose a template...</option>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {valid ? (
              <><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-success">Valid script</span></>
            ) : (
              <><AlertCircle className="w-4 h-4 text-warning" /><span className="text-warning">Missing default export</span></>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Script'}
          </button>
          <button onClick={handleRun} disabled={running || saving} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Starting...' : 'Run Test'}
          </button>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-3 py-2.5 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </motion.div>
        )}

        <div className="glass-card p-4 flex-1">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Quick Reference</h3>
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex items-center gap-2"><Zap className="w-3 h-3 text-accent" /> <code>http.get(url)</code></div>
            <div className="flex items-center gap-2"><Zap className="w-3 h-3 text-accent" /> <code>http.post(url, body)</code></div>
            <div className="flex items-center gap-2"><Zap className="w-3 h-3 text-accent" /> <code>check(res, {'{}'})</code></div>
            <div className="flex items-center gap-2"><Zap className="w-3 h-3 text-accent" /> <code>sleep(seconds)</code></div>
            <div className="flex items-center gap-2"><Zap className="w-3 h-3 text-accent" /> <code>group(name, fn)</code></div>
          </div>
        </div>
      </motion.div>

      {/* Editor */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex-1 glass-card overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={script}
          onChange={handleEditorChange}
          options={{
            fontSize: 14,
            minimap: { enabled: true },
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          }
        />
      </motion.div>
    </motion.div>
  );
}
