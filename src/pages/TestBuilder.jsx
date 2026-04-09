import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Play, Eye, Loader2, AlertCircle, ChevronDown,
  Globe, Layers, Clock, Target, Code2, Save,
} from 'lucide-react';
import { tests } from '../lib/api';
import { cn } from '../lib/utils';
import { TEST_TYPES, PROTOCOLS } from '../lib/constants';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const EMPTY_ENDPOINT = {
  method: 'GET', url: '', headers: '{}', body: '{}', thinkTime: 1,
};

const EMPTY_THRESHOLD = { metric: 'http_req_duration_p95', operator: 'lt', value: '' };

const THRESHOLD_METRICS = [
  { id: 'http_req_duration_p95', label: 'P95 Response Time (ms)' },
  { id: 'http_req_duration_p99', label: 'P99 Response Time (ms)' },
  { id: 'http_req_duration_avg', label: 'Avg Response Time (ms)' },
  { id: 'http_req_failed_rate', label: 'Error Rate (%)' },
  { id: 'http_reqs', label: 'Total Requests' },
];

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-accent" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function FormField({ label, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';
const selectClass = `${inputClass} appearance-none cursor-pointer`;

export default function TestBuilder() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [previewScript, setPreviewScript] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    testType: 'load',
    protocol: 'http',
    targetUrl: '',
    vus: 10,
    duration: '30s',
    endpoints: [{ ...EMPTY_ENDPOINT }],
    thresholds: [{ ...EMPTY_THRESHOLD }],
  });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const updateEndpoint = (idx, field, value) => {
    setForm((f) => {
      const endpoints = [...f.endpoints];
      endpoints[idx] = { ...endpoints[idx], [field]: value };
      return { ...f, endpoints };
    });
  };

  const addEndpoint = () => setForm((f) => ({ ...f, endpoints: [...f.endpoints, { ...EMPTY_ENDPOINT }] }));
  const removeEndpoint = (idx) => setForm((f) => ({ ...f, endpoints: f.endpoints.filter((_, i) => i !== idx) }));

  const updateThreshold = (idx, field, value) => {
    setForm((f) => {
      const thresholds = [...f.thresholds];
      thresholds[idx] = { ...thresholds[idx], [field]: value };
      return { ...f, thresholds };
    });
  };

  const addThreshold = () => setForm((f) => ({ ...f, thresholds: [...f.thresholds, { ...EMPTY_THRESHOLD }] }));
  const removeThreshold = (idx) => setForm((f) => ({ ...f, thresholds: f.thresholds.filter((_, i) => i !== idx) }));

  const buildPayload = () => ({
    name: form.name,
    description: form.description,
    test_type: form.testType,
    protocol: form.protocol,
    target_url: form.targetUrl,
    script_source: 'visual_builder',
    config: {
      vus: Number(form.vus),
      duration: form.duration,
      endpoints: form.endpoints.map((ep) => ({
        method: ep.method,
        url: ep.url,
        headers: safeJsonParse(ep.headers),
        body: safeJsonParse(ep.body),
        think_time: Number(ep.thinkTime),
      })),
      thresholds: form.thresholds
        .filter((t) => t.value)
        .map((t) => ({ metric: t.metric, operator: t.operator, value: Number(t.value) })),
    },
  });

  const handlePreview = async () => {
    setError(null);
    try {
      const payload = buildPayload();
      const res = await tests.create({ ...payload, preview: true });
      setPreviewScript(res.data?.script || JSON.stringify(payload, null, 2));
    } catch (err) {
      setPreviewScript(JSON.stringify(buildPayload(), null, 2));
    }
  };

  const handleSave = async (andRun = false) => {
    if (!form.name.trim()) { setError('Test name is required'); return; }
    if (!form.targetUrl.trim()) { setError('Target URL is required'); return; }
    setError(null);
    setSaving(true);
    try {
      const res = await tests.create(buildPayload());
      const testId = res.data?.id;
      if (andRun && testId) {
        const runRes = await tests.run(testId);
        navigate(`/live/${runRes.data?.id || testId}`);
      } else {
        navigate(testId ? `/tests/${testId}` : '/tests');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save test');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Visual Test Builder</h1>
          <p className="text-text-secondary mt-1">Design your load test without writing code</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handlePreview} className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm">
            <Eye className="w-4 h-4" /> Preview Script
          </button>
          <button onClick={() => handleSave(false)} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm disabled:opacity-50">
            <Save className="w-4 h-4" /> Save
          </button>
          <button onClick={() => handleSave(true)} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Save & Run
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Basic Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-6">
        <SectionHeader icon={Layers} title="Test Configuration" subtitle="Define the basics of your test" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Test Name" className="md:col-span-2">
            <input className={inputClass} placeholder="e.g. API Load Test - Production" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </FormField>
          <FormField label="Description" className="md:col-span-2">
            <textarea className={cn(inputClass, 'resize-none')} rows={2} placeholder="What does this test validate?" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>
          <FormField label="Test Type">
            <div className="relative">
              <select className={selectClass} value={form.testType} onChange={(e) => set('testType', e.target.value)}>
                {TEST_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>
          </FormField>
          <FormField label="Protocol">
            <div className="relative">
              <select className={selectClass} value={form.protocol} onChange={(e) => set('protocol', e.target.value)}>
                {PROTOCOLS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>
          </FormField>
        </div>
      </motion.div>

      {/* Target & Load */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
        <SectionHeader icon={Globe} title="Target & Load Profile" subtitle="Where to send traffic and how much" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Target URL" className="md:col-span-3">
            <input className={inputClass} placeholder="https://api.example.com" value={form.targetUrl} onChange={(e) => set('targetUrl', e.target.value)} />
          </FormField>
          <FormField label="Virtual Users (VUs)">
            <input className={inputClass} type="number" min={1} value={form.vus} onChange={(e) => set('vus', e.target.value)} />
          </FormField>
          <FormField label="Duration">
            <input className={inputClass} placeholder="30s, 5m, 1h" value={form.duration} onChange={(e) => set('duration', e.target.value)} />
          </FormField>
        </div>
      </motion.div>

      {/* Endpoints */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={Target} title="Endpoints" subtitle="Define the API endpoints to test" />
          <button onClick={addEndpoint} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/15 text-accent rounded-lg text-sm hover:bg-accent/25 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Endpoint
          </button>
        </div>
        <div className="space-y-4">
          <AnimatePresence>
            {form.endpoints.map((ep, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-bg-secondary/50 border border-border/60 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Endpoint {idx + 1}</span>
                  {form.endpoints.length > 1 && (
                    <button onClick={() => removeEndpoint(idx)} className="text-text-muted hover:text-danger transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-2">
                    <div className="relative">
                      <select className={selectClass} value={ep.method} onChange={(e) => updateEndpoint(idx, 'method', e.target.value)}>
                        {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                    </div>
                  </div>
                  <div className="col-span-8">
                    <input className={inputClass} placeholder="/api/v1/resource" value={ep.url} onChange={(e) => updateEndpoint(idx, 'url', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input className={inputClass} type="number" min={0} step={0.5} placeholder="Think(s)" value={ep.thinkTime} onChange={(e) => updateEndpoint(idx, 'thinkTime', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField label="Headers (JSON)">
                    <textarea className={cn(inputClass, 'resize-none font-mono text-xs')} rows={2} value={ep.headers} onChange={(e) => updateEndpoint(idx, 'headers', e.target.value)} />
                  </FormField>
                  <FormField label="Body (JSON)">
                    <textarea className={cn(inputClass, 'resize-none font-mono text-xs')} rows={2} value={ep.body} onChange={(e) => updateEndpoint(idx, 'body', e.target.value)} />
                  </FormField>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Thresholds */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={Clock} title="Thresholds" subtitle="Define pass/fail criteria" />
          <button onClick={addThreshold} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/15 text-accent rounded-lg text-sm hover:bg-accent/25 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Threshold
          </button>
        </div>
        <div className="space-y-3">
          <AnimatePresence>
            {form.thresholds.map((th, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="grid grid-cols-12 gap-3 items-end"
              >
                <div className="col-span-5">
                  <div className="relative">
                    <select className={selectClass} value={th.metric} onChange={(e) => updateThreshold(idx, 'metric', e.target.value)}>
                      {THRESHOLD_METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="relative">
                    <select className={selectClass} value={th.operator} onChange={(e) => updateThreshold(idx, 'operator', e.target.value)}>
                      <option value="lt">&lt; less than</option>
                      <option value="gt">&gt; greater than</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  </div>
                </div>
                <div className="col-span-4">
                  <input className={inputClass} type="number" placeholder="Value" value={th.value} onChange={(e) => updateThreshold(idx, 'value', e.target.value)} />
                </div>
                <div className="col-span-1 flex justify-center pb-1">
                  <button onClick={() => removeThreshold(idx)} className="text-text-muted hover:text-danger transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Script Preview Modal */}
      <AnimatePresence>
        {previewScript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
            onClick={() => setPreviewScript(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 max-w-3xl w-full max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-accent" />
                  <h3 className="text-lg font-semibold text-text-primary">Generated Script Preview</h3>
                </div>
                <button onClick={() => setPreviewScript(null)} className="text-text-muted hover:text-text-primary transition-colors text-sm">Close</button>
              </div>
              <pre className="flex-1 overflow-auto bg-bg-primary rounded-lg p-4 text-sm font-mono text-text-secondary border border-border/60">
                {previewScript}
              </pre>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function safeJsonParse(str) {
  try { return JSON.parse(str); }
  catch { return str; }
}
