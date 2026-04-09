import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Plus, Trash2, Globe, Cpu, Activity,
  AlertCircle, CheckCircle2, Loader2, X, ChevronDown, Info,
} from 'lucide-react';
import { cn } from '../lib/utils';

const TARGET_TYPES = [
  { id: 'http_endpoint', label: 'HTTP Endpoint', icon: Globe, color: '#3b82f6' },
  { id: 'system_stats', label: 'System Stats', icon: Cpu, color: '#8b5cf6' },
];

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

export default function Infrastructure() {
  const [targets, setTargets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    type: 'http_endpoint', host: '', url: '', interval: 10,
  });

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.host && !form.url) return;
    setSaving(true);
    setTimeout(() => {
      setTargets((prev) => [...prev, { ...form, id: Date.now() }]);
      setForm({ type: 'http_endpoint', host: '', url: '', interval: 10 });
      setShowForm(false);
      setSaving(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    }, 500);
  };

  const removeTarget = (id) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Infrastructure</h1>
          </div>
          <p className="text-text-secondary mt-1">Monitor system infrastructure during load tests</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add Target
        </button>
      </div>

      {/* Info Banner */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Infrastructure Correlation</h3>
          <p className="text-sm text-text-secondary mt-1">
            Add monitoring targets to correlate infrastructure metrics (CPU, memory, network) with your load test results.
            When a test runs, Sarfat automatically polls these targets and overlays the data in your run analysis for deeper insights.
          </p>
        </div>
      </motion.div>

      <AnimatePresence>
        {(error || success) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn('flex items-center gap-2 px-4 py-3 rounded-lg text-sm', error ? 'bg-danger/10 border border-danger/30 text-danger' : 'bg-success/10 border border-success/30 text-success')}>
            {error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {error || 'Target added successfully'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAdd}
            className="glass-card p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">Add Monitoring Target</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Type</label>
                <div className="relative">
                  <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    {TARGET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Host</label>
                <input className={inputClass} placeholder="server-01.example.com" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">
                  {form.type === 'http_endpoint' ? 'Health Check URL' : 'Stats Endpoint'}
                </label>
                <input className={inputClass} placeholder={form.type === 'http_endpoint' ? 'https://api.example.com/health' : 'http://server:9100/metrics'} value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Interval (sec)</label>
                <input className={inputClass} type="number" min={1} max={300} value={form.interval} onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value }))} />
              </div>
            </div>
            <button type="submit" disabled={saving || (!form.host && !form.url)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Target
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Target List */}
      {targets.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Activity className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-secondary">No monitoring targets configured</p>
          <p className="text-sm text-text-muted mt-1">Add servers and endpoints to correlate infrastructure metrics with test results</p>
        </div>
      ) : (
        <div className="space-y-3">
          {targets.map((target, idx) => {
            const typeConfig = TARGET_TYPES.find((t) => t.id === target.type) || TARGET_TYPES[0];
            const Icon = typeConfig.icon;
            return (
              <motion.div
                key={target.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="glass-card p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${typeConfig.color}20` }}>
                    <Icon className="w-4.5 h-4.5" style={{ color: typeConfig.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{target.host || target.url}</p>
                    <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                      <span>{typeConfig.label}</span>
                      <span>Every {target.interval}s</span>
                      {target.url && <span className="truncate max-w-xs">{target.url}</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => removeTarget(target.id)} className="text-text-muted hover:text-danger transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
