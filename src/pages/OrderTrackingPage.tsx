import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";

export default function OrderTrackingPage() {
  return (
    <main className="min-h-screen bg-snow-white p-6 text-snow-ink">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-snow-ice bg-white p-8 shadow-soft">
        <BrandLogo subtitle="Order tracking" />

        <p className="mt-8 text-sm font-black uppercase tracking-[0.2em] text-snow-blue">
          Track
        </p>

        <h1 className="mt-3 text-4xl font-black text-snow-navy">
          Track Your Order
        </h1>

        <p className="mt-4 text-snow-muted">
          Soon, customers can search using their order number or claim code.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <input
            placeholder="PRN-YYYYMMDD-###"
            className="rounded-2xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
          />
          <input
            placeholder="SNOW-####"
            className="rounded-2xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
          />
        </div>

        <Link
          to="/"
          className="mt-6 inline-block rounded-full bg-snow-navy px-5 py-3 text-sm font-bold text-white"
        >
          Back Home
        </Link>
      </section>
    </main>
  );
}
