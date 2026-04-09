import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, AlertCircle, TrendingUp, ChevronDown, BarChart3,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { runs, tests } from '../lib/api';
import { timeAgo, cn } from '../lib/utils';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-2.5 !rounded-lg text-xs">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</p>
      ))}
    </div>
  );
};

export default function Trends() {
  const [runList, setRunList] = useState([]);
  const [testList, setTestList] = useState([]);
  const [selectedTest, setSelectedTest] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    tests.list()
      .then((res) => setTestList(res.data?.tests || res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    runs.list(selectedTest || null, 50)
      .then((res) => {
        const data = res.data?.runs || res.data || [];
        setRunList(data.filter((r) => r.status === 'complete').reverse());
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load run data'))
      .finally(() => setLoading(false));
  }, [selectedTest]);

  const scoreData = runList.map((r, i) => ({
    name: `#${r.id}`,
    score: r.score != null ? Math.round(r.score) : null,
    label: r.test_name?.slice(0, 12) || `Run ${r.id}`,
  })).filter((d) => d.score != null);

  const responseData = runList.map((r) => ({
    name: `#${r.id}`,
    avg: r.avg_response_time ?? r.http_req_duration_avg ?? null,
    p95: r.p95_response_time ?? r.http_req_duration_p95 ?? null,
  })).filter((d) => d.avg != null);

  const errorData = runList.map((r) => ({
    name: `#${r.id}`,
    rate: r.error_rate != null ? (r.error_rate * 100) : (r.http_req_failed_rate != null ? (r.http_req_failed_rate * 100) : null),
  })).filter((d) => d.rate != null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Performance Trends</h1>
          </div>
          <p className="text-text-secondary mt-1">Track performance metrics over time</p>
        </div>
        <div className="relative w-64">
          <select
            className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/60 transition-colors"
            value={selectedTest}
            onChange={(e) => setSelectedTest(e.target.value)}
          >
            <option value="">All Tests</option>
            {testList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Score Trend */}
          {scoreData.length > 1 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Performance Score Trend</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={scoreData}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fill="url(#scoreGrad)" name="Score" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* Response Time Trend */}
          {responseData.length > 1 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Response Time Trend</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={responseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="avg" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} name="Avg (ms)" />
                  <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2, fill: '#f59e0b' }} name="P95 (ms)" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* Error Rate Trend */}
          {errorData.length > 1 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Error Rate Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={errorData}>
                  <defs>
                    <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} unit="%" />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={2} fill="url(#errorGrad)" name="Error %" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {scoreData.length <= 1 && (
            <div className="glass-card p-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-secondary">Not enough data for trends</p>
              <p className="text-sm text-text-muted mt-1">Complete at least 2 runs to see performance trends</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
