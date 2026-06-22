import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, ReceiptText, Search } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

type Order = {
  order_number: string;
  claim_code: string;
  payment_method: string;
  payment_status: string | null;
  order_status: string | null;
  final_total: number | null;
  estimated_total: number | null;
  pickup_type: string | null;
};

export default function PaymentThankYouPage() {
  const { orderNumber } = useParams();
  const [params] = useSearchParams();
  const type = params.get("type");

  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadOrder();
  }, [orderNumber]);

  const amount = useMemo(() => {
    return Number(order?.final_total ?? order?.estimated_total ?? 0);
  }, [order]);

  async function loadOrder() {
    if (!orderNumber) return;

    const { data, error } = await supabase
      .from("orders")
      .select(
        "order_number, claim_code, payment_method, payment_status, order_status, final_total, estimated_total, pickup_type"
      )
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (!error && data) {
      setOrder(data as Order);
    }
  }

  const isCash = type === "cash" || order?.payment_method === "cash";

  return (
    <main className="min-h-screen bg-snow-white text-snow-ink">
      <header className="border-b border-snow-ice bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <BrandLogo subtitle="Thank you" />
        </div>
      </header>

      <section className="mx-auto flex min-h-[75vh] max-w-3xl items-center px-6 py-12">
        <div className="w-full rounded-[2rem] border border-snow-ice bg-white p-8 text-center shadow-card">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-snow-mint">
            <CheckCircle2 className="h-8 w-8 text-snow-navy" />
          </div>

          <h1 className="mt-6 text-3xl font-black text-snow-navy">
            Thank you!
          </h1>

          <p className="mt-3 text-sm leading-6 text-snow-muted">
            {isCash
              ? "Your cash on pickup request is confirmed."
              : "Your payment proof has been submitted for verification."}
          </p>

          {order && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Info label="Order Number" value={order.order_number} />
              <Info label="Claim Code" value={order.claim_code} />
              <Info label="Total" value={`₱${amount.toFixed(2)}`} />
              <Info label="Payment Status" value={formatStatus(order.payment_status ?? "pending")} />
            </div>
          )}

          <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-left">
            <p className="font-black text-amber-800">
              {isCash ? "Cash pickup reminder" : "Payment verification reminder"}
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-700">
              {isCash
                ? "Please pay the full amount when you pick up your print order. The print will not be released until the customer pays and the admin confirms payment received."
                : "Please wait for SnowPrint to verify your payment. Pick up your print order on time once it is marked ready for pickup. Bring your claim code."}
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/track"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-snow-navy px-6 py-3 text-sm font-black text-white"
            >
              <Search className="h-4 w-4" />
              Track Order
            </Link>

            {order && (
              <Link
                to={`/payment/${order.order_number}`}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-snow-blue bg-white px-6 py-3 text-sm font-black text-snow-navy"
              >
                <ReceiptText className="h-4 w-4" />
                View Payment Page
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-snow-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-snow-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-lg font-black text-snow-navy">
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
