import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ReceiptText,
  UploadCloud,
  Wallet
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

type PaymentOrderFile = {
  id: string;
  file_name: string;
  page_count: number | null;
  sheets: number | null;
  line_total: number | null;
  auto_line_total: number | null;
  final_line_total: number | null;
  preparation_status: string | null;
  print_ready_storage_path: string | null;
  preparation_reason?: string | null;
  preparation_fee?: number | null;
};

type Order = {
  id: string;
  order_number: string;
  claim_code: string;
  customer_name: string | null;
  customer_email: string | null;
  payment_method: string;
  payment_status: string | null;
  order_status: string | null;
  pricing_status: string | null;
  requires_manual_pricing: boolean | null;
  estimated_total: number | null;
  final_total: number | null;
  created_at: string;
  order_files?: PaymentOrderFile[];
};

function clean(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}


const PAYMENT_DETAILS: Record<
  string,
  {
    title: string;
    accountName: string;
    accountNumber: string;
    extraNote: string;
    qrPath: string;
  }
> = {
  gcash: {
    title: "GCash Payment",
    accountName: "SnowPrint",
    accountNumber: "09XX XXX XXXX",
    extraNote: "Send the exact amount, then upload your screenshot below.",
    qrPath: "/payments/gcash-qr.png"
  },
  maya: {
    title: "Maya Payment",
    accountName: "SnowPrint",
    accountNumber: "09XX XXX XXXX",
    extraNote: "Send the exact amount, then upload your screenshot below.",
    qrPath: "/payments/maya-qr.png"
  },
  bank_transfer: {
    title: "Bank Transfer",
    accountName: "SnowPrint",
    accountNumber: "BANK ACCOUNT NUMBER HERE",
    extraNote: "Use your order number as transfer note/reference if possible.",
    qrPath: "/payments/bank-qr.png"
  }
};


