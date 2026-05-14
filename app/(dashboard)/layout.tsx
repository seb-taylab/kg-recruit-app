import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { getAuthContext } from "@/lib/auth/get-user";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  return <DashboardLayout auth={auth}>{children}</DashboardLayout>;
}
