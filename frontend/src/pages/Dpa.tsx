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
    id: 'definitions',
    title: '1. Definitions',
    content: (
      <>
        <p>
          The following capitalized terms have the meanings set forth below. Terms not defined here
          carry the meanings given in the GDPR or in the DevSignal Terms of Service.
        </p>
        <ul>
          <li>
            <strong>"Data Controller"</strong> means the natural or legal person, public authority,
            agency, or other body which, alone or jointly with others, determines the purposes and
            means of the processing of Personal Data. In the context of this DPA, the Customer is
            the Data Controller.
          </li>
          <li>
            <strong>"Data Processor"</strong> means a natural or legal person, public authority,
            agency, or other body which processes Personal Data on behalf of the Data Controller.
            In the context of this DPA, DevSignal is the Data Processor.
          </li>
          <li>
            <strong>"Personal Data"</strong> means any information relating to an identified or
            identifiable natural person ("Data Subject"), as defined in GDPR Article 4(1), that
            Customer submits to the Service or that DevSignal processes on behalf of Customer.
          </li>
          <li>
            <strong>"Processing"</strong> means any operation or set of operations which is
            performed on Personal Data, whether or not by automated means, including collection,
            recording, organisation, structuring, storage, adaptation or alteration, retrieval,
            consultation, use, disclosure by transmission, dissemination or otherwise making
            available, alignment or combination, restriction, erasure, or destruction (GDPR Art.
            4(2)).
          </li>
          <li>
            <strong>"Sub-processors"</strong> means any third-party data processor engaged by
            DevSignal to assist in fulfilling its obligations with respect to the Service.
          </li>
          <li>
            <strong>"Data Subject"</strong> means an identified or identifiable natural person
            whose Personal Data is processed under this DPA, including Customer's end users,
            contacts, and leads.
          </li>
          <li>
            <strong>"GDPR"</strong> means Regulation (EU) 2016/679 of the European Parliament and
            of the Council of 27 April 2016 on the protection of natural persons with regard to the
            processing of personal data and on the free movement of such data (General Data
            Protection Regulation), and where applicable the UK GDPR as retained in UK law.
          </li>
          <li>
            <strong>"SCCs"</strong> means the Standard Contractual Clauses for the transfer of
            personal data to third countries as approved by the European Commission under Decision
            2021/914, or any successor instrument.
          </li>
          <li>
            <strong>"Service"</strong> means the DevSignal developer signal intelligence platform,
            APIs, SDKs, and related services as described in the DevSignal Terms of Service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'scope-purpose',
    title: '2. Scope & Purpose',
    content: (
      <>
        <p>
          This Data Processing Agreement ("DPA") is entered into between DevSignal, Inc.
          ("DevSignal", "Processor") and the Customer ("Controller") and forms part of the
          DevSignal Terms of Service. This DPA governs the processing of Personal Data by DevSignal
          on behalf of Customer in connection with the Service.
        </p>
        <p>
          <strong>Role Allocation:</strong> The parties agree that with respect to Personal Data
          processed under the Service:
        </p>
        <ul>
          <li>
            <strong>Customer is the Data Controller:</strong> Customer determines the purposes and
            means of processing Personal Data submitted to the Service, including which developer
            contacts and signals to track, enrich, and analyze.
          </li>
          <li>
            <strong>DevSignal is the Data Processor:</strong> DevSignal processes Personal Data
            only on behalf of and under the documented instructions of the Customer, solely for
            the purpose of providing the Service.
          </li>
        </ul>
        <p>
          DevSignal will not process Personal Data for any purpose other than those specified in
          this DPA and the Terms of Service, unless required to do so by applicable law. In such
          cases, DevSignal will inform Customer of the legal requirement prior to processing, unless
          the law prohibits such disclosure.
        </p>
        <p>
          This DPA applies to the extent that DevSignal processes Personal Data that is subject to
          the GDPR, the UK GDPR, the California Consumer Privacy Act (CCPA), or other applicable
          data protection laws.
        </p>
      </>
    ),
  },
  {
    id: 'processing-details',
    title: '3. Data Processing Details',
    content: (
      <>
        <p>
          The following describes the nature and purpose of the Personal Data processing carried
          out by DevSignal under this DPA.
        </p>
        <p>
          <strong>Nature and Purpose of Processing:</strong> DevSignal processes Personal Data to
          provide the Service, including ingesting developer signals, scoring and enriching contact
          and company profiles, generating AI-powered account briefs, delivering notifications, and
          facilitating CRM workflows. Processing includes collection, storage, analysis,
          enrichment, and transmission of data as directed by the Customer.
        </p>
        <p>
          <strong>Categories of Personal Data Processed:</strong>
        </p>
        <ul>
          <li>
            <strong>Contact and Identity Information:</strong> Names, email addresses, usernames
            (GitHub, npm, etc.), LinkedIn profiles, and other identifiers associated with
            developer contacts and leads.
          </li>
          <li>
            <strong>Company and Firmographic Data:</strong> Organization names, company size,
            industry, location, website, funding stage, and technology stack, sourced from
            Customer imports, third-party enrichment (Clearbit), and public sources.
          </li>
          <li>
            <strong>Developer Signal Data:</strong> GitHub activity (stars, forks, commits, pull
            requests, issues), npm and PyPI download statistics, Stack Overflow activity, Reddit
            and Discord participation, Twitter/X mentions, and signals received via Customer's
            Segment, PostHog, HubSpot, Salesforce, Intercom, or Zendesk integrations.
          </li>
          <li>
            <strong>Usage Analytics:</strong> End-user interaction data submitted through the
            DevSignal SDK or Segment integration, including feature usage events and product
            engagement metrics.
          </li>
          <li>
            <strong>Communication Data:</strong> Email addresses used for transactional
            communications and notification delivery.
          </li>
        </ul>
        <p>
          <strong>Data Subjects:</strong> The Personal Data processed relates to Customer's end
          users, developer contacts, leads, accounts, and any other natural persons whose data
          Customer submits to or integrates with the Service.
        </p>
        <p>
          <strong>Duration of Processing:</strong> DevSignal will process Personal Data for the
          duration of the Service subscription term. Upon expiry or termination of the agreement,
          DevSignal will cease processing and will delete or return Personal Data as described in
          Section 10 (Term and Termination).
        </p>
      </>
    ),
  },
  {
    id: 'processor-obligations',
    title: '4. Obligations of the Processor',
    content: (
      <>
        <p>
          DevSignal agrees to the following obligations in its capacity as Data Processor, in
          accordance with GDPR Article 28:
        </p>
        <ul>
          <li>
            <strong>Process Only on Documented Instructions:</strong> DevSignal will process
            Personal Data only on documented instructions from Customer, including with regard to
            transfers of Personal Data to a third country or international organisation, unless
            required to do so by applicable law (GDPR Art. 28(3)(a)).
          </li>
          <li>
            <strong>Confidentiality:</strong> DevSignal will ensure that persons authorised to
            process Personal Data have committed themselves to confidentiality or are under an
            appropriate statutory obligation of confidentiality (GDPR Art. 28(3)(b)).
          </li>
          <li>
            <strong>Security Measures:</strong> DevSignal will implement appropriate technical and
            organisational measures to ensure a level of security appropriate to the risk, as
            described in Section 7 of this DPA (GDPR Art. 28(3)(c), Art. 32).
          </li>
          <li>
            <strong>Sub-processor Controls:</strong> DevSignal will not engage a Sub-processor
            without Customer's prior general written authorisation. DevSignal will impose data
            protection obligations on any Sub-processor, at least equivalent to those set out in
            this DPA, and will remain fully liable to Customer for any failure by Sub-processors to
            fulfil their data protection obligations (GDPR Art. 28(2), Art. 28(4)).
          </li>
          <li>
            <strong>Assistance with Data Subject Rights:</strong> Taking into account the nature of
            the processing, DevSignal will assist Customer by appropriate technical and
            organisational measures, insofar as possible, to fulfil Customer's obligation to
            respond to requests for exercising Data Subject rights under Chapter III of the GDPR
            (GDPR Art. 28(3)(e)).
          </li>
          <li>
            <strong>Assistance with Compliance Obligations:</strong> DevSignal will assist Customer
            in ensuring compliance with obligations under GDPR Articles 32 through 36 (security,
            breach notification, data protection impact assessments, and prior consultation), taking
            into account the nature of processing and the information available to DevSignal
            (GDPR Art. 28(3)(f)).
          </li>
          <li>
            <strong>Deletion or Return of Data:</strong> At Customer's choice, DevSignal will
            delete or return all Personal Data upon termination of the service agreement, and
            delete existing copies unless applicable law requires storage of the Personal Data
            (GDPR Art. 28(3)(g)).
          </li>
          <li>
            <strong>Audit Cooperation:</strong> DevSignal will make available to Customer all
            information necessary to demonstrate compliance with the obligations laid down in GDPR
            Article 28, and will allow for and contribute to audits, including inspections,
            conducted by Customer or an auditor mandated by Customer. DevSignal will inform
            Customer if, in its opinion, any instruction infringes GDPR or applicable data
            protection law (GDPR Art. 28(3)(h)).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'sub-processors',
    title: '5. Sub-processors',
    content: (
      <>
        <p>
          Customer provides general authorisation for DevSignal to engage the following
          Sub-processors in connection with the Service. DevSignal will ensure that each
          Sub-processor is bound by data protection obligations at least equivalent to those
          set out in this DPA.
        </p>
        <p><strong>Current Approved Sub-processors:</strong></p>
        <ul>
          <li>
            <strong>Railway / Cloud Hosting Provider</strong> — Infrastructure and hosting for
            the PostgreSQL database. Processes all Customer data stored in the Service.
            Location: United States.
          </li>
          <li>
            <strong>Railway / Redis</strong> — In-memory data store used for job queuing,
            caching, and real-time features. Processes transient Customer data.
            Location: United States.
          </li>
          <li>
            <strong>Stripe, Inc.</strong> — Payment processing and subscription management.
            Processes billing information associated with Customer's account. Personal Data
            processed: billing contact name, email, and payment method details.
            Location: United States.{' '}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
              Stripe Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Resend, Inc.</strong> — Transactional email delivery. Processes email
            addresses and message content for service notifications, alerts, and account
            communications. Location: United States.
          </li>
          <li>
            <strong>Sentry (Functional Software, Inc.)</strong> — Application error monitoring
            and performance tracking. May process IP addresses, browser/device identifiers,
            and stack trace information. Location: United States.{' '}
            <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">
              Sentry Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Anthropic, PBC (Claude API)</strong> — AI-powered account brief generation,
            contact enrichment, and next-best-action recommendations. Customer data submitted
            to the AI model is not used for model training or improvement. Location: United
            States.{' '}
            <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer">
              Anthropic Privacy Policy
            </a>
            .
          </li>
        </ul>
        <p>
          <strong>Changes to Sub-processors:</strong> DevSignal will notify Customer of any
          intended addition or replacement of Sub-processors at least <strong>30 days</strong>{' '}
          in advance by sending an email to the Customer's registered account email address and
          by updating this page. Customer may object to the change within 14 days of notice. If
          Customer objects and the parties cannot resolve the objection in good faith, Customer
          may terminate the Service without penalty.
        </p>
        <p>
          The current Sub-processor list is maintained at{' '}
          <a href="https://devsignal.dev/dpa">devsignal.dev/dpa</a> and updated whenever changes
          are made.
        </p>
      </>
    ),
  },
  {
    id: 'data-transfers',
    title: '6. International Data Transfers',
    content: (
      <>
        <p>
          Customer acknowledges that the Service is operated from the United States. Personal Data
          submitted to the Service may be transferred to, stored, and processed in the United
          States or other countries where DevSignal and its Sub-processors maintain operations.
        </p>
        <p>
          <strong>Transfers from the EEA, UK, or Switzerland:</strong> Where Personal Data
          originating from the European Economic Area (EEA), the United Kingdom, or Switzerland
          is transferred to the United States or another country not deemed by the European
          Commission to provide an adequate level of data protection, such transfers are made
          subject to appropriate safeguards, as follows:
        </p>
        <ul>
          <li>
            <strong>Standard Contractual Clauses (SCCs):</strong> DevSignal relies on the
            Standard Contractual Clauses adopted by the European Commission under Decision
            2021/914 (Module Two: Controller-to-Processor) as the primary transfer mechanism for
            transfers of Personal Data from the EEA to the United States. For UK transfers,
            DevSignal relies on the UK International Data Transfer Agreement (IDTA) or the
            UK Addendum to the EU SCCs. To receive a signed copy of the applicable SCCs, contact{' '}
            <a href="mailto:dpa@devsignal.dev">dpa@devsignal.dev</a>.
          </li>
          <li>
            <strong>Schrems II Compliance:</strong> DevSignal has conducted a Transfer Impact
            Assessment (TIA) to assess the laws and practices of the United States and has
            implemented supplementary technical measures (including encryption in transit and
            at rest) to ensure that Personal Data transferred under the SCCs is afforded a
            level of protection essentially equivalent to that guaranteed within the EEA.
          </li>
          <li>
            <strong>Sub-processor Transfers:</strong> DevSignal requires all Sub-processors to
            implement appropriate transfer mechanisms for any onward transfers of Personal Data
            outside the EEA or UK, consistent with the requirements of Chapter V of the GDPR.
          </li>
        </ul>
        <p>
          If the European Commission, the UK ICO, or a competent supervisory authority invalidates
          a transfer mechanism relied upon by DevSignal, DevSignal will promptly notify Customer
          and will cooperate in good faith to implement an alternative compliant transfer mechanism
          with minimum disruption to the Service.
        </p>
      </>
    ),
  },
  {
    id: 'security-measures',
    title: '7. Security Measures',
    content: (
      <>
        <p>
          DevSignal implements appropriate technical and organisational security measures
          to protect Personal Data against accidental or unlawful destruction, loss,
          alteration, unauthorised disclosure, or access, in accordance with GDPR Article 32.
          The following measures are currently in place:
        </p>
        <p><strong>Technical Measures:</strong></p>
        <ul>
          <li>
            <strong>Encryption in Transit:</strong> All data transmitted between clients and
            DevSignal servers is encrypted using TLS 1.2 or higher. Webhook payloads are
            signed using HMAC-SHA256 for integrity verification.
          </li>
          <li>
            <strong>Encryption at Rest:</strong> Database storage is encrypted at rest using
            AES-256. Redis instances use encryption for sensitive cached data.
          </li>
          <li>
            <strong>Access Controls (RBAC):</strong> Role-based access control ensures users
            can only access data within their own organisation. Multi-tenancy is enforced at the
            database query level through mandatory <code>organizationId</code> scoping on all
            data operations.
          </li>
          <li>
            <strong>Authentication Security:</strong> Passwords are hashed using bcrypt with
            appropriate cost factors. API keys are generated using cryptographically secure
            random number generators. Session tokens (JWT) are short-lived with refresh token
            rotation.
          </li>
          <li>
            <strong>Rate Limiting:</strong> API endpoints are protected by multi-tier rate
            limiting to prevent abuse, brute force attacks, and denial-of-service conditions.
          </li>
          <li>
            <strong>Audit Logging:</strong> All sensitive operations (authentication events,
            data exports, API key management, admin actions) are recorded in an immutable
            audit log retained for 12 months.
          </li>
          <li>
            <strong>Enterprise SSO:</strong> SAML 2.0 and OIDC (PKCE) single sign-on
            integration is available for enterprise customers, enabling centralised
            authentication and session management through existing identity providers.
          </li>
        </ul>
        <p><strong>Organisational Measures:</strong></p>
        <ul>
          <li>
            DevSignal personnel with access to Customer Personal Data are subject to
            confidentiality obligations and receive training on data protection requirements.
          </li>
          <li>
            Access to production systems containing Personal Data is restricted to
            authorised personnel on a least-privilege basis and reviewed periodically.
          </li>
          <li>
            DevSignal conducts regular security reviews and vulnerability assessments of
            the infrastructure and codebase.
          </li>
          <li>
            Incident response procedures are in place to detect, respond to, and recover
            from security incidents promptly.
          </li>
        </ul>
        <p>
          The security measures described above represent a minimum baseline. DevSignal may
          implement additional or updated measures over time to address evolving threats, provided
          that such updates do not materially reduce the overall level of protection.
        </p>
      </>
    ),
  },
  {
    id: 'breach-notification',
    title: '8. Breach Notification',
    content: (
      <>
        <p>
          DevSignal maintains incident response procedures to detect, investigate, and respond to
          Personal Data breaches. In the event of a confirmed Personal Data breach affecting
          Customer's data, DevSignal will:
        </p>
        <ul>
          <li>
            <strong>Notify Customer Without Undue Delay:</strong> DevSignal will notify Customer
            of a confirmed Personal Data breach within <strong>72 hours</strong> of becoming
            aware of the breach, in accordance with GDPR Article 33. Notification will be sent
            to the Customer's registered account email address and, where available, to the
            designated security contact.
          </li>
          <li>
            <strong>Provide Required Information:</strong> The breach notification will include,
            to the extent available at the time of notification:
            <ul>
              <li>
                The nature of the Personal Data breach, including where possible the categories
                and approximate number of Data Subjects concerned and the categories and
                approximate number of Personal Data records concerned (GDPR Art. 33(3)(a)).
              </li>
              <li>
                The name and contact details of the Data Protection contact or other point of
                contact where more information can be obtained (GDPR Art. 33(3)(b)).
              </li>
              <li>
                The likely consequences of the Personal Data breach (GDPR Art. 33(3)(c)).
              </li>
              <li>
                The measures taken or proposed to be taken by DevSignal to address the Personal
                Data breach, including, where appropriate, measures to mitigate its possible
                adverse effects (GDPR Art. 33(3)(d)).
              </li>
            </ul>
          </li>
          <li>
            <strong>Phased Notification:</strong> Where all required information is not available
            at the time of the initial notification, DevSignal will provide information in phases
            as it becomes available, without undue further delay.
          </li>
          <li>
            <strong>Take Immediate Remedial Action:</strong> DevSignal will take all reasonable
            steps to contain the breach, mitigate its impact, and prevent recurrence, including
            isolating affected systems, revoking compromised credentials, and patching
            vulnerabilities.
          </li>
          <li>
            <strong>Assist with Regulatory Notifications:</strong> DevSignal will provide
            Customer with reasonable assistance in meeting Customer's own notification
            obligations to supervisory authorities and to affected Data Subjects under GDPR
            Articles 33 and 34.
          </li>
        </ul>
        <p>
          To report a suspected security incident, contact{' '}
          <a href="mailto:security@devsignal.dev">security@devsignal.dev</a>.
        </p>
      </>
    ),
  },
  {
    id: 'data-subject-rights',
    title: '9. Data Subject Rights',
    content: (
      <>
        <p>
          DevSignal will assist Customer in fulfilling its obligations to respond to Data Subject
          rights requests under Chapter III of the GDPR, including the following rights, taking
          into account the nature of the processing and the information available to DevSignal:
        </p>
        <ul>
          <li>
            <strong>Right of Access (Art. 15):</strong> DevSignal will provide Customer with
            copies of the Personal Data it processes on behalf of Customer upon request, in a
            commonly used machine-readable format, to allow Customer to fulfil Data Subject
            access requests.
          </li>
          <li>
            <strong>Right to Rectification (Art. 16):</strong> DevSignal will update or correct
            Personal Data upon receiving documented instructions from Customer, within the
            timeframes specified below.
          </li>
          <li>
            <strong>Right to Erasure / Right to be Forgotten (Art. 17):</strong> DevSignal will
            delete specified Personal Data upon receiving documented instructions from Customer,
            subject to any legal retention obligations or technical limitations (e.g., encrypted
            backups that will be purged on their normal retention schedule).
          </li>
          <li>
            <strong>Right to Restriction of Processing (Art. 18):</strong> DevSignal will
            restrict the processing of identified Personal Data upon receiving documented
            instructions from Customer, and will not process restricted data beyond storage
            until the restriction is lifted.
          </li>
          <li>
            <strong>Right to Data Portability (Art. 20):</strong> DevSignal will provide
            Customer with an export of Personal Data in a structured, commonly used,
            machine-readable format (JSON or CSV) upon request. Customers may also use
            DevSignal's built-in bulk export APIs at any time.
          </li>
          <li>
            <strong>Right to Object (Art. 21):</strong> DevSignal will assist Customer in
            implementing objections to specific processing activities upon receiving documented
            instructions.
          </li>
        </ul>
        <p>
          DevSignal will use commercially reasonable efforts to respond to, and fulfill, data
          subject rights requests forwarded by Customer within <strong>30 days</strong> of
          receiving Customer's documented instruction. Where a request is particularly complex
          or numerous, this period may be extended by a further 30 days with prior notice and
          explanation to Customer.
        </p>
        <p>
          To submit a Data Subject rights request or instruction, contact{' '}
          <a href="mailto:dpa@devsignal.dev">dpa@devsignal.dev</a> with the subject line
          "Data Subject Rights Request."
        </p>
      </>
    ),
  },
  {
    id: 'term-termination',
    title: '10. Term & Termination',
    content: (
      <>
        <p>
          <strong>Effective Date:</strong> This DPA is effective from the date Customer first
          accepts the DevSignal Terms of Service and remains in force for the duration of the
          Service subscription.
        </p>
        <p>
          <strong>Termination:</strong> This DPA terminates automatically upon expiry or
          termination of the DevSignal Terms of Service for any reason.
        </p>
        <p>
          <strong>Obligations upon Termination:</strong> Upon expiry or termination of the
          Service, DevSignal will, at Customer's election:
        </p>
        <ul>
          <li>
            <strong>Delete Personal Data:</strong> Securely delete all Personal Data processed
            under this DPA within <strong>30 days</strong> following the termination date,
            including deleting existing copies held by DevSignal and instructing Sub-processors
            to do the same. DevSignal will provide written confirmation of deletion upon request.
          </li>
          <li>
            <strong>Return Personal Data:</strong> Provide Customer with a complete export of all
            Personal Data in a machine-readable format (JSON or CSV) within 30 days of the
            termination date, after which DevSignal will delete its copies.
          </li>
        </ul>
        <p>
          <strong>Legal Retention Exceptions:</strong> DevSignal may retain certain Personal
          Data beyond the 30-day deletion period to the extent and for the period required by
          applicable law (for example, billing records required for tax compliance, or data
          subject to a legal hold). DevSignal will notify Customer of any such retention and
          will continue to protect retained data in accordance with this DPA.
        </p>
        <p>
          <strong>Survival:</strong> Obligations under this DPA that by their nature should
          survive termination (including confidentiality, security, and data deletion/return
          obligations) shall survive expiry or termination.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '11. Contact & DPA Execution',
    content: (
      <>
        <p>
          This DPA is incorporated by reference into the DevSignal Terms of Service and applies
          automatically to all Customers who use the Service. No separate written signature is
          required for the DPA to take effect.
        </p>
        <p>
          Enterprise Customers requiring a countersigned DPA for their legal or procurement
          processes may request a signed copy by contacting us. DevSignal will endeavour to
          respond within 5 business days.
        </p>
        <p>
          <strong>Data Protection Contact:</strong>
        </p>
        <ul>
          <li>
            <strong>DPA and Data Subject Rights:</strong>{' '}
            <a href="mailto:dpa@devsignal.dev">dpa@devsignal.dev</a>
          </li>
          <li>
            <strong>Legal and Compliance:</strong>{' '}
            <a href="mailto:legal@devsignal.dev">legal@devsignal.dev</a>
          </li>
          <li>
            <strong>Security Incidents:</strong>{' '}
            <a href="mailto:security@devsignal.dev">security@devsignal.dev</a>
          </li>
          <li>
            <strong>Company:</strong> DevSignal, Inc.
          </li>
        </ul>
        <p>
          For questions about the GDPR, or to exercise your rights as a Data Subject, you may
          also contact the supervisory authority in your EU member state or the UK Information
          Commissioner's Office (ICO).
        </p>
      </>
    ),
  },
];

export default function Dpa() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => { document.title = 'Data Processing Agreement — DevSignal'; }, []);

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
            Data Processing Agreement
          </h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-gray-400 max-w-3xl">
            This Data Processing Agreement ("DPA") governs how DevSignal processes personal data
            on behalf of customers in its capacity as a Data Processor under the GDPR and other
            applicable data protection laws. It applies automatically to all customers and
            supplements the DevSignal{' '}
            <a href="/terms" className="text-indigo-400 hover:text-indigo-300 underline">
              Terms of Service
            </a>
            {' '}and{' '}
            <a href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline">
              Privacy Policy
            </a>
            .
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
        .legal-content .prose-legal ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .legal-content .prose-legal ul ul {
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
          font-family: ui-monospace, monospace;
          font-size: 0.875em;
          color: #c084fc;
          background-color: #1f2937;
          padding: 0.1em 0.35em;
          border-radius: 0.25rem;
        }
      `}</style>
    </div>
  );
}
