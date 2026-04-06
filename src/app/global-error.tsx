"use client";

import { useEffect } from "react";

// global-error.tsx — replaces the root layout on fatal errors.
// Must render its own <html> and <body>.
interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-8 text-center font-sans">
        <div className="rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 max-w-md w-full">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Application error</h1>
          <p className="mt-2 text-gray-500">
            A critical error occurred. Please reload the page.
          </p>
          {error.digest && (
            <p className="mt-1 text-xs text-gray-400 font-mono">Error ID: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
