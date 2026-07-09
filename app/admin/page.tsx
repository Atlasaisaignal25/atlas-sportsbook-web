import Link from "next/link";
import AdminDashboard from "./AdminDashboard";
import { getAdminSession } from "@/app/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#050816] px-5 py-10 text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <div className="mb-6 rounded-3xl border border-cyan-400/20 bg-cyan-950/10 p-8">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-cyan-300">
              Atlas Admin
            </p>
            <h1 className="mb-4 text-4xl font-black">Restricted Access</h1>
            <p className="mb-8 text-base leading-7 text-white/65">
              This dashboard is only available for the internal admin account.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-black"
              >
                Login
              </Link>
              <Link
                href="/"
                className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white/80"
              >
                Back to App
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <AdminDashboard adminEmail={user.email ?? "admin"} />;
}
