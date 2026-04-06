export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🏥</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re offline</h1>
        <p className="text-gray-500 mb-6">
          Triage AI needs an internet connection. Please check your network and try again.
        </p>
        <a
          href="/"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
        >
          Retry
        </a>
      </div>
    </div>
  );
}

export const metadata = {
  title: "Offline — Triage AI",
};
