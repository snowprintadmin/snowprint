import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";

export default function AdminLoginPage() {
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

        <div className="mt-6 space-y-4">
          <input
            placeholder="Admin email"
            className="w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
          />
          <Link
            to="/admin/orders"
            className="block w-full rounded-full bg-snow-navy px-5 py-3 text-center text-sm font-black text-white"
          >
            Open Admin Orders
          </Link>
        </div>

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
