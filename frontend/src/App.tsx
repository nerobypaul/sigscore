import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Deals from './pages/Deals';
import Activities from './pages/Activities';
import Signals from './pages/Signals';
import PQADashboard from './pages/PQADashboard';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import Workflows from './pages/Workflows';
import DealDetail from './pages/DealDetail';
import Landing from './pages/Landing';
import ApiDocs from './pages/ApiDocs';
import TeamMembers from './pages/TeamMembers';
import AuditLog from './pages/AuditLog';
import NotFound from './pages/NotFound';

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
    <Routes>
      {/* Public routes */}
      <Route path="/landing" element={<Landing />} />
      <Route path="/docs" element={<ApiDocs />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Register />}
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
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/deals/:id" element={<DealDetail />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/signals" element={<Signals />} />
        <Route path="/scores" element={<PQADashboard />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/team" element={<TeamMembers />} />
        <Route path="/audit" element={<AuditLog />} />
      </Route>

      {/* 404 catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
