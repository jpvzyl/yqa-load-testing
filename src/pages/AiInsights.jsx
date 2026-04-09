import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Loader2, AlertCircle, CheckCircle2, Clock, Zap,
  AlertTriangle, TrendingUp, Shield, FileText, Play,
  ChevronRight, Target, Database, Server, ArrowRight,
} from 'lucide-react';
import { runs } from '../lib/api';
import { getGradeInfo, cn } from '../lib/utils';

const PASS_CONFIG = [
  {
    pass: 1,
    label: 'Performance Analysis',
    icon: Zap,
    color: '#3b82f6',
    description: 'Response times, error analysis, bottleneck detection',
  },
  {
    pass: 2,
    label: 'Deep Diagnostics',
    icon: Database,
    color: '#8b5cf6',
    description: 'Resource bottlenecks, capacity modeling, database analysis',
  },
  {
    pass: 3,
    label: 'Executive Summary',
    icon: FileText,
    color: '#22c55e',
    description: 'Risk assessment, go/no-go recommendation, remediation roadmap',
  },
];

function PassStatus({ status }) {
  if (status === 'complete') return <CheckCircle2 className="w-4.5 h-4.5 text-success" />;
  if (status === 'running') return <Loader2 className="w-4.5 h-4.5 text-accent animate-spin" />;
  if (status === 'error') return <AlertCircle className="w-4.5 h-4.5 text-danger" />;
  return <Clock className="w-4.5 h-4.5 text-text-muted" />;
}

