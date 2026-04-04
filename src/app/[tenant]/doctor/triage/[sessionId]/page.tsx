import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getTriageSession } from "@/services/triageService";
import { TriageReview } from "@/components/doctor/TriageReview";
import { Button } from "@/components/ui/Button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Triage Review" };

interface Props { params: Promise<{ tenant: string; sessionId: string }> }

export default async function DoctorTriageReviewPage({ params }: Props) {
  const { tenant, sessionId } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());

  let session;
  try {
    session = await getTriageSession(sessionId, payload.userId, payload.role, tenantId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href={`/${tenant}/doctor/dashboard`}>
          <Button variant="ghost" size="sm">← Dashboard</Button>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Triage Review</h1>
      </div>
      <TriageReview session={session} onValidated={() => {}} />
    </div>
  );
}
