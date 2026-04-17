import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Loader2, AlertCircle, Clock, AlertTriangle,
  ChevronRight, X, Activity, Layers, ArrowRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import api from '../lib/api';

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

function SpanBar({ span, maxDuration, depth = 0 }) {
  const left = maxDuration > 0 ? (span.start_offset / maxDuration) * 100 : 0;
  const width = maxDuration > 0 ? Math.max((span.duration_ms / maxDuration) * 100, 1) : 1;
  const isError = span.status === 'error';

  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 20}px` }}>
        <span className="text-xs text-text-muted w-28 truncate shrink-0">{span.operation}</span>
        <div className="flex-1 relative h-6 bg-bg-secondary/50 rounded">
          <div
            className={`absolute h-full rounded ${isError ? 'bg-red-500/60' : 'bg-blue-500/60'}`}
            style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}
          />
        </div>
        <span className="text-xs text-text-secondary w-16 text-right shrink-0">{span.duration_ms}ms</span>
      </div>
      {span.children?.map((child, i) => (
        <SpanBar key={i} span={child} maxDuration={maxDuration} depth={depth + 1} />
      ))}
    </div>
  );
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary">{payload[0].name}</p>
      <p className="text-blue-400 font-semibold">{payload[0].value}</p>
    </div>
  );
};

export default function TraceExplorer() {
  const [runId, setRunId] = useState('');
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [traceDetail, setTraceDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorLogs, setErrorLogs] = useState([]);
  const [serviceBreakdown, setServiceBreakdown] = useState([]);

  const fetchTraces = async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/v2/traces`, { params: { run_id: runId, sort: 'duration_desc', limit: 50 } });
      setTraces(res.data?.traces || []);
      setServiceBreakdown(res.data?.service_breakdown || []);
      setErrorLogs(res.data?.error_logs || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load traces');
    } finally {
      setLoading(false);
    }
  };

  const selectTrace = async (trace) => {
    setSelectedTrace(trace);
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/v2/traces/${trace.trace_id}`);
      setTraceDetail(res.data);
    } catch {
      setTraceDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const maxDuration = traceDetail?.spans?.reduce((max, s) => Math.max(max, (s.start_offset || 0) + (s.duration_ms || 0)), 0) || 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Trace Explorer</h1>
        </div>
        <p className="text-text-secondary mt-1">Explore OpenTelemetry traces from your load test runs</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
        <div className="flex gap-3">
          <input
            className={inputClass}
            placeholder="Enter Run ID to explore traces..."
            value={runId}
            onChange={e => setRunId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchTraces()}
          />
          <button onClick={fetchTraces} disabled={loading || !runId} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {serviceBreakdown.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Service Breakdown</h2>
          <div className="flex items-center gap-8">
            <div className="w-48 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={serviceBreakdown} dataKey="count" nameKey="service" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                    {serviceBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3">
              {serviceBreakdown.map((s, i) => (
                <div key={s.service} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-text-secondary">{s.service}</span>
                  <span className="text-text-muted">({s.count})</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traces Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Slow Traces</h2>
          {traces.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-10 h-10 mx-auto text-text-muted mb-2" />
              <p className="text-text-secondary text-sm">No traces found</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {traces.map(t => (
                <div
                  key={t.trace_id}
                  onClick={() => selectTrace(t)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${selectedTrace?.trace_id === t.trace_id ? 'bg-accent/10 border border-accent/30' : 'hover:bg-bg-card-hover'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary font-medium truncate">{t.operation || t.trace_id}</p>
                    <p className="text-xs text-text-muted mt-0.5">{t.service} &middot; {t.trace_id.slice(0, 16)}...</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`text-sm font-semibold ${t.duration_ms > 1000 ? 'text-red-400' : t.duration_ms > 500 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {t.duration_ms}ms
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Waterfall / Detail */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Waterfall View</h2>
          {!selectedTrace ? (
            <div className="text-center py-12">
              <ArrowRight className="w-8 h-8 mx-auto text-text-muted mb-2 -rotate-180 lg:rotate-0" />
              <p className="text-text-secondary text-sm">Select a trace to view its waterfall</p>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : traceDetail?.spans?.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto">
              {traceDetail.spans.map((span, i) => (
                <SpanBar key={i} span={span} maxDuration={maxDuration} />
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">No span data available</p>
          )}
        </motion.div>
      </div>

      {/* Error Logs */}
      {errorLogs.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" /> Error Logs
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {errorLogs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{log.message}</p>
                  <div className="flex gap-3 mt-1 text-xs text-text-muted">
                    <span>{log.service}</span>
                    <span>{log.timestamp}</span>
                    {log.trace_id && <span className="truncate">{log.trace_id.slice(0, 16)}...</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
