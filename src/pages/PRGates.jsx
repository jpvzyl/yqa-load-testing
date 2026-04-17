import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitPullRequest, Plus, Loader2, AlertCircle, CheckCircle2, XCircle,
  X, Settings, ArrowUpRight, ArrowDownRight, Minus,
  Shield, GitBranch, Eye, ChevronDown,
} from 'lucide-react';
import api from '../lib/api';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const PROVIDERS = [
  { id: 'github', label: 'GitHub' },
  { id: 'gitlab', label: 'GitLab' },
  { id: 'bitbucket', label: 'Bitbucket' },
];

function DeltaIndicator({ value, unit = 'ms', inverse = false }) {
  if (value == null || value === 0) return <span className="text-text-muted flex items-center gap-0.5"><Minus className="w-3 h-3" /> 0{unit}</span>;
  const isPositive = value > 0;
  const isGood = inverse ? isPositive : !isPositive;
  return (
    <span className={`flex items-center gap-0.5 ${isGood ? 'text-green-400' : 'text-red-400'}`}>
      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {isPositive ? '+' : ''}{value}{unit}
    </span>
  );
}

export default function PRGates() {
  const [gates, setGates] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('gates');
  const [selectedGate, setSelectedGate] = useState(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [configForm, setConfigForm] = useState({
    repo_owner: '', repo_name: '', provider: 'github',
    p95_budget_ms: 500, error_rate_budget: 1.0, throughput_min_rps: 100,
  });

  useEffect(() => {
    Promise.all([
      api.get('/api/v2/pr-gates'),
      api.get('/api/v2/pr-gates/configs'),
    ])
      .then(([gatesRes, configsRes]) => {
        setGates(gatesRes.data?.gates || []);
        setConfigs(configsRes.data?.configs || []);
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load PR gates'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreateConfig = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/api/v2/pr-gates/configs', configForm);
      setConfigs(prev => [res.data, ...prev]);
      setConfigForm({ repo_owner: '', repo_name: '', provider: 'github', p95_budget_ms: 500, error_rate_budget: 1.0, throughput_min_rps: 100 });
      setShowConfigForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create config');
    } finally {
      setSubmitting(false);
    }
  };

  const gateStatusConfig = {
    passed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/15', label: 'Passed' },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/15', label: 'Failed' },
    running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'Running' },
    pending: { icon: Eye, color: 'text-yellow-400', bg: 'bg-yellow-500/15', label: 'Pending' },
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
            <GitPullRequest className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">PR Gates</h1>
          </div>
          <p className="text-text-secondary mt-1">Continuous performance testing in your CI pipeline</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('gates')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'gates' ? 'bg-accent text-white' : 'bg-bg-card border border-border text-text-secondary hover:border-accent/50'}`}>
            Gates
          </button>
          <button onClick={() => setView('config')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'config' ? 'bg-accent text-white' : 'bg-bg-card border border-border text-text-secondary hover:border-accent/50'}`}>
            Configuration
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {view === 'config' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Gate Configurations</h2>
            <button onClick={() => setShowConfigForm(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Config
            </button>
          </div>

          <AnimatePresence>
            {showConfigForm && (
              <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} onSubmit={handleCreateConfig} className="glass-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-text-primary">New Gate Configuration</h3>
                  <button type="button" onClick={() => setShowConfigForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Repo Owner</label>
                    <input className={inputClass} placeholder="my-org" value={configForm.repo_owner} onChange={e => setConfigForm(f => ({ ...f, repo_owner: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Repo Name</label>
                    <input className={inputClass} placeholder="my-app" value={configForm.repo_name} onChange={e => setConfigForm(f => ({ ...f, repo_name: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Provider</label>
                    <select className={inputClass} value={configForm.provider} onChange={e => setConfigForm(f => ({ ...f, provider: e.target.value }))}>
                      {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">P95 Budget (ms)</label>
                    <input className={inputClass} type="number" min={1} value={configForm.p95_budget_ms} onChange={e => setConfigForm(f => ({ ...f, p95_budget_ms: parseInt(e.target.value) || 500 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Error Rate Budget (%)</label>
                    <input className={inputClass} type="number" min={0} max={100} step={0.1} value={configForm.error_rate_budget} onChange={e => setConfigForm(f => ({ ...f, error_rate_budget: parseFloat(e.target.value) || 1 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Min Throughput (rps)</label>
                    <input className={inputClass} type="number" min={1} value={configForm.throughput_min_rps} onChange={e => setConfigForm(f => ({ ...f, throughput_min_rps: parseInt(e.target.value) || 100 }))} />
                  </div>
                </div>
                <button type="submit" disabled={submitting || !configForm.repo_owner || !configForm.repo_name} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />} Save Config
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {configs.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Settings className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-secondary">No gate configurations yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GitBranch className="w-5 h-5 text-accent" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{c.repo_owner}/{c.repo_name}</p>
                      <p className="text-xs text-text-muted mt-0.5">{c.provider} &middot; P95: {c.p95_budget_ms}ms &middot; Err: {c.error_rate_budget}% &middot; RPS: {c.throughput_min_rps}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {view === 'gates' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Recent Gates</h2>
          {gates.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <GitPullRequest className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-secondary">No PR gates triggered yet</p>
            </div>
          ) : (
            <>
              <div className="glass-card p-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-text-secondary">
                        <th className="text-left py-3 px-3 font-medium">PR</th>
                        <th className="text-left py-3 px-3 font-medium">Branch</th>
                        <th className="text-left py-3 px-3 font-medium">Status</th>
                        <th className="text-left py-3 px-3 font-medium">Gate Result</th>
                        <th className="text-left py-3 px-3 font-medium">Violations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gates.map(g => {
                        const st = gateStatusConfig[g.gate_result] || gateStatusConfig.pending;
                        const StIcon = st.icon;
                        return (
                          <tr key={g.id} onClick={() => setSelectedGate(selectedGate?.id === g.id ? null : g)} className="border-b border-border/50 hover:bg-bg-card-hover cursor-pointer transition-colors">
                            <td className="py-3 px-3 text-text-primary font-medium">#{g.pr_number}</td>
                            <td className="py-3 px-3 text-text-secondary flex items-center gap-1"><GitBranch className="w-3.5 h-3.5" /> {g.branch}</td>
                            <td className="py-3 px-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">{g.status}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>
                                <StIcon className={`w-3.5 h-3.5 ${g.gate_result === 'running' ? 'animate-spin' : ''}`} />
                                {st.label}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-text-muted">{g.violations?.length || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Performance Diff */}
              <AnimatePresence>
                {selectedGate?.perf_diff && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card p-5 space-y-4">
                    <h3 className="text-base font-semibold text-text-primary">Performance Diff — PR #{selectedGate.pr_number}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-text-secondary">
                            <th className="text-left py-3 px-3 font-medium">Metric</th>
                            <th className="text-left py-3 px-3 font-medium">Baseline</th>
                            <th className="text-left py-3 px-3 font-medium">Current</th>
                            <th className="text-left py-3 px-3 font-medium">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGate.perf_diff.map((d, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="py-3 px-3 text-text-primary font-medium">{d.metric}</td>
                              <td className="py-3 px-3 text-text-secondary">{d.baseline}{d.unit}</td>
                              <td className="py-3 px-3 text-text-secondary">{d.current}{d.unit}</td>
                              <td className="py-3 px-3"><DeltaIndicator value={d.delta} unit={d.unit} inverse={d.inverse} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedGate.violations?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-red-400 flex items-center gap-1.5">
                          <Shield className="w-4 h-4" /> Budget Violations
                        </h4>
                        {selectedGate.violations.map((v, i) => (
                          <div key={i} className="flex items-start gap-2 p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm text-text-primary">{v.metric}: {v.actual}{v.unit} exceeds budget of {v.budget}{v.unit}</p>
                              <p className="text-xs text-text-muted mt-0.5">{v.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
