import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, AlertCircle, TrendingUp, Server, Zap,
  AlertTriangle, CheckCircle2, BarChart3,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { runs } from '../lib/api';
import { formatNumber, cn } from '../lib/utils';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-2.5 !rounded-lg text-xs">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {typeof p.value === 'number' ? p.value.toFixed(0) : p.value}</p>
      ))}
    </div>
  );
};

function RecommendationCard({ icon: Icon, title, description, color }) {
  return (
    <div className="flex items-start gap-3 bg-bg-secondary/50 border border-border/60 rounded-lg p-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function CapacityPlanning() {
  const [analysis, setAnalysis] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const runsRes = await runs.list(null, 20);
        const allRuns = (runsRes.data?.runs || runsRes.data || []).filter((r) => r.status === 'complete');
        setRunHistory(allRuns.reverse());

        const latest = allRuns[allRuns.length - 1];
        if (latest) {
          try {
            const analysisRes = await runs.analyses(latest.id);
            const passes = analysisRes.data?.passes || (Array.isArray(analysisRes.data) ? analysisRes.data : []);
            const pass2 = passes.find((p) => p.pass === 2 || p.pass_number === 2);
            setAnalysis(pass2?.results || pass2 || null);
          } catch {
            setAnalysis(null);
          }
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load capacity data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const projectionData = (() => {
    if (runHistory.length < 2) return [];
    const points = runHistory.map((r, i) => ({
      x: i,
      vus: r.vus_max ?? r.config?.vus ?? 0,
      rps: r.total_requests ?? r.http_reqs ?? 0,
      responseTime: r.avg_response_time ?? r.http_req_duration_avg ?? 0,
    }));

    const n = points.length;
    const last = points[n - 1];
    const secondLast = points[n - 2];
    const rtSlope = (last.responseTime - secondLast.responseTime) / (last.vus - secondLast.vus || 1);

    const data = points.map((p) => ({
      name: `#${runHistory[p.x]?.id || p.x}`,
      responseTime: Math.round(p.responseTime),
      projected: null,
    }));

    for (let i = 1; i <= 5; i++) {
      const extraVus = (last.vus || 10) * (1 + i * 0.5);
      data.push({
        name: `+${Math.round(extraVus)} VUs`,
        responseTime: null,
        projected: Math.round(last.responseTime + rtSlope * (extraVus - last.vus)),
      });
    }

    return data;
  })();

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  const capacity = analysis?.capacity_analysis || analysis?.capacity || [];
  const recommendations = analysis?.optimization_targets || analysis?.optimizations || analysis?.recommendations || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Capacity Planning</h1>
        </div>
        <p className="text-text-secondary mt-1">Forecast system capacity and plan for growth</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Summary Cards */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-5 text-center">
            <Server className="w-6 h-6 mx-auto mb-2 text-accent" />
            <p className="text-xs text-text-muted uppercase tracking-wider">Max Tested VUs</p>
            <p className="text-2xl font-bold text-text-primary mt-1">
              {formatNumber(runHistory[runHistory.length - 1]?.vus_max ?? 0)}
            </p>
          </div>
          <div className="glass-card p-5 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-success" />
            <p className="text-xs text-text-muted uppercase tracking-wider">Capacity Trend</p>
            <p className="text-2xl font-bold text-success mt-1">
              {analysis.trend || 'Stable'}
            </p>
          </div>
          <div className="glass-card p-5 text-center">
            <Zap className="w-6 h-6 mx-auto mb-2 text-warning" />
            <p className="text-xs text-text-muted uppercase tracking-wider">Recommendations</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{recommendations.length || capacity.length}</p>
          </div>
        </motion.div>
      )}

      {/* Projection Chart */}
      {projectionData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Response Time Projection</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} unit="ms" />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="responseTime" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} name="Actual (ms)" connectNulls={false} />
              <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#f59e0b' }} name="Projected (ms)" connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-text-muted mt-2 text-center">Dashed line shows projected response time under increasing load</p>
        </motion.div>
      )}

      {/* Capacity Analysis */}
      {capacity.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Capacity Analysis</h3>
          {capacity.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-text-secondary py-1.5 border-b border-border/30 last:border-0">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent" />
              <span>{typeof item === 'string' ? item : item.message || item.description || JSON.stringify(item)}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Recommendations</h3>
          {recommendations.map((rec, i) => (
            <RecommendationCard
              key={i}
              icon={i % 3 === 0 ? Server : i % 3 === 1 ? Zap : AlertTriangle}
              title={typeof rec === 'string' ? rec : rec.title || 'Recommendation'}
              description={typeof rec === 'string' ? '' : rec.description || rec.message || ''}
              color={['#3b82f6', '#22c55e', '#f59e0b'][i % 3]}
            />
          ))}
        </motion.div>
      )}

      {!analysis && runHistory.length < 2 && (
        <div className="glass-card p-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-secondary">Not enough data for capacity planning</p>
          <p className="text-sm text-text-muted mt-1">Complete multiple test runs with AI analysis to enable capacity projections</p>
        </div>
      )}
    </motion.div>
  );
}
