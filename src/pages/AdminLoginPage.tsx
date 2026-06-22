import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error || !data.user) {
      setIsLoading(false);
      setErrorMessage(error?.message ?? "Invalid admin email or password.");
      return;
    }

    const { data: adminRow, error: adminError } = await supabase
      .from("admin_users")
      .select("user_id, email, role, is_active")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (adminError || !adminRow) {
      await supabase.auth.signOut();
      setIsLoading(false);
      setErrorMessage("This account is not authorized as a SnowPrint admin.");
      return;
    }

    setIsLoading(false);
    navigate("/admin/orders");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-snow-white p-6 text-snow-ink">
      <section className="w-full max-w-md rounded-[2rem] border border-snow-ice bg-white p-8 shadow-soft">
        <BrandLogo subtitle="Admin access only" />

        <p className="mt-8 text-sm font-black uppercase tracking-[0.2em] text-snow-blue">
          Admin
        </p>

        <h1 className="mt-3 text-3xl font-black text-snow-navy">
          SnowPrint Admin Login
        </h1>

        <p className="mt-3 text-sm text-snow-muted">
          Admin access only. Customers cannot access this dashboard.
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Admin email"
            className="w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
            required
          />

          {errorMessage && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="block w-full rounded-full bg-snow-navy px-5 py-3 text-center text-sm font-black text-white disabled:opacity-60"
          >
            {isLoading ? "Checking..." : "Open Admin Orders"}
          </button>
        </form>

        <Link
          to="/"
          className="mt-6 inline-block text-sm font-bold text-snow-navy"
        >
          Back Home
        </Link>
      </section>
    </main>
  );
}
