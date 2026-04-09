import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Activity, Clock, AlertTriangle, Loader2, AlertCircle,
  StopCircle, Wifi, WifiOff, Zap,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { runs } from '../lib/api';
import { connect, subscribe, unsubscribe, addListener, removeListener } from '../lib/websocket';
import { formatDuration, formatNumber, getStatusInfo } from '../lib/utils';

function HeroMetric({ icon: Icon, label, value, color, unit, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300 }}
      className="glass-card p-5 text-center"
    >
      <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <motion.p
        key={value}
        initial={{ scale: 1.15, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-3xl font-bold text-text-primary"
      >
        {value}
        {unit && <span className="text-lg text-text-muted ml-1">{unit}</span>}
      </motion.p>
      <p className="text-xs text-text-secondary mt-1">{label}</p>
    </motion.div>
  );
}

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

export default function LiveMonitor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [aborting, setAborting] = useState(false);

  const [metrics, setMetrics] = useState({
    vus: 0, rps: 0, avgResponseTime: 0, errorRate: 0,
  });
  const [responseTimeData, setResponseTimeData] = useState([]);
  const [throughputData, setThroughputData] = useState([]);
  const [errors, setErrors] = useState([]);
  const tickRef = useRef(0);

  useEffect(() => {
    runs.get(id)
      .then((res) => setRun(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load run'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    connect();
    subscribe(id);
    setConnected(true);

    const listenerId = `live-monitor-${id}`;
    addListener(listenerId, (data) => {
      if (data.run_id && String(data.run_id) !== String(id)) return;

      if (data.type === 'metrics') {
        const m = data.metrics || data;
        setMetrics({
          vus: m.vus ?? m.vus_current ?? 0,
          rps: m.rps ?? m.http_reqs_per_sec ?? 0,
          avgResponseTime: m.avg_response_time ?? m.http_req_duration_avg ?? 0,
          errorRate: m.error_rate ?? m.http_req_failed_rate ?? 0,
        });
        tickRef.current += 1;
        const t = tickRef.current;
        const label = `${Math.floor(t * 3 / 60)}:${String((t * 3) % 60).padStart(2, '0')}`;
        setResponseTimeData((prev) => [...prev.slice(-59), {
          time: label,
          avg: m.avg_response_time ?? m.http_req_duration_avg ?? 0,
          p95: m.p95 ?? m.http_req_duration_p95 ?? 0,
        }]);
        setThroughputData((prev) => [...prev.slice(-59), {
          time: label,
          rps: m.rps ?? m.http_reqs_per_sec ?? 0,
        }]);
      }

      if (data.type === 'error') {
        setErrors((prev) => [{ message: data.message || data.error, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
      }

      if (data.type === 'status') {
        setRun((prev) => prev ? { ...prev, status: data.status } : prev);
      }
    });

    return () => {
      removeListener(listenerId);
      unsubscribe(id);
    };
  }, [id]);

  const handleAbort = async () => {
    setAborting(true);
    try {
      await runs.abort(id);
      setRun((prev) => prev ? { ...prev, status: 'aborted' } : prev);
      setConfirmAbort(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to abort');
    } finally {
      setAborting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (error && !run) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="w-10 h-10 text-danger" />
        <p className="text-text-secondary">{error}</p>
      </div>
    );
  }

  const statusInfo = getStatusInfo(run?.status);
  const isActive = ['running', 'initializing', 'collecting'].includes(run?.status);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">Live Monitor</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.bg}`} style={{ color: statusInfo.color }}>
              {statusInfo.label}
            </span>
            {connected ? (
              <span className="flex items-center gap-1 text-xs text-success"><Wifi className="w-3 h-3" /> Connected</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-warning"><WifiOff className="w-3 h-3" /> Disconnected</span>
            )}
          </div>
          <p className="text-text-secondary mt-1">{run?.test_name || 'Test Run'} — Run #{id}</p>
        </div>
        {isActive && (
          <button
            onClick={() => setConfirmAbort(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30 rounded-lg text-sm font-medium transition-colors"
          >
            <StopCircle className="w-4 h-4" /> Abort Run
          </button>
        )}
      </div>

      {/* Hero Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroMetric icon={Users} label="Current VUs" value={formatNumber(metrics.vus)} color="#3b82f6" delay={0} />
        <HeroMetric icon={Zap} label="Requests/sec" value={typeof metrics.rps === 'number' ? metrics.rps.toFixed(1) : '0'} color="#8b5cf6" delay={0.05} />
        <HeroMetric icon={Clock} label="Avg Response Time" value={formatDuration(metrics.avgResponseTime)} color="#22c55e" delay={0.1} />
        <HeroMetric icon={AlertTriangle} label="Error Rate" value={`${(metrics.errorRate * 100).toFixed(2)}%`} color={metrics.errorRate > 0.05 ? '#ef4444' : '#f59e0b'} delay={0.15} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Response Time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={responseTimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg" />
              <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="P95" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Throughput</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={throughputData}>
              <defs>
                <linearGradient id="rpsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={{ stroke: '#1e3a5f' }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="rps" stroke="#8b5cf6" strokeWidth={2} fill="url(#rpsGrad)" name="RPS" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Error Feed */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Error Feed</h3>
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {errors.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No errors recorded</p>
          ) : (
            errors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-sm py-1.5 border-b border-border/30 last:border-0">
                <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                <span className="text-text-secondary flex-1">{err.message}</span>
                <span className="text-xs text-text-muted shrink-0">{err.time}</span>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Abort Confirmation */}
      <AnimatePresence>
        {confirmAbort && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmAbort(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="glass-card p-6 max-w-sm w-full mx-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <StopCircle className="w-12 h-12 text-danger mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">Abort this run?</h3>
              <p className="text-sm text-text-secondary mb-6">This action cannot be undone. The run will be stopped and partial results saved.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setConfirmAbort(false)} className="px-4 py-2 bg-bg-card border border-border text-text-secondary rounded-lg text-sm hover:border-accent/50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleAbort} disabled={aborting} className="px-4 py-2 bg-danger hover:bg-danger/80 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                  {aborting ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
                  Abort Run
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
