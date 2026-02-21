import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactResult {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  companyName: string | null;
}

interface CompanyResult {
  id: string;
  name: string;
  domain: string | null;
  pqaScore: number | null;
}

interface SignalResult {
  id: string;
  type: string;
  source: string | null;
  timestamp: string;
}

interface GroupedSearchResponse {
  contacts: ContactResult[];
  companies: CompanyResult[];
  signals: SignalResult[];
  query: string;
}

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  path: string;
  section: string;
}

/** A selectable item in the palette. The discriminated `kind` field drives rendering. */
type PaletteItem =
  | { kind: 'contact'; data: ContactResult }
  | { kind: 'company'; data: CompanyResult }
  | { kind: 'signal'; data: SignalResult }
  | { kind: 'command'; data: CommandItem }
  | { kind: 'recent'; data: { query: string } };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_SEARCHES_KEY = 'sigscore:recent-searches';
const MAX_RECENT = 5;
const DEBOUNCE_MS = 300;

const COMMANDS: CommandItem[] = [
  { id: 'cmd-dashboard', label: 'Go to Dashboard', shortcut: 'G D', path: '/', section: 'Navigation' },
  { id: 'cmd-contacts', label: 'Go to Contacts', shortcut: 'G C', path: '/contacts', section: 'Navigation' },
  { id: 'cmd-companies', label: 'Go to Companies', shortcut: 'G O', path: '/companies', section: 'Navigation' },
  { id: 'cmd-signals', label: 'Go to Signals', shortcut: 'G S', path: '/signals', section: 'Navigation' },
  { id: 'cmd-deals', label: 'Go to Deals', shortcut: 'G E', path: '/deals', section: 'Navigation' },
  { id: 'cmd-scores', label: 'Go to PQA Scores', shortcut: 'G P', path: '/scores', section: 'Navigation' },
  { id: 'cmd-workflows', label: 'Go to Workflows', shortcut: 'G W', path: '/workflows', section: 'Navigation' },
  { id: 'cmd-playbooks', label: 'Go to Playbooks', path: '/playbooks', section: 'Navigation' },
  { id: 'cmd-sequences', label: 'Go to Sequences', path: '/sequences', section: 'Navigation' },
  { id: 'cmd-analytics', label: 'Go to Analytics', path: '/analytics', section: 'Navigation' },
  { id: 'cmd-settings', label: 'Go to Integrations', shortcut: 'G T', path: '/settings', section: 'Settings' },
  { id: 'cmd-billing', label: 'Go to Billing', shortcut: 'G B', path: '/billing', section: 'Settings' },
  { id: 'cmd-team', label: 'Go to Team Members', path: '/team', section: 'Settings' },
  { id: 'cmd-webhooks', label: 'Go to Webhooks', path: '/webhooks', section: 'Settings' },
  { id: 'cmd-audit', label: 'Go to Audit Log', path: '/audit', section: 'Settings' },
];

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const existing = getRecentSearches().filter((s) => s !== trimmed);
  const updated = [trimmed, ...existing].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Quota exceeded or private browsing — ignore silently.
  }
}

// ---------------------------------------------------------------------------
// Icons (inline SVGs, matching existing codebase patterns)
// ---------------------------------------------------------------------------

function SearchIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18m16.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [companies, setCompanies] = useState<CompanyResult[]>([]);
  const [signals, setSignals] = useState<SignalResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // ---- Derived flat list of all selectable items ----

  const filteredCommands = useMemo(() => {
    if (query.trim().length < 1) return COMMANDS;
    const lower = query.toLowerCase();
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(lower));
  }, [query]);

  const items: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [];

    // Show recent searches when there is no query
    if (query.trim().length < 2) {
      recentSearches.forEach((q) => list.push({ kind: 'recent', data: { query: q } }));
      filteredCommands.forEach((c) => list.push({ kind: 'command', data: c }));
      return list;
    }

    contacts.forEach((c) => list.push({ kind: 'contact', data: c }));
    companies.forEach((c) => list.push({ kind: 'company', data: c }));
    signals.forEach((s) => list.push({ kind: 'signal', data: s }));
    filteredCommands.forEach((c) => list.push({ kind: 'command', data: c }));

    return list;
  }, [query, contacts, companies, signals, filteredCommands, recentSearches]);

  // ---- Open / close ----

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setContacts([]);
    setCompanies([]);
    setSignals([]);
    setSelectedIndex(0);
    setRecentSearches(getRecentSearches());
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  // ---- Cmd+K / Ctrl+K handler (global) ----

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
      }
      if (e.key === 'Escape' && open) {
        closePalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, openPalette, closePalette]);

  // ---- Custom event to open from other components (e.g. sidebar button) ----

  useEffect(() => {
    const handler = () => {
      if (!open) openPalette();
    };
    window.addEventListener('sigscore:open-command-palette', handler);
    return () => window.removeEventListener('sigscore:open-command-palette', handler);
  }, [open, openPalette]);

  // ---- Focus input when opening ----

  useEffect(() => {
    if (open) {
      // Use a small delay so the modal has rendered
      const id = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  // ---- Debounced API search ----

  useEffect(() => {
    if (!open) return;

    if (query.trim().length < 2) {
      setContacts([]);
      setCompanies([]);
      setSignals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<GroupedSearchResponse>('/search/command-palette', {
          params: { q: query },
        });
        setContacts(data.contacts);
        setCompanies(data.companies);
        setSignals(data.signals);
        setSelectedIndex(0);
      } catch {
        setContacts([]);
        setCompanies([]);
        setSignals([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, open]);

  // ---- Clamp selected index when items change ----

  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // ---- Scroll selected item into view ----

  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // ---- Navigation ----

  const selectItem = useCallback(
    (item: PaletteItem) => {
      switch (item.kind) {
        case 'contact':
          saveRecentSearch(query);
          closePalette();
          navigate(`/contacts/${item.data.id}`);
          break;
        case 'company':
          saveRecentSearch(query);
          closePalette();
          navigate(`/companies/${item.data.id}`);
          break;
        case 'signal':
          saveRecentSearch(query);
          closePalette();
          navigate('/signals');
          break;
        case 'command':
          closePalette();
          navigate(item.data.path);
          break;
        case 'recent':
          setQuery(item.data.query);
          break;
      }
    },
    [navigate, closePalette, query],
  );

  // ---- Keyboard navigation inside the input ----

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (items[selectedIndex]) {
            selectItem(items[selectedIndex]);
          }
          break;
      }
    },
    [items, selectedIndex, selectItem],
  );

  // ---- When closed, render nothing (trigger button lives in Layout sidebar) ----

  if (!open) {
    return null;
  }

  // ---- Render the full modal ----

  // Determine section headers for grouped rendering
  const hasContacts = query.trim().length >= 2 && contacts.length > 0;
  const hasCompanies = query.trim().length >= 2 && companies.length > 0;
  const hasSignals = query.trim().length >= 2 && signals.length > 0;
  const hasRecents = query.trim().length < 2 && recentSearches.length > 0;
  const hasSearchResults = hasContacts || hasCompanies || hasSignals;
  const noResults = query.trim().length >= 2 && !loading && !hasSearchResults && filteredCommands.length === 0;

  // Track the current running index for the flat item list
  let runningIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closePalette}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-700/50">
          <SearchIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, companies, signals or type a command..."
            className="flex-1 text-sm text-gray-100 placeholder-gray-500 outline-none bg-transparent"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <LoadingSpinner />}
          <kbd className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded font-mono">
            Esc
          </kbd>
        </div>

        {/* Results area */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {/* Recent Searches */}
          {hasRecents && (
            <Section label="Recent Searches">
              {recentSearches.map((q) => {
                const idx = runningIndex++;
                return (
                  <ResultRow
                    key={`recent-${q}`}
                    active={idx === selectedIndex}
                    index={idx}
                    onSelect={() => selectItem({ kind: 'recent', data: { query: q } })}
                    onHover={() => setSelectedIndex(idx)}
                    icon={<ClockIcon />}
                    iconBg="bg-gray-800 text-gray-400"
                    title={q}
                  />
                );
              })}
            </Section>
          )}

          {/* Contacts */}
          {hasContacts && (
            <Section label="Contacts">
              {contacts.map((c) => {
                const idx = runningIndex++;
                return (
                  <ResultRow
                    key={`contact-${c.id}`}
                    active={idx === selectedIndex}
                    index={idx}
                    onSelect={() => selectItem({ kind: 'contact', data: c })}
                    onHover={() => setSelectedIndex(idx)}
                    icon={<PersonIcon />}
                    iconBg="bg-blue-500/10 text-blue-400"
                    title={c.name}
                    subtitle={[c.email, c.companyName].filter(Boolean).join(' \u00b7 ')}
                  />
                );
              })}
            </Section>
          )}

          {/* Companies */}
          {hasCompanies && (
            <Section label="Companies">
              {companies.map((c) => {
                const idx = runningIndex++;
                return (
                  <ResultRow
                    key={`company-${c.id}`}
                    active={idx === selectedIndex}
                    index={idx}
                    onSelect={() => selectItem({ kind: 'company', data: c })}
                    onHover={() => setSelectedIndex(idx)}
                    icon={<BuildingIcon />}
                    iconBg="bg-emerald-500/10 text-emerald-400"
                    title={c.name}
                    subtitle={
                      [c.domain, c.pqaScore != null ? `PQA ${c.pqaScore}` : null]
                        .filter(Boolean)
                        .join(' \u00b7 ')
                    }
                    badge={
                      c.pqaScore != null
                        ? { label: String(c.pqaScore), color: pqaColor(c.pqaScore) }
                        : undefined
                    }
                  />
                );
              })}
            </Section>
          )}

          {/* Signals */}
          {hasSignals && (
            <Section label="Signals">
              {signals.map((s) => {
                const idx = runningIndex++;
                return (
                  <ResultRow
                    key={`signal-${s.id}`}
                    active={idx === selectedIndex}
                    index={idx}
                    onSelect={() => selectItem({ kind: 'signal', data: s })}
                    onHover={() => setSelectedIndex(idx)}
                    icon={<ActivityIcon />}
                    iconBg="bg-amber-500/10 text-amber-400"
                    title={formatSignalType(s.type)}
                    subtitle={
                      [s.source, formatTimestamp(s.timestamp)]
                        .filter(Boolean)
                        .join(' \u00b7 ')
                    }
                  />
                );
              })}
            </Section>
          )}

          {/* Commands */}
          {filteredCommands.length > 0 && (
            <Section label="Commands">
              {filteredCommands.map((c) => {
                const idx = runningIndex++;
                return (
                  <ResultRow
                    key={c.id}
                    active={idx === selectedIndex}
                    index={idx}
                    onSelect={() => selectItem({ kind: 'command', data: c })}
                    onHover={() => setSelectedIndex(idx)}
                    icon={<TerminalIcon />}
                    iconBg="bg-purple-500/10 text-purple-400"
                    title={c.label}
                    shortcut={c.shortcut}
                  />
                );
              })}
            </Section>
          )}

          {/* No results */}
          {noResults && (
            <div className="py-12 text-center">
              <SearchIcon className="w-8 h-8 mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-400">No results found for &quot;{query}&quot;</p>
              <p className="text-xs text-gray-600 mt-1">Try a different search term</p>
            </div>
          )}

          {/* Initial state (no query, no recent) */}
          {query.trim().length < 2 && recentSearches.length === 0 && filteredCommands.length > 0 && (
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs text-gray-600">Type to search contacts, companies, and signals</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-700/50 text-[11px] text-gray-600">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded font-mono">&uarr;</kbd>
            <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded font-mono">&darr;</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded font-mono">&crarr;</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded font-mono">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="px-4 py-1.5">
        <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

interface ResultRowProps {
  active: boolean;
  index: number;
  onSelect: () => void;
  onHover: () => void;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  badge?: { label: string; color: string };
}

function ResultRow({
  active,
  index: _index,
  onSelect,
  onHover,
  icon,
  iconBg,
  title,
  subtitle,
  shortcut,
  badge,
}: ResultRowProps) {
  return (
    <button
      data-active={active}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
        active ? 'bg-gray-800' : 'hover:bg-gray-800/50'
      }`}
    >
      <span
        className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${iconBg}`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${active ? 'text-gray-100' : 'text-gray-300'}`}>
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
        )}
      </div>
      {badge && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.color} flex-shrink-0`}>
          {badge.label}
        </span>
      )}
      {shortcut && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {shortcut.split(' ').map((k, i) => (
            <kbd
              key={i}
              className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded font-mono"
            >
              {k}
            </kbd>
          ))}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pqaColor(score: number): string {
  if (score >= 70) return 'bg-red-500/15 text-red-400';
  if (score >= 40) return 'bg-orange-500/15 text-orange-400';
  return 'bg-blue-500/15 text-blue-400';
}

function formatSignalType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}
