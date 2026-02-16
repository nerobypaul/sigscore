import { useState, useCallback, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import KeyboardShortcuts from './KeyboardShortcuts';
import DemoModeBanner from './DemoModeBanner';
import UsageBanner from './UsageBanner';
import UpgradeModal from './UpgradeModal';
import type { UpgradeModalProps } from './UpgradeModal';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';

// --- Grouped Navigation Structure ---

interface NavItem {
  to: string;
  label: string;
  icon: () => JSX.Element;
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const navSections: NavSection[] = [
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    items: [
      { to: '/', label: 'Dashboard', icon: DashboardIcon },
      { to: '/contacts', label: 'Contacts', icon: ContactsIcon },
      { to: '/companies', label: 'Companies', icon: CompaniesIcon },
      { to: '/signals', label: 'Signals', icon: SignalsIcon },
      { to: '/scores', label: 'PQA Scores', icon: ScoresIcon },
    ],
  },
  {
    id: 'automation',
    label: 'AUTOMATION',
    items: [
      { to: '/workflows', label: 'Workflows', icon: WorkflowsIcon },
      { to: '/playbooks', label: 'Playbooks', icon: PlaybooksIcon },
      { to: '/sequences', label: 'Sequences', icon: SequencesIcon },
    ],
  },
  {
    id: 'analysis',
    label: 'ANALYSIS',
    items: [
      { to: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
      { to: '/deals', label: 'Deals', icon: DealsIcon },
    ],
  },
  {
    id: 'settings',
    label: 'SETTINGS',
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { to: '/settings', label: 'Integrations', icon: IntegrationsIcon },
      { to: '/webhooks', label: 'Webhooks', icon: WebhooksIcon },
      { to: '/scoring', label: 'Scoring Rules', icon: ScoringBuilderIcon },
      { to: '/team', label: 'Team', icon: TeamIcon },
      { to: '/billing', label: 'Billing', icon: BillingIcon },
      { to: '/audit', label: 'Audit Log', icon: AuditLogIcon },
      { to: '/sso-settings', label: 'SSO', icon: SsoIcon },
    ],
  },
];

// Paths that belong to the Settings section (used to auto-expand when navigating directly)
const SETTINGS_PATHS = ['/settings', '/webhooks', '/scoring', '/team', '/billing', '/audit', '/sso-settings'];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // UpgradeModal state — triggered by 402 responses from the API
  const [upgradeModal, setUpgradeModal] = useState<Omit<UpgradeModalProps, 'open' | 'onClose'> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        error?: string;
        current?: number;
        limit?: number;
        tier?: string;
      } | undefined;
      setUpgradeModal({
        error: detail?.error,
        current: detail?.current,
        limit: detail?.limit,
        tier: detail?.tier,
      });
    };
    window.addEventListener('devsignal:plan-limit', handler);
    return () => window.removeEventListener('devsignal:plan-limit', handler);
  }, []);

  // Auto-expand settings if the user is on a settings page
  const isOnSettingsPage = SETTINGS_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/')
  );
  const [settingsExpanded, setSettingsExpanded] = useState(isOnSettingsPage);

  const toggleShortcuts = useCallback(() => {
    setShowShortcuts((prev) => !prev);
  }, []);

  useKeyboardShortcuts(toggleShortcuts);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase()
    : '??';

  // Close sidebar on route change (mobile)
  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  // Resolve page title for mobile top bar
  const resolvePageTitle = (): string => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)) {
          return item.label;
        }
      }
    }
    return 'DevSignal';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <DemoModeBanner />
      <UsageBanner />
      <div className="flex flex-1 overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white flex flex-col flex-shrink-0 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo + Notifications */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-800">
          <span className="text-xl font-bold tracking-tight">DevSignal</span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            {/* Close button (mobile only) */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Global Search */}
        <div className="px-3 pt-3 pb-1">
          <GlobalSearch />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 px-3 overflow-y-auto">
          {navSections.map((section) => {
            const isCollapsible = section.collapsible;
            const isExpanded = section.id === 'settings' ? settingsExpanded : true;

            return (
              <div key={section.id} className={section.id !== 'intelligence' ? 'mt-5' : 'mt-1'}>
                {/* Section header */}
                {isCollapsible ? (
                  <button
                    onClick={() => setSettingsExpanded((prev) => !prev)}
                    className="flex items-center justify-between w-full px-3 py-1.5 group"
                  >
                    <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
                      {section.label}
                    </span>
                    <ChevronIcon expanded={isExpanded} />
                  </button>
                ) : (
                  <div className="px-3 py-1.5">
                    <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
                      {section.label}
                    </span>
                  </div>
                )}

                {/* Section items */}
                {isExpanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-gray-800 text-white'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                          }`
                        }
                      >
                        <item.icon />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Keyboard shortcuts hint */}
        <button
          onClick={toggleShortcuts}
          className="mx-3 mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
        >
          <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-[10px] font-mono">?</kbd>
          <span>Keyboard shortcuts</span>
        </button>

        {/* User section */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-semibold">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-left text-sm text-gray-400 hover:text-white transition-colors px-1"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden h-14 flex items-center gap-3 px-4 border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="flex-1 text-sm font-semibold text-gray-900">
            {resolvePageTitle()}
          </span>
          <div className="[&_button]:text-gray-600 [&_button]:hover:text-gray-900 [&_button]:hover:bg-gray-100">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />
      )}

      {/* Upgrade modal — triggered by 402 responses */}
      <UpgradeModal
        open={upgradeModal !== null}
        onClose={() => setUpgradeModal(null)}
        error={upgradeModal?.error}
        current={upgradeModal?.current}
        limit={upgradeModal?.limit}
        tier={upgradeModal?.tier}
      />
      </div>
    </div>
  );
}

// ---- Chevron icon for collapsible sections ----

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${
        expanded ? 'rotate-180' : ''
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ---- Inline SVG icons (simple, no extra deps) ----

function DashboardIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function CompaniesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function SignalsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function ScoresIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function WorkflowsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function PlaybooksIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function SequencesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function DealsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IntegrationsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function WebhooksIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5" />
    </svg>
  );
}

function ScoringBuilderIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function AuditLogIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function SsoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}
