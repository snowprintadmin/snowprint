import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  RefreshCw,
  Snowflake,
  X
} from "lucide-react";
import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { supabase } from "../lib/supabase";

type AdminAlert = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  related_order_id: string | null;
  related_order_file_id: string | null;
  related_batch_id: string | null;
  created_at: string;
};

type BatchFile = {
  id: string;
  file_name: string;
  paper_size: string;
  print_mode: string;
  side_mode: string;
  service_type: string;
  billed_pages: number;
  sheets: number;
  print_status: string;
  printed_successfully: boolean;
  print_issue_type: string | null;
  print_issue_note: string | null;
  needs_print_preparation: boolean;
  preparation_status: string;
  print_ready_storage_path: string | null;
  orders?: {
    order_number: string;
    claim_code: string;
    customer_name: string;
    payment_status: string;
    order_status: string;
    pickup_window: string | null;
  };
};

type PrintBatch = {
  id: string;
  batch_code: string;
  batch_status: string;
  queue_type: string;
  pickup_date: string | null;
  pickup_window: string;
  paper_size: string;
  print_mode: string;
  side_mode: string;
  service_type: string;
  total_files: number;
  total_pages: number;
  total_sheets: number;
  created_at: string;
  pause_reason: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  order_files?: BatchFile[];
};

