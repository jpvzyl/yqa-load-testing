import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Plus, Loader2, AlertCircle, X, Bell,
  CheckCircle2, XCircle, TrendingDown, Clock,
  Gauge, Activity,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Legend,
} from 'recharts';
import api from '../lib/api';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const METRICS = ['latency_p99', 'latency_p95', 'error_rate', 'availability', 'throughput'];
const WINDOWS = ['1h', '6h', '1d', '7d', '30d'];

function BurnRateGauge({ slo }) {
  const burnRate = slo.burn_rate || 0;
  const data = [{ name: slo.name, value: Math.min(burnRate * 100, 100), fill: burnRate > 1 ? '#ef4444' : burnRate > 0.8 ? '#f59e0b' : '#22c55e' }];
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary truncate">{slo.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${burnRate > 1 ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
          {(slo.target * 100).toFixed(2)}%
        </span>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={data} startAngle={180} endAngle={0}>
            <RadialBar background dataKey="value" cornerRadius={4} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center -mt-4">
        <p className="text-lg font-bold text-text-primary">{burnRate.toFixed(2)}x</p>
        <p className="text-xs text-text-muted">burn rate</p>
      </div>
      <div className="flex justify-between mt-3 text-xs text-text-muted">
        <span>{slo.service}</span>
        <span>{slo.window}</span>
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="text-blue-400 font-semibold">Budget: {payload[0].value?.toFixed(2)}%</p>
    </div>
  );
};

export default function SLODashboard() {
  const [slos, setSlos] = useState([]);
  const [burndown, setBurndown] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [burnHistory, setBurnHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '', service: '', endpoint: '', metric: 'latency_p99', target: 0.999, window: '30d',
  });

  useEffect(() => {
    Promise.all([
      api.get('/api/v2/slos'),
      api.get('/api/v2/slos/burndown'),
      api.get('/api/v2/slos/alerts'),
      api.get('/api/v2/slos/burn-history'),
    ])
      .then(([sloRes, burnRes, alertRes, histRes]) => {
        setSlos(sloRes.data?.slos || []);
        setBurndown(burnRes.data?.burndown || []);
        setAlerts(alertRes.data?.alerts || []);
        setBurnHistory(histRes.data?.history || []);
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load SLO data'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/api/v2/slos', form);
      setSlos(prev => [res.data, ...prev]);
      setForm({ name: '', service: '', endpoint: '', metric: 'latency_p99', target: 0.999, window: '30d' });
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create SLO');
    } finally {
      setSubmitting(false);
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">SLO Dashboard</h1>
          </div>
          <p className="text-text-secondary mt-1">Service Level Objectives and error budget tracking</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Create SLO
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Create SLO Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} onSubmit={handleCreate} className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">Create SLO</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">SLO Name</label>
                <input className={inputClass} placeholder="API Latency SLO" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Service</label>
                <input className={inputClass} placeholder="api-gateway" value={form.service} onChange={e => setForm(f => ({ ...f, service: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Endpoint</label>
                <input className={inputClass} placeholder="/api/v2/users" value={form.endpoint} onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Metric</label>
                <select className={inputClass} value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}>
                  {METRICS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Target (0-1)</label>
                <input className={inputClass} type="number" min={0} max={1} step={0.001} value={form.target} onChange={e => setForm(f => ({ ...f, target: parseFloat(e.target.value) || 0.999 }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Window</label>
                <select className={inputClass} value={form.window} onChange={e => setForm(f => ({ ...f, window: e.target.value }))}>
                  {WINDOWS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={submitting || !form.name || !form.service} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />} Create SLO
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* SLO Cards with Burn Rate Gauges */}
      {slos.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Active SLOs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {slos.map((slo, i) => (
              <motion.div key={slo.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <BurnRateGauge slo={slo} />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Error Budget Burndown */}
      {burndown.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-blue-400" /> Error Budget Burndown
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={burndown}>
              <defs>
                <linearGradient id="budgetGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} domain={[0, 100]} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="budget_remaining" stroke="#3b82f6" strokeWidth={2} fill="url(#budgetGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Multi-Window Alert Status */}
      {alerts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-400" /> Multi-Window Alerts
          </h2>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${alert.firing ? 'bg-red-500/5 border border-red-500/10' : 'bg-bg-secondary/50'}`}>
                <div className="flex items-center gap-3">
                  {alert.firing ? <XCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  <div>
                    <p className="text-sm text-text-primary">{alert.slo_name}</p>
                    <p className="text-xs text-text-muted">{alert.window} window &middot; burn rate: {alert.burn_rate?.toFixed(2)}x</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full ${alert.firing ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                  {alert.firing ? 'FIRING' : 'OK'}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Burn History Timeline */}
      {burnHistory.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" /> Burn History
          </h2>
          <div className="space-y-3">
            {burnHistory.map((event, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1 ${event.type === 'violation' ? 'bg-red-400' : event.type === 'recovery' ? 'bg-green-400' : 'bg-blue-400'}`} />
                  {i < burnHistory.length - 1 && <div className="w-px h-8 bg-border" />}
                </div>
                <div>
                  <p className="text-sm text-text-primary">{event.message}</p>
                  <p className="text-xs text-text-muted mt-0.5">{event.timestamp} &middot; {event.slo_name}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {slos.length === 0 && !showForm && (
        <div className="glass-card p-12 text-center">
          <Gauge className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-secondary">No SLOs configured yet</p>
          <p className="text-sm text-text-muted mt-1">Create your first SLO to start tracking error budgets</p>
        </div>
      )}
    </motion.div>
  );
}
