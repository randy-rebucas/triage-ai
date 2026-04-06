"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PatientError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[PatientError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
        <span className="text-3xl">⚠️</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-gray-500">
          An unexpected error occurred while loading this page.
          Please try again, and contact support if the problem persists.
        </p>
      </div>

      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
