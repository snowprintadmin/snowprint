import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";

export default function LandingPage() {
  return (
    <main className="min-h-screen text-snow-ink">
      <header className="border-b border-snow-ice bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <BrandLogo />

          <div className="flex items-center gap-3">
            <Link
              to="/track"
              className="hidden rounded-full border border-snow-blue/60 bg-white px-5 py-2.5 text-sm font-bold text-snow-navy sm:inline-block"
            >
              Track Order
            </Link>

            <Link
              to="/order"
              className="rounded-full bg-snow-navy px-5 py-2.5 text-sm font-bold text-white shadow-soft hover:bg-[#0d2538]"
            >
              Start Order
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.25em] text-snow-blue">
            SnowPrint
          </p>

          <h1 className="mt-4 text-5xl font-black leading-tight text-snow-navy md:text-6xl">
            Upload. Configure. Pay. Claim.
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-snow-muted">
            A cute, clean, and reliable semi-automated printing service for
            students, teachers, office workers, and everyday customers.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/order"
              className="rounded-full bg-snow-navy px-7 py-4 text-center text-sm font-black text-white shadow-soft hover:bg-[#0d2538]"
            >
              Upload Documents
            </Link>

            <Link
              to="/track"
              className="rounded-full border border-snow-blue/60 bg-white px-7 py-4 text-center text-sm font-black text-snow-navy shadow-card"
            >
              Track Order
            </Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-snow-ice bg-white p-8 shadow-soft">
          <BrandLogo size="lg" subtitle="Semi-automated printing" />

          <div className="mt-8 grid gap-4">
            {[
              ["1", "Upload your files"],
              ["2", "Choose paper, color, pages, and copies"],
              ["3", "Get an instant estimate"],
              ["4", "Submit and claim with your code"]
            ].map(([number, text]) => (
              <div
                key={number}
                className="flex items-center gap-4 rounded-2xl bg-snow-white p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-snow-navy text-sm font-black text-white">
                  {number}
                </div>
                <p className="font-bold text-snow-navy">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
