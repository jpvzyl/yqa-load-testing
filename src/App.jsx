import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tests = lazy(() => import('./pages/Tests'));
const TestDetail = lazy(() => import('./pages/TestDetail'));
const TestBuilder = lazy(() => import('./pages/TestBuilder'));
const ScriptEditor = lazy(() => import('./pages/ScriptEditor'));
const Scenarios = lazy(() => import('./pages/Scenarios'));
const Import = lazy(() => import('./pages/Import'));
const TestRuns = lazy(() => import('./pages/TestRuns'));
const RunDetail = lazy(() => import('./pages/RunDetail'));
const LiveMonitor = lazy(() => import('./pages/LiveMonitor'));
const AiInsights = lazy(() => import('./pages/AiInsights'));
const Baselines = lazy(() => import('./pages/Baselines'));
const Comparison = lazy(() => import('./pages/Comparison'));
const CapacityPlanning = lazy(() => import('./pages/CapacityPlanning'));
const Reports = lazy(() => import('./pages/Reports'));
const SlaCompliance = lazy(() => import('./pages/SlaCompliance'));
const Trends = lazy(() => import('./pages/Trends'));
const Infrastructure = lazy(() => import('./pages/Infrastructure'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Settings = lazy(() => import('./pages/Settings'));
const PitchDeck = lazy(() => import('./pages/PitchDeck'));
const Login = lazy(() => import('./pages/Login'));

const WorkerPool = lazy(() => import('./pages/WorkerPool'));
const TraceExplorer = lazy(() => import('./pages/TraceExplorer'));
const ChaosExperiments = lazy(() => import('./pages/ChaosExperiments'));
const TrafficReplay = lazy(() => import('./pages/TrafficReplay'));
const PRGates = lazy(() => import('./pages/PRGates'));
const SLODashboard = lazy(() => import('./pages/SLODashboard'));
const CostAnalysis = lazy(() => import('./pages/CostAnalysis'));
const WorkloadModeler = lazy(() => import('./pages/WorkloadModeler'));
const ComplianceReports = lazy(() => import('./pages/ComplianceReports'));
const EvidenceBrowser = lazy(() => import('./pages/EvidenceBrowser'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-accent animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/pitch" element={<PitchDeck />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="tests" element={<Tests />} />
            <Route path="tests/:id" element={<TestDetail />} />
            <Route path="test-builder" element={<TestBuilder />} />
            <Route path="script-editor" element={<ScriptEditor />} />
            <Route path="scenarios" element={<Scenarios />} />
            <Route path="import" element={<Import />} />
            <Route path="runs" element={<TestRuns />} />
            <Route path="runs/:id" element={<RunDetail />} />
            <Route path="live/:id" element={<LiveMonitor />} />
            <Route path="ai-insights/:id" element={<AiInsights />} />
            <Route path="baselines" element={<Baselines />} />
            <Route path="comparison" element={<Comparison />} />
            <Route path="capacity" element={<CapacityPlanning />} />
            <Route path="reports" element={<Reports />} />
            <Route path="sla" element={<SlaCompliance />} />
            <Route path="trends" element={<Trends />} />
            <Route path="infrastructure" element={<Infrastructure />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="workers" element={<WorkerPool />} />
            <Route path="traces/:runId" element={<TraceExplorer />} />
            <Route path="chaos" element={<ChaosExperiments />} />
            <Route path="replay" element={<TrafficReplay />} />
            <Route path="pr-gates" element={<PRGates />} />
            <Route path="slo-dashboard" element={<SLODashboard />} />
            <Route path="cost-analysis/:runId" element={<CostAnalysis />} />
            <Route path="workload-modeler" element={<WorkloadModeler />} />
            <Route path="compliance" element={<ComplianceReports />} />
            <Route path="evidence" element={<EvidenceBrowser />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
