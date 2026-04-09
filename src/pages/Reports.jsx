import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Loader2, AlertCircle, Brain, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';
import { reports as reportsApi } from '../lib/api';
import { timeAgo, cn } from '../lib/utils';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function Reports() {
  const [reportList, setReportList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    reportsApi.list()
      .then((res) => setReportList(res.data?.reports || res.data || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (id) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

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
        <h1 className="text-2xl font-bold text-text-primary">Reports</h1>
        <p className="text-text-secondary mt-1">{reportList.length} generated report{reportList.length !== 1 ? 's' : ''}</p>
      </div>

      {reportList.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-12 text-center"
        >
          <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No reports yet</h3>
          <p className="text-text-secondary">
            Reports are generated from individual test runs. Go to a run and generate one.
          </p>
        </motion.div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
          {reportList.map((report) => {
            const isExpanded = expanded === report.id;
            return (
              <motion.div key={report.id} variants={item} className="glass-card overflow-hidden">
                <button
                  onClick={() => toggleExpand(report.id)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-text-primary font-semibold text-sm truncate">
                        {report.title || report.report_type || 'Report'}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        {report.report_type && (
                          <span className="text-xs text-text-muted capitalize">
                            {report.report_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <Calendar className="w-3 h-3" />
                          {timeAgo(report.created_at)}
                        </span>
                        {report.ai_generated && (
                          <span className="flex items-center gap-1 text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                            <Brain className="w-3 h-3" /> AI
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-text-muted shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-text-muted shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-border/50"
                  >
                    <div className="p-5 prose prose-invert prose-sm max-w-none text-text-secondary whitespace-pre-wrap leading-relaxed">
                      {report.content || 'No content available.'}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}
