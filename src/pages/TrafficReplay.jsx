import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlayCircle, Plus, Loader2, AlertCircle, X, Pause,
  Radio, FastForward, RotateCcw, Waves, CheckCircle2,
  XCircle, ArrowRight, RefreshCw, Filter,
} from 'lucide-react';
import api from '../lib/api';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const REPLAY_MODES = [
  { id: 'verbatim', label: 'Verbatim', icon: PlayCircle, description: 'Replay exact captured traffic' },
  { id: 'amplified', label: 'Amplified', icon: FastForward, description: 'Multiply traffic volume' },
  { id: 'looped', label: 'Looped', icon: RotateCcw, description: 'Repeat traffic in a loop' },
  { id: 'shaped', label: 'Shaped', icon: Waves, description: 'Apply traffic shaping profile' },
];

function StatusBadge({ status }) {
  const config = {
    capturing: { color: 'text-blue-400', bg: 'bg-blue-500/15', icon: Radio },
    completed: { color: 'text-green-400', bg: 'bg-green-500/15', icon: CheckCircle2 },
    replaying: { color: 'text-purple-400', bg: 'bg-purple-500/15', icon: PlayCircle },
    failed: { color: 'text-red-400', bg: 'bg-red-500/15', icon: XCircle },
    idle: { color: 'text-yellow-400', bg: 'bg-yellow-500/15', icon: Pause },
  };
  const c = config[status] || config.idle;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${c.bg} ${c.color}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'capturing' || status === 'replaying' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

export default function TrafficReplay() {
  const [captures, setCaptures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCaptureForm, setShowCaptureForm] = useState(false);
  const [showReplayControls, setShowReplayControls] = useState(null);
  const [parityReport, setParityReport] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [replayMode, setReplayMode] = useState('verbatim');
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [captureForm, setCaptureForm] = useState({
    name: '', target_url: '', method_filter: '', environment: 'staging', duration_sec: 300,
  });

  useEffect(() => {
    api.get('/api/v2/replay/captures')
      .then(res => setCaptures(res.data?.captures || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load captures'))
      .finally(() => setLoading(false));
  }, []);

  const startCapture = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/api/v2/replay/captures', captureForm);
      setCaptures(prev => [res.data, ...prev]);
      setCaptureForm({ name: '', target_url: '', method_filter: '', environment: 'staging', duration_sec: 300 });
      setShowCaptureForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start capture');
    } finally {
      setSubmitting(false);
    }
  };

  const startReplay = async (captureId) => {
    try {
      const res = await api.post(`/api/v2/replay/captures/${captureId}/replay`, {
        mode: replayMode,
        speed_multiplier: speedMultiplier,
      });
      setParityReport(res.data?.parity_report || null);
      setShowReplayControls(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start replay');
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
            <RefreshCw className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Traffic Replay</h1>
          </div>
          <p className="text-text-secondary mt-1">Capture and replay production traffic patterns</p>
        </div>
        <button onClick={() => setShowCaptureForm(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Start Capture
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Capture Form */}
      <AnimatePresence>
        {showCaptureForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} onSubmit={startCapture} className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">Start New Capture</h3>
              <button type="button" onClick={() => setShowCaptureForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Capture Name</label>
                <input className={inputClass} placeholder="prod-checkout-flow" value={captureForm.name} onChange={e => setCaptureForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Target URL</label>
                <input className={inputClass} placeholder="https://api.example.com" value={captureForm.target_url} onChange={e => setCaptureForm(f => ({ ...f, target_url: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Method Filter</label>
                <input className={inputClass} placeholder="GET,POST (empty = all)" value={captureForm.method_filter} onChange={e => setCaptureForm(f => ({ ...f, method_filter: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Environment</label>
                <select className={inputClass} value={captureForm.environment} onChange={e => setCaptureForm(f => ({ ...f, environment: e.target.value }))}>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Duration (seconds)</label>
                <input className={inputClass} type="number" min={30} max={86400} value={captureForm.duration_sec} onChange={e => setCaptureForm(f => ({ ...f, duration_sec: parseInt(e.target.value) || 300 }))} />
              </div>
            </div>
            <button type="submit" disabled={submitting || !captureForm.name} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />} Start Capture
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Captures List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Captures</h2>
        {captures.length === 0 ? (
          <div className="text-center py-8">
            <Radio className="w-10 h-10 mx-auto text-text-muted mb-2" />
            <p className="text-text-secondary text-sm">No captures recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-3 px-3 font-medium">Name</th>
                  <th className="text-left py-3 px-3 font-medium">Method</th>
                  <th className="text-left py-3 px-3 font-medium">Environment</th>
                  <th className="text-left py-3 px-3 font-medium">Status</th>
                  <th className="text-left py-3 px-3 font-medium">Requests</th>
                  <th className="text-left py-3 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {captures.map(cap => (
                  <tr key={cap.id} className="border-b border-border/50 hover:bg-bg-card-hover transition-colors">
                    <td className="py-3 px-3 text-text-primary font-medium">{cap.name}</td>
                    <td className="py-3 px-3 text-text-secondary">{cap.method_filter || 'ALL'}</td>
                    <td className="py-3 px-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">{cap.environment}</span>
                    </td>
                    <td className="py-3 px-3"><StatusBadge status={cap.status} /></td>
                    <td className="py-3 px-3 text-text-secondary">{(cap.request_count || 0).toLocaleString()}</td>
                    <td className="py-3 px-3">
                      <button onClick={() => setShowReplayControls(showReplayControls === cap.id ? null : cap.id)} className="flex items-center gap-1 text-accent hover:text-accent-light text-xs font-medium transition-colors">
                        <PlayCircle className="w-3.5 h-3.5" /> Replay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Replay Controls */}
      <AnimatePresence>
        {showReplayControls && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Replay Controls</h2>
              <button onClick={() => setShowReplayControls(null)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {REPLAY_MODES.map(mode => {
                const Icon = mode.icon;
                return (
                  <div key={mode.id} onClick={() => setReplayMode(mode.id)} className={`glass-card p-4 cursor-pointer transition-colors text-center ${replayMode === mode.id ? 'border border-accent/50 bg-accent/5' : 'hover:bg-bg-card-hover'}`}>
                    <Icon className={`w-6 h-6 mx-auto mb-2 ${replayMode === mode.id ? 'text-accent' : 'text-text-muted'}`} />
                    <p className="text-sm font-medium text-text-primary">{mode.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{mode.description}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Speed Multiplier</label>
                <input className={`${inputClass} w-32`} type="number" min={0.1} max={100} step={0.1} value={speedMultiplier} onChange={e => setSpeedMultiplier(parseFloat(e.target.value) || 1)} />
              </div>
              <button onClick={() => startReplay(showReplayControls)} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors mt-6">
                <PlayCircle className="w-4 h-4" /> Start Replay
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Parity Report */}
      {parityReport && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Parity Report</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{parityReport.percent_matched || 0}%</p>
              <p className="text-sm text-text-secondary mt-1">Matched</p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-3xl font-bold text-text-primary">{parityReport.total_requests || 0}</p>
              <p className="text-sm text-text-secondary mt-1">Total Requests</p>
            </div>
            <div className="glass-card p-4 text-center">
              <p className="text-3xl font-bold text-red-400">{parityReport.divergences?.length || 0}</p>
              <p className="text-sm text-text-secondary mt-1">Divergences</p>
            </div>
          </div>
          {parityReport.divergences?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-secondary">
                    <th className="text-left py-3 px-3 font-medium">Endpoint</th>
                    <th className="text-left py-3 px-3 font-medium">Expected</th>
                    <th className="text-left py-3 px-3 font-medium">Actual</th>
                    <th className="text-left py-3 px-3 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {parityReport.divergences.map((d, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 px-3 text-text-primary font-medium">{d.endpoint}</td>
                      <td className="py-3 px-3 text-green-400">{d.expected_status}</td>
                      <td className="py-3 px-3 text-red-400">{d.actual_status}</td>
                      <td className="py-3 px-3 text-text-muted">{d.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
