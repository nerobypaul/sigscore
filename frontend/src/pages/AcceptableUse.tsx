import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
    id: 'overview',
    title: '1. Overview',
    content: (
      <>
        <p>
          This Acceptable Use Policy ("AUP") governs your use of the DevSignal platform, including
          our website, APIs, SDKs, webhooks, and all related services (collectively, the "Service").
          This AUP is incorporated by reference into our{' '}
          <Link to="/terms" className="text-indigo-400 hover:text-indigo-300 underline">
            Terms of Service
          </Link>
          , which remain in full effect.
        </p>
        <p>
          By accessing or using the Service, you agree to comply with this AUP. Violations may
          result in warnings, throttling of your access, suspension, or permanent termination of
          your account, depending on the severity and frequency of the violation.
        </p>
        <p>
          We reserve the right to update this AUP at any time. Material changes will be
          communicated via email and a notice within the Service. Your continued use of the Service
          after any update constitutes acceptance of the revised AUP.
        </p>
      </>
    ),
  },
  {
    id: 'prohibited-activities',
    title: '2. Prohibited Activities',
    content: (
      <>
        <p>
          You may not use the Service for any of the following activities:
        </p>
        <ul>
          <li>
            <strong>Unauthorized Scraping:</strong> Scraping, crawling, or bulk-extracting data
            from the Service beyond what is permitted by your subscription plan and the documented
            API rate limits.
          </li>
          <li>
            <strong>Reverse Engineering:</strong> Decompiling, disassembling, or reverse
            engineering any part of the Service, including our scoring algorithms, AI models,
            or proprietary data pipelines, except to the extent permitted by applicable law.
          </li>
          <li>
            <strong>Unauthorized Access:</strong> Attempting to gain unauthorized access to the
            Service, other user accounts, our databases, or any systems connected to the Service,
            including through credential stuffing, brute-force attacks, or exploitation of
            vulnerabilities.
          </li>
          <li>
            <strong>Malware &amp; Exploits:</strong> Transmitting or distributing malware, viruses,
            trojans, ransomware, or any other malicious code through the Service or its APIs.
            Attempting to exploit security vulnerabilities in the Service or its infrastructure.
          </li>
          <li>
            <strong>Spam &amp; Unsolicited Communications:</strong> Using DevSignal contact data
            or outbound webhook sequences to send unsolicited commercial email (spam), harassment
            campaigns, or any communications that violate CAN-SPAM, CASL, or other applicable
            anti-spam laws.
          </li>
          <li>
            <strong>Fraudulent Data:</strong> Uploading, importing, or submitting fabricated,
            falsified, or intentionally misleading data into the Service, including fake contact
            records, spoofed signals, or manipulated PQA scores.
          </li>
          <li>
            <strong>Impersonation:</strong> Impersonating another person, organization, or
            DevSignal itself, or misrepresenting your affiliation with any entity when using the
            Service.
          </li>
          <li>
            <strong>Denial of Service:</strong> Intentionally overloading or disrupting the
            Service's infrastructure, including through automated high-volume requests designed
            to degrade performance for other users.
          </li>
          <li>
            <strong>Illegal Use:</strong> Using the Service for any purpose that violates
            applicable laws or regulations, including data protection law, intellectual property
            law, export controls, or sanctions regimes.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'api-sdk-usage',
    title: '3. API & SDK Usage',
    content: (
      <>
        <p>
          DevSignal exposes REST, GraphQL, and WebSocket APIs, as well as the{' '}
          <code>@devsignal/node</code> SDK. Your use of these interfaces is subject to the
          following rules:
        </p>
        <ul>
          <li>
            <strong>Rate Limits:</strong> All API tiers enforce per-minute rate limits to ensure
            fair resource distribution:
            <ul>
              <li>Authentication endpoints: 5 requests per minute per IP.</li>
              <li>General API endpoints: 100 requests per minute per API key.</li>
              <li>Webhook ingestion: 200 requests per minute per source.</li>
              <li>Signal ingestion: 500 requests per minute per organization.</li>
            </ul>
            Systematically exceeding these limits, or implementing retry logic designed to
            circumvent them, is prohibited and may result in permanent IP or key-level blocks.
          </li>
          <li>
            <strong>No Credential Sharing:</strong> API keys and JWT tokens are issued per
            user or per organization and must not be shared with third parties outside your
            organization. Each team member must authenticate with their own credentials.
          </li>
          <li>
            <strong>API Key Confidentiality:</strong> Treat API keys as passwords. Do not embed
            them in public repositories, client-side code, build artifacts, or any publicly
            accessible location. Rotate keys immediately if you suspect they have been compromised.
          </li>
          <li>
            <strong>Webhook Signature Verification:</strong> All outbound webhook payloads from
            DevSignal are signed with HMAC-SHA256. You are required to verify webhook signatures
            on your receiving endpoint before processing any payload. Do not process payloads
            from unsigned or unverified requests.
          </li>
          <li>
            <strong>Permitted Use Only:</strong> APIs and SDKs may only be used to access and
            interact with the Service in ways consistent with your subscription plan and this AUP.
            Reselling or sublicensing API access to third parties is prohibited without prior
            written consent from DevSignal.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-handling',
    title: '4. Data Handling',
    content: (
      <>
        <p>
          You are responsible for all data you upload, import, or transmit through the Service.
          The following data handling rules apply:
        </p>
        <ul>
          <li>
            <strong>No Illegal or Infringing Content:</strong> You may not upload data that
            infringes on third-party intellectual property rights, trade secrets, or confidentiality
            obligations, or that constitutes stolen or unlawfully obtained information.
          </li>
          <li>
            <strong>PII Consent Requirements:</strong> When using DevSignal to collect, store, or
            process personal information about individuals (contacts, leads, developers), you must
            have obtained appropriate consent or have a valid legal basis under applicable law for
            that processing. You may not use DevSignal to build contact databases without proper
            authorization.
          </li>
          <li>
            <strong>GDPR &amp; CCPA Compliance:</strong> When you use DevSignal to process personal
            data of individuals in the European Economic Area or California, you are the data
            controller and are responsible for ensuring your use of the Service complies with GDPR,
            CCPA, and other applicable data protection regulations. Contact{' '}
            <a href="mailto:legal@devsignal.dev">legal@devsignal.dev</a> to request a Data
            Processing Agreement (DPA).
          </li>
          <li>
            <strong>No Sensitive Financial or Health Data:</strong> DevSignal is not designed or
            certified for the storage or processing of payment card data (PCI-DSS scope), protected
            health information (HIPAA), or other categories of sensitive regulated data. Do not
            upload or sync such data into the Service.
          </li>
          <li>
            <strong>Data Accuracy:</strong> You are responsible for the accuracy of data you import
            into DevSignal. Do not knowingly populate the Service with incorrect, deceptive, or
            fabricated contact or company records.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'integration-rules',
    title: '5. Integration Rules',
    content: (
      <>
        <p>
          DevSignal supports integrations with 16 external sources, including HubSpot, Salesforce,
          GitHub, Segment, Slack, Discord, PostHog, Intercom, Zendesk, and others. When connecting
          third-party accounts and data sources, you must adhere to the following:
        </p>
        <ul>
          <li>
            <strong>Authorized Accounts Only:</strong> You may only connect accounts and
            integrations that you own or have explicit, documented authorization to access and
            sync on behalf of your organization. Connecting accounts belonging to other parties
            without authorization is prohibited.
          </li>
          <li>
            <strong>OAuth Scope Limitations:</strong> Do not attempt to request or use OAuth
            permission scopes beyond what is required for the integration to function as described
            in our documentation. Abusing granted scopes to exfiltrate data beyond normal Service
            functionality is a violation of this AUP.
          </li>
          <li>
            <strong>Third-Party Authorization:</strong> You are responsible for ensuring that any
            data synced from third-party platforms (CRM records, product analytics events, support
            tickets, etc.) is transferred in accordance with the terms of service of those
            platforms and any agreements you have with the individuals whose data is included.
          </li>
          <li>
            <strong>Outbound Webhooks (Zapier/Make):</strong> Webhook subscriptions must only
            forward DevSignal event data to systems and workflows that are authorized within your
            organization. Do not route webhook data to unauthorized third parties.
          </li>
          <li>
            <strong>Integration Compliance:</strong> Your use of any connected third-party
            platform must remain compliant with that platform's own acceptable use policies.
            DevSignal is not liable for violations you commit on connected platforms.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'resource-limits',
    title: '6. Resource Limits',
    content: (
      <>
        <p>
          Each DevSignal subscription plan includes defined resource allocations. You must stay
          within the limits of your plan and may not attempt to circumvent usage metering:
        </p>
        <ul>
          <li>
            <strong>Contact &amp; Signal Limits:</strong> The Free plan includes up to 1,000
            contacts and 5,000 signals per month. Pro includes 25,000 contacts and 100,000
            signals per month. Growth includes 100,000 contacts and 500,000 signals per month.
            Scale provides unlimited contacts and signals. Exceeding your plan's limits will
            result in ingestion throttling until the next billing cycle or until you upgrade.
          </li>
          <li>
            <strong>No Usage Circumvention:</strong> Manipulating or interfering with usage
            counters, signal deduplication logic, or billing metering in any way is prohibited.
            This includes engineering artificial signal structures to avoid being counted against
            your plan limits.
          </li>
          <li>
            <strong>No Multi-Account Abuse:</strong> Creating multiple free-tier accounts under
            different email addresses or organizational names for the purpose of aggregating
            resource limits or avoiding paid subscription requirements is a violation of this AUP
            and the Terms of Service.
          </li>
          <li>
            <strong>Fair Use:</strong> Even within plan limits, usage patterns that place
            disproportionate load on the Service infrastructure — such as sustained high-frequency
            polling or large batch imports executed repeatedly outside of off-peak hours — may be
            throttled to protect service quality for all users.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'reporting-violations',
    title: '7. Reporting Violations',
    content: (
      <>
        <p>
          If you become aware of any use of the DevSignal platform that violates this AUP —
          including abuse by other users, API misuse, data exfiltration, or spam campaigns
          originating from DevSignal data — please report it to us immediately.
        </p>
        <ul>
          <li>
            <strong>Abuse Reports:</strong>{' '}
            <a href="mailto:abuse@devsignal.dev">abuse@devsignal.dev</a> — for suspected
            misuse, spam, scraping abuse, or unauthorized access incidents.
          </li>
          <li>
            <strong>Security Vulnerabilities:</strong>{' '}
            <a href="mailto:security@devsignal.dev">security@devsignal.dev</a> — for responsible
            disclosure of security issues. Please do not publicly disclose vulnerabilities before
            we have had an opportunity to address them.
          </li>
        </ul>
        <p>
          We investigate all reports and take appropriate action based on the severity of the
          violation. We may not be able to share the outcome of an investigation due to
          confidentiality obligations, but we take all reports seriously.
        </p>
        <p>
          Good-faith security research conducted in accordance with responsible disclosure
          principles will not be treated as an AUP violation, provided you do not access,
          modify, or exfiltrate actual user data during your research.
        </p>
      </>
    ),
  },
  {
    id: 'enforcement',
    title: '8. Enforcement',
    content: (
      <>
        <p>
          DevSignal enforces this AUP through a graduated response process, calibrated to the
          nature and severity of the violation:
        </p>
        <ul>
          <li>
            <strong>Warning:</strong> For first-time or minor violations, we will issue a written
            warning via email describing the violation and the corrective action required.
          </li>
          <li>
            <strong>Throttling:</strong> For violations involving excessive resource consumption
            or rate limit abuse, we may temporarily throttle your API access or signal ingestion
            without prior notice.
          </li>
          <li>
            <strong>Suspension:</strong> Repeated violations or moderate-severity incidents may
            result in temporary suspension of your account. Access will be restored after the
            violation is remediated and acknowledged.
          </li>
          <li>
            <strong>Termination:</strong> Severe violations — including unauthorized access
            attempts, deliberate data manipulation, distribution of malware, large-scale spam,
            or systematic circumvention of plan limits — may result in immediate and permanent
            termination of your account without prior warning or refund.
          </li>
          <li>
            <strong>Legal Action:</strong> Where violations constitute criminal activity or cause
            material harm to DevSignal or its users, we reserve the right to pursue civil remedies
            or refer matters to law enforcement.
          </li>
        </ul>
        <p>
          <strong>Appeals:</strong> If you believe an enforcement action was taken in error, you
          may appeal to{' '}
          <a href="mailto:legal@devsignal.dev">legal@devsignal.dev</a> within 14 days of the
          action. Include your account details and a description of why you believe the action was
          unwarranted. We will review appeals and respond within 10 business days.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '9. Contact',
    content: (
      <>
        <p>
          For any questions about this Acceptable Use Policy, or to report a suspected violation,
          please reach out through the appropriate channel below:
        </p>
        <ul>
          <li>
            <strong>Abuse &amp; Violations:</strong>{' '}
            <a href="mailto:abuse@devsignal.dev">abuse@devsignal.dev</a>
          </li>
          <li>
            <strong>Legal &amp; Appeals:</strong>{' '}
            <a href="mailto:legal@devsignal.dev">legal@devsignal.dev</a>
          </li>
          <li>
            <strong>Security Disclosures:</strong>{' '}
            <a href="mailto:security@devsignal.dev">security@devsignal.dev</a>
          </li>
          <li>
            <strong>Company:</strong> DevSignal, Inc.
          </li>
        </ul>
        <p>
          This AUP should be read alongside our{' '}
          <Link to="/terms" className="text-indigo-400 hover:text-indigo-300 underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-indigo-400 hover:text-indigo-300 underline">
            Privacy Policy
          </Link>
          , which together govern your use of the Service.
        </p>
      </>
    ),
  },
];

export default function AcceptableUse() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => { document.title = 'Acceptable Use Policy — DevSignal'; }, []);

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
            Acceptable Use Policy
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

      {/* Footer */}
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
        .legal-content .prose-legal ul ul {
          list-style-type: circle;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
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
          color: #e5e7eb;
          background: #1f2937;
          padding: 0.1rem 0.4rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
      `}</style>
    </div>
  );
}