export default function AdminQueuePage() {
  const [batches, setBatches] = useState<PrintBatch[]>([]);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [issueFile, setIssueFile] = useState<BatchFile | null>(null);
  const [issueType, setIssueType] = useState("printer_jam");
  const [issueNote, setIssueNote] = useState("");
  const [printerIssueBatchId, setPrinterIssueBatchId] = useState("");
  const [printerIssueType, setPrinterIssueType] = useState("no_paper");
  const [printerIssueMessage, setPrinterIssueMessage] = useState("");

  useEffect(() => {
    loadDashboard();

    const timer = window.setInterval(() => {
      loadBatches();
      loadAlerts();
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const activeAlert = alerts[0] ?? null;

  const stats = useMemo(() => {
    return {
      queued: batches.filter((batch) => batch.batch_status === "queued").length,
      printing: batches.filter((batch) => batch.batch_status === "printing").length,
      ready: batches.filter((batch) => batch.batch_status === "ready_for_pickup").length,
      issues: batches.reduce(
        (sum, batch) =>
          sum +
          (batch.order_files ?? []).filter((file) => file.print_status === "print_issue").length,
        0
      ),
      files: batches.reduce((sum, batch) => sum + Number(batch.total_files ?? 0), 0)
    };
  }, [batches]);

  async function loadDashboard() {
    setLoading(true);

    try {
      await Promise.all([loadBatches(), loadAlerts()]);
    } finally {
      setLoading(false);
    }
  }

  async function loadBatches() {
    const { data, error } = await supabase
      .from("print_batches")
      .select(
        `
        *,
        order_files (
          id,
          file_name,
          paper_size,
          print_mode,
          side_mode,
          service_type,
          billed_pages,
          sheets,
          print_status,
          printed_successfully,
          print_issue_type,
          print_issue_note,
          needs_print_preparation,
          preparation_status,
          print_ready_storage_path,
          orders (
            order_number,
            claim_code,
            customer_name,
            payment_status,
            order_status,
            pickup_window
          )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("Could not load printing queue. Check print_batches policies.");
      return;
    }

    setBatches((data ?? []) as PrintBatch[]);
  }

  async function loadAlerts() {
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("*")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error(error);
      return;
    }

    setAlerts((data ?? []) as AdminAlert[]);
  }

  async function updateBatchStatus(batchId: string, status: string) {
    setUpdatingId(batchId);

    try {
      const { error } = await supabase.rpc("snowprint_set_batch_status", {
        p_batch_id: batchId,
        p_status: status
      });

      if (error) throw error;

      await loadDashboard();
    } catch (error) {
      console.error(error);
      alert("Could not update batch status.");
    } finally {
      setUpdatingId("");
    }
  }

  async function markFilePrinted(fileId: string) {
    setUpdatingId(fileId);

    try {
      const { error } = await supabase.rpc("snowprint_set_file_print_status", {
        p_file_id: fileId,
        p_status: "printed_successfully",
        p_issue_type: null,
        p_issue_note: null
      });

      if (error) throw error;

      await loadDashboard();
    } catch (error) {
      console.error(error);
      alert("Could not mark file as printed.");
    } finally {
      setUpdatingId("");
    }
  }

  async function submitFileIssue() {
    if (!issueFile) return;

    setUpdatingId(issueFile.id);

    try {
      const { error } = await supabase.rpc("snowprint_set_file_print_status", {
        p_file_id: issueFile.id,
        p_status: "print_issue",
        p_issue_type: issueType,
        p_issue_note: issueNote.trim() || null
      });

      if (error) throw error;

      setIssueFile(null);
      setIssueType("printer_jam");
      setIssueNote("");
      await loadDashboard();
    } catch (error) {
      console.error(error);
      alert("Could not save file issue.");
    } finally {
      setUpdatingId("");
    }
  }

  async function resolveAlert(alertId: string) {
    try {
      const { error } = await supabase.rpc("snowprint_resolve_printer_alert_continue", {
        p_alert_id: alertId
      });

      if (error) throw error;

      await loadDashboard();
    } catch (error) {
      console.error(error);
      alert("Could not resolve alert.");
    }
  }

  async function createPrinterAlert() {
    if (!printerIssueBatchId) {
      alert("Please choose the affected batch.");
      return;
    }

    try {
      const { error } = await supabase.rpc("snowprint_create_printer_alert", {
        p_batch_id: printerIssueBatchId,
        p_alert_type: printerIssueType,
        p_message: printerIssueMessage.trim() || null
      });

      if (error) throw error;

      setPrinterIssueBatchId("");
      setPrinterIssueType("no_paper");
      setPrinterIssueMessage("");
      await loadDashboard();
    } catch (error) {
      console.error(error);
      alert("Could not create printer alert.");
    }
  }

  return (
    <main className="min-h-screen bg-snow-white text-snow-ink">
      {activeAlert && (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-[1.5rem] border border-red-200 bg-white p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-black text-red-700">{activeAlert.title}</p>
              <p className="mt-1 text-sm text-snow-muted">{activeAlert.message}</p>

              <button
                type="button"
                onClick={() => resolveAlert(activeAlert.id)}
                className="mt-4 rounded-full bg-snow-navy px-4 py-2 text-xs font-black text-white"
              >
                Resolved / Continue Printing
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAlerts((current) => current.slice(1))}
              className="rounded-full p-2 text-snow-muted hover:bg-snow-ice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {issueFile && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-snow-navy/40 p-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black text-snow-navy">Report print issue</h2>
            <p className="mt-1 break-words text-sm text-snow-muted">{issueFile.file_name}</p>

            <label className="mt-5 block text-xs font-black uppercase tracking-wide text-snow-muted">
              Issue type
              <select
                value={issueType}
                onChange={(event) => setIssueType(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm font-bold text-snow-navy outline-none"
              >
                <option value="printer_jam">Printer jam</option>
                <option value="low_ink">Low ink / poor print quality</option>
                <option value="no_paper">No paper</option>
                <option value="wrong_paper">Wrong paper size</option>
                <option value="layout_issue">Layout issue</option>
                <option value="conversion_issue">PDF conversion/layout issue</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="mt-4 block text-xs font-black uppercase tracking-wide text-snow-muted">
              Notes
              <textarea
                value={issueNote}
                onChange={(event) => setIssueNote(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm text-snow-navy outline-none"
                placeholder="Example: Page 3 has wrong margin / printer jammed after 10 sheets"
              />
            </label>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setIssueFile(null)}
                className="flex-1 rounded-full border border-snow-ice bg-white px-4 py-3 text-sm font-black text-snow-navy"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={updatingId === issueFile.id}
                onClick={submitFileIssue}
                className="flex-1 rounded-full bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                Save issue
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-snow-ice bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-2 text-sm font-black text-snow-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Orders
          </Link>

          <BrandLogo subtitle="Automatic batching" />

          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-2 rounded-full bg-snow-navy px-5 py-3 text-sm font-black text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div>
          <p className="text-sm font-black text-snow-blue">Printing Queue</p>
          <h1 className="mt-1 text-3xl font-black text-snow-navy">
            Automatic Batches
          </h1>
          <p className="mt-1 text-sm text-snow-muted">
            Each file can now be marked as printed successfully or flagged for an issue.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-5">
          <Stat label="Queued" value={stats.queued} />
          <Stat label="Printing" value={stats.printing} />
          <Stat label="Ready" value={stats.ready} />
          <Stat label="Issues" value={stats.issues} />
          <Stat label="Files" value={stats.files} />
        </div>

        <div className="mt-6 rounded-[2rem] border border-amber-100 bg-amber-50 p-5">
          <p className="font-black text-amber-900">Automatic printer issue detector</p>
          <p className="mt-1 text-sm text-amber-800">
            SnowPrint will notify the admin automatically when the local printer agent detects no paper, low ink, jam, wrong paper, or printer offline. Admin only needs to resolve the issue and continue printing.
          </p>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
            <p className="text-sm font-black text-amber-900">Detector status</p>
            <p className="mt-1 text-sm text-amber-800">
              Listening for alerts from the local printer agent.
            </p>
            <p className="mt-2 text-xs font-bold text-amber-700">
              Keep this running on the computer connected to the printer:
              <span className="ml-1 rounded-lg bg-amber-100 px-2 py-1 font-mono">npm run printer:agent</span>
            </p>
          </div>

          {import.meta.env.VITE_SHOW_PRINTER_SIMULATOR === "true" && (
<div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_1.5fr_auto]">
            <select
              value={printerIssueBatchId}
              onChange={(event) => setPrinterIssueBatchId(event.target.value)}
              className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
            >
              <option value="">Choose active batch</option>
              {batches
                .filter((batch) => ["queued", "printing", "paused_issue"].includes(batch.batch_status))
                .map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batch_code} · {formatStatus(batch.batch_status)}
                  </option>
                ))}
            </select>

            <select
              value={printerIssueType}
              onChange={(event) => setPrinterIssueType(event.target.value)}
              className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
            >
              <option value="no_paper">No paper</option>
              <option value="low_ink">Low ink</option>
              <option value="printer_jam">Printer jam</option>
              <option value="wrong_paper">Wrong paper</option>
              <option value="printer_offline">Printer offline</option>
              <option value="waste_tank_full">Waste tank full</option>
            </select>

            <input
              value={printerIssueMessage}
              onChange={(event) => setPrinterIssueMessage(event.target.value)}
              placeholder="Optional note, e.g. load A4 paper"
              className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-snow-navy outline-none"
            />

            <button
              type="button"
              onClick={createPrinterAlert}
              className="rounded-full bg-amber-600 px-5 py-3 text-sm font-black text-white"
            >
              Show Popup
            </button>
          </div>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-snow-navy" />
          </div>
        ) : batches.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-snow-ice bg-white p-10 text-center shadow-card">
            <Snowflake className="mx-auto h-10 w-10 text-snow-blue" />
            <p className="mt-3 font-black text-snow-navy">No batches yet</p>
            <p className="mt-1 text-sm text-snow-muted">
              Orders appear here automatically once pricing and payment requirements are complete.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5">
            {batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                updatingId={updatingId}
                onUpdate={updateBatchStatus}
                onPrinted={markFilePrinted}
                onIssue={(file) => setIssueFile(file)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function BatchCard({
  batch,
  updatingId,
  onUpdate,
  onPrinted,
  onIssue
}: {
  batch: PrintBatch;
  updatingId: string;
  onUpdate: (batchId: string, status: string) => void;
  onPrinted: (fileId: string) => void;
  onIssue: (file: BatchFile) => void;
}) {
  const files = batch.order_files ?? [];

  return (
    <article className="rounded-[2rem] border border-snow-ice bg-white p-6 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-black text-snow-navy">{batch.batch_code}</h2>
            <StatusPill value={batch.batch_status} />
            <QueuePill value={batch.queue_type} />
          </div>

          <p className="mt-2 text-sm text-snow-muted">
            {batch.paper_size.toUpperCase()} · {formatStatus(batch.print_mode)} ·{" "}
            {formatStatus(batch.side_mode)} · {formatStatus(batch.service_type)}
          </p>

          <p className="mt-1 text-sm font-bold text-snow-navy">
            Pickup:{" "}
            {batch.queue_type === "on_the_spot"
              ? "Subject to availability"
              : `${batch.pickup_date ?? "Next schedule"} · ${batch.pickup_window}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {batch.batch_status === "queued" && (
            <button
              type="button"
              disabled={Boolean(updatingId)}
              onClick={() => onUpdate(batch.id, "printing")}
              className="inline-flex items-center gap-2 rounded-full bg-snow-navy px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Start Printing
            </button>
          )}

          {batch.batch_status === "printing" && (
            <p className="rounded-full bg-amber-100 px-5 py-3 text-sm font-black text-amber-800">
              Mark each file below after printing
            </p>
          )}

          {batch.batch_status === "paused_issue" && (
            <p className="rounded-full bg-red-100 px-5 py-3 text-sm font-black text-red-700">
              Paused: {formatStatus(batch.pause_reason ?? "printer issue")}
            </p>
          )}

          {batch.batch_status === "ready_for_pickup" && (
            <button
              type="button"
              disabled={Boolean(updatingId)}
              onClick={() => onUpdate(batch.id, "completed")}
              className="rounded-full border border-snow-blue bg-white px-5 py-3 text-sm font-black text-snow-navy disabled:opacity-50"
            >
              Complete Batch
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Mini label="Files" value={String(batch.total_files)} />
        <Mini label="Pages" value={String(batch.total_pages)} />
        <Mini label="Sheets" value={String(batch.total_sheets)} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-snow-ice">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-snow-white text-xs uppercase tracking-wide text-snow-muted">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Preparation</th>
              <th className="px-4 py-3">Print status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-snow-ice bg-white">
            {files.map((file) => (
              <tr key={file.id}>
                <td className="px-4 py-3">
                  <p className="break-words font-black text-snow-navy">{file.file_name}</p>
                  <p className="text-xs text-snow-muted">
                    {file.billed_pages} page(s), {file.sheets} sheet(s)
                  </p>
                </td>

                <td className="px-4 py-3">
                  <p className="font-black text-snow-navy">
                    {file.orders?.order_number ?? "—"}
                  </p>
                  <p className="text-xs text-snow-muted">
                    {file.orders?.claim_code ?? "—"}
                  </p>
                </td>

                <td className="px-4 py-3">{file.orders?.customer_name ?? "—"}</td>

                <td className="px-4 py-3">
                  {file.needs_print_preparation ? (
                    <StatusPill value={file.preparation_status} />
                  ) : (
                    <StatusPill value="not_needed" />
                  )}
                </td>

                <td className="px-4 py-3">
                  <StatusPill value={file.print_status} />
                  {file.print_issue_note && (
                    <p className="mt-1 max-w-xs text-xs text-red-700">
                      {file.print_issue_note}
                    </p>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        updatingId === file.id ||
                        file.print_status === "printed_successfully" ||
                        batch.batch_status === "queued" ||
                        batch.batch_status === "paused_issue"
                      }
                      onClick={() => onPrinted(file.id)}
                      className="inline-flex items-center gap-2 rounded-full bg-snow-mint px-4 py-2 text-xs font-black text-snow-navy disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Printed
                    </button>

                    <button
                      type="button"
                      disabled={
                        updatingId === file.id ||
                        batch.batch_status === "queued" ||
                        batch.batch_status === "paused_issue"
                      }
                      onClick={() => onIssue(file)}
                      className="rounded-full bg-red-100 px-4 py-2 text-xs font-black text-red-700 disabled:opacity-40"
                    >
                      Issue
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-snow-ice bg-white p-5 shadow-card">
      <p className="text-xs font-black uppercase tracking-wide text-snow-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-snow-navy">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-snow-white p-4">
      <p className="text-xs font-black uppercase tracking-wide text-snow-muted">{label}</p>
      <p className="mt-1 font-black text-snow-navy">{value}</p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const className =
    value.includes("issue") || value.includes("failed")
      ? "bg-red-100 text-red-700"
      : value.includes("queued") || value.includes("pending")
        ? "bg-snow-ice text-snow-navy"
        : value.includes("printing") || value.includes("progress")
          ? "bg-amber-100 text-amber-800"
          : value.includes("ready") ||
              value.includes("completed") ||
              value.includes("success") ||
              value.includes("approved") ||
              value.includes("not_needed")
            ? "bg-snow-mint text-snow-navy"
            : "bg-snow-ice text-snow-navy";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {formatStatus(value)}
    </span>
  );
}

function QueuePill({ value }: { value: string }) {
  const className =
    value === "rush"
      ? "bg-amber-100 text-amber-800"
      : value === "on_the_spot"
        ? "bg-snow-mint text-snow-navy"
        : "bg-snow-ice text-snow-navy";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {formatStatus(value)}
    </span>
  );
}

function formatStatus(value: string) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
