import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Play, Loader2, AlertCircle, Clock, Filter, X, Eye,
} from 'lucide-react';
import { runs } from '../lib/api';
import { formatDuration, timeAgo, scoreToColor, getStatusInfo, cn } from '../lib/utils';
import { RUN_STATUSES } from '../lib/constants';
import ScoreGrade from '../components/ScoreGrade';

export default function TestRuns() {
  const navigate = useNavigate();
  const [runsList, setRunsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    runs.list()
      .then((res) => setRunsList(res.data?.runs || res.data || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load runs'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = runsList.filter((r) => !statusFilter || r.status === statusFilter);

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Test Runs</h1>
        <p className="text-text-secondary mt-1">{runsList.length} total run{runsList.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary text-sm appearance-none focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">All Statuses</option>
            {Object.entries(RUN_STATUSES).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>
        {statusFilter && (
          <button
            onClick={() => setStatusFilter('')}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-12 text-center"
        >
          <Play className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No runs found</h3>
          <p className="text-text-secondary">
            {runsList.length === 0
              ? 'Run a test to see results here.'
              : 'No runs match the current filter.'}
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left py-3 px-3 font-medium">Test Name</th>
                  <th className="text-left py-3 px-3 font-medium">Type</th>
                  <th className="text-left py-3 px-3 font-medium">Status</th>
                  <th className="text-left py-3 px-3 font-medium">Score</th>
                  <th className="text-left py-3 px-3 font-medium">Duration</th>
                  <th className="text-left py-3 px-3 font-medium">Started</th>
                  <th className="text-left py-3 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => {
                  const statusInfo = getStatusInfo(run.status);
                  return (
                    <tr
                      key={run.id}
                      className="border-b border-border/50 hover:bg-bg-card-hover transition-colors"
                    >
                      <td className="py-3 px-3 text-text-primary font-medium">
                        {run.test_name || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent capitalize">
                          {run.test_type || '—'}
                        </span>
                      </td>
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
                      <td className="py-3 px-3 text-text-muted">{timeAgo(run.started_at)}</td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => navigate(`/runs/${run.id}`)}
                          className="flex items-center gap-1.5 text-accent hover:text-accent-light transition-colors text-xs font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