export default function PaymentPage() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [referenceNumber, setReferenceNumber] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  useEffect(() => {
    loadOrder();
  }, [orderNumber]);

  const amount = useMemo(() => {
    return Number(order?.final_total ?? order?.estimated_total ?? 0);
  }, [order]);

  const isCash = order?.payment_method === "cash";
  const paymentDetails = order ? PAYMENT_DETAILS[order.payment_method] : null;

  async function loadOrder() {
    if (!orderNumber) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`id, order_number, claim_code, customer_name, customer_email, payment_method, payment_status, order_status, pricing_status, requires_manual_pricing, estimated_total, final_total, created_at,
          order_files (*)`)
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        alert("Order not found.");
        navigate("/track");
        return;
      }

      const foundOrder = data as Order;

      const pricingStatus = clean(foundOrder.pricing_status);
      const paymentStatus = clean(foundOrder.payment_status);

      const pricingStillPending =
        pricingStatus === "pending_pricing" ||
        paymentStatus === "pending_pricing" ||
        (
          foundOrder.requires_manual_pricing === true &&
          foundOrder.final_total === null &&
          pricingStatus !== "pricing_finalized" &&
          pricingStatus !== "pricing_updated"
        );

      if (pricingStillPending) {
        navigate(`/pricing-wait/${foundOrder.order_number}`);
        return;
      }

      setOrder(foundOrder);
    } catch (error) {
      console.error(error);
      alert("Could not load payment page.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmCashPickup() {
    if (!order) return;

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: "cash_on_pickup"
        })
        .eq("id", order.id);

      if (error) throw error;

      navigate(`/thank-you/${order.order_number}?type=cash`, { replace: true });
    } catch (error) {
      console.error(error);
      alert("Could not confirm cash on pickup.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCashlessPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!order) return;

    if (!referenceNumber.trim()) {
      alert("Please enter your payment reference number.");
      return;
    }

    if (!proofFile) {
      alert("Please upload your payment proof screenshot.");
      return;
    }

    setSubmitting(true);

    try {
      const safeFileName = sanitizeFileName(proofFile.name);
      const storagePath = `${order.id}/${crypto.randomUUID()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(storagePath, proofFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: proofFile.type || "image/jpeg"
        });

      if (uploadError) throw uploadError;

      const { error: paymentError } = await supabase.from("payments").insert({
        order_id: order.id,
        payment_method: order.payment_method,
        amount,
        reference_number: referenceNumber.trim(),
        proof_storage_path: storagePath,
        payment_status: "pending_verification",
        submitted_at: new Date().toISOString()
      });

      if (paymentError) throw paymentError;

      const { error: orderError } = await supabase
        .from("orders")
        .update({
          payment_status: "pending_verification"
        })
        .eq("id", order.id);

      if (orderError) throw orderError;

      navigate(`/thank-you/${order.order_number}?type=verification`, {
        replace: true
      });
    } catch (error) {
      console.error(error);
      alert("Could not submit payment proof. Please check the uploaded file and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleProofChange(event: ChangeEvent<HTMLInputElement>) {
    setProofFile(event.target.files?.[0] ?? null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-snow-white">
        <Loader2 className="h-8 w-8 animate-spin text-snow-navy" />
      
      {getOrderFiles(order).some(isConvertedFile) && (
        <section className="mt-6 rounded-[2rem] border border-snow-ice bg-white p-5 shadow-card">
          <p className="text-lg font-black text-snow-navy">Print Preparation Receipt</p>
          <p className="mt-1 text-sm text-snow-muted">
            Some files were converted into print-ready PDFs. The final price was adjusted based on the converted PDF page count.
          </p>

          <div className="mt-4 space-y-3">
            {getOrderFiles(order).filter(isConvertedFile).map((file: any) => (
              <div key={file.id} className="rounded-2xl bg-snow-white p-4">
                <p className="break-words font-black text-snow-navy">{file.file_name}</p>
                <p className="mt-1 text-xs text-snow-muted">
                  Reason: Converted to print-ready PDF for accurate page count and pricing.
                </p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-black uppercase text-snow-muted">Pages</p>
                    <p className="font-black text-snow-navy">{file.page_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase text-snow-muted">Sheets</p>
                    <p className="font-black text-snow-navy">{file.sheets ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase text-snow-muted">Line total</p>
                    <p className="font-black text-snow-navy">{formatPeso(receiptLineTotal(file))}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </main>
    );
  }

  if (!order) return null;

  return (
    <main className="min-h-screen bg-snow-white text-snow-ink">
      <header className="border-b border-snow-ice bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            to="/order"
            className="inline-flex items-center gap-2 text-sm font-bold text-snow-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Order
          </Link>

          <BrandLogo subtitle="Payment" />
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-[2rem] border border-snow-ice bg-white p-8 shadow-card">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-snow-ice">
            <Wallet className="h-8 w-8 text-snow-navy" />
          </div>

          <h1 className="mt-6 text-center text-3xl font-black text-snow-navy">
            Payment
          </h1>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Order Number" value={order.order_number} />
            <Info label="Claim Code" value={order.claim_code} />
            <Info label="Payment Method" value={formatStatus(order.payment_method)} />
            <Info label="Final Total" value={`₱${amount.toFixed(2)}`} />
          </div>

          <div className="mt-6 rounded-2xl bg-snow-white p-5">
            <p className="font-black text-snow-navy">Pickup reminder</p>
            <p className="mt-2 text-sm leading-6 text-snow-muted">
              {getPickupReminder()}
            </p>
          </div>

          {isCash ? (
            <div className="mt-6 rounded-[1.5rem] border border-amber-100 bg-amber-50 p-5">
              <p className="font-black text-amber-800">Cash on pickup</p>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                Confirm this if you will pay when claiming your print order.
                Your print will only be released after you pay and the admin
                confirms that payment was received.
              </p>

              <button
                type="button"
                disabled={submitting}
                onClick={confirmCashPickup}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-snow-navy px-6 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Confirming..." : "Confirm Cash on Pickup"}
              </button>
            </div>
          ) : (
            <form
              onSubmit={submitCashlessPayment}
              className="mt-6 rounded-[1.5rem] border border-snow-ice bg-snow-white p-5"
            >
              <p className="font-black text-snow-navy">
                {formatStatus(order.payment_method)} payment verification
              </p>
              <p className="mt-2 text-sm leading-6 text-snow-muted">
                After sending your payment, enter the reference number and upload
                your payment proof. SnowPrint will verify it before releasing the print.
              </p>

              {paymentDetails && (
                <div className="mt-5 rounded-2xl bg-white p-4">
                  <p className="font-black text-snow-navy">{paymentDetails.title}</p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
                    <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-snow-blue bg-snow-white p-3">
                      <img
                        src={paymentDetails.qrPath}
                        alt={`${paymentDetails.title} QR code`}
                        className="max-h-32 max-w-32 object-contain"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                      <p className="text-center text-xs font-bold text-snow-muted">
                        Add QR image at public{paymentDetails.qrPath}
                      </p>
                    </div>

                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="font-black text-snow-muted">Account name: </span>
                        <span className="font-black text-snow-navy">{paymentDetails.accountName}</span>
                      </p>
                      <p>
                        <span className="font-black text-snow-muted">Account number: </span>
                        <span className="font-black text-snow-navy">{paymentDetails.accountNumber}</span>
                      </p>
                      <p className="text-snow-muted">{paymentDetails.extraNote}</p>
                      <p className="font-black text-snow-navy">
                        Amount to pay: ₱{amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <label className="mt-5 block text-xs font-black uppercase tracking-wide text-snow-muted">
                Reference Number
                <input
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  placeholder="Enter GCash/Maya/bank reference number"
                  className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm text-snow-navy outline-none focus:border-snow-blue"
                />
              </label>

              <label className="mt-4 block text-xs font-black uppercase tracking-wide text-snow-muted">
                Upload Payment Proof
                <div className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-snow-blue bg-white p-5 text-center">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleProofChange}
                    className="hidden"
                  />
                  <div>
                    <UploadCloud className="mx-auto h-6 w-6 text-snow-navy" />
                    <p className="mt-2 text-sm font-bold text-snow-navy">
                      {proofFile ? proofFile.name : "Click to upload screenshot or PDF"}
                    </p>
                  </div>
                </div>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-snow-navy px-6 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                <ReceiptText className="h-4 w-4" />
                {submitting ? "Submitting..." : "Submit for Verification"}
              </button>
            </form>
          )}
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

function getPickupReminder() {
  return "Please pick up your print order on time once SnowPrint marks it as ready for pickup. Bring your claim code. Orders will only be released after payment is confirmed.";
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


function isConvertedFile(file: any) {
  return Boolean(file?.print_ready_storage_path) || file?.preparation_status === "completed";
}

function receiptLineTotal(file: any) {
  return Number(file?.final_line_total ?? file?.line_total ?? file?.auto_line_total ?? 0);
}

function formatPeso(value: number) {
  return `₱${Number(value || 0).toFixed(2)}`;
}


function getOrderFiles(order: Order | null) {
  return ((order as unknown as { order_files?: unknown[] } | null)?.order_files ?? []) as any[];
}
