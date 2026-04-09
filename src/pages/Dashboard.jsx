import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity, FlaskConical, Play, TrendingUp, Plus, ArrowRight,
  Loader2, AlertCircle, Clock, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { dashboard } from '../lib/api';
import { formatDuration, formatNumber, timeAgo, scoreToColor, getStatusInfo, getGradeInfo } from '../lib/utils';
import ScoreGrade from '../components/ScoreGrade';

function MetricCard({ icon: Icon, label, value, color, delay = 0 }) {
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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="text-accent font-semibold">Score: {payload[0].value}</p>
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    dashboard.get()
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="w-10 h-10 text-danger" />
        <p className="text-text-secondary">{error}</p>
      </div>
    );
  }

  const stats = data?.stats || {};
  const recentRuns = data?.recent_runs || [];

  const chartData = recentRuns
    .filter((r) => r.score != null)
    .slice()
    .reverse()
    .map((r) => ({
      name: r.test_name?.slice(0, 15) || 'Run',
      score: Math.round(r.score),
    }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary mt-1">Performance overview at a glance</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/tests/new"
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New Test
          </Link>
          <Link
            to="/runs"
            className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm"
          >
            View All Runs <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={FlaskConical} label="Total Tests" value={formatNumber(stats.total_tests ?? 0)} color="#3b82f6" delay={0} />
        <MetricCard icon={Play} label="Total Runs" value={formatNumber(stats.total_runs ?? 0)} color="#8b5cf6" delay={0.05} />
        <MetricCard icon={TrendingUp} label="Avg Score" value={stats.avg_score != null ? Math.round(stats.avg_score) : '—'} color="#22c55e" delay={0.1} />
        <MetricCard icon={Activity} label="Active Runs" value={formatNumber(stats.active_runs ?? 0)} color="#f59e0b" delay={0.15} />
      </div>

      {chartData.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5"
        >
          <h2 className="text-lg font-semibold text-text-primary mb-4">Performance Trend</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fill="url(#scoreGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {recentRuns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5"
        >
          <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Runs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-3 px-3 font-medium">Test Name</th>
                  <th className="text-left py-3 px-3 font-medium">Type</th>
                  <th className="text-left py-3 px-3 font-medium">Status</th>
                  <th className="text-left py-3 px-3 font-medium">Score</th>
                  <th className="text-left py-3 px-3 font-medium">Duration</th>
                  <th className="text-left py-3 px-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => {
                  const statusInfo = getStatusInfo(run.status);
                  return (
                    <tr
                      key={run.id}
                      onClick={() => navigate(`/runs/${run.id}`)}
                      className="border-b border-border/50 hover:bg-bg-card-hover cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 text-text-primary font-medium">{run.test_name || '—'}</td>
                      <td className="py-3 px-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent capitalize">
                          {run.test_type || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bg}`}
                          style={{ color: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span style={{ color: scoreToColor(run.score) }} className="font-semibold">
                            {run.score != null ? Math.round(run.score) : '—'}
                          </span>
                          {run.grade && <ScoreGrade grade={run.grade} size="sm" />}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDuration(run.duration_ms)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-text-muted">{timeAgo(run.started_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
