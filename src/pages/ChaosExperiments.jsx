import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Plus, Loader2, AlertCircle, CheckCircle2, XCircle,
  Flame, Wifi, Clock, Server, HardDrive, Shield,
  X, Play, ChevronRight, Beaker,
} from 'lucide-react';
import api from '../lib/api';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const FAULT_CATALOG = [
  { id: 'latency', label: 'Latency Injection', icon: Clock, color: '#f59e0b', description: 'Add artificial delay to requests' },
  { id: 'error', label: 'Error Injection', icon: AlertCircle, color: '#ef4444', description: 'Force HTTP error responses' },
  { id: 'cpu_stress', label: 'CPU Stress', icon: Flame, color: '#f97316', description: 'Spike CPU utilization on target' },
  { id: 'memory_pressure', label: 'Memory Pressure', icon: HardDrive, color: '#8b5cf6', description: 'Consume memory on target host' },
  { id: 'network_partition', label: 'Network Partition', icon: Wifi, color: '#3b82f6', description: 'Simulate network split between services' },
  { id: 'dns_failure', label: 'DNS Failure', icon: Server, color: '#06b6d4', description: 'Block DNS resolution' },
  { id: 'disk_io', label: 'Disk I/O Stress', icon: HardDrive, color: '#ec4899', description: 'Saturate disk I/O bandwidth' },
  { id: 'tls_expiry', label: 'TLS Certificate Expiry', icon: Shield, color: '#22c55e', description: 'Simulate expired certificates' },
];

