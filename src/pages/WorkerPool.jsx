import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Plus, Globe, Activity, Cpu, Wifi, WifiOff,
  Loader2, AlertCircle, X, Users, Gauge, MapPin,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../lib/api';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const REGIONS = [
  { id: 'us-east-1', label: 'US East', x: '25%', y: '40%' },
  { id: 'us-west-2', label: 'US West', x: '12%', y: '35%' },
  { id: 'eu-west-1', label: 'EU West', x: '47%', y: '28%' },
  { id: 'eu-central-1', label: 'EU Central', x: '52%', y: '30%' },
  { id: 'ap-southeast-1', label: 'AP Southeast', x: '78%', y: '55%' },
  { id: 'ap-northeast-1', label: 'AP Northeast', x: '83%', y: '35%' },
];

function StatCard({ icon: Icon, label, value, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-text-secondary text-sm">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="w-4.5 h-4.5" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
    </motion.div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="text-blue-400 font-semibold">Workers: {payload[0].value}</p>
    </div>
  );
};

export default function WorkerPool() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', region: 'us-east-1', capacity: 500 });

  useEffect(() => {
    api.get('/api/v2/workers')
      .then(res => setWorkers(res.data?.workers || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load worker pool'))
      .finally(() => setLoading(false));
  }, []);

  const totalWorkers = workers.length;
  const onlineWorkers = workers.filter(w => w.status === 'online').length;
  const totalCapacity = workers.reduce((sum, w) => sum + (w.capacity_vus || 0), 0);
  const currentVUs = workers.reduce((sum, w) => sum + (w.current_vus || 0), 0);
  const utilization = totalCapacity > 0 ? Math.round((currentVUs / totalCapacity) * 100) : 0;

  const regionData = REGIONS.map(r => ({
    name: r.label,
    workers: workers.filter(w => w.region === r.id).length,
  })).filter(r => r.workers > 0);

  const regionWorkerCounts = {};
  workers.forEach(w => {
    regionWorkerCounts[w.region] = (regionWorkerCounts[w.region] || 0) + 1;
  });

  const handleRegister = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/api/v2/workers', form);
      setWorkers(prev => [...prev, res.data]);
      setForm({ name: '', region: 'us-east-1', capacity: 500 });
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register worker');
    } finally {
      setSubmitting(false);
    }
  };

  const timeAgo = (ts) => {
    if (!ts) return '—';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (error && workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="w-10 h-10 text-danger" />
        <p className="text-text-secondary">{error}</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Worker Pool</h1>
          </div>
          <p className="text-text-secondary mt-1">Distributed load generation fleet</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Register Worker
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Server} label="Total Workers" value={totalWorkers} color="#3b82f6" delay={0} />
        <StatCard icon={Wifi} label="Online" value={onlineWorkers} color="#22c55e" delay={0.05} />
        <StatCard icon={Users} label="Capacity (VUs)" value={totalCapacity.toLocaleString()} color="#8b5cf6" delay={0.1} />
        <StatCard icon={Gauge} label="Utilization" value={`${utilization}%`} color="#f59e0b" delay={0.15} />
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleRegister}
            className="glass-card p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">Register New Worker</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Worker Name</label>
                <input className={inputClass} placeholder="worker-01" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Region</label>
                <select className={inputClass} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
                  {REGIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Capacity (VUs)</label>
                <input className={inputClass} type="number" min={1} max={10000} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <button type="submit" disabled={submitting || !form.name} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Register
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Region Map Visualization */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Region Distribution</h2>
        {regionData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={regionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="workers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="relative h-48 rounded-lg bg-bg-secondary/50 overflow-hidden">
            {REGIONS.map(r => (
              <div key={r.id} className="absolute flex flex-col items-center" style={{ left: r.x, top: r.y }}>
                <MapPin className="w-5 h-5 text-blue-400" />
                <span className="text-xs text-text-muted mt-1">{r.label}</span>
                <span className="text-xs font-bold text-blue-400">{regionWorkerCounts[r.id] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Workers Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Workers</h2>
        {workers.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-10 h-10 mx-auto text-text-muted mb-2" />
            <p className="text-text-secondary text-sm">No workers registered</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-3 px-3 font-medium">Name</th>
                  <th className="text-left py-3 px-3 font-medium">Region</th>
                  <th className="text-left py-3 px-3 font-medium">Status</th>
                  <th className="text-left py-3 px-3 font-medium">Capacity</th>
                  <th className="text-left py-3 px-3 font-medium">Current VUs</th>
                  <th className="text-left py-3 px-3 font-medium">Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(w => (
                  <tr key={w.id} className="border-b border-border/50 hover:bg-bg-card-hover transition-colors">
                    <td className="py-3 px-3 text-text-primary font-medium flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-400" /> {w.name || w.id}
                    </td>
                    <td className="py-3 px-3 text-text-secondary">
                      <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> {w.region}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${w.status === 'online' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {w.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {w.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-text-secondary">{(w.capacity_vus || 0).toLocaleString()} VUs</td>
                    <td className="py-3 px-3 text-text-primary font-medium">{(w.current_vus || 0).toLocaleString()}</td>
                    <td className="py-3 px-3 text-text-muted">{timeAgo(w.last_heartbeat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
