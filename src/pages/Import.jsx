import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileJson, Globe, Loader2, AlertCircle, CheckCircle2,
  ArrowRight, X, FileCode2, Link as LinkIcon,
} from 'lucide-react';
import { importers, tests } from '../lib/api';
import { IMPORT_TYPES } from '../lib/constants';

const ICONS = {
  openapi: FileJson,
  har: Globe,
  postman: FileJson,
  graphql: FileCode2,
};

function DropZone({ accept, onFile, active }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
        dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40 hover:bg-bg-card-hover'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
      <Upload className="w-8 h-8 mx-auto mb-3 text-text-muted" />
      <p className="text-sm text-text-secondary">
        Drag & drop your file here, or <span className="text-accent font-medium">browse</span>
      </p>
      <p className="text-xs text-text-muted mt-1">Accepted: {accept}</p>
    </div>
  );
}

export default function Import() {
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState('openapi');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [graphqlUrl, setGraphqlUrl] = useState('');

  const handleFile = async (file) => {
    setError(null);
    setResult(null);
    setImporting(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const importFn = importers[activeType];
      const res = await importFn(formData);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to import ${activeType} file`);
    } finally {
      setImporting(false);
    }
  };

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setError(null);
    setResult(null);
    setImporting(true);
    try {
      const res = await importers.openapi({ url: urlInput.trim() });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import from URL');
    } finally {
      setImporting(false);
    }
  };

  const handleGraphqlImport = async () => {
    if (!graphqlUrl.trim()) return;
    setError(null);
    setResult(null);
    setImporting(true);
    try {
      const res = await importers.graphql({ endpoint: graphqlUrl.trim() });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import GraphQL schema');
    } finally {
      setImporting(false);
    }
  };

  const handleCreateTest = async () => {
    if (!result) return;
    setImporting(true);
    try {
      const res = await tests.create({
        name: result.name || `Imported ${activeType} test`,
        script: result.script || '',
        script_source: `import_${activeType}`,
        config: result.config,
      });
      navigate(`/tests/${res.data?.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create test');
    } finally {
      setImporting(false);
    }
  };

  const activeConfig = IMPORT_TYPES.find((t) => t.id === activeType);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Import Test</h1>
        <p className="text-text-secondary mt-1">Generate k6 scripts from existing API definitions</p>
      </div>

      {/* Type Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {IMPORT_TYPES.map((type) => {
          const Icon = ICONS[type.id] || FileJson;
          const active = activeType === type.id;
          return (
            <motion.button
              key={type.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setActiveType(type.id); setResult(null); setError(null); }}
              className={`glass-card p-4 text-left transition-all ${active ? 'border-accent/60 bg-accent/5' : ''}`}
            >
              <Icon className={`w-6 h-6 mb-2 ${active ? 'text-accent' : 'text-text-muted'}`} />
              <p className={`text-sm font-medium ${active ? 'text-accent' : 'text-text-primary'}`}>{type.label}</p>
            </motion.button>
          );
        })}
      </div>

      {/* Import Area */}
      <motion.div key={activeType} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 space-y-5">
        <h2 className="text-lg font-semibold text-text-primary">
          Import from {activeConfig?.label}
        </h2>

        <DropZone accept={activeConfig?.accept || '*'} onFile={handleFile} active={activeType} />

        {activeType === 'openapi' && (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Or import from URL:</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  className="w-full bg-bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
                  placeholder="https://api.example.com/openapi.json"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
              </div>
              <button onClick={handleUrlImport} disabled={importing || !urlInput.trim()} className="px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                Fetch
              </button>
            </div>
          </div>
        )}

        {activeType === 'graphql' && (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Or introspect from endpoint:</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  className="w-full bg-bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
                  placeholder="https://api.example.com/graphql"
                  value={graphqlUrl}
                  onChange={(e) => setGraphqlUrl(e.target.value)}
                />
              </div>
              <button onClick={handleGraphqlImport} disabled={importing || !graphqlUrl.trim()} className="px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                Introspect
              </button>
            </div>
          </div>
        )}

        {importing && (
          <div className="flex items-center justify-center py-6 gap-3">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
            <span className="text-sm text-text-secondary">Importing and generating script...</span>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Result Preview */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <h3 className="text-lg font-semibold text-text-primary">Import Successful</h3>
              </div>
              <button onClick={() => setResult(null)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>

            {result.metadata && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(result.metadata).map(([key, value]) => (
                  <div key={key} className="bg-bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-text-muted capitalize">{key.replace(/_/g, ' ')}</p>
                    <p className="text-sm font-medium text-text-primary mt-0.5">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}

            {result.script && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-secondary">Generated Script Preview</p>
                <pre className="bg-bg-primary rounded-lg p-4 text-xs font-mono text-text-secondary border border-border/60 max-h-64 overflow-auto">
                  {result.script}
                </pre>
              </div>
            )}

            <button onClick={handleCreateTest} disabled={importing} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Create Test
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
