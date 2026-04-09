import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Loader2, AlertCircle, Clock, Activity, Gauge,
  BarChart3, Brain, FileText, GitCompare, ShieldCheck,
  RefreshCw, Bookmark, Download, Zap,
} from 'lucide-react';
import { runs as runsApi } from '../lib/api';
import {
  formatDuration, formatNumber, timeAgo, scoreToColor,
  getStatusInfo, getGradeInfo, cn, formatBytes, formatPercent,
} from '../lib/utils';
import { REPORT_TYPES } from '../lib/constants';
import ScoreGrade from '../components/ScoreGrade';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'endpoints', label: 'Endpoints', icon: BarChart3 },
  { id: 'analysis', label: 'AI Analysis', icon: Brain },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'regression', label: 'Regression', icon: GitCompare },
  { id: 'sla', label: 'SLA', icon: ShieldCheck },
];

function MetricTile({ label, value, sub }) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-lg font-bold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export default function RunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [reports, setReports] = useState([]);
  const [regression, setRegression] = useState(null);
  const [slaResults, setSlaResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    runsApi.get(id)
      .then((res) => setRun(res.data?.run || res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load run'))
      .finally(() => setLoading(false));
  }, [id]);

  const loadTabData = useCallback(async () => {
    try {
      if (tab === 'endpoints' && endpoints.length === 0) {
        const res = await runsApi.endpoints(id);
        setEndpoints(res.data?.endpoints || res.data || []);
      } else if (tab === 'analysis' && analyses.length === 0) {
        const res = await runsApi.analyses(id);
        setAnalyses(res.data?.analyses || res.data || []);
      } else if (tab === 'reports' && reports.length === 0) {
        const res = await runsApi.reports(id);
        setReports(res.data?.reports || res.data || []);
      } else if (tab === 'regression' && !regression) {
        const res = await runsApi.regression(id);
        setRegression(res.data);
      } else if (tab === 'sla' && slaResults.length === 0) {
        const res = await runsApi.slaResults(id);
        setSlaResults(res.data?.results || res.data || []);
      }
    } catch (_e) { /* tab data is supplementary */ }
  }, [tab, id, endpoints.length, analyses.length, reports.length, regression, slaResults.length]);

  useEffect(() => { loadTabData(); }, [loadTabData]);

  const handleAnalyze = async () => {
    setActionLoading('analyze');
    try {
      await runsApi.analyze(id);
      const res = await runsApi.analyses(id);
      setAnalyses(res.data?.analyses || res.data || []);
    } catch (_e) { /* best effort */ }
    setActionLoading(null);
  };

  const handleGenerateReport = async (type) => {
    setActionLoading(`report-${type}`);
    try {
      await runsApi.generateReport(id, type);
      const res = await runsApi.reports(id);
      setReports(res.data?.reports || res.data || []);
    } catch (_e) { /* best effort */ }
    setActionLoading(null);
  };

  const handleSetBaseline = async () => {
    setActionLoading('baseline');
    try {
      const { baselines } = await import('../lib/api');
      await baselines.create({ run_id: id, test_id: run?.test_id });
    } catch (_e) { /* best effort */ }
    setActionLoading(null);
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
        <button onClick={() => navigate('/runs')} className="text-accent hover:text-accent-light text-sm mt-2">
          Back to Runs
        </button>
      </div>
    );
  }

  const statusInfo = getStatusInfo(run?.status);
  const gradeInfo = getGradeInfo(run?.grade);
  const m = run?.metrics_summary || run?.metrics || {};

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <button
        onClick={() => navigate('/runs')}
        className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Runs
      </button>

      <div className="glass-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-text-primary">{run?.test_name || 'Run Details'}</h1>
              <span
                className={`text-xs px-2.5 py-1 rounded-full ${statusInfo.bg}`}
                style={{ color: statusInfo.color }}
              >
                {statusInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-text-muted">
              <span>Started {timeAgo(run?.started_at)}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {formatDuration(run?.duration_ms)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: scoreToColor(run?.score) }}>
                {run?.score != null ? Math.round(run.score) : '—'}
              </div>
              <p className="text-xs text-text-muted mt-0.5">Score</p>
            </div>
            {run?.grade && (
              <div className="text-center">
                <ScoreGrade grade={run.grade} size="lg" />
                <p className="text-xs mt-1" style={{ color: gradeInfo.color }}>{gradeInfo.label}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
          <button
            onClick={handleSetBaseline}
            disabled={actionLoading === 'baseline'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-xs"
          >
            {actionLoading === 'baseline' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
            Set as Baseline
          </button>
          <button
            onClick={() => handleGenerateReport('executive_summary')}
            disabled={actionLoading?.startsWith('report')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-xs"
          >
            {actionLoading?.startsWith('report') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Generate Report
          </button>
          <button
            onClick={handleAnalyze}
            disabled={actionLoading === 'analyze'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/30 hover:bg-accent/20 text-accent rounded-lg transition-colors text-xs"
          >
            {actionLoading === 'analyze' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            Re-analyze
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
              tab === tabId
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricTile label="Avg Response Time" value={formatDuration(m.http_req_duration_avg)} />
            <MetricTile label="P50 Response Time" value={formatDuration(m.http_req_duration_med)} />
            <MetricTile label="P90 Response Time" value={formatDuration(m.http_req_duration_p90)} />
            <MetricTile label="P95 Response Time" value={formatDuration(m.http_req_duration_p95)} />
            <MetricTile label="P99 Response Time" value={formatDuration(m.http_req_duration_p99)} />
            <MetricTile label="Error Rate" value={formatPercent(m.http_req_failed_rate)} />
            <MetricTile label="Total Requests" value={formatNumber(m.http_reqs)} />
            <MetricTile label="Data Received" value={formatBytes(m.data_received)} />
            <MetricTile label="Data Sent" value={formatBytes(m.data_sent)} />
            <MetricTile label="Max VUs" value={formatNumber(m.vus_max)} />
          </div>

          {run?.response_time_breakdown && run.response_time_breakdown.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-base font-semibold text-text-primary mb-3">Response Time Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-secondary">
                      <th className="text-left py-2 px-3 font-medium">Endpoint</th>
                      <th className="text-left py-2 px-3 font-medium">Avg</th>
                      <th className="text-left py-2 px-3 font-medium">P95</th>
                      <th className="text-left py-2 px-3 font-medium">Requests</th>
                      <th className="text-left py-2 px-3 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.response_time_breakdown.map((row, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 px-3 text-text-primary font-mono text-xs">{row.endpoint}</td>
                        <td className="py-2 px-3 text-text-secondary">{formatDuration(row.avg)}</td>
                        <td className="py-2 px-3 text-text-secondary">{formatDuration(row.p95)}</td>
                        <td className="py-2 px-3 text-text-secondary">{formatNumber(row.requests)}</td>
                        <td className="py-2 px-3 text-danger">{formatNumber(row.errors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {tab === 'endpoints' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          {endpoints.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No endpoint metrics available.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-secondary">
                    <th className="text-left py-3 px-3 font-medium">Method</th>
                    <th className="text-left py-3 px-3 font-medium">URL</th>
                    <th className="text-left py-3 px-3 font-medium">Requests</th>
                    <th className="text-left py-3 px-3 font-medium">Avg</th>
                    <th className="text-left py-3 px-3 font-medium">P95</th>
                    <th className="text-left py-3 px-3 font-medium">P99</th>
                    <th className="text-left py-3 px-3 font-medium">Error %</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((ep, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-bg-card-hover transition-colors">
                      <td className="py-3 px-3">
                        <span className="text-xs font-bold text-accent uppercase">{ep.method}</span>
                      </td>
                      <td className="py-3 px-3 text-text-primary font-mono text-xs truncate max-w-xs">{ep.url || ep.name}</td>
                      <td className="py-3 px-3 text-text-secondary">{formatNumber(ep.requests || ep.count)}</td>
                      <td className="py-3 px-3 text-text-secondary">{formatDuration(ep.avg_duration || ep.avg)}</td>
                      <td className="py-3 px-3 text-text-secondary">{formatDuration(ep.p95_duration || ep.p95)}</td>
                      <td className="py-3 px-3 text-text-secondary">{formatDuration(ep.p99_duration || ep.p99)}</td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          'font-medium',
                          (ep.error_rate || 0) > 0.05 ? 'text-danger' : 'text-success'
                        )}>
                          {formatPercent(ep.error_rate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {tab === 'analysis' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {analyses.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Brain className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary mb-4">No AI analysis available yet.</p>
              <button
                onClick={handleAnalyze}
                disabled={actionLoading === 'analyze'}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                {actionLoading === 'analyze' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                Run AI Analysis
              </button>
            </div>
          ) : (
            analyses.map((analysis, i) => (
              <div key={analysis.id || i} className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                    <Brain className="w-4 h-4 text-accent" />
                    Pass {analysis.pass_number || i + 1}
                    {analysis.analysis_type && (
                      <span className="text-xs text-text-muted">({analysis.analysis_type})</span>
                    )}
                  </h3>
                  <span className="text-xs text-text-muted">{timeAgo(analysis.created_at)}</span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {analysis.content || analysis.summary || '—'}
                </div>
              </div>
            ))
          )}
        </motion.div>
      )}

      {tab === 'reports' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {REPORT_TYPES.map((rt) => (
              <button
                key={rt.id}
                onClick={() => handleGenerateReport(rt.id)}
                disabled={actionLoading === `report-${rt.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-xs disabled:opacity-50"
              >
                {actionLoading === `report-${rt.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>{rt.icon}</span>}
                {rt.label}
              </button>
            ))}
          </div>

          {reports.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No reports generated yet. Select a report type above.</p>
            </div>
          ) : (
            reports.map((report, i) => (
              <div key={report.id || i} className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-text-primary">{report.title || report.report_type}</h3>
                  <span className="text-xs text-text-muted">{timeAgo(report.created_at)}</span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {report.content || '—'}
                </div>
              </div>
            ))
          )}
        </motion.div>
      )}

      {tab === 'regression' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          {regression ? (
            <div>
              <h3 className="text-base font-semibold text-text-primary mb-3">Regression Analysis</h3>
              <pre className="bg-bg-primary border border-border rounded-lg p-4 overflow-x-auto text-sm text-text-secondary font-mono leading-relaxed">
                <code>{JSON.stringify(regression, null, 2)}</code>
              </pre>
            </div>
          ) : (
            <div className="text-center py-12">
              <GitCompare className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No regression data available. Set a baseline first.</p>
            </div>
          )}
        </motion.div>
      )}

      {tab === 'sla' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          {slaResults.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No SLA results available. Configure SLAs in project settings.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-secondary">
                    <th className="text-left py-3 px-3 font-medium">SLA</th>
                    <th className="text-left py-3 px-3 font-medium">Target</th>
                    <th className="text-left py-3 px-3 font-medium">Actual</th>
                    <th className="text-left py-3 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slaResults.map((sla, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-3 px-3 text-text-primary">{sla.name || sla.metric}</td>
                      <td className="py-3 px-3 text-text-secondary">{sla.target ?? '—'}</td>
                      <td className="py-3 px-3 text-text-secondary">{sla.actual ?? '—'}</td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          sla.passed ? 'bg-green-500/20 text-success' : 'bg-red-500/20 text-danger'
                        )}>
                          {sla.passed ? 'Passed' : 'Failed'}
                        </span>
                      </td>
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
