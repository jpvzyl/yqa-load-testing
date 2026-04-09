import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Shield, Plus, X, CheckCircle2,
  ChevronDown, AlertTriangle, Target,
} from 'lucide-react';
import { slas, runs } from '../lib/api';
import { cn } from '../lib/utils';

const METRIC_OPTIONS = [
  { id: 'http_req_duration_avg', label: 'Avg Response Time' },
  { id: 'http_req_duration_p95', label: 'P95 Response Time' },
  { id: 'http_req_duration_p99', label: 'P99 Response Time' },
  { id: 'http_req_failed_rate', label: 'Error Rate' },
  { id: 'http_reqs', label: 'Total Requests' },
  { id: 'vus_max', label: 'Peak VUs' },
];

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-500/15', color: 'text-red-400', label: 'Critical' },
  warning: { bg: 'bg-yellow-500/15', color: 'text-yellow-400', label: 'Warning' },
  info: { bg: 'bg-blue-500/15', color: 'text-blue-400', label: 'Info' },
};

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

export default function SlaCompliance() {
  const [slaList, setSlaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slaResults, setSlaResults] = useState(null);
  const [selectedRun, setSelectedRun] = useState('');
  const [runList, setRunList] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const [form, setForm] = useState({
    name: '', metric: 'http_req_duration_p95', operator: 'lt', threshold: '', unit: 'ms', severity: 'warning',
  });

  useEffect(() => {
    fetchSlas();
    runs.list(null, 30)
      .then((res) => setRunList(res.data?.runs || res.data || []))
      .catch(() => {});
  }, []);

  const fetchSlas = () => {
    slas.list()
      .then((res) => setSlaList(res.data?.slas || res.data || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load SLAs'))
      .finally(() => setLoading(false));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.threshold) return;
    setSaving(true);
    setError(null);
    try {
      await slas.create({
        ...form,
        threshold: Number(form.threshold),
      });
      setShowForm(false);
      setForm({ name: '', metric: 'http_req_duration_p95', operator: 'lt', threshold: '', unit: 'ms', severity: 'warning' });
      fetchSlas();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create SLA');
    } finally {
      setSaving(false);
    }
  };

  const handleRunSelect = async (runId) => {
    setSelectedRun(runId);
    if (!runId) { setSlaResults(null); return; }
    setLoadingResults(true);
    try {
      const res = await runs.slaResults(runId);
      setSlaResults(res.data?.results || res.data || []);
    } catch {
      setSlaResults([]);
    } finally {
      setLoadingResults(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">SLA Compliance</h1>
          </div>
          <p className="text-text-secondary mt-1">Define and monitor Service Level Agreements</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add SLA
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add SLA Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="glass-card p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">New SLA Definition</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Name</label>
                <input className={inputClass} placeholder="e.g. API Response Time" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Metric</label>
                <div className="relative">
                  <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={form.metric} onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))}>
                    {METRIC_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Operator</label>
                <div className="relative">
                  <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={form.operator} onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}>
                    <option value="lt">&lt; Less than</option>
                    <option value="gt">&gt; Greater than</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Threshold</label>
                <input className={inputClass} type="number" placeholder="500" value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Severity</label>
                <div className="relative">
                  <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>
            <button type="submit" disabled={saving || !form.name.trim()} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save SLA
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* SLA List */}
      {slaList.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Shield className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-secondary">No SLAs defined yet</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="text-left py-3 px-4 font-medium">Name</th>
                <th className="text-left py-3 px-4 font-medium">Metric</th>
                <th className="text-left py-3 px-4 font-medium">Threshold</th>
                <th className="text-left py-3 px-4 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody>
              {slaList.map((sla, idx) => {
                const sev = SEVERITY_CONFIG[sla.severity] || SEVERITY_CONFIG.warning;
                const metricLabel = METRIC_OPTIONS.find((m) => m.id === sla.metric)?.label || sla.metric;
                return (
                  <motion.tr
                    key={sla.id || idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-b border-border/50 hover:bg-bg-card-hover transition-colors"
                  >
                    <td className="py-3 px-4 text-text-primary font-medium">{sla.name}</td>
                    <td className="py-3 px-4 text-text-secondary">{metricLabel}</td>
                    <td className="py-3 px-4 text-text-primary font-mono text-xs">
                      {sla.operator === 'lt' ? '<' : '>'} {sla.threshold} {sla.unit || 'ms'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sev.bg} ${sev.color}`}>{sev.label}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SLA Results per Run */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">Check SLA Results</h3>
        <div className="max-w-sm relative">
          <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={selectedRun} onChange={(e) => handleRunSelect(e.target.value)}>
            <option value="">Select a run...</option>
            {runList.map((r) => <option key={r.id} value={r.id}>#{r.id} — {r.test_name || 'Unnamed'}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        </div>

        {loadingResults && (
          <div className="flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 text-accent animate-spin" /> <span className="text-sm text-text-secondary">Loading results...</span></div>
        )}

        {slaResults && !loadingResults && (
          <div className="space-y-2">
            {slaResults.length === 0 ? (
              <p className="text-sm text-text-muted py-2">No SLA results for this run</p>
            ) : (
              slaResults.map((r, i) => (
                <div key={i} className={cn('flex items-center justify-between p-3 rounded-lg border', r.passed ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
                  <div className="flex items-center gap-2">
                    {r.passed ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                    <span className="text-sm text-text-primary">{r.sla_name || r.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-muted">Actual: <span className="text-text-primary font-mono">{r.actual_value ?? '—'}</span></span>
                    <span className={cn('text-xs font-medium', r.passed ? 'text-green-400' : 'text-red-400')}>
                      {r.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
