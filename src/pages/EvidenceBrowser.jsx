import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Loader2, AlertCircle, Search, Shield,
  CheckCircle2, XCircle, X, Filter, Hash, HardDrive,
  Clock, FileText, BarChart3, Calendar, Archive,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../lib/api';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const EVIDENCE_TYPES = ['all', 'metric_snapshot', 'test_result', 'trace_export', 'log_bundle', 'config_snapshot', 'report'];

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="text-blue-400 font-semibold">{payload[0].value} items</p>
    </div>
  );
};

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

export default function EvidenceBrowser() {
  const [evidence, setEvidence] = useState([]);
  const [stats, setStats] = useState(null);
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [filters, setFilters] = useState({
    type: 'all', run_id: '', date_from: '', date_to: '', search: '',
  });

  const fetchEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filters.type !== 'all') params.type = filters.type;
      if (filters.run_id) params.run_id = filters.run_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.search) params.search = filters.search;

      const [evidenceRes, statsRes, retentionRes] = await Promise.all([
        api.get('/api/v2/evidence', { params }),
        api.get('/api/v2/evidence/stats'),
        api.get('/api/v2/evidence/retention'),
      ]);
      setEvidence(evidenceRes.data?.items || []);
      setStats(statsRes.data || null);
      setRetention(retentionRes.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load evidence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvidence(); }, []);

  const applyFilters = () => { fetchEvidence(); };

  const verifyIntegrity = async () => {
    setVerifying(true);
    try {
      const res = await api.post('/api/v2/evidence/verify');
      setVerifyResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const byTypeData = stats?.by_type?.map(t => ({
    name: t.type.replace(/_/g, ' '),
    count: t.count,
  })) || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Evidence Browser</h1>
          </div>
          <p className="text-text-secondary mt-1">Browse, verify, and manage stored evidence artifacts</p>
        </div>
        <button onClick={verifyIntegrity} disabled={verifying} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50">
          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Verify Integrity
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Verify Result */}
      <AnimatePresence>
        {verifyResult && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`glass-card p-4 flex items-center gap-3 border ${verifyResult.valid ? 'border-green-500/20' : 'border-red-500/20'}`}>
            {verifyResult.valid ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
            <div>
              <p className="text-sm text-text-primary font-medium">{verifyResult.valid ? 'All integrity checks passed' : `${verifyResult.failures || 0} integrity failure(s) detected`}</p>
              <p className="text-xs text-text-muted">{verifyResult.checked || 0} items verified &middot; {verifyResult.duration_ms || 0}ms</p>
            </div>
            <button onClick={() => setVerifyResult(null)} className="ml-auto text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Database} label="Total Items" value={stats?.total_items?.toLocaleString() || '0'} color="#3b82f6" delay={0} />
        <StatCard icon={HardDrive} label="Total Size" value={formatBytes(stats?.total_bytes)} color="#8b5cf6" delay={0.05} />
        <StatCard icon={FileText} label="Evidence Types" value={stats?.by_type?.length || 0} color="#22c55e" delay={0.1} />
        <StatCard icon={Clock} label="Oldest Item" value={stats?.oldest_date || '—'} color="#f59e0b" delay={0.15} />
      </div>

      {/* By Type Chart */}
      {byTypeData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" /> Evidence by Type
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byTypeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#1e3a5f' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5">
        <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Filter className="w-4 h-4 text-blue-400" /> Filters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select className={inputClass} value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            {EVIDENCE_TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : t.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input className={inputClass} placeholder="Run ID" value={filters.run_id} onChange={e => setFilters(f => ({ ...f, run_id: e.target.value }))} />
          <input className={inputClass} type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
          <input className={inputClass} type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
          <button onClick={applyFilters} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors">
            <Search className="w-4 h-4" /> Search
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Evidence List */}
          <div className="lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Evidence Items</h2>
              {evidence.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="w-12 h-12 mx-auto text-text-muted mb-3" />
                  <p className="text-text-secondary">No evidence items found</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {evidence.map((item, i) => (
                    <div
                      key={item.id || i}
                      onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedItem?.id === item.id ? 'bg-accent/10 border border-accent/30' : 'bg-bg-secondary/30 hover:bg-bg-secondary/50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">{item.type?.replace(/_/g, ' ')}</span>
                          {item.run_id && <span className="text-xs text-text-muted">Run: {item.run_id}</span>}
                        </div>
                        <span className="text-xs text-text-muted">{formatBytes(item.size_bytes)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Hash className="w-3 h-3 text-text-muted" />
                        <span className="text-xs font-mono text-text-muted truncate">{item.hash}</span>
                      </div>
                      {item.created_at && (
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="w-3 h-3 text-text-muted" />
                          <span className="text-xs text-text-muted">{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Detail Panel + Retention */}
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass-card p-5">
              <h2 className="text-base font-semibold text-text-primary mb-4">Detail</h2>
              {selectedItem ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Type</p>
                    <p className="text-sm text-text-primary mt-0.5">{selectedItem.type?.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Hash (SHA-256)</p>
                    <p className="text-xs font-mono text-text-primary mt-0.5 break-all">{selectedItem.hash}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Size</p>
                    <p className="text-sm text-text-primary mt-0.5">{formatBytes(selectedItem.size_bytes)}</p>
                  </div>
                  {selectedItem.run_id && (
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wide">Run ID</p>
                      <p className="text-sm text-text-primary mt-0.5">{selectedItem.run_id}</p>
                    </div>
                  )}
                  {selectedItem.metadata && (
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wide">Metadata</p>
                      <pre className="text-xs text-text-secondary mt-1 bg-bg-secondary rounded p-2 overflow-x-auto max-h-40">
                        {JSON.stringify(selectedItem.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedItem.created_at && (
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wide">Created</p>
                      <p className="text-sm text-text-primary mt-0.5">{new Date(selectedItem.created_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-text-muted text-sm text-center py-8">Select an item to view details</p>
              )}
            </motion.div>

            {/* Retention Policy */}
            {retention && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-5">
                <h2 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" /> Retention Policy
                </h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Default retention</span>
                    <span className="text-text-primary font-medium">{retention.default_days || 90} days</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Compliance retention</span>
                    <span className="text-text-primary font-medium">{retention.compliance_days || 365} days</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Auto-cleanup</span>
                    <span className={`text-sm font-medium ${retention.auto_cleanup ? 'text-green-400' : 'text-yellow-400'}`}>
                      {retention.auto_cleanup ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  {retention.next_cleanup && (
                    <div className="flex justify-between text-sm">
                      <span className="text-text-muted">Next cleanup</span>
                      <span className="text-text-primary font-medium">{retention.next_cleanup}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
