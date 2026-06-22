import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Home,
  Loader2,
  PackageCheck,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Snowflake,
  WalletCards
} from "lucide-react";
import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

type OrderFile = {
  id: string;
  file_name: string;
  file_size: number;
  storage_path: string | null;
  paper_size: string;
  print_mode: string;
  side_mode: string;
  service_type: string;
  pickup_type: string;
  range_mode: string;
  copies: number;
  extra_copies: number;
  page_count: number;
  billed_pages: number;
  sheets: number;
  line_total: number;
  auto_line_total: number | null;
  final_line_total: number | null;
  requires_manual_pricing: boolean | null;
  manual_pricing_reason: string | null;
  pricing_status: string | null;
  pricing_notes: string | null;
  preparation_status?: string | null;
  print_ready_storage_path?: string | null;
  needs_print_preparation?: boolean | null;
};

type Payment = {
  id: string;
  payment_method: string;
  amount: number;
  reference_number: string | null;
  proof_storage_path: string | null;
  payment_status: string;
  submitted_at: string | null;
};

type Order = {
  id: string;
  order_number: string;
  claim_code: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  estimated_total: number;
  final_total: number | null;
  requires_manual_pricing: boolean;
  pricing_status: string;
  manual_pricing_reason: string | null;
  is_rush_order: boolean;
  rush_fee_amount: number;
  total_files: number;
  total_pages: number;
  total_sheets: number;
  created_at: string;
  notes: string | null;
  order_files?: OrderFile[];
  payments?: Payment[];
};

const ORDER_STATUSES = [
  "received",
  "payment_review",
  "in_progress",
  "ready_for_pickup",
  "completed",
  "cancelled"
];

