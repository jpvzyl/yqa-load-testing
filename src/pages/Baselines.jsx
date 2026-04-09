import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, AlertCircle, Bookmark, Plus, CheckCircle2,
  Calendar, Tag, X, ChevronDown,
} from 'lucide-react';
import { baselines, runs } from '../lib/api';
import { timeAgo, scoreToColor, cn } from '../lib/utils';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

export default function Baselines() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentRuns, setRecentRuns] = useState([]);

  const [form, setForm] = useState({ run_id: '', environment: 'production', notes: '' });

  useEffect(() => {
    fetchBaselines();
    runs.list(null, 20)
      .then((res) => setRecentRuns(res.data?.runs || res.data || []))
      .catch(() => {});
  }, []);

  const fetchBaselines = () => {
    baselines.list()
      .then((res) => setList(res.data?.baselines || res.data || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load baselines'))
      .finally(() => setLoading(false));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.run_id) return;
    setSaving(true);
    setError(null);
    try {
      await baselines.create(form);
      setShowForm(false);
      setForm({ run_id: '', environment: 'production', notes: '' });
      fetchBaselines();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create baseline');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Baselines</h1>
          <p className="text-text-secondary mt-1">Performance baselines for regression detection</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Set New Baseline
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Baseline Form */}
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
              <h3 className="text-base font-semibold text-text-primary">Set New Baseline</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Select Run</label>
                <div className="relative">
                  <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={form.run_id} onChange={(e) => setForm((f) => ({ ...f, run_id: e.target.value }))}>
                    <option value="">Choose a run...</option>
                    {recentRuns.map((r) => (
                      <option key={r.id} value={r.id}>Run #{r.id} — {r.test_name || 'Unnamed'} ({r.status})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Environment</label>
                <div className="relative">
                  <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={form.environment} onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}>
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="qa">QA</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Notes</label>
                <input className={inputClass} placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <button type="submit" disabled={saving || !form.run_id} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save Baseline
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Baseline List */}
      {list.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Bookmark className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-secondary">No baselines set yet</p>
          <p className="text-sm text-text-muted mt-1">Set a baseline from a successful run to enable regression detection</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="text-left py-3 px-4 font-medium">Test</th>
                <th className="text-left py-3 px-4 font-medium">Environment</th>
                <th className="text-left py-3 px-4 font-medium">Date</th>
                <th className="text-left py-3 px-4 font-medium">Score</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b, idx) => (
                <motion.tr
                  key={b.id || idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="border-b border-border/50 hover:bg-bg-card-hover transition-colors"
                >
                  <td className="py-3 px-4 text-text-primary font-medium">{b.test_name || b.name || '—'}</td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <Tag className="w-3 h-3" /> {b.environment || '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-text-secondary">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-text-muted" /> {timeAgo(b.created_at)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold" style={{ color: scoreToColor(b.score) }}>
                      {b.score != null ? Math.round(b.score) : '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.active !== false ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'}`}>
                      {b.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-text-muted text-xs max-w-xs truncate">{b.notes || '—'}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
