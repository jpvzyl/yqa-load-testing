import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wind, Flame, Zap, Waves, Target, Server,
  MessageSquare, Braces, ShoppingCart, Search, ArrowRight,
} from 'lucide-react';

const SCENARIOS = [
  {
    id: 'standard_load',
    name: 'Standard Load Test',
    description: 'Validate performance under expected normal traffic patterns with steady virtual users.',
    type: 'load',
    icon: Target,
    color: '#3b82f6',
  },
  {
    id: 'stress_test',
    name: 'Stress Test',
    description: 'Gradually increase load beyond normal capacity to find the breaking point.',
    type: 'stress',
    icon: Flame,
    color: '#f97316',
  },
  {
    id: 'spike_test',
    name: 'Spike Test',
    description: 'Simulate sudden surges of traffic to test auto-scaling and recovery.',
    type: 'spike',
    icon: Zap,
    color: '#eab308',
  },
  {
    id: 'soak_test',
    name: 'Soak Test',
    description: 'Run sustained load over hours to detect memory leaks and degradation.',
    type: 'soak',
    icon: Waves,
    color: '#06b6d4',
  },
  {
    id: 'breakpoint_test',
    name: 'Breakpoint Test',
    description: 'Ramp VUs until the system fails to find exact capacity ceiling.',
    type: 'breakpoint',
    icon: Wind,
    color: '#ef4444',
  },
  {
    id: 'api_crud',
    name: 'API CRUD Flow',
    description: 'Test complete Create, Read, Update, Delete lifecycle on REST endpoints.',
    type: 'load',
    icon: Server,
    color: '#8b5cf6',
  },
  {
    id: 'websocket_chat',
    name: 'WebSocket Chat',
    description: 'Simulate real-time WebSocket connections with message exchange patterns.',
    type: 'load',
    icon: MessageSquare,
    color: '#22c55e',
  },
  {
    id: 'graphql_queries',
    name: 'GraphQL Queries',
    description: 'Load test GraphQL endpoints with queries, mutations, and subscriptions.',
    type: 'load',
    icon: Braces,
    color: '#ec4899',
  },
  {
    id: 'ecommerce_flow',
    name: 'E-Commerce Flow',
    description: 'Full user journey: browse → search → add to cart → checkout → payment.',
    type: 'load',
    icon: ShoppingCart,
    color: '#14b8a6',
  },
];

const TYPE_BADGES = {
  load: { label: 'Load', bg: 'bg-blue-500/15', color: 'text-blue-400' },
  stress: { label: 'Stress', bg: 'bg-orange-500/15', color: 'text-orange-400' },
  spike: { label: 'Spike', bg: 'bg-yellow-500/15', color: 'text-yellow-400' },
  soak: { label: 'Soak', bg: 'bg-cyan-500/15', color: 'text-cyan-400' },
  breakpoint: { label: 'Breakpoint', bg: 'bg-red-500/15', color: 'text-red-400' },
};

export default function Scenarios() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  const filtered = SCENARIOS.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.description.toLowerCase().includes(filter.toLowerCase())
  );

  const useTemplate = (scenario) => {
    navigate(`/script-editor?template=${scenario.id}`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Scenario Templates</h1>
          <p className="text-text-secondary mt-1">Pre-built test scenarios to get started quickly</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            className="w-64 bg-bg-secondary border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors"
            placeholder="Search templates..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((scenario, idx) => {
          const Icon = scenario.icon;
          const badge = TYPE_BADGES[scenario.type] || TYPE_BADGES.load;
          return (
            <motion.div
              key={scenario.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass-card p-5 flex flex-col gap-4 group hover:border-accent/40"
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: `${scenario.color}20` }}
                >
                  <Icon className="w-5.5 h-5.5" style={{ color: scenario.color }} />
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.bg} ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-text-primary mb-1.5">{scenario.name}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{scenario.description}</p>
              </div>
              <button
                onClick={() => useTemplate(scenario)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent/10 hover:bg-accent/20 text-accent rounded-lg text-sm font-medium transition-colors group-hover:bg-accent group-hover:text-white"
              >
                Use Template <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-text-muted">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No templates match your search</p>
        </div>
      )}
    </motion.div>
  );
}