const PAYMENT_STATUSES = [
  "pending",
  "cash_on_pickup",
  "pending_verification",
  "verified",
  "rejected"
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const query = [
        order.order_number,
        order.claim_code,
        order.customer_name,
        order.customer_email,
        order.customer_phone,
        order.payment_method,
        order.payment_status,
        order.order_status,
        order.pricing_status
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = query.includes(search.toLowerCase());

      const matchesFilter =
        filter === "all" ||
        (filter === "needs_pricing" && order.pricing_status === "pending_pricing") ||
        (filter === "payment_review" &&
          ["submitted", "pending_verification"].includes(order.payment_status)) ||
        (filter === "cash_pickup" && order.payment_status === "cash_on_pickup") ||
        (filter === "printing_queue" &&
          ["received", "payment_review", "in_progress", "ready_for_pickup"].includes(order.order_status)) ||
        order.order_status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [orders, search, filter]);

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0] ?? null;

  const stats = useMemo(() => {
    return {
      total: orders.length,
      needsPricing: orders.filter((order) => order.pricing_status === "pending_pricing").length,
      paymentReview: orders.filter((order) =>
        ["submitted", "pending_verification"].includes(order.payment_status)
      ).length,
      ready: orders.filter((order) => order.order_status === "ready_for_pickup").length,
      completed: orders.filter((order) => order.order_status === "completed").length,
      revenue: orders.reduce((sum, order) => sum + getOrderTotal(order), 0)
    };
  }, [orders]);

  async function loadOrders() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          order_files (*),
          payments (*)
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Order[];
      setOrders(rows);

      if (!selectedOrderId && rows[0]) {
        setSelectedOrderId(rows[0].id);
      }
    } catch (error) {
      console.error(error);
      alert("Could not load admin orders. Check Supabase policies and columns.");
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(orderId: string, orderStatus: string) {
    setUpdatingId(orderId);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ order_status: orderStatus })
        .eq("id", orderId);

      if (error) throw error;
      await loadOrders();
    } catch (error) {
      console.error(error);
      alert("Could not update order status.");
    } finally {
      setUpdatingId("");
    }
  }

  async function updatePaymentStatus(order: Order, paymentStatus: string) {
    setUpdatingId(order.id);

    try {
      const { error: orderError } = await supabase
        .from("orders")
        .update({ payment_status: paymentStatus })
        .eq("id", order.id);

      if (orderError) throw orderError;

      if (order.payments?.[0]?.id) {
        const { error: paymentError } = await supabase
          .from("payments")
          .update({ payment_status: paymentStatus })
          .eq("id", order.payments[0].id);

        if (paymentError) throw paymentError;
      }

      await loadOrders();
    } catch (error) {
      console.error(error);
      alert("Could not update payment status.");
    } finally {
      setUpdatingId("");
    }
  }

  async function saveManualFilePrice(
    order: Order,
    file: OrderFile,
    price: number,
    notes: string
  ) {
    if (!Number.isFinite(price) || price < 0) {
      alert("Please enter a valid price.");
      return;
    }

    setUpdatingId(file.id);

    try {
      const savedPrice = Number(price.toFixed(2));
      const savedNotes = notes.trim() || null;

      const { error: fileError } = await supabase
        .from("order_files")
        .update({
          final_line_total: savedPrice,
          line_total: savedPrice,
          pricing_status: "pricing_updated",
          pricing_notes: savedNotes
        })
        .eq("id", file.id);

      if (fileError) throw fileError;

      const updatedFiles = (order.order_files ?? []).map((orderFile) =>
        orderFile.id === file.id
          ? {
              ...orderFile,
              final_line_total: savedPrice,
              line_total: savedPrice,
              pricing_status: "pricing_updated",
              pricing_notes: savedNotes
            }
          : orderFile
      );

      const manualFiles = updatedFiles.filter(isManualFile);
      const hasPendingManual = manualFiles.some(
        (orderFile) =>
          orderFile.final_line_total === null ||
          orderFile.final_line_total === undefined
      );

      const autoSubtotal = updatedFiles
        .filter((orderFile) => !isManualFile(orderFile))
        .reduce((sum, orderFile) => sum + Number(orderFile.line_total ?? 0), 0);

      const manualSubtotal = manualFiles.reduce(
        (sum, orderFile) => sum + Number(orderFile.final_line_total ?? 0),
        0
      );

      const finalTotal = Number(
        (autoSubtotal + manualSubtotal + Number(order.rush_fee_amount ?? 0)).toFixed(2)
      );

      const nextPaymentStatus =
        hasPendingManual
          ? "pending_pricing"
          : order.payment_method === "cash"
            ? "cash_on_pickup"
            : "pending_verification";

      const { error: orderError } = await supabase
        .from("orders")
        .update({
          final_total: hasPendingManual ? null : finalTotal,
          pricing_status: hasPendingManual ? "pending_pricing" : "pricing_finalized",
          requires_manual_pricing: hasPendingManual,
          payment_status: nextPaymentStatus
        })
        .eq("id", order.id);

      if (orderError) throw orderError;

      await loadOrders();
    } catch (error) {
      console.error(error);
      alert("Could not save manual price.");
    } finally {
      setUpdatingId("");
    }
  }

  async function openStoredFile(bucket: string, storagePath: string | null) {
    if (!storagePath) {
      alert("No uploaded file path found.");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 10);

      if (error) throw error;

      window.open(data.signedUrl, "_blank");
    } catch (error) {
      console.error(error);
      alert("Could not open file.");
    }
  }

  return (
    <main className="min-h-screen bg-snow-white text-snow-ink">
      <div className="mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-snow-ice bg-white p-6 lg:block">
          <BrandLogo subtitle="Admin dashboard" />

          <nav className="mt-8 space-y-2">
            <SideLink
              icon={<Home className="h-4 w-4" />}
              label="Home"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <SideLink
              icon={<ReceiptText className="h-4 w-4" />}
              label="Orders"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <SideLink
              icon={<WalletCards className="h-4 w-4" />}
              label="Payments"
              active={filter === "payment_review" || filter === "cash_pickup"}
              onClick={() => setFilter("payment_review")}
            />
            <Link
              to="/admin/queue"
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black text-snow-muted hover:bg-snow-ice hover:text-snow-navy"
            >
              <Printer className="h-4 w-4" />
              Printing Queue
            </Link>
            <Link
              to="/admin/pricing"
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black text-snow-muted hover:bg-snow-ice hover:text-snow-navy"
            >
              <Settings className="h-4 w-4" />
              Pricing
            </Link>
          </nav>

          <div className="mt-10 rounded-[1.5rem] bg-snow-ice p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                <Snowflake className="h-5 w-5 text-snow-blue" />
              </div>
              <div>
                <p className="text-sm font-black text-snow-navy">SnowPrint</p>
                <p className="text-xs text-snow-muted">Cute but organized ✦</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="p-4 sm:p-6 lg:p-8">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-snow-blue">Orders List</p>
              <h1 className="mt-1 text-3xl font-black text-snow-navy">Admin Orders</h1>
              <p className="mt-1 text-sm text-snow-muted">
                Manage files, manual pricing, payments, and pickup status in one place.
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                to="/admin/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-snow-blue bg-white px-5 py-3 text-sm font-black text-snow-navy"
              >
                <Settings className="h-4 w-4" />
                Pricing
              </Link>

              <button
                type="button"
                onClick={loadOrders}
                className="inline-flex items-center gap-2 rounded-full bg-snow-navy px-5 py-3 text-sm font-black text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </header>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard label="Total Orders" value={stats.total} />
            <StatCard label="Needs Pricing" value={stats.needsPricing} tone="amber" />
            <StatCard label="Payment Review" value={stats.paymentReview} tone="blue" />
            <StatCard label="Ready" value={stats.ready} tone="mint" />
            <StatCard label="Completed" value={stats.completed} tone="mint" />
            <StatCard label="Sales" value={`₱${stats.revenue.toFixed(2)}`} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
            <section className="rounded-[2rem] border border-snow-ice bg-white shadow-card">
              <div className="flex flex-col gap-3 border-b border-snow-ice p-5 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-snow-muted" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, order ID, claim code..."
                    className="w-full rounded-2xl border border-snow-ice bg-snow-white py-3 pl-10 pr-4 text-sm outline-none focus:border-snow-blue"
                  />
                </div>

                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="rounded-2xl border border-snow-ice bg-snow-white px-4 py-3 text-sm font-bold text-snow-navy outline-none focus:border-snow-blue"
                >
                  <option value="all">All orders</option>
                  <option value="needs_pricing">Needs pricing</option>
                  <option value="payment_review">Needs verification</option>
                  <option value="printing_queue">Printing queue</option>
                  <option value="cash_pickup">Cash on pickup</option>
                  <option value="received">Received</option>
                  <option value="in_progress">In progress</option>
                  <option value="ready_for_pickup">Ready</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {loading ? (
                <div className="flex min-h-80 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-snow-navy" />
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-10 text-center">
                  <PackageCheck className="mx-auto h-10 w-10 text-snow-blue" />
                  <p className="mt-3 font-black text-snow-navy">No orders found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-snow-white text-xs uppercase tracking-wide text-snow-muted">
                      <tr>
                        <th className="px-5 py-4">Customer</th>
                        <th className="px-5 py-4">Order ID</th>
                        <th className="px-5 py-4">Amount</th>
                        <th className="px-5 py-4">Payment</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Action</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-snow-ice">
                      {filteredOrders.map((order) => (
                        <tr
                          key={order.id}
                          className={selectedOrder?.id === order.id ? "bg-snow-ice/60" : "bg-white"}
                        >
                          <td className="px-5 py-4">
                            <p className="font-black text-snow-navy">{order.customer_name}</p>
                            <p className="text-xs text-snow-muted">{order.customer_email}</p>
                          </td>

                          <td className="px-5 py-4">
                            <p className="font-black text-snow-navy">{order.order_number}</p>
                            <p className="text-xs text-snow-muted">{order.claim_code}</p>
                          </td>

                          <td className="px-5 py-4">
                            <p className="font-black text-snow-navy">
                              ₱{getOrderTotal(order).toFixed(2)}
                            </p>
                            <p className="text-xs text-snow-muted">
                              {order.total_files} file(s)
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <PaymentPill value={order.payment_status} />
                            <p className="mt-1 text-xs text-snow-muted">
                              {formatStatus(order.payment_method)}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <StatusPill value={order.order_status} />
                            {order.pricing_status === "pending_pricing" && (
                              <p className="mt-1 text-xs font-black text-amber-700">
                                Needs price
                              </p>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => setSelectedOrderId(order.id)}
                              className="rounded-full border border-snow-ice bg-white px-4 py-2 text-xs font-black text-snow-navy hover:border-snow-blue"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <OrderDetailsPanel
              order={selectedOrder}
              updatingId={updatingId}
              onOrderStatusChange={updateOrderStatus}
              onPaymentStatusChange={updatePaymentStatus}
              onManualFilePriceSave={saveManualFilePrice}
              onOpenFile={openStoredFile}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function OrderDetailsPanel({
  order,
  updatingId,
  onOrderStatusChange,
  onPaymentStatusChange,
  onManualFilePriceSave,
  onOpenFile
}: {
  order: Order | null;
  updatingId: string;
  onOrderStatusChange: (orderId: string, status: string) => void;
  onPaymentStatusChange: (order: Order, status: string) => void;
  onManualFilePriceSave: (order: Order, file: OrderFile, price: number, notes: string) => void;
  onOpenFile: (bucket: string, storagePath: string | null) => void;
}) {
  if (!order) {
    return (
      <aside className="rounded-[2rem] border border-snow-ice bg-white p-6 shadow-card">
        <p className="font-black text-snow-navy">Select an order</p>
        <p className="mt-2 text-sm text-snow-muted">Order details will appear here.</p>
      </aside>
    );
  }

  const files = order.order_files ?? [];
  const payment = order.payments?.[0];

  return (
    <aside className="rounded-[2rem] border border-snow-ice bg-white p-6 shadow-card xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-snow-blue">
            Selected order
          </p>
          <h2 className="mt-1 text-2xl font-black text-snow-navy">
            {order.order_number}
          </h2>
          <p className="text-sm font-bold text-snow-muted">{order.claim_code}</p>
        </div>

        {order.pricing_status === "pending_pricing" ? (
          <StatusPill value="needs_pricing" />
        ) : (
          <StatusPill value={order.pricing_status} />
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <DetailBox label="Customer" value={order.customer_name} />
        <DetailBox label="Phone" value={order.customer_phone} />
        <DetailBox label="Amount" value={`₱${getOrderTotal(order).toFixed(2)}`} />
        <DetailBox label="Files" value={`${files.length}`} />
      </div>

      <div className="mt-5 grid gap-3">
        <label className="block text-xs font-black uppercase tracking-wide text-snow-muted">
          Order Status
          <select
            value={order.order_status}
            disabled={Boolean(updatingId)}
            onChange={(event) => onOrderStatusChange(order.id, event.target.value)}
            className="mt-2 w-full rounded-2xl border border-snow-ice bg-snow-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
          >
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-black uppercase tracking-wide text-snow-muted">
          Payment Status
          <select
            value={order.payment_status}
            disabled={Boolean(updatingId)}
            onChange={(event) => onPaymentStatusChange(order, event.target.value)}
            className="mt-2 w-full rounded-2xl border border-snow-ice bg-snow-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
          >
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatPaymentStatus(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {payment?.proof_storage_path && (
        <button
          type="button"
          onClick={() => onOpenFile("payment-proofs", payment.proof_storage_path)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-snow-navy px-4 py-3 text-sm font-black text-white"
        >
          <ShieldCheck className="h-4 w-4" />
          Open payment proof
        </button>
      )}

      <div className="mt-6">
        <p className="mb-3 flex items-center gap-2 font-black text-snow-navy">
          <FileText className="h-4 w-4" />
          Files & pricing
        </p>

        <div className="space-y-3">
          {files.map((file) => (
            <FileCard
              key={file.id}
              order={order}
              file={file}
              updating={updatingId === file.id}
              onSave={onManualFilePriceSave}
              onOpenFile={onOpenFile}
            />
          ))}

          {files.length === 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              No files are visible. Check order_files policies if this order should have files.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function FileCard({
  order,
  file,
  updating,
  onSave,
  onOpenFile
}: {
  order: Order;
  file: OrderFile;
  updating: boolean;
  onSave: (order: Order, file: OrderFile, price: number, notes: string) => void;
  onOpenFile: (bucket: string, storagePath: string | null) => void;
}) {
  const manual = isManualFile(file);
  const done =
    manual &&
    file.final_line_total !== null &&
    file.final_line_total !== undefined &&
    ["pricing_updated", "manual_priced", "pricing_finalized"].includes(
      file.pricing_status ?? ""
    );

  const [price, setPrice] = useState(
    Number(file.final_line_total ?? 0).toFixed(2)
  );
  const [notes, setNotes] = useState(file.pricing_notes ?? "");

  useEffect(() => {
    setPrice(Number(file.final_line_total ?? 0).toFixed(2));
    setNotes(file.pricing_notes ?? "");
  }, [file.id, file.final_line_total, file.pricing_notes]);

  return (
    <div className={`rounded-2xl border p-4 ${manual ? "border-amber-100 bg-amber-50" : "border-snow-ice bg-snow-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-black text-snow-navy">{file.file_name}</p>
          <p className="mt-1 text-xs text-snow-muted">
            {file.paper_size.toUpperCase()} · {formatStatus(file.print_mode)} · {file.page_count} page(s)
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenFile("snowprint-files", file.storage_path)}
          className="shrink-0 rounded-full bg-snow-navy px-3 py-2 text-xs font-black text-white"
        >
          <Download className="h-3 w-3" />
        </button>
      </div>

      {!manual && (
        <div className="mt-3 rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase tracking-wide text-snow-muted">
            Auto price locked
          </p>
          <p className="mt-1 font-black text-snow-navy">
            ₱{Number(file.line_total ?? 0).toFixed(2)}
          </p>
        </div>
      )}

      {manual && done && (
        <div className="mt-3 rounded-2xl bg-white p-3">
          <p className="text-xs font-black uppercase tracking-wide text-snow-muted">
            Manual price saved
          </p>
          <p className="mt-1 text-xl font-black text-snow-navy">
            ₱{Number(file.final_line_total ?? 0).toFixed(2)}
          </p>
          {file.pricing_notes && (
            <p className="mt-1 text-xs font-bold text-snow-muted">
              {file.pricing_notes}
            </p>
          )}
        </div>
      )}

      {manual && !done && (
        <div className="mt-3 space-y-3 rounded-2xl bg-white p-3">
          <p className="text-xs font-black text-amber-800">
            {file.manual_pricing_reason ?? "Manual pricing needed"}
          </p>

          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm font-bold text-snow-navy outline-none"
            placeholder="Manual price"
          />

          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm text-snow-navy outline-none"
            placeholder="Pricing notes"
          />

          <button
            type="button"
            disabled={updating}
            onClick={() => onSave(order, file, Number(price), notes)}
            className="w-full rounded-full bg-snow-navy px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {updating ? "Saving..." : "Save Price"}
          </button>
        </div>
      )}
    </div>
  );
}

function SideLink({
  icon,
  label,
  active = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black ${
        active ? "bg-snow-ice text-snow-navy" : "text-snow-muted hover:bg-snow-ice"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "blue" | "mint";
}) {
  const iconClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "mint"
        ? "bg-snow-mint text-snow-navy"
        : tone === "blue"
          ? "bg-snow-ice text-snow-blue"
          : "bg-white text-snow-navy";

  return (
    <div className="rounded-[1.5rem] border border-snow-ice bg-white p-4 shadow-card">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${iconClass}`}>
        {tone === "amber" ? (
          <AlertCircle className="h-4 w-4" />
        ) : tone === "mint" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : tone === "blue" ? (
          <Clock3 className="h-4 w-4" />
        ) : (
          <ReceiptText className="h-4 w-4" />
        )}
      </div>
      <p className="text-xs font-black uppercase tracking-wide text-snow-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-snow-navy">{value}</p>
    </div>
  );
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-snow-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-snow-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black text-snow-navy">
        {value}
      </p>
    </div>
  );
}

function PaymentPill({ value }: { value: string }) {
  const cleanValue = String(value ?? "").trim().toLowerCase();

  const className =
    cleanValue === "pending_verification" || cleanValue === "submitted"
      ? "bg-amber-100 text-amber-800"
      : cleanValue === "verified" || cleanValue === "cash_on_pickup"
        ? "bg-snow-mint text-snow-navy"
        : cleanValue === "rejected"
          ? "bg-red-100 text-red-700"
          : "bg-snow-ice text-snow-navy";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {formatPaymentStatus(cleanValue)}
    </span>
  );
}

function formatPaymentStatus(value: string) {
  const cleanValue = String(value ?? "").trim().toLowerCase();

  if (cleanValue === "pending_verification" || cleanValue === "submitted") {
    return "Needs Verification";
  }

  if (cleanValue === "cash_on_pickup") {
    return "Cash on Pickup";
  }

  if (cleanValue === "verified") {
    return "Payment Received";
  }

  if (cleanValue === "rejected") {
    return "Rejected";
  }

  if (cleanValue === "pending" || cleanValue === "") {
    return "Unpaid";
  }

  return formatStatus(cleanValue);
}

function StatusPill({ value }: { value: string }) {
  const cleanValue = value ?? "";
  const className =
    cleanValue.includes("pending") || cleanValue.includes("pricing")
      ? "bg-amber-100 text-amber-800"
      : cleanValue.includes("ready") ||
          cleanValue.includes("verified") ||
          cleanValue.includes("completed") ||
          cleanValue.includes("cash")
        ? "bg-snow-mint text-snow-navy"
        : cleanValue.includes("cancel") || cleanValue.includes("reject")
          ? "bg-red-100 text-red-700"
          : "bg-snow-ice text-snow-navy";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {formatStatus(cleanValue)}
    </span>
  );
}

function isManualFile(file: OrderFile) {
  const extension = file.file_name.toLowerCase().split(".").pop() ?? "";
  const isOfficePrepFile = ["doc", "docx", "odt", "ppt", "pptx"].includes(extension);

  if (
    file.preparation_status === "completed" ||
    Boolean(file.print_ready_storage_path)
  ) {
    return false;
  }

  if (
    isOfficePrepFile &&
    ["queued", "processing", "preparing_files", "pending_options", "not_needed"].includes(
      file.preparation_status ?? "queued"
    )
  ) {
    return false;
  }

  return Boolean(
    file.requires_manual_pricing ||
      ["xls", "xlsx"].includes(extension) ||
      file.service_type === "bulk" ||
      file.service_type === "specialty" ||
      file.print_mode === "manual"
  );
}

function getOrderTotal(order: Order) {
  if (order.final_total !== null && order.final_total !== undefined) {
    return Number(order.final_total);
  }

  return Number(order.estimated_total ?? 0);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