function InsightCard({ icon: Icon, title, items, color }) {
  if (!items?.length) return null;
  return (
    <div className="bg-bg-secondary/50 border border-border/60 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color }} />
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
            <ChevronRight className="w-3 h-3 shrink-0 mt-1 text-text-muted" />
            <span>{typeof item === 'string' ? item : item.message || item.description || JSON.stringify(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiskBadge({ level }) {
  const config = {
    low: { bg: 'bg-green-500/15', color: 'text-green-400', label: 'Low Risk' },
    medium: { bg: 'bg-yellow-500/15', color: 'text-yellow-400', label: 'Medium Risk' },
    high: { bg: 'bg-orange-500/15', color: 'text-orange-400', label: 'High Risk' },
    critical: { bg: 'bg-red-500/15', color: 'text-red-400', label: 'Critical Risk' },
  };
  const c = config[level] || config.medium;
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.bg} ${c.color}`}>{c.label}</span>;
}

export default function AiInsights() {
  const { id } = useParams();
  const [analyses, setAnalyses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPass, setExpandedPass] = useState(1);

  const fetchAnalyses = () => {
    runs.analyses(id)
      .then((res) => setAnalyses(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load analyses'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAnalyses(); }, [id]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      await runs.analyze(id);
      setTimeout(fetchAnalyses, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const passList = Array.isArray(analyses) ? analyses : analyses?.passes || [];
  const getPassData = (passNum) => passList.find((p) => p.pass === passNum || p.pass_number === passNum);
  const getPassStatus = (passNum) => {
    const p = getPassData(passNum);
    if (!p) return 'pending';
    if (p.status === 'complete' || p.results) return 'complete';
    if (p.status === 'error') return 'error';
    if (p.status === 'running') return 'running';
    return 'pending';
  };

  const hasAnyResults = passList.length > 0;
  const pass1 = getPassData(1)?.results || getPassData(1);
  const pass2 = getPassData(2)?.results || getPassData(2);
  const pass3 = getPassData(3)?.results || getPassData(3);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">AI Insights</h1>
          </div>
          <p className="text-text-secondary mt-1">Multi-pass AI analysis for Run #{id}</p>
        </div>
        {!hasAnyResults && (
          <button onClick={handleAnalyze} disabled={analyzing} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Analysis
          </button>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pipeline */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Analysis Pipeline</h3>
        <div className="flex items-center gap-3">
          {PASS_CONFIG.map((pc, idx) => {
            const status = getPassStatus(pc.pass);
            const Icon = pc.icon;
            return (
              <div key={pc.pass} className="flex items-center gap-3 flex-1">
                <button
                  onClick={() => setExpandedPass(pc.pass)}
                  className={cn(
                    'flex-1 flex items-center gap-3 p-3 rounded-lg transition-all border',
                    expandedPass === pc.pass ? 'border-accent/50 bg-accent/5' : 'border-border/40 hover:border-border'
                  )}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${pc.color}20` }}>
                    <Icon className="w-4.5 h-4.5" style={{ color: pc.color }} />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary">Pass {pc.pass}</span>
                      <PassStatus status={status} />
                    </div>
                    <p className="text-xs text-text-muted truncate">{pc.label}</p>
                  </div>
                </button>
                {idx < PASS_CONFIG.length - 1 && <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Pass Results */}
      <AnimatePresence mode="wait">
        {expandedPass === 1 && pass1 && (
          <motion.div key="pass1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            {pass1.grade && (
              <div className="glass-card p-5 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold" style={{ background: `${getGradeInfo(pass1.grade).color}20`, color: getGradeInfo(pass1.grade).color }}>
                  {pass1.grade}
                </div>
                <div>
                  <p className="text-lg font-semibold text-text-primary">Performance Grade</p>
                  <p className="text-sm text-text-secondary">{getGradeInfo(pass1.grade).label} — Score: {pass1.score ?? '—'}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InsightCard icon={AlertTriangle} title="Bottlenecks" items={pass1.bottlenecks} color="#f59e0b" />
              <InsightCard icon={AlertCircle} title="Error Analysis" items={pass1.error_analysis || pass1.errors} color="#ef4444" />
              <InsightCard icon={Clock} title="Response Time Analysis" items={pass1.response_time_analysis || pass1.response_times} color="#3b82f6" />
              <InsightCard icon={Zap} title="Quick Wins" items={pass1.quick_wins || pass1.recommendations} color="#22c55e" />
            </div>
          </motion.div>
        )}

        {expandedPass === 2 && pass2 && (
          <motion.div key="pass2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InsightCard icon={Server} title="Resource Bottlenecks" items={pass2.resource_bottlenecks || pass2.resources} color="#f97316" />
              <InsightCard icon={TrendingUp} title="Capacity Analysis" items={pass2.capacity_analysis || pass2.capacity} color="#8b5cf6" />
              <InsightCard icon={Database} title="Database Analysis" items={pass2.database_analysis || pass2.database} color="#06b6d4" />
              <InsightCard icon={Target} title="Optimization Targets" items={pass2.optimization_targets || pass2.optimizations} color="#22c55e" />
            </div>
          </motion.div>
        )}

        {expandedPass === 3 && pass3 && (
          <motion.div key="pass3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            {(pass3.executive_summary || pass3.summary) && (
              <div className="glass-card p-5">
                <h3 className="text-base font-semibold text-text-primary mb-2">Executive Summary</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{pass3.executive_summary || pass3.summary}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pass3.risk_level && (
                <div className="glass-card p-5 text-center">
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Risk Level</p>
                  <RiskBadge level={pass3.risk_level} />
                </div>
              )}
              {pass3.recommendation != null && (
                <div className="glass-card p-5 text-center">
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Go / No-Go</p>
                  <span className={`text-lg font-bold ${pass3.recommendation === 'go' ? 'text-success' : 'text-danger'}`}>
                    {pass3.recommendation === 'go' ? '✓ GO' : '✗ NO-GO'}
                  </span>
                </div>
              )}
              {pass3.confidence && (
                <div className="glass-card p-5 text-center">
                  <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Confidence</p>
                  <span className="text-lg font-bold text-accent">{pass3.confidence}%</span>
                </div>
              )}
            </div>
            <InsightCard icon={Shield} title="Remediation Roadmap" items={pass3.remediation_roadmap || pass3.roadmap || pass3.remediation} color="#3b82f6" />
          </motion.div>
        )}

        {expandedPass && !getPassData(expandedPass) && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-12 text-center">
            <Brain className="w-12 h-12 mx-auto text-text-muted mb-3" />
            <p className="text-text-secondary">Pass {expandedPass} has not been analyzed yet.</p>
            <button onClick={handleAnalyze} disabled={analyzing} className="mt-4 flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium mx-auto disabled:opacity-50 transition-colors">
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run Analysis
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
