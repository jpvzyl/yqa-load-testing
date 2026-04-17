import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, Plus, Loader2, AlertCircle, X, Trash2,
  CheckCircle2, XCircle, Download, Play, Sliders,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../lib/api';

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card p-3 !rounded-lg text-sm">
      <p className="text-text-secondary">{payload[0].name}</p>
      <p className="text-blue-400 font-semibold">{payload[0].value}%</p>
    </div>
  );
};

export default function WorkloadModeler() {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newScenario, setNewScenario] = useState({ name: '', endpoint: '', method: 'GET', weight: 10 });

  useEffect(() => {
    api.get('/api/v2/workload-models')
      .then(res => {
        setScenarios(res.data?.scenarios || []);
        setValidation(res.data?.validation || null);
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load workload model'))
      .finally(() => setLoading(false));
  }, []);

  const totalWeight = scenarios.reduce((sum, s) => sum + (s.weight || 0), 0);

  const updateWeight = (id, weight) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, weight: Math.max(0, Math.min(100, parseInt(weight) || 0)) } : s));
  };

  const removeScenario = (id) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
  };

  const addScenario = (e) => {
    e.preventDefault();
    setScenarios(prev => [...prev, { ...newScenario, id: `scenario-${Date.now()}` }]);
    setNewScenario({ name: '', endpoint: '', method: 'GET', weight: 10 });
    setShowAddForm(false);
  };

  const saveModel = async () => {
    try {
      const res = await api.put('/api/v2/workload-models', { scenarios });
      setValidation(res.data?.validation || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save model');
    }
  };

  const generateScript = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/api/v2/workload-models/generate', { scenarios });
      setGeneratedScript(res.data?.script || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate script');
    } finally {
      setGenerating(false);
    }
  };

  const pieData = scenarios.map(s => ({
    name: s.name,
    value: totalWeight > 0 ? Math.round((s.weight / totalWeight) * 100) : 0,
  }));

  const isValid = totalWeight === 100;

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
            <Sliders className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Workload Modeler</h1>
          </div>
          <p className="text-text-secondary mt-1">Compose realistic traffic patterns from weighted scenarios</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm">
            <Plus className="w-4 h-4" /> Add Scenario
          </button>
          <button onClick={generateScript} disabled={generating || !isValid} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Generate Script
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Validation Status */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`glass-card p-4 flex items-center gap-3 ${isValid ? 'border border-green-500/20' : totalWeight > 0 ? 'border border-yellow-500/20' : ''}`}>
        {isValid ? (
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        ) : (
          <XCircle className="w-5 h-5 text-yellow-400" />
        )}
        <div>
          <p className="text-sm font-medium text-text-primary">
            {isValid ? 'Model is valid' : `Weights sum to ${totalWeight}% — must equal 100%`}
          </p>
          {validation?.message && <p className="text-xs text-text-muted mt-0.5">{validation.message}</p>}
        </div>
        <div className="ml-auto text-sm font-bold text-text-primary">{totalWeight}%</div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenario List */}
        <div className="lg:col-span-2 space-y-3">
          <AnimatePresence>
            {showAddForm && (
              <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} onSubmit={addScenario} className="glass-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-text-primary">Add Scenario</h3>
                  <button type="button" onClick={() => setShowAddForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Name</label>
                    <input className={inputClass} placeholder="Browse Products" value={newScenario.name} onChange={e => setNewScenario(f => ({ ...f, name: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Endpoint</label>
                    <input className={inputClass} placeholder="/api/products" value={newScenario.endpoint} onChange={e => setNewScenario(f => ({ ...f, endpoint: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Method</label>
                    <select className={inputClass} value={newScenario.method} onChange={e => setNewScenario(f => ({ ...f, method: e.target.value }))}>
                      {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Weight (%)</label>
                    <input className={inputClass} type="number" min={0} max={100} value={newScenario.weight} onChange={e => setNewScenario(f => ({ ...f, weight: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                <button type="submit" disabled={!newScenario.name} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {scenarios.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Layers className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-secondary">No scenarios defined</p>
              <p className="text-sm text-text-muted mt-1">Add scenarios to model your production traffic</p>
            </div>
          ) : (
            scenarios.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-4 flex items-center gap-4">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{s.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent/15 text-accent mr-1">{s.method}</span>
                    {s.endpoint}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={s.weight}
                    onChange={e => updateWeight(s.id, e.target.value)}
                    className="w-24 accent-blue-500"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={s.weight}
                    onChange={e => updateWeight(s.id, e.target.value)}
                    className="w-16 bg-bg-secondary border border-border rounded px-2 py-1 text-sm text-text-primary text-center focus:outline-none focus:border-accent/60"
                  />
                  <span className="text-xs text-text-muted w-4">%</span>
                  <button onClick={() => removeScenario(s.id)} className="text-text-muted hover:text-danger transition-colors p-1 ml-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )}

          {scenarios.length > 0 && (
            <div className="flex justify-end">
              <button onClick={saveModel} className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm">
                <Download className="w-4 h-4" /> Save Model
              </button>
            </div>
          )}
        </div>

        {/* Weight Distribution Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5">
          <h2 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-blue-400" /> Weight Distribution
          </h2>
          {pieData.length > 0 ? (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-3">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-text-secondary truncate">{d.name}</span>
                    </div>
                    <span className="text-text-primary font-medium">{d.value}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">Add scenarios to see distribution</p>
          )}
        </motion.div>
      </div>

      {/* Generated Script */}
      <AnimatePresence>
        {generatedScript && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-text-primary">Generated Script</h2>
              <button onClick={() => setGeneratedScript(null)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            <pre className="bg-bg-secondary rounded-lg p-4 text-sm text-text-primary overflow-x-auto max-h-80">
              <code>{generatedScript}</code>
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
