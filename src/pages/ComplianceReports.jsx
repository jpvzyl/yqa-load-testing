import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck, Loader2, AlertCircle, CheckCircle2, XCircle,
  Download, Shield, Clock, Hash, HardDrive,
  ChevronRight, Eye, X, FileText,
} from 'lucide-react';
import api from '../lib/api';

const FRAMEWORKS = [
  { id: 'soc2', label: 'SOC 2 Type II', description: 'Service Organization Controls' },
  { id: 'iso27001', label: 'ISO 27001', description: 'Information Security Management' },
  { id: 'pcidss', label: 'PCI DSS', description: 'Payment Card Industry Data Security' },
  { id: 'hipaa', label: 'HIPAA', description: 'Health Insurance Portability' },
];

function ControlItem({ control }) {
  const statusConfig = {
    met: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/15', label: 'Met' },
    partial: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/15', label: 'Partial' },
    not_met: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/15', label: 'Not Met' },
    pending: { icon: Eye, color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'Pending' },
  };
  const st = statusConfig[control.status] || statusConfig.pending;
  const StIcon = st.icon;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary/30 hover:bg-bg-secondary/50 transition-colors">
      <div className="flex items-center gap-3">
        <StIcon className={`w-4 h-4 ${st.color}`} />
        <div>
          <p className="text-sm text-text-primary">{control.id}: {control.name}</p>
          {control.description && <p className="text-xs text-text-muted mt-0.5">{control.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
        {control.evidence_count > 0 && (
          <span className="text-xs text-text-muted">{control.evidence_count} evidence</span>
        )}
      </div>
    </div>
  );
}

export default function ComplianceReports() {
  const [selectedFramework, setSelectedFramework] = useState('soc2');
  const [controls, setControls] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [reportUrl, setReportUrl] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState(null);

  const fetchFrameworkData = async (framework) => {
    setLoading(true);
    setError(null);
    try {
      const [controlsRes, evidenceRes] = await Promise.all([
        api.get(`/api/v2/compliance/${framework}/controls`),
        api.get(`/api/v2/compliance/${framework}/evidence`),
      ]);
      setControls(controlsRes.data?.controls || []);
      setEvidence(evidenceRes.data?.evidence || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load compliance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFrameworkData(selectedFramework);
  }, [selectedFramework]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await api.post(`/api/v2/compliance/${selectedFramework}/reports`);
      setReportUrl(res.data?.download_url || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const verifyIntegrity = async () => {
    setVerifying(true);
    try {
      const res = await api.post(`/api/v2/compliance/${selectedFramework}/verify`);
      setIntegrityStatus(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const metCount = controls.filter(c => c.status === 'met').length;
  const totalControls = controls.length;
  const compliancePercent = totalControls > 0 ? Math.round((metCount / totalControls) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <FileCheck className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">Compliance Reports</h1>
          </div>
          <p className="text-text-secondary mt-1">Audit-ready compliance evidence and reporting</p>
        </div>
        <div className="flex gap-2">
          <button onClick={verifyIntegrity} disabled={verifying} className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm">
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} Verify Integrity
          </button>
          <button onClick={generateReport} disabled={generating} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Generate Report
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-danger/10 border border-danger/30 text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Integrity Status */}
      <AnimatePresence>
        {integrityStatus && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`glass-card p-4 flex items-center gap-3 border ${integrityStatus.valid ? 'border-green-500/20' : 'border-red-500/20'}`}>
            {integrityStatus.valid ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
            <p className="text-sm text-text-primary">{integrityStatus.valid ? 'All evidence integrity checks passed' : `${integrityStatus.failures || 0} integrity check(s) failed`}</p>
            <button onClick={() => setIntegrityStatus(null)} className="ml-auto text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report URL */}
      <AnimatePresence>
        {reportUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass-card p-4 flex items-center gap-3 border border-green-500/20">
            <FileText className="w-5 h-5 text-green-400" />
            <p className="text-sm text-text-primary">Report generated successfully</p>
            <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent-light font-medium ml-auto">Download</a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Framework Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {FRAMEWORKS.map((fw, i) => (
          <motion.div
            key={fw.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelectedFramework(fw.id)}
            className={`glass-card p-4 cursor-pointer transition-colors ${selectedFramework === fw.id ? 'border border-accent/50 bg-accent/5' : 'hover:bg-bg-card-hover'}`}
          >
            <Shield className={`w-5 h-5 mb-2 ${selectedFramework === fw.id ? 'text-accent' : 'text-text-muted'}`} />
            <h3 className="text-sm font-semibold text-text-primary">{fw.label}</h3>
            <p className="text-xs text-text-muted mt-0.5">{fw.description}</p>
          </motion.div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Checklist */}
          <div className="lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Control Checklist</h2>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${compliancePercent}%` }} />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{compliancePercent}%</span>
                </div>
              </div>
              {controls.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-8">No controls defined for this framework</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {controls.map(c => <ControlItem key={c.id} control={c} />)}
                </div>
              )}
            </motion.div>
          </div>

          {/* Evidence Browser */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-5">
            <h2 className="text-base font-semibold text-text-primary mb-4">Evidence</h2>
            {evidence.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">No evidence collected</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {evidence.map((e, i) => (
                  <div key={i} className="p-3 bg-bg-secondary/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent">{e.type}</span>
                      <span className="text-xs text-text-muted">{e.size}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Hash className="w-3 h-3" />
                        <span className="font-mono truncate">{e.hash}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <HardDrive className="w-3 h-3" />
                        <span>{e.size}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