function FaultCard({ fault, onSelect, selected }) {
  const Icon = fault.icon;
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      onClick={() => onSelect(fault.id)}
      className={`glass-card p-4 cursor-pointer transition-colors ${selected ? 'border border-accent/50 bg-accent/5' : 'hover:bg-bg-card-hover'}`}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${fault.color}20` }}>
        <Icon className="w-5 h-5" style={{ color: fault.color }} />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{fault.label}</h3>
      <p className="text-xs text-text-muted mt-1">{fault.description}</p>
    </motion.div>
  );
}

export default function ChaosExperiments() {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('catalog');
  const [selectedFaults, setSelectedFaults] = useState([]);
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    hypothesis: '',
    target_service: '',
    duration_sec: 60,
    steady_state_probe: '',
  });

  useEffect(() => {
    api.get('/api/v2/chaos/experiments')
      .then(res => setExperiments(res.data?.experiments || []))
      .catch(err => setError(err.response?.data?.error || 'Failed to load experiments'))
      .finally(() => setLoading(false));
  }, []);

  const toggleFault = (id) => {
    setSelectedFaults(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, faults: selectedFaults };
      const res = await api.post('/api/v2/chaos/experiments', payload);
      setExperiments(prev => [res.data, ...prev]);
      setForm({ name: '', hypothesis: '', target_service: '', duration_sec: 60, steady_state_probe: '' });
      setSelectedFaults([]);
      setView('list');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create experiment');
    } finally {
      setSubmitting(false);
    }
  };

  const runExperiment = async (id) => {
    try {
      await api.post(`/api/v2/chaos/experiments/${id}/run`);
      const res = await api.get('/api/v2/chaos/experiments');
      setExperiments(res.data?.experiments || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run experiment');
    }
  };

  const statusConfig = {
    passed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/15' },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/15' },
    running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/15' },
    pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
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
            <Zap className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Chaos Experiments</h1>
          </div>
          <p className="text-text-secondary mt-1">Inject faults to validate system resilience</p>
        </div>
        <div className="flex gap-2">
          {['catalog', 'builder', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === v ? 'bg-accent text-white' : 'bg-bg-card border border-border text-text-secondary hover:border-accent/50'}`}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </motion.div>
      )}

      {/* Fault Catalog */}
      {view === 'catalog' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Fault Catalog</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FAULT_CATALOG.map((fault, i) => (
              <motion.div key={fault.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <FaultCard fault={fault} onSelect={toggleFault} selected={selectedFaults.includes(fault.id)} />
              </motion.div>
            ))}
          </div>
          {selectedFaults.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-text-secondary">{selectedFaults.length} fault(s) selected</span>
              <button onClick={() => setView('builder')} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors">
                Build Experiment <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Experiment Builder */}
      {view === 'builder' && (
        <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleCreate} className="glass-card p-6 space-y-5">
          <h2 className="text-lg font-semibold text-text-primary">Experiment Builder</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedFaults.map(fid => {
              const fault = FAULT_CATALOG.find(f => f.id === fid);
              return fault ? (
                <span key={fid} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-accent/15 text-accent">
                  {fault.label}
                  <button type="button" onClick={() => toggleFault(fid)}><X className="w-3 h-3" /></button>
                </span>
              ) : null;
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Experiment Name</label>
              <input className={inputClass} placeholder="e.g., API gateway resilience" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Target Service</label>
              <input className={inputClass} placeholder="e.g., api-gateway" value={form.target_service} onChange={e => setForm(f => ({ ...f, target_service: e.target.value }))} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Hypothesis</label>
            <textarea className={`${inputClass} min-h-[80px]`} placeholder="When we inject latency into the API gateway, the system should degrade gracefully..." value={form.hypothesis} onChange={e => setForm(f => ({ ...f, hypothesis: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Duration (seconds)</label>
              <input className={inputClass} type="number" min={10} max={3600} value={form.duration_sec} onChange={e => setForm(f => ({ ...f, duration_sec: parseInt(e.target.value) || 60 }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Steady-State Probe URL</label>
              <input className={inputClass} placeholder="https://api.example.com/health" value={form.steady_state_probe} onChange={e => setForm(f => ({ ...f, steady_state_probe: e.target.value }))} />
            </div>
          </div>
          <button type="submit" disabled={submitting || !form.name || selectedFaults.length === 0} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Beaker className="w-4 h-4" />} Create Experiment
          </button>
        </motion.form>
      )}

      {/* Experiments List */}
      {view === 'list' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Experiments</h2>
          {experiments.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Beaker className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-secondary">No experiments created yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {experiments.map((exp, i) => {
                const st = statusConfig[exp.status] || statusConfig.pending;
                const StIcon = st.icon;
                const isSelected = selectedExperiment?.id === exp.id;
                return (
                  <motion.div key={exp.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <div className={`glass-card p-4 cursor-pointer transition-colors ${isSelected ? 'border border-accent/30' : ''}`} onClick={() => setSelectedExperiment(isSelected ? null : exp)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Zap className="w-5 h-5 text-accent" />
                          <div>
                            <p className="text-sm font-semibold text-text-primary">{exp.name}</p>
                            <p className="text-xs text-text-muted mt-0.5">{exp.target_service} &middot; {exp.faults?.join(', ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>
                            <StIcon className={`w-3.5 h-3.5 ${exp.status === 'running' ? 'animate-spin' : ''}`} />
                            {exp.status}
                          </span>
                          {exp.status !== 'running' && (
                            <button onClick={(e) => { e.stopPropagation(); runExperiment(exp.id); }} className="p-1.5 rounded-lg hover:bg-accent/10 text-accent transition-colors">
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass-card p-5 mt-2 space-y-3">
                          <div>
                            <h4 className="text-sm font-medium text-text-secondary">Hypothesis</h4>
                            <p className="text-sm text-text-primary mt-1">{exp.hypothesis || 'No hypothesis defined'}</p>
                          </div>
                          {exp.result && (
                            <div>
                              <h4 className="text-sm font-medium text-text-secondary">Evaluation</h4>
                              <p className={`text-sm mt-1 ${exp.result.hypothesis_confirmed ? 'text-green-400' : 'text-red-400'}`}>
                                {exp.result.hypothesis_confirmed ? 'Hypothesis confirmed' : 'Hypothesis disproved'}
                              </p>
                              {exp.result.summary && <p className="text-sm text-text-muted mt-1">{exp.result.summary}</p>}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
