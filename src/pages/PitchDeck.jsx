import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Zap, Brain, Activity, BarChart3, Shield, Globe, Code2,
  TrendingUp, CheckCircle2, ArrowRight, Layers, Users,
  Clock, Server, Star, ChevronRight,
} from 'lucide-react';

function AnimatedSection({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.6, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const STATS = [
  { value: '300K', label: 'Requests/sec', icon: Zap },
  { value: 'AI', label: 'Powered Analysis', icon: Brain },
  { value: '5+', label: 'Protocols', icon: Globe },
  { value: '<3s', label: 'Real-time Metrics', icon: Activity },
];

const FEATURES = [
  {
    icon: Code2,
    title: 'Smart Test Creation',
    description: 'Visual builder, script editor, or import from OpenAPI/HAR/Postman. AI generates tests from natural language.',
    color: '#3b82f6',
  },
  {
    icon: Brain,
    title: '3-Pass AI Analysis',
    description: 'Deep performance analysis with bottleneck detection, capacity planning, and executive-ready recommendations.',
    color: '#8b5cf6',
  },
  {
    icon: Activity,
    title: 'Real-time Monitoring',
    description: 'Live WebSocket dashboard with response time charts, throughput graphs, and error feeds updating in real-time.',
    color: '#22c55e',
  },
  {
    icon: BarChart3,
    title: 'Enterprise Reporting',
    description: 'Auto-generated PDF reports: executive summary, technical deep-dive, SLA compliance, and capacity planning.',
    color: '#f59e0b',
  },
];

const COMPARISON = [
  { feature: 'Visual Test Builder', yqa: true, k6Cloud: false, loadRunner: true, artillery: false },
  { feature: 'AI Analysis (3-pass)', yqa: true, k6Cloud: false, loadRunner: false, artillery: false },
  { feature: 'OpenAPI/HAR/Postman Import', yqa: true, k6Cloud: true, loadRunner: true, artillery: true },
  { feature: 'Real-time WebSocket Dashboard', yqa: true, k6Cloud: true, loadRunner: true, artillery: false },
  { feature: 'Multi-protocol (HTTP/WS/gRPC/GraphQL)', yqa: true, k6Cloud: true, loadRunner: true, artillery: true },
  { feature: 'Baseline Regression Detection', yqa: true, k6Cloud: true, loadRunner: true, artillery: false },
  { feature: 'Infrastructure Correlation', yqa: true, k6Cloud: false, loadRunner: true, artillery: false },
  { feature: 'Auto PDF Reports', yqa: true, k6Cloud: false, loadRunner: true, artillery: false },
  { feature: 'Self-hosted Option', yqa: true, k6Cloud: false, loadRunner: false, artillery: true },
  { feature: 'Starting Price', yqa: '$0/mo', k6Cloud: '$165/mo', loadRunner: 'Contact', artillery: '$0/mo' },
];

const PRICING = [
  {
    name: 'Starter',
    price: 'Free',
    description: 'For individual developers',
    features: ['5 tests', '10 runs/month', 'Basic AI analysis', 'Community support'],
    color: '#94a3b8',
    cta: 'Get Started',
  },
  {
    name: 'Professional',
    price: '$49',
    period: '/mo',
    description: 'For growing teams',
    features: ['Unlimited tests', '100 runs/month', 'Full AI analysis', 'PDF reports', 'Slack integration', 'Priority support'],
    color: '#3b82f6',
    cta: 'Start Trial',
    popular: true,
  },
  {
    name: 'Team',
    price: '$149',
    period: '/mo',
    description: 'For engineering teams',
    features: ['Everything in Pro', '500 runs/month', 'Multi-project', 'CI/CD integration', 'SLA monitoring', 'Baseline regression'],
    color: '#8b5cf6',
    cta: 'Start Trial',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large organizations',
    features: ['Unlimited everything', 'Self-hosted option', 'SSO/SAML', 'Dedicated support', 'Custom integrations', 'SLA guarantee'],
    color: '#22c55e',
    cta: 'Contact Sales',
  },
];

const SERVICES = [
  { title: 'Performance Audit', description: 'Complete system performance assessment with actionable roadmap', price: 'From $2,500' },
  { title: 'Continuous Performance', description: 'Ongoing monitoring, analysis, and optimization partnership', price: 'From $1,500/mo' },
  { title: 'Load Test Design', description: 'Custom test scenarios designed for your specific architecture', price: 'From $1,000' },
  { title: 'Emergency Response', description: 'Rapid performance incident investigation and remediation', price: 'From $3,000' },
];

export default function PitchDeck() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Hero */}
      <section className="relative overflow-hidden py-24 px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.15),transparent_70%)]" />
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent/10 border border-accent/20 rounded-full text-sm text-accent mb-8">
              <Zap className="w-3.5 h-3.5" /> Next-Generation Load Testing
            </div>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
              <span className="bg-gradient-to-r from-accent via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Y-QA Load Testing
              </span>
              <br />
              <span className="text-text-primary">Platform</span>
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
              AI-powered performance testing that finds bottlenecks before your users do.
              From test creation to executive reports — in minutes, not days.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <a href="#pricing" className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-light text-white rounded-xl text-base font-medium transition-colors">
                Start Free <ArrowRight className="w-4 h-4" />
              </a>
              <a href="#features" className="flex items-center gap-2 px-6 py-3 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-xl text-base transition-colors">
                See Features
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-y border-border/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <AnimatedSection key={stat.label} delay={idx * 0.1}>
                <div className="text-center">
                  <Icon className="w-6 h-6 mx-auto mb-3 text-accent" />
                  <p className="text-3xl font-bold text-text-primary">{stat.value}</p>
                  <p className="text-sm text-text-secondary mt-1">{stat.label}</p>
                </div>
              </AnimatedSection>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary">Everything You Need</h2>
            <p className="text-text-secondary mt-3 max-w-lg mx-auto">A complete platform for modern performance engineering</p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <AnimatedSection key={feature.title} delay={idx * 0.1}>
                  <div className="glass-card p-6 h-full">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: `${feature.color}20` }}>
                      <Icon className="w-5.5 h-5.5" style={{ color: feature.color }} />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">{feature.title}</h3>
                    <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-6 bg-bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary">How We Compare</h2>
            <p className="text-text-secondary mt-3">Y-QA vs the competition</p>
          </AnimatedSection>
          <AnimatedSection delay={0.1}>
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-text-secondary">Feature</th>
                      <th className="text-center py-3 px-4 font-bold text-accent">Y-QA</th>
                      <th className="text-center py-3 px-4 font-medium text-text-secondary">k6 Cloud</th>
                      <th className="text-center py-3 px-4 font-medium text-text-secondary">LoadRunner</th>
                      <th className="text-center py-3 px-4 font-medium text-text-secondary">Artillery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((row, idx) => (
                      <tr key={idx} className="border-b border-border/40 hover:bg-bg-card-hover/50 transition-colors">
                        <td className="py-2.5 px-4 text-text-primary">{row.feature}</td>
                        {['yqa', 'k6Cloud', 'loadRunner', 'artillery'].map((key) => (
                          <td key={key} className="py-2.5 px-4 text-center">
                            {typeof row[key] === 'boolean' ? (
                              row[key] ? <CheckCircle2 className="w-4 h-4 text-success mx-auto" /> : <span className="text-text-muted">—</span>
                            ) : (
                              <span className={key === 'yqa' ? 'text-accent font-semibold' : 'text-text-secondary'}>{row[key]}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary">Simple, Transparent Pricing</h2>
            <p className="text-text-secondary mt-3">Start free, scale as you grow</p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((plan, idx) => (
              <AnimatedSection key={plan.name} delay={idx * 0.1}>
                <div className={`glass-card p-6 h-full flex flex-col relative ${plan.popular ? 'border-accent/60' : ''}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 bg-accent text-white text-xs font-medium rounded-full">
                      <Star className="w-3 h-3" /> Most Popular
                    </div>
                  )}
                  <div className="mb-4">
                    <h3 className="text-base font-semibold" style={{ color: plan.color }}>{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-3xl font-bold text-text-primary">{plan.price}</span>
                      {plan.period && <span className="text-sm text-text-muted">{plan.period}</span>}
                    </div>
                    <p className="text-xs text-text-muted mt-1">{plan.description}</p>
                  </div>
                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: plan.color }} /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      plan.popular
                        ? 'bg-accent hover:bg-accent-light text-white'
                        : 'bg-bg-secondary border border-border hover:border-accent/50 text-text-secondary'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 px-6 bg-bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary">Professional Services</h2>
            <p className="text-text-secondary mt-3">Expert performance engineering when you need it</p>
          </AnimatedSection>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SERVICES.map((service, idx) => (
              <AnimatedSection key={service.title} delay={idx * 0.1}>
                <div className="glass-card p-5 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                    <ChevronRight className="w-4.5 h-4.5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">{service.title}</h3>
                    <p className="text-sm text-text-secondary mt-1">{service.description}</p>
                    <p className="text-sm font-medium text-accent mt-2">{service.price}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.1),transparent_70%)]" />
        <AnimatedSection className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-4xl font-bold text-text-primary mb-4">
            Ready to find bottlenecks<br />before your users do?
          </h2>
          <p className="text-lg text-text-secondary mb-8">
            Start testing in under 2 minutes. No credit card required.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a href="/login" className="flex items-center gap-2 px-8 py-3.5 bg-accent hover:bg-accent-light text-white rounded-xl text-base font-medium transition-colors">
              Get Started Free <ArrowRight className="w-4.5 h-4.5" />
            </a>
            <a href="mailto:sales@yqa.dev" className="flex items-center gap-2 px-8 py-3.5 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-xl text-base transition-colors">
              Talk to Sales
            </a>
          </div>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-text-muted">
          <span>&copy; {new Date().getFullYear()} Y-QA. All rights reserved.</span>
          <span>Built with performance in mind.</span>
        </div>
      </footer>
    </div>
  );
}
