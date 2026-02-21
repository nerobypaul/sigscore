import { useState, useEffect } from 'react';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

const LAST_UPDATED = 'February 21, 2026';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const sections: Section[] = [
  {
    id: 'information-we-collect',
    title: '1. Information We Collect',
    content: (
      <>
        <p>We collect the following categories of information:</p>
        <h3>Account Information</h3>
        <ul>
          <li>Name, email address, and password when you create an account.</li>
          <li>Organization name, billing address, and payment information (processed by Stripe).</li>
          <li>
            OAuth profile data (name, email, avatar) when you sign in via GitHub or Google.
          </li>
        </ul>
        <h3>Usage Data</h3>
        <ul>
          <li>
            API request logs, feature usage patterns, and session information to improve the
            Service and provide support.
          </li>
          <li>Browser type, operating system, IP address, and device identifiers.</li>
          <li>Pages visited, actions taken, and time spent within the application.</li>
        </ul>
        <h3>Signal Data</h3>
        <ul>
          <li>
            Publicly available developer signals from sources such as GitHub (stars, forks, issues,
            pull requests), npm/PyPI download statistics, Stack Overflow activity, Reddit posts,
            and Twitter/X mentions.
          </li>
          <li>
            Data you explicitly send through our APIs, SDKs, webhooks, and third-party
            integrations (Segment, HubSpot, Salesforce, PostHog, etc.).
          </li>
        </ul>
        <h3>Enrichment Data</h3>
        <ul>
          <li>
            Company firmographic data obtained from third-party providers (such as Clearbit) to
            enrich contact and company profiles, including company size, industry, and location.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: '2. How We Use Information',
    content: (
      <>
        <p>We use the information we collect for the following purposes:</p>
        <ul>
          <li>
            <strong>Provide the Service:</strong> Process signals, generate PQA scores, deliver
            account intelligence, and power the CRM and workflow features.
          </li>
          <li>
            <strong>Authentication & Security:</strong> Verify your identity, manage sessions,
            detect and prevent fraud and unauthorized access.
          </li>
          <li>
            <strong>Billing:</strong> Process payments, manage subscriptions, and send invoices
            and receipts.
          </li>
          <li>
            <strong>Communication:</strong> Send transactional emails (account verification,
            password resets, billing notifications), service updates, and security alerts.
          </li>
          <li>
            <strong>Analytics & Improvement:</strong> Understand how users interact with the
            Service to improve features, performance, and user experience.
          </li>
          <li>
            <strong>AI Features:</strong> Generate AI-powered account briefs, contact enrichment,
            and next-best-action recommendations using anonymized and aggregated data patterns.
          </li>
          <li>
            <strong>Legal Compliance:</strong> Comply with applicable laws, regulations, and legal
            processes.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-processing',
    title: '3. Data Processing & Legal Basis (GDPR)',
    content: (
      <>
        <p>
          For users in the European Economic Area (EEA), United Kingdom, and Switzerland, we
          process personal data under the following legal bases as defined by the General Data
          Protection Regulation (GDPR):
        </p>
        <ul>
          <li>
            <strong>Contract Performance (Art. 6(1)(b)):</strong> Processing necessary to provide
            the Service you have requested, including account management, signal processing,
            and CRM features.
          </li>
          <li>
            <strong>Legitimate Interests (Art. 6(1)(f)):</strong> Processing necessary for our
            legitimate interests, such as improving the Service, fraud prevention, and analytics,
            where such interests are not overridden by your data protection rights.
          </li>
          <li>
            <strong>Consent (Art. 6(1)(a)):</strong> Where you have given explicit consent, such
            as for optional marketing communications. You may withdraw consent at any time.
          </li>
          <li>
            <strong>Legal Obligation (Art. 6(1)(c)):</strong> Processing necessary to comply with
            legal obligations, such as tax and accounting requirements.
          </li>
        </ul>
        <p>
          <strong>Data Processing Agreements:</strong> Where Sigscore acts as a data processor on
          behalf of your organization, we will enter into a Data Processing Agreement (DPA) upon
          request. Contact{' '}
          <a href="mailto:legal@sigscore.dev">legal@sigscore.dev</a> to request a DPA.
        </p>
        <p>
          <strong>International Transfers:</strong> Your data may be transferred to and processed
          in the United States. We rely on the EU-US Data Privacy Framework for transfers to
          certified recipients and Standard Contractual Clauses (SCCs) approved by the European
          Commission for all other transfers outside the EEA.
        </p>
      </>
    ),
  },
  {
    id: 'automated-decisions',
    title: '3a. Automated Decision-Making',
    content: (
      <>
        <h3>Automated Decision-Making &amp; Profiling (Art. 13(2)(f) GDPR)</h3>
        <p>
          Sigscore uses automated processing to generate PQA (Product-Qualified Account) scores
          for accounts based on developer activity signals. This scoring:
        </p>
        <ul>
          <li>
            Aggregates publicly available signals (GitHub activity, npm downloads, community
            engagement) to calculate a 0-100 score
          </li>
          <li>
            Does not make automated decisions that produce legal effects or similarly significantly
            affect individuals
          </li>
          <li>
            Is used solely to help our B2B customers prioritize business outreach
          </li>
          <li>
            Can be reviewed and overridden by human users at any time
          </li>
        </ul>
        <p>
          AI-generated account briefs are produced using third-party AI models (Anthropic Claude) to
          summarize account activity. These briefs are informational only and do not trigger automated
          actions.
        </p>
      </>
    ),
  },
  {
    id: 'third-party',
    title: '5. Third-Party Services',
    content: (
      <>
        <p>
          We share data with the following categories of third-party service providers, solely for
          the purposes described:
        </p>
        <ul>
          <li>
            <strong>Payment Processing:</strong> Stripe processes payment information. We do not
            store full credit card numbers. See{' '}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
              Stripe's Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Email Delivery:</strong> Resend delivers transactional emails on our behalf.
          </li>
          <li>
            <strong>Error Monitoring:</strong> Sentry captures error reports and performance data
            to help us maintain service reliability.
          </li>
          <li>
            <strong>Data Enrichment:</strong> Clearbit provides company and contact enrichment
            data.
          </li>
          <li>
            <strong>AI Processing:</strong> Anthropic's Claude processes data to generate account
            briefs and recommendations. Data sent to the AI model is not used for model training.
          </li>
          <li>
            <strong>CRM Integrations:</strong> When you connect HubSpot or Salesforce, data is
            synced bidirectionally as configured by you. We access only the scopes you authorize.
          </li>
        </ul>
        <p>
          We do not sell your personal information to third parties. We do not share your data for
          third-party advertising purposes.
        </p>
      </>
    ),
  },
  {
    id: 'data-retention',
    title: '6. Data Retention',
    content: (
      <>
        <p>We retain your data according to the following schedule:</p>
        <ul>
          <li>
            <strong>Account Data:</strong> Retained for the duration of your active subscription.
            After account deletion, data is retained for 30 days to allow for recovery, then
            permanently deleted.
          </li>
          <li>
            <strong>Signal Data:</strong> Historical signal data is retained for the duration of
            your subscription. Raw webhook payloads are retained for 90 days for debugging
            purposes.
          </li>
          <li>
            <strong>Audit Logs:</strong> Audit log entries are retained for 12 months for
            compliance and security purposes.
          </li>
          <li>
            <strong>Billing Records:</strong> Payment and invoice records are retained for 7 years
            as required by tax and accounting regulations.
          </li>
          <li>
            <strong>Analytics Data:</strong> Aggregated, anonymized usage analytics are retained
            indefinitely for product improvement.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: '7. Your Rights (GDPR)',
    content: (
      <>
        <p>
          If you are located in the EEA, UK, or Switzerland, you have the following rights under
          GDPR and applicable data protection laws:
        </p>
        <ul>
          <li>
            <strong>Right of Access (Art. 15):</strong> Request a copy of the personal data we
            hold about you.
          </li>
          <li>
            <strong>Right to Rectification (Art. 16):</strong> Request correction of inaccurate
            or incomplete personal data.
          </li>
          <li>
            <strong>Right to Erasure (Art. 17):</strong> Request deletion of your personal data
            ("right to be forgotten"), subject to legal retention obligations.
          </li>
          <li>
            <strong>Right to Restriction (Art. 18):</strong> Request restriction of processing
            of your personal data in certain circumstances.
          </li>
          <li>
            <strong>Right to Data Portability (Art. 20):</strong> Receive your data in a
            structured, machine-readable format. You can export data via our bulk export APIs.
          </li>
          <li>
            <strong>Right to Object (Art. 21):</strong> Object to processing of your personal
            data based on legitimate interests or for direct marketing.
          </li>
          <li>
            <strong>Right to Withdraw Consent (Art. 7):</strong> Where processing is based on
            consent, withdraw your consent at any time without affecting the lawfulness of prior
            processing.
          </li>
          <li>
            <strong>Right to Lodge a Complaint:</strong> File a complaint with your competent
            data protection supervisory authority. If the controller is based in Germany, the
            competent authority depends on the federal state (Bundesland) of the controller's
            registered address.
          </li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{' '}
          <a href="mailto:legal@sigscore.dev">legal@sigscore.dev</a>. We will respond to
          requests within 30 days.
        </p>
        <p>
          <strong>California Residents (CCPA):</strong> California residents have additional
          rights under the CCPA, including the right to know what personal information is
          collected, the right to delete, and the right to opt out of the sale of personal
          information. We do not sell personal information. Contact us to exercise your rights.
        </p>
        <p>
          <strong>Data Protection Officer:</strong> Given the current scale of operations, Sigscore
          is not required to appoint a Data Protection Officer under Section 38 BDSG or Art. 37
          GDPR. For all data protection inquiries, please contact{' '}
          <a href="mailto:legal@sigscore.dev">legal@sigscore.dev</a>.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: '8. Cookies & Tracking',
    content: (
      <>
        <p>
          Sigscore uses a minimal set of cookies and local storage for essential functionality:
        </p>
        <ul>
          <li>
            <strong>Authentication Tokens:</strong> JWT access tokens and refresh tokens stored in
            local storage to maintain your session. These are essential for the Service to
            function.
          </li>
          <li>
            <strong>Organization Context:</strong> Your selected organization ID is stored in local
            storage to maintain context across page navigations.
          </li>
          <li>
            <strong>Preferences:</strong> UI preferences (such as sidebar state) may be stored
            locally.
          </li>
        </ul>
        <p>
          We do not use third-party advertising cookies or tracking pixels. We do not participate
          in cross-site tracking or behavioral advertising networks.
        </p>
        <p>
          Error monitoring through Sentry may collect technical session data (browser version,
          OS, error stack traces) to help us resolve bugs and improve reliability.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: '9. Security',
    content: (
      <>
        <p>
          We implement industry-standard security measures to protect your data:
        </p>
        <ul>
          <li>
            <strong>Encryption in Transit:</strong> All data transmitted between your browser and
            our servers is encrypted using TLS 1.2 or higher.
          </li>
          <li>
            <strong>Encryption at Rest:</strong> Database storage is encrypted at rest using
            AES-256 encryption.
          </li>
          <li>
            <strong>Authentication:</strong> Passwords are hashed using bcrypt. API keys use
            cryptographically secure random generation. HMAC-SHA256 is used for webhook signature
            verification.
          </li>
          <li>
            <strong>Access Control:</strong> Role-based access control (RBAC) ensures users can
            only access data within their organization. Multi-tenancy is enforced at the query
            level.
          </li>
          <li>
            <strong>Rate Limiting:</strong> API endpoints are protected by rate limiting to
            prevent abuse.
          </li>
          <li>
            <strong>Audit Logging:</strong> All sensitive operations are logged in an immutable
            audit trail.
          </li>
          <li>
            <strong>SSO:</strong> Enterprise SSO is available via SAML 2.0 and OIDC for
            centralized authentication.
          </li>
        </ul>
        <p>
          While we strive to protect your data, no method of electronic transmission or storage is
          100% secure. If you discover a security vulnerability, please report it to{' '}
          <a href="mailto:security@sigscore.dev">security@sigscore.dev</a>.
        </p>
      </>
    ),
  },
  {
    id: 'breach-notification',
    title: '10. Data Breach Notification',
    content: (
      <>
        <p>
          In the event of a data breach that affects your personal information, Sigscore will:
        </p>
        <ul>
          <li>
            <strong>Notify affected users</strong> via email within 72 hours of becoming aware of
            the breach, as required by GDPR Article 33.
          </li>
          <li>
            <strong>Notify supervisory authorities</strong> in applicable jurisdictions within the
            timeframes required by law.
          </li>
          <li>
            <strong>Provide details</strong> about the nature of the breach, the categories and
            approximate number of individuals affected, the likely consequences, and the measures
            taken or proposed to address the breach.
          </li>
          <li>
            <strong>Take immediate remedial action</strong> to contain the breach, mitigate its
            effects, and prevent recurrence.
          </li>
        </ul>
        <p>
          If you believe your data has been compromised, please contact us immediately at{' '}
          <a href="mailto:security@sigscore.dev">security@sigscore.dev</a>.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: '11. Children\'s Privacy',
    content: (
      <>
        <p>
          The Service is not directed to individuals under the age of 18. We do not knowingly
          collect personal information from children. If you become aware that a child has provided
          us with personal data, please contact us at{' '}
          <a href="mailto:legal@sigscore.dev">legal@sigscore.dev</a> and we will take steps to
          delete such information.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '12. Changes to This Policy',
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our practices,
          technology, legal requirements, or other factors. When we make material changes:
        </p>
        <ul>
          <li>We will update the "Last updated" date at the top of this page.</li>
          <li>
            We will notify you via email at least 30 days before the changes take effect.
          </li>
          <li>
            We will display a prominent notice within the Service.
          </li>
        </ul>
        <p>
          We encourage you to review this Privacy Policy periodically. Your continued use of the
          Service after changes become effective constitutes your acceptance of the revised policy.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '13. Contact Us',
    content: (
      <>
        <p>
          If you have questions about this Privacy Policy or our data practices, please contact us:
        </p>
        <h3>Data Controller</h3>
        <p>
          Sigscore<br />
          Paul Nispel<br />
          [Address to be updated]
        </p>
        <ul>
          <li>
            <strong>Email:</strong>{' '}
            <a href="mailto:legal@sigscore.dev">legal@sigscore.dev</a>
          </li>
          <li>
            <strong>Security:</strong>{' '}
            <a href="mailto:security@sigscore.dev">security@sigscore.dev</a>
          </li>
        </ul>
        <p>
          For GDPR-related inquiries, you may also contact your competent data protection
          supervisory authority.
        </p>
      </>
    ),
  },
];

export default function Privacy() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => { document.title = 'Privacy Policy — Sigscore'; }, []);

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
      {/* Navigation */}
      <PublicNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-gray-400 max-w-3xl">
            At Sigscore, we take your privacy seriously. This Privacy Policy describes how we
            collect, use, share, and protect your personal information when you use our Service.
          </p>
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

      {/* Footer */}
      <PublicFooter />

      <style>{`
        .legal-content .prose-legal p {
          color: #9ca3af;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .legal-content .prose-legal h3 {
          color: #e5e7eb;
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
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
      `}</style>
    </div>
  );
}
