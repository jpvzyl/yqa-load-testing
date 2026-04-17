import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, Loader2, AlertCircle, TrendingUp,
  Cloud, Lightbulb, ArrowRight, BarChart3,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../lib/api';

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const PROVIDERS = [
  { id: 'aws', label: 'AWS', color: '#f59e0b' },
  { id: 'gcp', label: 'GCP', color: '#3b82f6' },
  { id: 'azure', label: 'Azure', color: '#06b6d4' },
];

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }) {
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
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </motion.div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: ${p.value?.toLocaleString()}</p>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary">{payload[0].name}</p>
      <p className="text-blue-400 font-semibold">${payload[0].value?.toLocaleString()}/mo</p>
    </div>
  );
};

export default function CostAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState('aws');

  useEffect(() => {
    api.get('/api/v2/costs', { params: { provider } })
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load cost data'))
      .finally(() => setLoading(false));
  }, [provider]);

  const switchProvider = (p) => {
    setProvider(p);
    setLoading(true);
    setError(null);
  };

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

  const breakdown = data?.breakdown || [];
  const scalingCurve = data?.scaling_curve || [];
  const recommendations = data?.recommendations || [];
  const totalCost = breakdown.reduce((sum, b) => sum + (b.cost || 0), 0);
  const costPerRequest = data?.cost_per_request || 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Cost Analysis</h1>
          </div>
          <p className="text-text-secondary mt-1">Infrastructure cost modeling and optimization</p>
        </div>
        <div className="flex gap-2">
          {PROVIDERS.map(p => (
            <button
              key={p.id}
              onClick={() => switchProvider(p.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${provider === p.id ? 'bg-accent text-white' : 'bg-bg-card border border-border text-text-secondary hover:border-accent/50'}`}
            >
              <Cloud className="w-4 h-4" /> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={DollarSign} label="Total Monthly Cost" value={`$${totalCost.toLocaleString()}`} color="#3b82f6" delay={0} />
        <StatCard icon={TrendingUp} label="Cost per Request" value={`$${costPerRequest.toFixed(6)}`} sub="Average across all endpoints" color="#8b5cf6" delay={0.05} />
        <StatCard icon={BarChart3} label="Provider" value={PROVIDERS.find(p => p.id === provider)?.label || provider} sub={`${breakdown.length} cost categories`} color="#22c55e" delay={0.1} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown Pie */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Cost Breakdown</h2>
          {breakdown.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-52 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={breakdown} dataKey="cost" nameKey="category" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                {breakdown.map((b, i) => (
                  <div key={b.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm text-text-secondary">{b.category}</span>
                    </div>
                    <span className="text-sm font-medium text-text-primary">${b.cost?.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">No cost data available</p>
          )}
        </motion.div>

        {/* Scaling Curve */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Scaling Curve</h2>
          {scalingCurve.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scalingCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis dataKey="multiplier" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} label={{ value: 'Traffic Multiplier', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#1e3a5f' }} label={{ value: 'Monthly Cost ($)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} name="Cost" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">No scaling data available</p>
          )}
        </motion.div>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" /> Optimization Recommendations
          </h2>
          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }} className="flex items-start gap-3 p-4 bg-bg-secondary/50 rounded-lg">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${rec.impact === 'high' ? 'bg-green-500/15' : rec.impact === 'medium' ? 'bg-yellow-500/15' : 'bg-blue-500/15'}`}>
                  <ArrowRight className={`w-4 h-4 ${rec.impact === 'high' ? 'text-green-400' : rec.impact === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{rec.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rec.impact === 'high' ? 'bg-green-500/15 text-green-400' : rec.impact === 'medium' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-blue-500/15 text-blue-400'}`}>
                      {rec.impact} impact
                    </span>
                  </div>
                  <p className="text-sm text-text-muted mt-1">{rec.description}</p>
                  {rec.estimated_savings && (
                    <p className="text-sm text-green-400 mt-1 font-medium">Estimated savings: ${rec.estimated_savings}/mo</p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
