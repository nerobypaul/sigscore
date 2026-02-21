import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('sigscore-cookie-consent');
    if (!consent) setVisible(true);
  }, []);

  const accept = (level: 'all' | 'essential') => {
    localStorage.setItem('sigscore-cookie-consent', level);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes cookieSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        .cookie-banner {
          animation: cookieSlideUp 0.35s ease-out forwards;
        }
      `}</style>

      <div
        className="cookie-banner fixed bottom-0 inset-x-0 z-50 bg-gray-800/95 backdrop-blur border-t border-gray-700"
        role="region"
        aria-label="Cookie consent"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <p className="flex-1 text-sm text-gray-300 leading-relaxed">
            We use essential cookies to keep you signed in and remember your preferences. No
            advertising or tracking cookies.{' '}
            <Link
              to="/cookies"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 whitespace-nowrap"
            >
              Cookie Policy
            </Link>
          </p>

          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => accept('essential')}
              className="px-4 py-2 text-sm font-medium rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              Essential Only
            </button>
            <button
              onClick={() => accept('all')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              Accept All
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
