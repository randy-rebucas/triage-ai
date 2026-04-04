import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { getTenantId } from "@/lib/tenant";
import { getAllPatients } from "@/services/patientService";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Metadata } from "next";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Patients" };

interface Props {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function DoctorPatientsPage({ params, searchParams }: Props) {
  const { tenant } = await params;
  const { page: pageParam, search } = await searchParams;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());
  if (!token) redirect(`/${tenant}/login`);

  const payload = verifyToken(token);
  const tenantId = payload.tenantId || (await getTenantId());

  const page = parseInt(pageParam || "1");
  const limit = 15;
  const { patients, total } = await getAllPatients(tenantId, page, limit, search);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="mt-1 text-gray-500">{total} registered patients</p>
        </div>
      </div>

      <form method="get" className="flex gap-3">
        <input type="text" name="search" defaultValue={search}
          placeholder="Search by name or email..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <Button type="submit" variant="secondary">Search</Button>
        {search && (
          <Link href={`/${tenant}/doctor/patients`}>
            <Button type="button" variant="ghost">Clear</Button>
          </Link>
        )}
      </form>

      {patients.length === 0 ? (
        <Card className="text-center py-12">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-medium text-gray-900">{search ? "No patients found" : "No patients registered yet"}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((patient) => (
              <Link key={patient._id} href={`/${tenant}/doctor/patients/${patient._id}`}>
                <Card className="h-full hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-sm flex-shrink-0">
                      {patient.user?.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{patient.user?.name || "Unknown"}</p>
                      <p className="text-xs text-gray-500 truncate">{patient.user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" size="sm">{patient.gender}</Badge>
                    {patient.bloodType && <Badge variant="info" size="sm">{patient.bloodType}</Badge>}
                    {patient.allergies?.length > 0 && (
                      <Badge variant="warning" size="sm">
                        {patient.allergies.length} allerg{patient.allergies.length > 1 ? "ies" : "y"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-gray-400">
                    DOB: {patient.dateOfBirth ? format(new Date(patient.dateOfBirth), "MMM d, yyyy") : "Not set"}
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {page > 1 && (
                <Link href={`/${tenant}/doctor/patients?page=${page - 1}${search ? `&search=${search}` : ""}`}>
                  <Button variant="outline" size="sm">← Previous</Button>
                </Link>
              )}
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              {page < totalPages && (
                <Link href={`/${tenant}/doctor/patients?page=${page + 1}${search ? `&search=${search}` : ""}`}>
                  <Button variant="outline" size="sm">Next →</Button>
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
