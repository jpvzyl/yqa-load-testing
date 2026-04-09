import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Play, Code2, Settings, History, Loader2, AlertCircle,
  Clock, ArrowLeft, Edit3, Zap,
} from 'lucide-react';
import { tests, runs as runsApi } from '../lib/api';
import { formatDuration, timeAgo, scoreToColor, getStatusInfo, cn } from '../lib/utils';
import { TEST_TYPES } from '../lib/constants';
import ScoreGrade from '../components/ScoreGrade';

const TABS = [
  { id: 'runs', label: 'Runs History', icon: History },
  { id: 'script', label: 'Script', icon: Code2 },
  { id: 'config', label: 'Configuration', icon: Settings },
];

export default function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [runsList, setRunsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('runs');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    Promise.all([
      tests.get(id),
      runsApi.list(id),
    ])
      .then(([testRes, runsRes]) => {
        setTest(testRes.data?.test || testRes.data);
        setRunsList(runsRes.data?.runs || runsRes.data || []);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load test'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleRunTest = async () => {
    setRunning(true);
    try {
      const res = await tests.run(id);
      const runId = res.data?.run?.id || res.data?.id;
      if (runId) navigate(`/runs/${runId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start run');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (error && !test) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="w-10 h-10 text-danger" />
        <p className="text-text-secondary">{error}</p>
        <button onClick={() => navigate('/tests')} className="text-accent hover:text-accent-light text-sm mt-2">
          Back to Tests
        </button>
      </div>
    );
  }

  const typeInfo = TEST_TYPES.find((t) => t.id === test?.test_type) || { label: test?.test_type, icon: '🧪', color: '#94a3b8' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <button
        onClick={() => navigate('/tests')}
        className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tests
      </button>

      <div className="glass-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-text-primary">{test?.name}</h1>
              <span
                className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: `${typeInfo.color}20`, color: typeInfo.color }}
              >
                {typeInfo.icon} {typeInfo.label}
              </span>
            </div>
            {test?.description && (
              <p className="text-text-secondary mt-1 max-w-2xl">{test.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm text-text-muted">
              {test?.protocol && (
                <span className="uppercase tracking-wide font-medium text-text-secondary">{test.protocol}</span>
              )}
              <span>Created {timeAgo(test?.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/tests/${id}/script-editor`}
              className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm"
            >
              <Edit3 className="w-4 h-4" /> Edit Script
            </Link>
            <motion.button
              onClick={handleRunTest}
              disabled={running}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run Test
            </motion.button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 border border-danger/20 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === tabId
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'runs' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          {runsList.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No runs yet. Click "Run Test" to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-secondary">
                    <th className="text-left py-3 px-3 font-medium">Status</th>
                    <th className="text-left py-3 px-3 font-medium">Score</th>
                    <th className="text-left py-3 px-3 font-medium">Duration</th>
                    <th className="text-left py-3 px-3 font-medium">VUs</th>
                    <th className="text-left py-3 px-3 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runsList.map((run) => {
                    const statusInfo = getStatusInfo(run.status);
                    return (
                      <tr
                        key={run.id}
                        onClick={() => navigate(`/runs/${run.id}`)}
                        className="border-b border-border/50 hover:bg-bg-card-hover cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bg}`}
                            style={{ color: statusInfo.color }}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span style={{ color: scoreToColor(run.score) }} className="font-semibold">
                              {run.score != null ? Math.round(run.score) : '—'}
                            </span>
                            {run.grade && <ScoreGrade grade={run.grade} size="sm" />}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-text-secondary">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {formatDuration(run.duration_ms)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-text-secondary">{run.vus_max ?? '—'}</td>
                        <td className="py-3 px-3 text-text-muted">{timeAgo(run.started_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {tab === 'script' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          {test?.script_content ? (
            <pre className="bg-bg-primary border border-border rounded-lg p-4 overflow-x-auto text-sm text-text-secondary font-mono leading-relaxed">
              <code>{test.script_content}</code>
            </pre>
          ) : (
            <div className="text-center py-12">
              <Code2 className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No script content available.</p>
              <Link
                to={`/tests/${id}/script-editor`}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm"
              >
                <Edit3 className="w-4 h-4" /> Create Script
              </Link>
            </div>
          )}
        </motion.div>
      )}

      {tab === 'config' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          {test?.config ? (
            <pre className="bg-bg-primary border border-border rounded-lg p-4 overflow-x-auto text-sm text-text-secondary font-mono leading-relaxed">
              <code>{JSON.stringify(test.config, null, 2)}</code>
            </pre>
          ) : (
            <div className="text-center py-12">
              <Settings className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No configuration defined.</p>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
