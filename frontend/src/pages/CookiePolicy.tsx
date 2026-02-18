import { useState, useEffect } from 'react';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

const LAST_UPDATED = 'February 18, 2026';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const sections: Section[] = [
  {
    id: 'what-are-cookies',
    title: '1. What Are Cookies',
    content: (
      <>
        <p>
          Cookies are small text files that a website places on your device when you visit. They
          allow the site to remember information about your visit, such as your login session or
          display preferences, so you do not have to re-enter information on each page.
        </p>
        <p>
          DevSignal also uses <strong>local storage</strong> — a browser API similar to cookies
          but with a larger capacity. Local storage data is never transmitted to a server
          automatically; it stays on your device until you clear it.
        </p>
        <p>
          We aim to be minimal: we set only what is strictly necessary to operate the product
          securely and reliably.
        </p>
      </>
    ),
  },
  {
    id: 'cookies-we-use',
    title: '2. Cookies We Use',
    content: (
      <>
        <p>
          DevSignal uses a small number of cookies. Every cookie we set falls into one of two
          categories: <strong>Essential</strong> (required for the service to function) or{' '}
          <strong>Functional</strong> (improves reliability without tracking you for advertising).
        </p>

        <p>We use <strong>no advertising or analytics tracking cookies</strong>.</p>

        <div style={{ overflowX: 'auto' }}>
          <table className="cookie-table">
            <thead>
              <tr>
                <th>Cookie</th>
                <th>Category</th>
                <th>Purpose</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>ds_access_token</code></td>
                <td>Essential</td>
                <td>Stores your JWT access token to authenticate API requests.</td>
                <td>15 minutes (refreshed automatically)</td>
              </tr>
              <tr>
                <td><code>ds_refresh_token</code></td>
                <td>Essential</td>
                <td>Allows the app to obtain a new access token without re-login.</td>
                <td>7 days</td>
              </tr>
              <tr>
                <td><code>ds_org_id</code></td>
                <td>Essential</td>
                <td>Remembers the last active organization context.</td>
                <td>Session</td>
              </tr>
              <tr>
                <td>Sentry session replay</td>
                <td>Functional</td>
                <td>
                  Sentry may set a short-lived session identifier to correlate error reports.
                  No personal browsing history is collected.
                </td>
                <td>Session</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'local-storage',
    title: '3. Local Storage',
    content: (
      <>
        <p>
          In addition to cookies, DevSignal stores certain data in your browser's local storage.
          This data never leaves your device unless you explicitly use a feature that sends it to
          our servers.
        </p>
        <ul>
          <li>
            <strong>JWT tokens</strong> — access and refresh tokens used to authenticate your
            session (same as the cookies listed above; stored in local storage as a fallback for
            environments that block cookies).
          </li>
          <li>
            <strong>Organization ID</strong> — the identifier of your currently selected
            organization, so you land in the right workspace after reloading.
          </li>
          <li>
            <strong>Sidebar state</strong> — whether the left-hand navigation sidebar is expanded
            or collapsed. Purely a UI preference.
          </li>
          <li>
            <strong>Cookie consent preference</strong> (<code>devsignal-cookie-consent</code>) —
            records whether you chose "Accept All" or "Essential Only" so we do not ask again.
          </li>
        </ul>
        <p>
          All local storage entries are prefixed with <code>devsignal-</code> or are otherwise
          clearly scoped to the DevSignal application.
        </p>
      </>
    ),
  },
  {
    id: 'third-party-cookies',
    title: '4. Third-Party Cookies',
    content: (
      <>
        <p>
          A small number of third-party services we integrate with may set their own cookies. We
          restrict these to providers that are necessary for product operation:
        </p>
        <ul>
          <li>
            <strong>Stripe</strong> — Our payment processor may set cookies when you visit billing
            pages or interact with Stripe-hosted elements (e.g., the subscription checkout flow).
            These cookies are used solely for payment fraud prevention and are governed by{' '}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
              Stripe's Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Sentry</strong> — Our error monitoring provider may set a session-scoped
            identifier to correlate crash reports across page loads. Sentry does not receive
            personal data beyond what is in the error report itself (e.g., a stack trace). See{' '}
            <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">
              Sentry's Privacy Policy
            </a>
            .
          </li>
        </ul>
        <p>
          We do not use Google Analytics, Meta Pixel, LinkedIn Insight Tag, or any other
          advertising or cross-site tracking technology.
        </p>
      </>
    ),
  },
  {
    id: 'managing-cookies',
    title: '5. Managing Cookies',
    content: (
      <>
        <p>
          You can control and clear cookies directly through your browser settings. Here is how
          to do it in the most common browsers:
        </p>
        <ul>
          <li>
            <strong>Chrome</strong>: Settings &rarr; Privacy and security &rarr; Cookies and other
            site data
          </li>
          <li>
            <strong>Firefox</strong>: Settings &rarr; Privacy &amp; Security &rarr; Cookies and
            Site Data
          </li>
          <li>
            <strong>Safari</strong>: Preferences &rarr; Privacy &rarr; Manage Website Data
          </li>
          <li>
            <strong>Edge</strong>: Settings &rarr; Cookies and site permissions &rarr; Cookies and
            site data
          </li>
        </ul>
        <p>
          To clear your DevSignal local storage specifically, open your browser's Developer Tools
          (F12), navigate to the <em>Application</em> tab (Chrome/Edge) or <em>Storage</em> tab
          (Firefox), and delete the entries under <strong>Local Storage</strong> for{' '}
          <code>app.devsignal.dev</code>.
        </p>
        <p>
          <strong>Note:</strong> Clearing cookies or local storage will log you out of DevSignal
          and reset your UI preferences. You will need to sign in again.
        </p>
        <p>
          You can also update your cookie consent preference at any time by clicking the
          "Cookie Preferences" link in the footer.
        </p>
      </>
    ),
  },
  {
    id: 'updates',
    title: '6. Updates to This Policy',
    content: (
      <>
        <p>
          We may update this Cookie Policy from time to time to reflect changes in our practices
          or for legal, operational, or regulatory reasons. When we make material changes, we will:
        </p>
        <ul>
          <li>Update the "Last updated" date at the top of this page.</li>
          <li>
            Display a notice within the application or send an email to registered users at least
            14 days before the change takes effect.
          </li>
        </ul>
        <p>
          Your continued use of DevSignal after the effective date of any update constitutes your
          acceptance of the revised policy. We encourage you to review this page periodically.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '7. Contact',
    content: (
      <>
        <p>
          If you have questions or concerns about this Cookie Policy or how we handle your data,
          please reach out:
        </p>
        <ul>
          <li>
            <strong>Email:</strong>{' '}
            <a href="mailto:legal@devsignal.dev">legal@devsignal.dev</a>
          </li>
          <li>
            <strong>Company:</strong> DevSignal, Inc.
          </li>
        </ul>
      </>
    ),
  },
];

export default function CookiePolicy() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => { document.title = 'Cookie Policy — DevSignal'; }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY + 120;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollY) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({ top: el.offsetTop - 100, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <PublicNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Cookie Policy
          </h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="flex gap-12">
          {/* Table of contents sidebar (desktop) */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-24">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                Table of Contents
              </h2>
              <ul className="space-y-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => scrollTo(s.id)}
                      className={`block w-full text-left text-sm py-1.5 px-3 rounded-md transition-colors ${
                        activeSection === s.id
                          ? 'bg-gray-800 text-indigo-400 font-medium'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                      }`}
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Content */}
          <main className="min-w-0 flex-1 legal-content">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="mb-12">
                <h2 className="text-xl font-bold text-white mb-4">{s.title}</h2>
                <div className="prose-legal">{s.content}</div>
              </section>
            ))}
          </main>
        </div>
      </div>

      <PublicFooter />

      <style>{`
        .legal-content .prose-legal p {
          color: #9ca3af;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .legal-content .prose-legal ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .legal-content .prose-legal li {
          color: #9ca3af;
          line-height: 1.75;
          margin-bottom: 0.5rem;
        }
        .legal-content .prose-legal a {
          color: #818cf8;
          text-decoration: underline;
        }
        .legal-content .prose-legal a:hover {
          color: #a5b4fc;
        }
        .legal-content .prose-legal strong {
          color: #e5e7eb;
        }
        .legal-content .prose-legal code {
          color: #a5b4fc;
          background: #1f2937;
          padding: 0.1em 0.35em;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        .legal-content .cookie-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }
        .legal-content .cookie-table th {
          text-align: left;
          padding: 0.625rem 0.75rem;
          background: #1f2937;
          color: #e5e7eb;
          font-weight: 600;
          border-bottom: 1px solid #374151;
          white-space: nowrap;
        }
        .legal-content .cookie-table td {
          padding: 0.625rem 0.75rem;
          color: #9ca3af;
          border-bottom: 1px solid #1f2937;
          vertical-align: top;
          line-height: 1.6;
        }
        .legal-content .cookie-table tr:last-child td {
          border-bottom: none;
        }
        .legal-content .cookie-table code {
          color: #a5b4fc;
          background: #1f2937;
          padding: 0.1em 0.35em;
          border-radius: 0.25rem;
          font-size: 0.8125em;
        }
      `}</style>
    </div>
  );
}
