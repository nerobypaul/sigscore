import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Spinner from './components/Spinner';
import CommandPalette from './components/CommandPalette';
import CookieConsent from './components/CookieConsent';

// Lazy-loaded pages — each becomes its own chunk for faster initial load
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Contacts = lazy(() => import('./pages/Contacts'));
const ContactDetail = lazy(() => import('./pages/ContactDetail'));
const Companies = lazy(() => import('./pages/Companies'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));
const CompanyCompare = lazy(() => import('./pages/CompanyCompare'));
const Deals = lazy(() => import('./pages/Deals'));
const Activities = lazy(() => import('./pages/Activities'));
const Signals = lazy(() => import('./pages/Signals'));
const SignalFeed = lazy(() => import('./pages/SignalFeed'));
const PQADashboard = lazy(() => import('./pages/PQADashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Billing = lazy(() => import('./pages/Billing'));
const Workflows = lazy(() => import('./pages/Workflows'));
const DealDetail = lazy(() => import('./pages/DealDetail'));
const Landing = lazy(() => import('./pages/Landing'));
const UseCases = lazy(() => import('./pages/UseCases'));
const Pricing = lazy(() => import('./pages/Pricing'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const TeamMembers = lazy(() => import('./pages/TeamMembers'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const EmailSequences = lazy(() => import('./pages/EmailSequences'));
const EmailSequenceDetail = lazy(() => import('./pages/EmailSequenceDetail'));
const DashboardBuilder = lazy(() => import('./pages/DashboardBuilder'));
const CrmImport = lazy(() => import('./pages/CrmImport'));
const Playbooks = lazy(() => import('./pages/Playbooks'));
const ScoringBuilder = lazy(() => import('./pages/ScoringBuilder'));
const Analytics = lazy(() => import('./pages/Analytics'));
const DevPortal = lazy(() => import('./pages/DevPortal'));
const SsoSettings = lazy(() => import('./pages/SsoSettings'));
const SsoCallback = lazy(() => import('./pages/SsoCallback'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const WebhookManager = lazy(() => import('./pages/WebhookManager'));
const ContactDuplicates = lazy(() => import('./pages/ContactDuplicates'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const Dpa = lazy(() => import('./pages/Dpa'));
const AcceptableUse = lazy(() => import('./pages/AcceptableUse'));
const TeamSettings = lazy(() => import('./pages/TeamSettings'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const DataExport = lazy(() => import('./pages/DataExport'));
const AccountAlerts = lazy(() => import('./pages/AccountAlerts'));
const EnrichmentQueue = lazy(() => import('./pages/EnrichmentQueue'));
const AccountReports = lazy(() => import('./pages/AccountReports'));
const SharedReport = lazy(() => import('./pages/SharedReport'));
const ApiUsage = lazy(() => import('./pages/ApiUsage'));
const Changelog = lazy(() => import('./pages/Changelog'));
const CompareCommonRoom = lazy(() => import('./pages/CompareCommonRoom'));
const CompareReodev = lazy(() => import('./pages/CompareReodev'));
const Integrations = lazy(() => import('./pages/Integrations'));
const IntegrationDetail = lazy(() => import('./pages/IntegrationDetail'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

/**
 * Wrapper that redirects authenticated users with no organization to /onboarding.
 * Used inside the protected layout routes.
 */
function RequireOrg({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const hasOrg = user?.organizations && user.organizations.length > 0;

  if (!hasOrg) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
    {/* Command Palette — mounted once at top level, outside routes */}
    <CommandPalette />
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Root route: Landing for visitors, falls through to protected Dashboard for logged-in users */}
        {!isAuthenticated && <Route path="/" element={<Landing />} />}

        {/* Public routes */}
        <Route path="/landing" element={<Landing />} />
        <Route path="/use-cases" element={<UseCases />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/docs" element={<ApiDocs />} />
        <Route path="/developers" element={<DevPortal />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        <Route path="/dpa" element={<Dpa />} />
        <Route path="/acceptable-use" element={<AcceptableUse />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/compare/common-room" element={<CompareCommonRoom />} />
        <Route path="/compare/reo-dev" element={<CompareReodev />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/demo" element={<Navigate to="/" replace />} />
        <Route path="/sso/callback" element={<SsoCallback />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/shared/:shareToken" element={<SharedReport />} />
        <Route path="/invitations/:token/accept" element={<AcceptInvitation />} />
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Register />}
        />
        <Route
          path="/forgot-password"
          element={isAuthenticated ? <Navigate to="/" replace /> : <ForgotPassword />}
        />
        <Route
          path="/reset-password"
          element={isAuthenticated ? <Navigate to="/" replace /> : <ResetPassword />}
        />

        {/* Onboarding: must be logged in, shown when user has no org */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Protected routes (require org) */}
        <Route
          element={
            <ProtectedRoute>
              <RequireOrg>
                <Layout />
              </RequireOrg>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/duplicates" element={<ContactDuplicates />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/companies/compare" element={<CompanyCompare />} />
          <Route path="/companies/:id" element={<CompanyDetail />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/deals/:id" element={<DealDetail />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/signals/feed" element={<SignalFeed />} />
          <Route path="/scores" element={<PQADashboard />} />
          <Route path="/scoring" element={<ScoringBuilder />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/playbooks" element={<Playbooks />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/team" element={<TeamMembers />} />
          <Route path="/team/settings" element={<TeamSettings />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/sequences" element={<EmailSequences />} />
          <Route path="/sequences/:id" element={<EmailSequenceDetail />} />
          <Route path="/dashboard-builder" element={<DashboardBuilder />} />
          <Route path="/import/crm" element={<CrmImport />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/webhooks" element={<WebhookManager />} />
          <Route path="/sso-settings" element={<SsoSettings />} />
          <Route path="/settings/export" element={<DataExport />} />
          <Route path="/alerts" element={<AccountAlerts />} />
          <Route path="/reports" element={<AccountReports />} />
          <Route path="/enrichment" element={<EnrichmentQueue />} />
          <Route path="/api-usage" element={<ApiUsage />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/integrations/:type" element={<IntegrationDetail />} />
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
            <CookieConsent />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
