"use client";

import { useEffect } from "react";

// Segment error.tsx — rendered inside the root layout (no html/body allowed)
interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-2xl bg-white p-10 shadow-sm ring-1 ring-gray-200 max-w-md w-full">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-gray-500">
          An unexpected error occurred. Please try again.
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
    </div>
  );
}
