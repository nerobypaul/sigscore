import { useEffect } from 'react';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export default function Impressum() {
  useEffect(() => { document.title = 'Legal Notice (Impressum) — Sigscore'; }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      {/* Navigation */}
      <PublicNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Legal Notice (Impressum)
          </h1>
        </div>

        {/* Content */}
        <main className="max-w-3xl legal-content">
          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">
              Information pursuant to Section 5 DDG (Digitale-Dienste-Gesetz)
            </h2>
            <div className="prose-legal">
              <p>
                Sigscore<br />
                Paul Nispel<br />
                [Address to be updated]
              </p>
            </div>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">Contact</h2>
            <div className="prose-legal">
              <p>
                Email: <a href="mailto:legal@sigscore.dev">legal@sigscore.dev</a>
              </p>
            </div>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">
              Responsible for content pursuant to Section 18 para. 2 MStV
            </h2>
            <div className="prose-legal">
              <p>Paul Nispel</p>
            </div>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">
              EU Online Dispute Resolution
            </h2>
            <div className="prose-legal">
              <p>
                The European Commission provides a platform for online dispute resolution
                (ODR):{' '}
                <a
                  href="https://ec.europa.eu/consumers/odr/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://ec.europa.eu/consumers/odr/
                </a>
              </p>
              <p>
                We are not willing or obliged to participate in dispute resolution proceedings
                before a consumer arbitration board.
              </p>
            </div>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4">VAT ID</h2>
            <div className="prose-legal">
              <p>
                VAT identification number pursuant to Section 27a UStG: [To be added upon
                registration]
              </p>
            </div>
          </section>
        </main>
      </div>

      {/* Footer */}
      <PublicFooter />

      <style>{`
        .legal-content .prose-legal p {
          color: #9ca3af;
          line-height: 1.75;
          margin-bottom: 1rem;
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
