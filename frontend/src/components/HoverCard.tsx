import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

interface CompanyPreview {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  _count?: { contacts: number; deals: number };
}

interface ContactPreview {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  company?: { id: string; name: string } | null;
}

type PreviewData = { type: 'company'; data: CompanyPreview } | { type: 'contact'; data: ContactPreview };

const SIZE_LABELS: Record<string, string> = {
  STARTUP: 'Startup', SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', ENTERPRISE: 'Enterprise',
};

// Cache to avoid re-fetching
const cache = new Map<string, PreviewData>();

export function CompanyHoverCard({ companyId, children }: { companyId: string; children: React.ReactNode }) {
  return <HoverCard entityType="company" entityId={companyId}>{children}</HoverCard>;
}

export function ContactHoverCard({ contactId, children }: { contactId: string; children: React.ReactNode }) {
  return <HoverCard entityType="contact" entityId={contactId}>{children}</HoverCard>;
}

function HoverCard({
  entityType,
  entityId,
  children,
}: {
  entityType: 'company' | 'contact';
  entityId: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'below' | 'above'>('below');

  const cacheKey = `${entityType}:${entityId}`;

  const fetchData = useCallback(async () => {
    const cached = cache.get(cacheKey);
    if (cached) { setData(cached); return; }

    setLoading(true);
    try {
      const endpoint = entityType === 'company' ? `/companies/${entityId}` : `/contacts/${entityId}`;
      const { data: result } = await api.get(endpoint);
      const preview: PreviewData = entityType === 'company'
        ? { type: 'company', data: result as CompanyPreview }
        : { type: 'contact', data: result as ContactPreview };
      cache.set(cacheKey, preview);
      setData(preview);
    } catch {
      // Silently fail — hover card is non-critical
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, cacheKey]);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setShow(true);
      fetchData();
      // Calculate position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setPosition(spaceBelow < 200 ? 'above' : 'below');
      }
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div
          className={`absolute left-0 z-50 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-4 ${
            position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          style={{ pointerEvents: 'auto' }}
        >
          {loading && !data ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ) : data?.type === 'company' ? (
            <CompanyPreviewContent company={data.data} />
          ) : data?.type === 'contact' ? (
            <ContactPreviewContent contact={data.data} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function CompanyPreviewContent({ company }: { company: CompanyPreview }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {company.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <Link to={`/companies/${company.id}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 block truncate">
            {company.name}
          </Link>
          {company.domain && <p className="text-xs text-gray-400 truncate">{company.domain}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {company.industry && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{company.industry}</span>
        )}
        {company.size && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{SIZE_LABELS[company.size] || company.size}</span>
        )}
      </div>
      {company._count && (
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{company._count.contacts} contact{company._count.contacts !== 1 ? 's' : ''}</span>
          <span>{company._count.deals} deal{company._count.deals !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

function ContactPreviewContent({ contact }: { contact: ContactPreview }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {contact.firstName?.[0]?.toUpperCase()}{contact.lastName?.[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <Link to={`/contacts/${contact.id}`} className="text-sm font-semibold text-gray-900 hover:text-indigo-600 block truncate">
            {contact.firstName} {contact.lastName}
          </Link>
          {contact.title && <p className="text-xs text-gray-400 truncate">{contact.title}</p>}
        </div>
      </div>
      {contact.email && <p className="text-xs text-gray-500 truncate mb-1">{contact.email}</p>}
      {contact.company && (
        <Link to={`/companies/${contact.company.id}`} className="text-xs text-indigo-600 hover:text-indigo-800">
          {contact.company.name}
        </Link>
      )}
    </div>
  );
}
