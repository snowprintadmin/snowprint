import { useEffect, useState } from "react";
import type { FormEvent } from "react";


import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

type PaperSize = "short" | "a4" | "long";

type PricingRow = {
  paper_size: PaperSize;
  bw_price: number;
  colored_price: number;
  updated_at?: string;
};

const PAPER_LABELS: Record<PaperSize, string> = {
  short: "Short",
  a4: "A4",
  long: "Long"
};

const DEFAULT_ROWS: PricingRow[] = [
  { paper_size: "short", bw_price: 2, colored_price: 5 },
  { paper_size: "a4", bw_price: 2, colored_price: 5 },
  { paper_size: "long", bw_price: 3, colored_price: 6 }
];

export default function AdminPricingPage() {
  const [rows, setRows] = useState<PricingRow[]>(DEFAULT_ROWS);
  const [rushFee, setRushFee] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPricing();
  }, []);

  async function loadPricing() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .order("paper_size", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const sorted = ["short", "a4", "long"].map((paperSize) => {
          const found = data.find((row) => row.paper_size === paperSize);
          return found ?? DEFAULT_ROWS.find((row) => row.paper_size === paperSize)!;
        });

        setRows(sorted as PricingRow[]);
      }

      const { data: settingsData, error: settingsError } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .eq("setting_key", "rush_fee")
        .maybeSingle();

      if (!settingsError && settingsData) {
        setRushFee(Number(settingsData.setting_value));
      }
    } catch (error) {
      console.error(error);
      alert("Could not load pricing rules.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(
    paperSize: PaperSize,
    field: "bw_price" | "colored_price",
    value: string
  ) {
    setRows((current) =>
      current.map((row) =>
        row.paper_size === paperSize
          ? { ...row, [field]: Number(value) }
          : row
      )
    );
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    if (!Number.isFinite(rushFee) || rushFee < 0) {
      alert("Please enter a valid rush fee.");
      return;
    }

    for (const row of rows) {
      if (
        !Number.isFinite(row.bw_price) ||
        !Number.isFinite(row.colored_price) ||
        row.bw_price < 0 ||
        row.colored_price < 0
      ) {
        alert("Please enter valid prices.");
        return;
      }

      if (row.colored_price < row.bw_price) {
        alert(`${PAPER_LABELS[row.paper_size]} colored price should not be lower than B&W price.`);
        return;
      }
    }

    setSaving(true);

    try {
      const payload = rows.map((row) => ({
        paper_size: row.paper_size,
        bw_price: Number(row.bw_price.toFixed(2)),
        colored_price: Number(row.colored_price.toFixed(2)),
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from("pricing_rules")
        .upsert(payload, { onConflict: "paper_size" });

      if (error) throw error;

      const { error: settingsError } = await supabase
        .from("app_settings")
        .upsert(
          {
            setting_key: "rush_fee",
            setting_value: Number(rushFee.toFixed(2)),
            updated_at: new Date().toISOString()
          },
          { onConflict: "setting_key" }
        );

      if (settingsError) throw settingsError;

      alert("Pricing updated. New customer orders will use the new computation.");
      await loadPricing();
    } catch (error) {
      console.error(error);
      alert("Could not save pricing rules.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-snow-white text-snow-ink">
      <header className="sticky top-0 z-40 border-b border-snow-ice bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-2 text-sm font-bold text-snow-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin Orders
          </Link>

          <BrandLogo subtitle="Pricing settings" />

          <button
            type="button"
            onClick={loadPricing}
            className="rounded-full border border-snow-blue bg-white px-5 py-2.5 text-sm font-black text-snow-navy"
          >
            Refresh
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-[2rem] border border-snow-ice bg-white p-6 shadow-card">
          <div className="mb-8">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-snow-blue">
              Admin
            </p>
            <h1 className="mt-2 text-4xl font-black text-snow-navy">
              Pricing Settings
            </h1>
            <p className="mt-3 text-sm leading-6 text-snow-muted">
              Update per-page printing prices and rush fee. New customer orders will automatically use these prices.
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-60 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-snow-navy" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {rows.map((row) => (
                <section
                  key={row.paper_size}
                  className="rounded-[1.5rem] border border-snow-ice bg-snow-white p-5"
                >
                  <h2 className="text-2xl font-black text-snow-navy">
                    {PAPER_LABELS[row.paper_size]}
                  </h2>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-bold text-snow-navy">
                      B&W price per page
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.bw_price}
                        onChange={(event) =>
                          updateRow(row.paper_size, "bw_price", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm outline-none focus:border-snow-blue"
                      />
                    </label>

                    <label className="block text-sm font-bold text-snow-navy">
                      Full color price per page
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.colored_price}
                        onChange={(event) =>
                          updateRow(row.paper_size, "colored_price", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm outline-none focus:border-snow-blue"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-snow-muted">
                    Current range: ₱{Number(row.bw_price).toFixed(2)} B&W to ₱
                    {Number(row.colored_price).toFixed(2)} full color.
                  </div>
                </section>
              ))}

              <section className="rounded-[1.5rem] border border-amber-100 bg-amber-50 p-5">
                <h2 className="text-2xl font-black text-snow-navy">
                  Rush / Urgent Fee
                </h2>

                <p className="mt-2 text-sm leading-6 text-snow-muted">
                  This fee is added automatically once per order when the customer selects Rush / urgent order. This is separate from on-the-spot printing.
                </p>

                <label className="mt-5 block text-sm font-bold text-snow-navy">
                  Rush fee per urgent order
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rushFee}
                    onChange={(event) => setRushFee(Number(event.target.value))}
                    className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm outline-none focus:border-snow-blue"
                  />
                </label>

                <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-snow-muted">
                  Current rush fee: ₱{Number(rushFee).toFixed(2)}
                </div>
              </section>

              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-snow-navy px-6 py-4 text-sm font-black text-white shadow-soft disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Pricing
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
