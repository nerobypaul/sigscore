import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  useEffect(() => { document.title = 'Page Not Found — Sigscore'; }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4 relative overflow-hidden">
      {/* Background visual — pulsing gradient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-indigo-900/15 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] bg-purple-900/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s', animationDuration: '3s' }}
        />
      </div>

      <div className="relative max-w-lg w-full text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <svg
            className="w-7 h-7 text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
            />
          </svg>
          <span className="text-lg font-bold text-white tracking-tight">Sigscore</span>
        </div>

        {/* 404 number — large with gradient text */}
        <div className="mb-6 select-none">
          <span className="text-[120px] sm:text-[160px] font-extrabold leading-none bg-gradient-to-b from-gray-300 to-gray-700 bg-clip-text text-transparent">
            404
          </span>
        </div>

        <h1 className="text-2xl font-semibold text-white mb-3">Page not found</h1>
        <p className="text-sm text-gray-400 leading-relaxed max-w-sm mx-auto mb-10">
          The page you are looking for does not exist, has been moved, or you may not have permission to view it.
        </p>

        {/* Navigation links */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
            Go to Dashboard
          </Link>
          <Link
            to="/developers"
            className="inline-flex items-center gap-2 bg-gray-800 text-gray-300 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-700 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
              />
            </svg>
            API Docs
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-400 px-5 py-2.5 rounded-lg text-sm font-semibold hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
