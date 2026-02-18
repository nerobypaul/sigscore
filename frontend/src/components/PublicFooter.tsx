import { Link } from 'react-router-dom';

/**
 * Shared footer for all public-facing marketing & legal pages.
 * Consistent links: Home, Use Cases, Pricing, Developers, Changelog, Terms, Privacy, DPA, Cookies, Acceptable Use, Sign in.
 */
export default function PublicFooter() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-400">DevSignal</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
            <Link to="/" className="hover:text-gray-300 transition-colors">Home</Link>
            <Link to="/use-cases" className="hover:text-gray-300 transition-colors">Use Cases</Link>
            <Link to="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
            <Link to="/developers" className="hover:text-gray-300 transition-colors">Developers</Link>
            <Link to="/changelog" className="hover:text-gray-300 transition-colors">Changelog</Link>
            <Link to="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <Link to="/dpa" className="hover:text-gray-300 transition-colors">DPA</Link>
            <Link to="/cookies" className="hover:text-gray-300 transition-colors">Cookies</Link>
            <Link to="/acceptable-use" className="hover:text-gray-300 transition-colors">Acceptable Use</Link>
            <Link to="/login" className="hover:text-gray-300 transition-colors">Sign in</Link>
          </div>
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} DevSignal. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
