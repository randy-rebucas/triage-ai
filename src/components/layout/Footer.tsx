// ─────────────────────────────────────────────────────────────────
// Footer — app-wide patient footer
// ─────────────────────────────────────────────────────────────────

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-2 text-center">

          {/* Copyright */}
          <p className="text-xs text-gray-400">
            &copy; {year} Triage AI. All rights reserved.
          </p>

          {/* Powered by */}
          <p className="text-xs text-gray-400">
            Powered by{" "}
            <a
              href="https://devcomdigital.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:underline"
            >
              DevCom Digital Marketing Services
            </a>
          </p>

          {/* Social links */}
          <div className="flex items-center gap-5 mt-1">
            {/* Facebook */}
            <a
              href="https://www.facebook.com/DevComDMS"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="DevCom on Facebook"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987H7.898V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/>
              </svg>
              Facebook
            </a>

            {/* Divider dot */}
            <span className="text-gray-300" aria-hidden="true">·</span>

            {/* LinkedIn */}
            <a
              href="https://www.linkedin.com/company/devcom-digital-marketing-services/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="DevCom on LinkedIn"
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              LinkedIn
            </a>
          </div>

        </div>
      </div>
    </footer>
  );
}
