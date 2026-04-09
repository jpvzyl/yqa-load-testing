import { GRADES, RUN_STATUSES } from './constants';

export function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return typeof n === 'number' ? n.toLocaleString() : n;
}

export function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(1)} ${units[idx]}`;
}

export function formatPercent(rate) {
  if (rate === null || rate === undefined) return '—';
  return `${(rate * 100).toFixed(2)}%`;
}

export function getGradeInfo(grade) {
  return GRADES[grade] || { color: '#64748b', bg: 'bg-gray-500/20', label: 'Unknown' };
}

export function getStatusInfo(status) {
  return RUN_STATUSES[status] || { label: status, color: '#94a3b8', bg: 'bg-gray-500/20' };
}

export function timeAgo(date) {
  if (!date) return '—';
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function scoreToColor(score) {
  if (score >= 90) return '#22c55e';
  if (score >= 80) return '#4ade80';
  if (score >= 70) return '#facc15';
  if (score >= 60) return '#f97316';
  if (score >= 40) return '#ef4444';
  return '#dc2626';
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
