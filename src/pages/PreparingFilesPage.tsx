import { useEffect, useState } from "react";
import { FileCog, Loader2, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

type PreparingOrderFile = {
  id: string;
  file_name: string;
  preparation_status: string | null;
  preparation_error: string | null;
};

type PreparingOrder = {
  id: string;
  order_number: string;
  preparation_status: string | null;
  pricing_status: string | null;
  payment_status: string | null;
  final_total: number | null;
  estimated_total: number | null;
  order_files?: PreparingOrderFile[];
};

export default function PreparingFilesPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState<PreparingOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadOrder();

    const timer = window.setInterval(() => {
      void loadOrder();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [orderNumber]);

  async function loadOrder() {
    if (!orderNumber) return;

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        preparation_status,
        pricing_status,
        payment_status,
        final_total,
        estimated_total,
        order_files (
          id,
          file_name,
          preparation_status,
          preparation_error
        )
      `
      )
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const foundOrder = data as PreparingOrder | null;
    setOrder(foundOrder);
    setLoading(false);

    if (!foundOrder) return;

    const isReadyForPayment =
      foundOrder.preparation_status === "completed" ||
      foundOrder.pricing_status === "auto_priced" ||
      foundOrder.pricing_status === "pricing_finalized";

    if (isReadyForPayment) {
      navigate(`/payment/${foundOrder.order_number}`, { replace: true });
      return;
    }

    const needsManualFallback =
      foundOrder.preparation_status === "failed" ||
      foundOrder.pricing_status === "pending_pricing";

    if (needsManualFallback) {
      navigate(`/pricing-wait/${foundOrder.order_number}`, { replace: true });
    }
  }

  return (
    <main className="min-h-screen bg-snow-white px-4 py-10 text-snow-ink">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-snow-ice bg-white p-8 text-center shadow-card">
        <BrandLogo subtitle="Print preparation" />

        <div className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-snow-ice text-snow-navy">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <FileCog className="h-8 w-8" />
          )}
        </div>

        <h1 className="mt-5 text-3xl font-black text-snow-navy">
          Preparing your file for printing
        </h1>

        <p className="mt-3 text-sm text-snow-muted">
          SnowPrint is converting your document or presentation into a print-ready PDF.
          Once ready, the system will automatically compute the price and send you to payment.
        </p>

        <div className="mt-5 rounded-2xl bg-snow-ice p-4 text-left">
          <p className="font-black text-snow-navy">Estimated waiting time</p>
          <p className="mt-1 text-sm text-snow-muted">
            Usually 1–3 minutes per file. Larger PowerPoint files may take longer.
          </p>
        </div>

        {order && (
          <div className="mt-6 rounded-2xl bg-snow-white p-4 text-left">
            <p className="font-black text-snow-navy">{order.order_number}</p>
            <p className="mt-1 text-xs font-bold text-snow-muted">
              Overall status: {formatStatus(order.preparation_status ?? "queued")}
            </p>

            <div className="mt-4 space-y-3">
              {(order.order_files ?? []).map((file) => (
                <div key={file.id} className="rounded-xl bg-white p-3">
                  <p className="break-words text-sm font-black text-snow-navy">
                    {file.file_name}
                  </p>
                  <p className="mt-1 text-xs font-bold text-snow-muted">
                    Status: {formatStatus(file.preparation_status ?? "queued")}
                  </p>

                  {file.preparation_error && (
                    <p className="mt-1 text-xs font-bold text-red-700">
                      {file.preparation_error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void loadOrder()}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-snow-navy px-5 py-3 text-sm font-black text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </section>
    </main>
  );
}

function formatStatus(value: string) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
