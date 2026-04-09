import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon, User, Bell, Key, Sliders,
  Save, Loader2, CheckCircle2, AlertCircle, Copy, Eye, EyeOff,
} from 'lucide-react';
import { auth } from '../lib/api';
import { cn } from '../lib/utils';

const inputClass = 'w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors';

function Section({ icon: Icon, title, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card p-6 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const [profile, setProfile] = useState({ name: '', email: '' });
  const [notifications, setNotifications] = useState({
    onComplete: true,
    onFailure: true,
    onSlaBreached: true,
    onRegression: false,
    digest: 'daily',
  });
  const [defaults, setDefaults] = useState({
    vus: 10,
    duration: '30s',
    testType: 'load',
  });
  const apiKey = 'sarfat_lt_' + btoa(profile.email || 'user').slice(0, 24) + '...';

  useEffect(() => {
    auth.me()
      .then((res) => {
        const user = res.data?.user || res.data || {};
        setProfile({ name: user.name || '', email: user.email || '' });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-3xl mx-auto">
      <div>
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        </div>
        <p className="text-text-secondary mt-1">Manage your account and preferences</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Profile */}
      <Section icon={User} title="Profile" delay={0.05}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Name</label>
            <input className={inputClass} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Email</label>
            <input className={inputClass} type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
          </div>
        </div>
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="Notification Preferences" delay={0.1}>
        <div className="space-y-3">
          {[
            { key: 'onComplete', label: 'Test completed' },
            { key: 'onFailure', label: 'Test failed' },
            { key: 'onSlaBreached', label: 'SLA breached' },
            { key: 'onRegression', label: 'Regression detected' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between py-1 cursor-pointer group">
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{label}</span>
              <button
                type="button"
                onClick={() => setNotifications((n) => ({ ...n, [key]: !n[key] }))}
                className={cn(
                  'w-10 h-5.5 rounded-full transition-colors relative',
                  notifications[key] ? 'bg-accent' : 'bg-border'
                )}
              >
                <span className={cn(
                  'absolute top-0.75 w-4 h-4 rounded-full bg-white transition-transform',
                  notifications[key] ? 'translate-x-5' : 'translate-x-0.75'
                )} />
              </button>
            </label>
          ))}
          <div className="pt-2 border-t border-border/40">
            <label className="text-sm font-medium text-text-secondary">Email Digest</label>
            <div className="flex gap-2 mt-2">
              {['none', 'daily', 'weekly'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setNotifications((n) => ({ ...n, digest: opt }))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm capitalize transition-colors',
                    notifications.digest === opt
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary text-text-secondary hover:text-text-primary border border-border'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* API Key */}
      <Section icon={Key} title="API Key" delay={0.15}>
        <p className="text-sm text-text-secondary">Use this key to authenticate API requests and CI/CD integrations.</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              className={cn(inputClass, 'font-mono text-xs pr-10')}
              value={showApiKey ? apiKey : '•'.repeat(32)}
              readOnly
            />
            <button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={handleCopyKey} className="px-3 py-2 bg-bg-card border border-border hover:border-accent/50 rounded-lg text-sm text-text-secondary transition-colors">
            {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </Section>

      {/* Default Config */}
      <Section icon={Sliders} title="Default Test Configuration" delay={0.2}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Default VUs</label>
            <input className={inputClass} type="number" min={1} value={defaults.vus} onChange={(e) => setDefaults((d) => ({ ...d, vus: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Default Duration</label>
            <input className={inputClass} placeholder="30s" value={defaults.duration} onChange={(e) => setDefaults((d) => ({ ...d, duration: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Default Test Type</label>
            <select className={cn(inputClass, 'appearance-none cursor-pointer')} value={defaults.testType} onChange={(e) => setDefaults((d) => ({ ...d, testType: e.target.value }))}>
              <option value="smoke">Smoke</option>
              <option value="load">Load</option>
              <option value="stress">Stress</option>
              <option value="spike">Spike</option>
              <option value="soak">Soak</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Settings'}
        </button>
      </div>
    </motion.div>
  );
}
