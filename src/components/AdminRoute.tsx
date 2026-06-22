import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type AdminRouteProps = {
  children: ReactNode;
};

export default function AdminRoute({ children }: AdminRouteProps) {
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let isMounted = true;

    async function checkAdmin() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        if (isMounted) setStatus("denied");
        return;
      }

      const { data: adminRow } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", data.user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (isMounted) {
        setStatus(adminRow ? "allowed" : "denied");
      }
    }

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, []);

  if (status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-snow-white p-6 text-snow-navy">
        <p className="rounded-2xl bg-white px-5 py-4 text-sm font-black shadow-soft">
          Checking admin access...
        </p>
      </main>
    );
  }

  if (status === "denied") {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}
