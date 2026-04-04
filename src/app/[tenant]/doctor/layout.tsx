import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken, extractTokenFromCookie } from "@/lib/auth/jwt";
import { Navbar } from "@/components/layout/Navbar";
import { getUserById } from "@/services/authService";

interface Props {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function DoctorLayout({ children, params }: Props) {
  const { tenant } = await params;

  const cookieStore = await cookies();
  const token = extractTokenFromCookie(cookieStore.toString());

  if (!token) redirect(`/${tenant}/login`);

  let user;
  try {
    const payload = verifyToken(token);
    if (payload.role !== "doctor" && payload.role !== "admin") {
      redirect(`/${tenant}/patient/dashboard`);
    }
    user = await getUserById(payload.userId);
  } catch {
    redirect(`/${tenant}/login`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userName={user?.name} userRole={user?.role} tenantSlug={tenant} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
