import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import {
  Zap,
  BarChart3,
  TrendingUp,
  FlaskConical,
  Hammer,
  FileCode2,
  Layers,
  Import,
  PlayCircle,
  Calendar,
  Brain,
  Baseline,
  GitCompareArrows,
  Gauge,
  FileText,
  ShieldCheck,
  Server,
  Plug,
  Settings,
  Presentation,
  LogOut,
  Menu,
  X,
  Network,
  ScanSearch,
  Bomb,
  RotateCcw,
  GitPullRequest,
  Target,
  DollarSign,
  Workflow,
  Award,
  Archive,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'OVERVIEW',
    items: [
      { to: '/', icon: BarChart3, label: 'Dashboard', end: true },
      { to: '/trends', icon: TrendingUp, label: 'Trends' },
    ],
  },
  {
    label: 'TESTING',
    items: [
      { to: '/tests', icon: FlaskConical, label: 'Tests' },
      { to: '/test-builder', icon: Hammer, label: 'Test Builder' },
      { to: '/script-editor', icon: FileCode2, label: 'Script Editor' },
      { to: '/scenarios', icon: Layers, label: 'Scenarios' },
      { to: '/import', icon: Import, label: 'Import' },
    ],
  },
  {
    label: 'EXECUTION',
    items: [
      { to: '/runs', icon: PlayCircle, label: 'Test Runs' },
      { to: '/workload-modeler', icon: Workflow, label: 'Workload Modeler' },
      { to: '/schedules', icon: Calendar, label: 'Schedules' },
    ],
  },
  {
    label: 'ANALYSIS',
    items: [
      { to: '/ai-insights', icon: Brain, label: 'AI Insights' },
      { to: '/baselines', icon: Baseline, label: 'Baselines' },
      { to: '/comparison', icon: GitCompareArrows, label: 'Comparisons' },
      { to: '/capacity', icon: Gauge, label: 'Capacity Planning' },
      { to: '/slo-dashboard', icon: Target, label: 'SLO Dashboard' },
    ],
  },
  {
    label: 'RESILIENCE',
    items: [
      { to: '/chaos', icon: Bomb, label: 'Chaos Engineering' },
      { to: '/replay', icon: RotateCcw, label: 'Traffic Replay' },
    ],
  },
  {
    label: 'CI/CD',
    items: [
      { to: '/pr-gates', icon: GitPullRequest, label: 'PR Gates' },
    ],
  },
  {
    label: 'REPORTING',
    items: [
      { to: '/reports', icon: FileText, label: 'Reports' },
      { to: '/sla', icon: ShieldCheck, label: 'SLA Compliance' },
      { to: '/compliance', icon: Award, label: 'Compliance' },
      { to: '/evidence', icon: Archive, label: 'Evidence' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { to: '/workers', icon: Network, label: 'Worker Pool' },
      { to: '/integrations', icon: Plug, label: 'Integrations' },
      { to: '/infrastructure', icon: Server, label: 'Infrastructure' },
      { to: '/settings', icon: Settings, label: 'Settings' },
      { to: '/pitch', icon: Presentation, label: 'Pitch Deck' },
    ],
  },
];

function SidebarLink({ to, icon: Icon, label, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent/15 text-accent shadow-sm shadow-accent/10'
            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
        )
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();

  const closeSidebar = () => setSidebarOpen(false);

  const sidebar = (
    <nav className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/20">
          <Zap className="w-4.5 h-4.5 text-accent" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-text-primary">Sarfat</h1>
          <p className="text-[10px] text-text-muted leading-none">Load Testing Platform</p>
        </div>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.to} {...item} onClick={closeSidebar} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* User footer */}
      {user && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user.name || user.email}
              </p>
              {user.name && (
                <p className="text-xs text-text-muted truncate">{user.email}</p>
              )}
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-bg-primary">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 xl:w-64 shrink-0 flex-col border-r border-border bg-bg-secondary/80 backdrop-blur-sm">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeSidebar}
          />
          <aside className="relative w-64 h-full bg-bg-secondary border-r border-border shadow-2xl">
            <button
              onClick={closeSidebar}
              className="absolute top-4 right-3 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-secondary/60 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-text-primary">Sarfat</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
