import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, ReceiptText, RefreshCw } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

type WaitingOrder = {
  order_number: string;
  claim_code: string;
  pricing_status: string | null;
  payment_status: string | null;
  final_total: number | null;
};

function clean(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

export default function PricingWaitPage() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState<WaitingOrder | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkPricing();

    const timer = window.setInterval(() => {
      checkPricing(false);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [orderNumber]);

  async function checkPricing(showSpinner = true) {
    if (!orderNumber) return;

    if (showSpinner) setChecking(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("order_number, claim_code, pricing_status, payment_status, final_total")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      const foundOrder = data as WaitingOrder;
      setOrder(foundOrder);

      const pricingStatus = clean(foundOrder.pricing_status);
      const paymentStatus = clean(foundOrder.payment_status);
      const finalTotal = Number(foundOrder.final_total ?? 0);

      const shouldRedirect =
        pricingStatus === "pricing_finalized" ||
        pricingStatus === "pricing_updated" ||
        paymentStatus === "pending_verification" ||
        paymentStatus === "cash_on_pickup" ||
        finalTotal > 0;

      if (shouldRedirect) {
        window.location.replace(`/payment/${foundOrder.order_number}`);
        return;
      }
    } catch (error) {
      console.error("Pricing wait error:", error);
    } finally {
      if (showSpinner) setChecking(false);
    }
  }

  return (
    <main className="min-h-screen bg-snow-white text-snow-ink">
      <header className="border-b border-snow-ice bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/order" className="inline-flex items-center gap-2 text-sm font-bold text-snow-navy">
            <ArrowLeft className="h-4 w-4" />
            Back to Order
          </Link>

          <BrandLogo subtitle="Waiting for pricing" />
        </div>
      </header>

      <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-6 py-12">
        <div className="w-full rounded-[2rem] border border-amber-100 bg-white p-8 text-center shadow-card">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            {checking ? (
              <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
            ) : (
              <ReceiptText className="h-8 w-8 text-amber-700" />
            )}
          </div>

          <h1 className="mt-6 text-3xl font-black text-snow-navy">
            Checking Final Price
          </h1>

          <p className="mt-3 text-sm leading-6 text-snow-muted">
            If pricing is finished, this page will send you to payment automatically.
          </p>

          {order && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Info label="Order Number" value={order.order_number} />
              <Info label="Claim Code" value={order.claim_code} />
              <Info label="Pricing Status" value={formatStatus(order.pricing_status ?? "pending_pricing")} />
              <Info label="Payment Status" value={formatStatus(order.payment_status ?? "pending_pricing")} />
              <Info
                label="Final Total"
                value={
                  order.final_total === null || order.final_total === undefined
                    ? "Pending"
                    : `₱${Number(order.final_total).toFixed(2)}`
                }
              />
            </div>
          )}

          {order && (
            <a
              href={`/payment/${order.order_number}`}
              className="mt-6 inline-flex rounded-full bg-snow-navy px-6 py-3 text-sm font-black text-white"
            >
              Go to Payment
            </a>
          )}

          <button
            type="button"
            onClick={() => checkPricing()}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-snow-blue bg-white px-6 py-3 text-sm font-black text-snow-navy"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Status
          </button>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-snow-white p-4 text-left">
      <p className="text-xs font-black uppercase tracking-wide text-snow-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-base font-black text-snow-navy">
        {value}
      </p>
    </div>
  );
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
