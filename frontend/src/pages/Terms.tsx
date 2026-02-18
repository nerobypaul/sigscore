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
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: (
      <>
        <p>
          By accessing or using the DevSignal platform ("Service"), including our website, APIs,
          SDKs, and any related services, you agree to be bound by these Terms of Service ("Terms").
          If you do not agree to these Terms, you may not access or use the Service.
        </p>
        <p>
          These Terms constitute a legally binding agreement between you (whether personally or on
          behalf of an entity, "you") and DevSignal, Inc. ("DevSignal", "we", "us", or "our").
        </p>
        <p>
          By creating an account, you represent that you are at least 18 years old and have the
          legal authority to enter into these Terms. If you are using the Service on behalf of an
          organization, you represent that you have the authority to bind that organization to these
          Terms.
        </p>
      </>
    ),
  },
  {
    id: 'account-terms',
    title: '2. Account Terms',
    content: (
      <>
        <p>
          You must provide accurate, complete, and current information when creating an account.
          You are responsible for safeguarding the credentials used to access the Service and for
          all activities that occur under your account.
        </p>
        <ul>
          <li>You must not share your account credentials with any third party.</li>
          <li>
            You must notify us immediately at{' '}
            <a href="mailto:legal@devsignal.dev">legal@devsignal.dev</a> if you become aware of any
            unauthorized use of your account.
          </li>
          <li>
            You are responsible for maintaining the security of your API keys and access tokens.
            Treat them as you would a password.
          </li>
          <li>
            We reserve the right to suspend or terminate accounts that violate these Terms or
            remain inactive for an extended period.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'api-usage',
    title: '3. API Usage',
    content: (
      <>
        <p>
          DevSignal provides REST, GraphQL, and WebSocket APIs for programmatic access to the
          Service. Your use of our APIs is subject to the following conditions:
        </p>
        <ul>
          <li>
            <strong>Rate Limits:</strong> API requests are subject to rate limits as documented in
            our API documentation. Exceeding these limits may result in temporary or permanent
            throttling of your access.
          </li>
          <li>
            <strong>Authentication:</strong> All API requests must be authenticated using valid API
            keys or JWT tokens. Unauthorized access attempts will be logged and may result in
            account suspension.
          </li>
          <li>
            <strong>SDK Usage:</strong> Our official SDKs (@devsignal/node) are provided "as is".
            You may use them in your applications subject to these Terms.
          </li>
          <li>
            <strong>Webhook Delivery:</strong> Outbound webhook payloads are signed with HMAC-SHA256.
            You are responsible for verifying webhook signatures on your end.
          </li>
          <li>
            <strong>Data Accuracy:</strong> While we strive to provide accurate data through our
            APIs, we do not guarantee the completeness or accuracy of any data returned.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable Use',
    content: (
      <>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>
            Violate any applicable laws, regulations, or third-party rights, including intellectual
            property, privacy, or data protection laws.
          </li>
          <li>
            Scrape, crawl, or harvest data from the Service beyond what is permitted by your
            subscription plan and the API rate limits.
          </li>
          <li>
            Attempt to gain unauthorized access to the Service, other accounts, or systems
            connected to the Service.
          </li>
          <li>
            Transmit malware, viruses, or any other harmful code through the Service or its APIs.
          </li>
          <li>
            Use the Service to send unsolicited communications (spam) or engage in harassment.
          </li>
          <li>
            Interfere with or disrupt the integrity or performance of the Service, including
            denial-of-service attacks.
          </li>
          <li>
            Reverse engineer, decompile, or disassemble any aspect of the Service, except to the
            extent permitted by applicable law.
          </li>
          <li>
            Resell, sublicense, or redistribute access to the Service without our prior written
            consent.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-processing',
    title: '5. Data Processing',
    content: (
      <>
        <p>
          DevSignal processes data from publicly available sources (such as GitHub repositories,
          npm registries, and community forums) as well as data you explicitly provide through
          our APIs, SDKs, and integrations.
        </p>
        <ul>
          <li>
            <strong>Public Data:</strong> We collect and process publicly available developer
            signals, including GitHub activity, npm download statistics, and public forum
            participation. This data is used to generate account intelligence and scoring.
          </li>
          <li>
            <strong>Customer Data:</strong> Data you import or send through our integrations
            (HubSpot, Salesforce, Segment, etc.) remains your property. We process it solely to
            provide the Service.
          </li>
          <li>
            <strong>Data Retention:</strong> We retain your data for the duration of your
            subscription plus 30 days after account deletion to allow for recovery. After this
            period, data is permanently deleted.
          </li>
          <li>
            <strong>Data Portability:</strong> You may export your data at any time using our
            bulk export APIs or CSV export features.
          </li>
        </ul>
        <p>
          For details on how we handle personal information, please refer to our{' '}
          <Link to="/privacy" className="text-indigo-400 hover:text-indigo-300 underline">
            Privacy Policy
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: 'billing',
    title: '6. Billing & Payment',
    content: (
      <>
        <p>
          DevSignal offers both free and paid subscription plans. The current pricing is available
          on our{' '}
          <Link to="/pricing" className="text-indigo-400 hover:text-indigo-300 underline">
            Pricing page
          </Link>
          .
        </p>
        <ul>
          <li>
            <strong>Free Tier:</strong> The free plan includes limited contacts and signals per
            month as described on the pricing page. No credit card is required.
          </li>
          <li>
            <strong>Paid Plans:</strong> Paid subscriptions are billed monthly or annually in
            advance. All fees are non-refundable except as required by law.
          </li>
          <li>
            <strong>Upgrades & Downgrades:</strong> Plan changes take effect at the start of the
            next billing cycle. Downgrades may result in loss of access to features or data
            exceeding the lower plan's limits.
          </li>
          <li>
            <strong>Overages:</strong> If you exceed your plan's contact or signal limits, we will
            notify you and may throttle ingestion until you upgrade or the next billing cycle.
          </li>
          <li>
            <strong>Payment Processing:</strong> Payments are processed securely through Stripe.
            We do not store your full credit card information on our servers.
          </li>
          <li>
            <strong>Taxes:</strong> Prices do not include applicable taxes. You are responsible for
            any sales tax, VAT, or other taxes applicable to your jurisdiction.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    title: '7. Intellectual Property',
    content: (
      <>
        <p>
          The Service, including its original content, features, and functionality, is and will
          remain the exclusive property of DevSignal and its licensors. The Service is protected
          by copyright, trademark, and other laws.
        </p>
        <ul>
          <li>
            <strong>Our IP:</strong> DevSignal, the DevSignal logo, PQA scoring methodology, and
            all related names, logos, and slogans are trademarks of DevSignal, Inc. You may not
            use these marks without our prior written permission.
          </li>
          <li>
            <strong>Your Data:</strong> You retain all rights to the data you upload to or create
            within the Service. By using the Service, you grant us a limited license to process
            your data solely for the purpose of providing the Service.
          </li>
          <li>
            <strong>Feedback:</strong> If you provide us with feedback, suggestions, or
            improvements, you grant us a perpetual, royalty-free license to use and incorporate
            such feedback into the Service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'liability',
    title: '8. Limitation of Liability',
    content: (
      <>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, DEVSIGNAL SHALL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO
          LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE
          OF THE SERVICE.
        </p>
        <p>
          IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID TO US DURING THE TWELVE
          (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR ONE HUNDRED
          DOLLARS ($100), WHICHEVER IS GREATER.
        </p>
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
          WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>
        <p>
          We do not warrant that the Service will be uninterrupted, error-free, or secure, or that
          any defects will be corrected. You use the Service at your own risk.
        </p>
      </>
    ),
  },
  {
    id: 'indemnification',
    title: '9. Indemnification',
    content: (
      <>
        <p>
          You agree to indemnify, defend, and hold harmless DevSignal, its officers, directors,
          employees, agents, and affiliates from and against any claims, liabilities, damages, losses,
          costs, and expenses (including reasonable attorneys' fees) arising out of or relating to:
        </p>
        <ul>
          <li>Your use of the Service in violation of these Terms.</li>
          <li>Your violation of any applicable law, regulation, or third-party right.</li>
          <li>
            Any data or content you submit to the Service, including any claim that such data
            infringes or misappropriates the intellectual property rights of a third party.
          </li>
          <li>Your negligence or willful misconduct.</li>
        </ul>
        <p>
          DevSignal will promptly notify you of any such claim and will reasonably cooperate with
          you (at your expense) in the defense of such claim. DevSignal reserves the right, at its
          own expense, to assume the exclusive defense and control of any matter subject to
          indemnification by you.
        </p>
      </>
    ),
  },
  {
    id: 'termination',
    title: '10. Termination',
    content: (
      <>
        <p>
          Either party may terminate this agreement at any time. You may close your account
          through the account settings or by contacting us at{' '}
          <a href="mailto:legal@devsignal.dev">legal@devsignal.dev</a>.
        </p>
        <ul>
          <li>
            <strong>By You:</strong> You may cancel your subscription at any time. Cancellation
            takes effect at the end of the current billing period. No refunds will be issued for
            partial periods.
          </li>
          <li>
            <strong>By Us:</strong> We may suspend or terminate your account immediately if you
            breach these Terms, engage in fraudulent activity, or if continued provision of the
            Service becomes impractical due to legal or regulatory requirements.
          </li>
          <li>
            <strong>Effect of Termination:</strong> Upon termination, your right to use the
            Service ceases immediately. We will retain your data for 30 days after termination,
            during which you may request an export. After 30 days, all data will be permanently
            deleted.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'modifications',
    title: '11. Modifications to Terms',
    content: (
      <>
        <p>
          We reserve the right to modify these Terms at any time. When we make material changes,
          we will:
        </p>
        <ul>
          <li>Update the "Last updated" date at the top of this page.</li>
          <li>
            Send an email notification to the address associated with your account at least 30
            days before the changes take effect.
          </li>
          <li>
            Display a prominent notice within the Service for existing users.
          </li>
        </ul>
        <p>
          Your continued use of the Service after the effective date of any modifications
          constitutes your acceptance of the updated Terms. If you do not agree to the updated
          Terms, you must stop using the Service and close your account.
        </p>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: '12. Governing Law',
    content: (
      <>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the State
          of Delaware, United States, without regard to its conflict of law provisions.
        </p>
        <p>
          Any dispute arising from or relating to these Terms or the Service shall be resolved
          exclusively in the federal or state courts located in Delaware. You consent to the
          personal jurisdiction of such courts.
        </p>
        <p>
          Notwithstanding the foregoing, either party may seek injunctive or equitable relief in
          any court of competent jurisdiction to protect its intellectual property rights.
        </p>
      </>
    ),
  },
  {
    id: 'force-majeure',
    title: '13. Force Majeure',
    content: (
      <>
        <p>
          Neither party shall be liable for any failure or delay in performing its obligations under
          these Terms where such failure or delay results from circumstances beyond the reasonable
          control of that party, including but not limited to:
        </p>
        <ul>
          <li>Natural disasters, epidemics, or pandemics.</li>
          <li>War, terrorism, riots, or civil unrest.</li>
          <li>
            Government actions, sanctions, embargoes, or regulatory changes.
          </li>
          <li>
            Internet or telecommunications failures, cyberattacks, or denial-of-service attacks.
          </li>
          <li>
            Third-party service provider outages (including cloud hosting, payment processors, or
            API providers).
          </li>
        </ul>
        <p>
          The affected party shall promptly notify the other party of the force majeure event and
          shall use reasonable efforts to mitigate its effects. If a force majeure event continues
          for more than 60 days, either party may terminate these Terms upon written notice.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '14. Contact',
    content: (
      <>
        <p>If you have questions about these Terms of Service, please contact us at:</p>
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

export default function Terms() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => { document.title = 'Terms of Service — DevSignal'; }, []);

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
            Terms of Service
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
