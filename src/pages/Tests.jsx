import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, Search, FlaskConical, Loader2, AlertCircle,
  Play, Calendar, Filter, X,
} from 'lucide-react';
import { tests } from '../lib/api';
import { timeAgo, scoreToColor, cn } from '../lib/utils';
import { TEST_TYPES } from '../lib/constants';
import ScoreGrade from '../components/ScoreGrade';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function Tests() {
  const navigate = useNavigate();
  const [testList, setTestList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    tests.list()
      .then((res) => setTestList(res.data?.tests || res.data || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load tests'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = testList.filter((t) => {
    const matchSearch = !search || t.name?.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || t.test_type === typeFilter;
    return matchSearch && matchType;
  });

  const getTypeInfo = (type) => TEST_TYPES.find((t) => t.id === type) || { label: type, icon: '🧪', color: '#94a3b8' };

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Tests</h1>
          <p className="text-text-secondary mt-1">{testList.length} test{testList.length !== 1 ? 's' : ''} in library</p>
        </div>
        <Link
          to="/tests/new"
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Test
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests..."
            className="w-full pl-10 pr-4 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors text-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="pl-10 pr-8 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary text-sm appearance-none focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">All Types</option>
            {TEST_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        {(search || typeFilter) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); }}
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
          <FlaskConical className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            {testList.length === 0 ? 'No tests yet' : 'No matching tests'}
          </h3>
          <p className="text-text-secondary mb-6">
            {testList.length === 0
              ? 'Create your first load test to get started.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {testList.length === 0 && (
            <Link
              to="/tests/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Create Test
            </Link>
          )}
        </motion.div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {filtered.map((test) => {
            const typeInfo = getTypeInfo(test.test_type);
            return (
              <motion.div
                key={test.id}
                variants={item}
                onClick={() => navigate(`/tests/${test.id}`)}
                className="glass-card p-5 cursor-pointer hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-text-primary font-semibold text-base truncate pr-3">{test.name}</h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${typeInfo.color}20`, color: typeInfo.color }}
                  >
                    {typeInfo.icon} {typeInfo.label}
                  </span>
                </div>

                {test.description && (
                  <p className="text-text-secondary text-sm mb-4 line-clamp-2">{test.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-text-muted">
                  {test.protocol && (
                    <span className="uppercase tracking-wide font-medium text-text-secondary">
                      {test.protocol}
                    </span>
                  )}
                  {test.last_score != null && (
                    <span className="flex items-center gap-1">
                      Score:{' '}
                      <span style={{ color: scoreToColor(test.last_score) }} className="font-semibold">
                        {Math.round(test.last_score)}
                      </span>
                      {test.last_grade && <ScoreGrade grade={test.last_grade} size="sm" />}
                    </span>
                  )}
                  {test.run_count != null && (
                    <span className="flex items-center gap-1">
                      <Play className="w-3 h-3" /> {test.run_count} runs
                    </span>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-border/50 flex items-center text-xs text-text-muted">
                  <Calendar className="w-3 h-3 mr-1" />
                  Created {timeAgo(test.created_at)}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}
