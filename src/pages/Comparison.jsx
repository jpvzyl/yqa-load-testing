import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Loader2, AlertCircle, ArrowLeftRight, TrendingUp, TrendingDown,
  Minus, ChevronDown, BarChart3,
} from 'lucide-react';
import { compare, runs } from '../lib/api';
import { formatDuration, formatNumber, cn } from '../lib/utils';

function ChangeIndicator({ value }) {
  if (value == null || value === 0) return <Minus className="w-3.5 h-3.5 text-text-muted" />;
  const improved = value < 0;
  return (
    <span className={cn('flex items-center gap-1 text-xs font-medium', improved ? 'text-green-400' : 'text-red-400')}>
      {improved ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function MetricBar({ label, valueA, valueB, format = 'raw', invertBetter = false }) {
  const a = typeof valueA === 'number' ? valueA : 0;
  const b = typeof valueB === 'number' ? valueB : 0;
  const max = Math.max(a, b, 1);
  const pctChange = a ? ((b - a) / a) * 100 : 0;
  const displayChange = invertBetter ? -pctChange : pctChange;

  const fmt = (v) => {
    if (format === 'duration') return formatDuration(v);
    if (format === 'percent') return `${(v * 100).toFixed(2)}%`;
    if (format === 'number') return formatNumber(v);
    return typeof v === 'number' ? v.toFixed(1) : v;
  };

  return (
    <div className="py-3 border-b border-border/30 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-secondary">{label}</span>
        <ChangeIndicator value={displayChange} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-text-muted">Run A</span>
            <span className="text-text-primary font-medium">{fmt(a)}</span>
          </div>
          <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(a / max) * 100}%` }} transition={{ duration: 0.6 }} className="h-full bg-accent rounded-full" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-text-muted">Run B</span>
            <span className="text-text-primary font-medium">{fmt(b)}</span>
          </div>
          <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(b / max) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 }} className="h-full bg-purple-500 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Comparison() {
  const [searchParams] = useSearchParams();
  const [runList, setRunList] = useState([]);
  const [runA, setRunA] = useState(searchParams.get('a') || '');
  const [runB, setRunB] = useState(searchParams.get('b') || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    runs.list(null, 50)
      .then((res) => setRunList(res.data?.runs || res.data || []))
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    if (runA && runB) fetchComparison();
  }, [runA, runB]);

  const fetchComparison = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await compare.runs(runA, runB);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to compare runs');
    } finally {
      setLoading(false);
    }
  };

  const selectClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/60 transition-colors';

  const a = result?.run_a || result?.baseline || {};
  const b = result?.run_b || result?.current || {};

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Run Comparison</h1>
        </div>
        <p className="text-text-secondary mt-1">Side-by-side performance comparison</p>
      </div>

      {/* Run Selectors */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-accent">Run A (Baseline)</label>
            <div className="relative">
              <select className={selectClass} value={runA} onChange={(e) => setRunA(e.target.value)} disabled={listLoading}>
                <option value="">Select run...</option>
                {runList.map((r) => <option key={r.id} value={r.id}>#{r.id} — {r.test_name || 'Unnamed'}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-purple-400">Run B (Current)</label>
            <div className="relative">
              <select className={selectClass} value={runB} onChange={(e) => setRunB(e.target.value)} disabled={listLoading}>
                <option value="">Select run...</option>
                {runList.map((r) => <option key={r.id} value={r.id}>#{r.id} — {r.test_name || 'Unnamed'}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            </div>
          </div>
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
          <span className="text-text-secondary">Comparing runs...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && !loading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Score Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Run A Score</p>
              <p className="text-3xl font-bold text-accent">{a.score != null ? Math.round(a.score) : '—'}</p>
              <p className="text-xs text-text-muted mt-1">{a.grade || ''}</p>
            </div>
            <div className="glass-card p-5 text-center">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Run B Score</p>
              <p className="text-3xl font-bold text-purple-400">{b.score != null ? Math.round(b.score) : '—'}</p>
              <p className="text-xs text-text-muted mt-1">{b.grade || ''}</p>
            </div>
          </div>

          {/* Metric Bars */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-accent" />
              <h3 className="text-base font-semibold text-text-primary">Metric Comparison</h3>
            </div>
            <MetricBar label="Avg Response Time" valueA={a.avg_response_time ?? a.http_req_duration_avg} valueB={b.avg_response_time ?? b.http_req_duration_avg} format="duration" invertBetter />
            <MetricBar label="P95 Response Time" valueA={a.p95_response_time ?? a.http_req_duration_p95} valueB={b.p95_response_time ?? b.http_req_duration_p95} format="duration" invertBetter />
            <MetricBar label="P99 Response Time" valueA={a.p99_response_time ?? a.http_req_duration_p99} valueB={b.p99_response_time ?? b.http_req_duration_p99} format="duration" invertBetter />
            <MetricBar label="Error Rate" valueA={a.error_rate ?? a.http_req_failed_rate} valueB={b.error_rate ?? b.http_req_failed_rate} format="percent" invertBetter />
            <MetricBar label="Total Requests" valueA={a.total_requests ?? a.http_reqs} valueB={b.total_requests ?? b.http_reqs} format="number" />
            <MetricBar label="Peak VUs" valueA={a.vus_max} valueB={b.vus_max} format="number" />
          </div>
        </motion.div>
      )}

      {!result && !loading && !error && (
        <div className="glass-card p-12 text-center">
          <ArrowLeftRight className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-secondary">Select two runs to compare their performance</p>
        </div>
      )}
    </motion.div>
  );
}
