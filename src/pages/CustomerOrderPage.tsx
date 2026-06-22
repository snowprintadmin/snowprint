import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";


import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import BrandLogo from "../components/BrandLogo";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Printer,
  ReceiptText,
  Trash2,
  UploadCloud,
  Wallet
} from "lucide-react";

type CreatedSnowprintOrder = {
  id: string;
  order_number: string;
  claim_code: string;
};

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PaperSize = "short" | "a4" | "long";
type PrintMode = "auto" | "bw" | "colored" | "mixed";
type SideMode = "single_sided" | "double_sided";
type ServiceType = "standard" | "bulk" | "specialty";
type PickupType = "scheduled" | "on_the_spot";
type PaymentMethod = "cash" | "gcash" | "maya" | "bank_transfer";
type AnalysisStatus = "analyzing" | "detected" | "manual" | "partial";
type RangeMode = "full" | "specific" | "full_with_extra";

type PageColorInfo = {
  pageNumber: number;
  colorPercent: number;
  tier: "bw" | "light" | "medium" | "full";
};

type FileAnalysis = {
  status: AnalysisStatus;
  message: string;
  pageCount: number;
  averageColorPercent: number;
  pages: PageColorInfo[];
};

type PrintConfig = {
  paperSize: PaperSize;
  printMode: PrintMode;
  sideMode: SideMode;
  serviceType: ServiceType;
  pickupType: PickupType;
  rangeMode: RangeMode;
  specificPages: string;
  copies: number;
  extraCopies: number;
  pageCount: number;
  coloredPages: number;
  slidesPerPage?: number;
  prepOrientation?: "portrait" | "landscape";
  prepMargins?: "normal" | "narrow" | "wide";
  slideBorder?: boolean;
};

type UploadedFileItem = {
  id: string;
  file: File;
  analysis: FileAnalysis;
  config: PrintConfig;
};

type SummaryLine = {
  id: string;
  filename: string;
  modeLabel: string;
  pageCount: number;
  billedPages: number;
  copies: number;
  extraCopies: number;
  basePageCount: number;
  extraPageCount: number;
  sheets: number;
  bwPages: number;
  lightPages: number;
  mediumPages: number;
  fullColorPages: number;
  averageColorPercent: number;
  discount: number;
  lineTotal: number;
  needsQuote: boolean;
};

type OrderSummary = {
  files: number;
  billedPages: number;
  sheets: number;
  rushFee: number;
  total: number;
  lines: SummaryLine[];
};

const PRICE = {
  bw: {
    short: 2,
    a4: 2,
    long: 3
  },
  colored: {
    short: 5,
    a4: 5,
    long: 6
  }
};

export default function CustomerOrderPage() {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isRushOrder, setIsRushOrder] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [submittedOrder, setSubmittedOrder] = useState<{
    orderNumber: string;
    claimCode: string;
  } | null>(null);

  const clientRequestIdRef = useRef(
    sessionStorage.getItem("snowprint_client_request_id") ?? crypto.randomUUID()
  );

  if (!sessionStorage.getItem("snowprint_client_request_id")) {
    sessionStorage.setItem(
      "snowprint_client_request_id",
      clientRequestIdRef.current
    );
  }

  const summary = useMemo<OrderSummary>(() => {
    const lines = files.map((item) => buildSummaryLine(item));

    return {
      files: files.length,
      billedPages: lines.reduce((sum, line) => sum + line.billedPages, 0),
      sheets: lines.reduce((sum, line) => sum + line.sheets, 0),
      rushFee: 0,
      total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      lines
    };
  }, [files]);

  function addFiles(fileList: FileList | File[]) {
    const newFiles = Array.from(fileList).map((file) => {
      const item: UploadedFileItem = {
        id: crypto.randomUUID(),
        file,
        analysis: {
          status: "analyzing",
          message: "Checking file pages and color percentage...",
          pageCount: 1,
          averageColorPercent: 0,
          pages: []
        },
        config: {
          paperSize: "a4",
          printMode: "auto",
          sideMode: "single_sided",
          serviceType: "standard",
          pickupType: "scheduled",
          rangeMode: "full",
          specificPages: "",
          copies: 1,
          extraCopies: 1,
          pageCount: 1,
          coloredPages: 0,
          slidesPerPage: 1,
          prepOrientation: "landscape",
          prepMargins: "normal",
          slideBorder: true
        }
      };

      return item;
    });

    setFiles((current) => [...current, ...newFiles]);

    newFiles.forEach((item) => {
      analyzeUploadedFile(item.id, item.file);
    });
  }

  async function analyzeUploadedFile(fileId: string, file: File) {
    const lowerName = file.name.toLowerCase();

    try {
      if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
        const result = await analyzePdfFile(file, (message) => {
          setFiles((current) =>
            current.map((item) =>
              item.id === fileId
                ? {
                    ...item,
                    analysis: {
                      ...item.analysis,
                      status: "analyzing",
                      message
                    }
                  }
                : item
            )
          );
        });

        setFiles((current) =>
          current.map((item) =>
            item.id === fileId
              ? {
                  ...item,
                  analysis: result,
                  config: {
                    ...item.config,
                    pageCount: result.pageCount,
                    coloredPages: result.pages.filter((page) => page.tier !== "bw").length,
                    printMode: "auto"
                  }
                }
              : item
          )
        );

        return;
      }

      if (
        file.type.startsWith("image/") ||
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".jpeg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".webp")
      ) {
        const colorPercent = await analyzeImageColorPercent(file);
        const tier = getColorTier(colorPercent);

        setFiles((current) =>
          current.map((item) =>
            item.id === fileId
              ? {
                  ...item,
                  analysis: {
                    status: "detected",
                    message: `Image detected as 1 page. Color area: ${colorPercent.toFixed(2)}%.`,
                    pageCount: 1,
                    averageColorPercent: colorPercent,
                    pages: [
                      {
                        pageNumber: 1,
                        colorPercent,
                        tier
                      }
                    ]
                  },
                  config: {
                    ...item.config,
                    pageCount: 1,
                    coloredPages: tier === "bw" ? 0 : 1,
                    printMode: "auto"
                  }
                }
              : item
          )
        );

        return;
      }

      setFiles((current) =>
        current.map((item) =>
          item.id === fileId
            ? {
                ...item,
                analysis: {
                  status: "manual",
                  message:
                    "Print preparation enabled. SnowPrint will convert this to a print-ready PDF and compute the price automatically.",
                  pageCount: 1,
                  averageColorPercent: 0,
                  pages: []
                },
                config: {
                  ...item.config,
                  printMode: "bw",
                  pageCount: 1,
                  coloredPages: 0
                }
              }
            : item
        )
      );
    } catch (error) {
      console.error(error);

      setFiles((current) =>
        current.map((item) =>
          item.id === fileId
            ? {
                ...item,
                analysis: {
                  status: "partial",
                  message:
                    "File accepted. Auto-analysis had an issue, but you can still enter pages manually.",
                  pageCount: item.config.pageCount || 1,
                  averageColorPercent: 0,
                  pages: []
                },
                config: {
                  ...item.config,
                  printMode: "mixed"
                }
              }
            : item
        )
      );
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  function updateConfig(fileId: string, patch: Partial<PrintConfig>) {
    setFiles((current) =>
      current.map((item) =>
        item.id === fileId
          ? { ...item, config: { ...item.config, ...patch } }
          : item
      )
    );
  }

  function removeFile(fileId: string) {
    setFiles((current) => current.filter((item) => item.id !== fileId));
  }

  function startNewOrder() {
    const newRequestId = crypto.randomUUID();
    clientRequestIdRef.current = newRequestId;
    sessionStorage.setItem("snowprint_client_request_id", newRequestId);

    setSubmittedOrder(null);
    setUploadStatus("");
    setSubmitting(false);
  }


  const pricedSummary = useMemo<OrderSummary>(() => {
    const rushFee = isRushOrder ? 10 : 0;

    return {
      ...summary,
      rushFee,
      total: Number((summary.total + rushFee).toFixed(2))
    };
  }, [summary, isRushOrder]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (submitting) return;

    if (submittedOrder) {
      alert(
        `This order was already submitted.\n\nOrder Number: ${submittedOrder.orderNumber}\nClaim Code: ${submittedOrder.claimCode}`
      );
      return;
    }

    if (files.length === 0) {
      alert("Please upload at least one file first.");
      return;
    }

    for (const item of files) {
      if (
        item.config.rangeMode === "specific" &&
        parsePageSelection(item.config.specificPages, item.config.pageCount).length === 0
      ) {
        alert(`Please enter specific pages for ${item.file.name}. Example: 1-3, 7, 10-12`);
        return;
      }

      if (
        item.config.rangeMode === "full_with_extra" &&
        parsePageSelection(item.config.specificPages, item.config.pageCount).length === 0
      ) {
        alert(`Please enter extra pages for ${item.file.name}. Example: 1-3, 7, 10-12`);
        return;
      }
    }

    setSubmitting(true);
    setSubmittedOrder(null);
    clientRequestIdRef.current = crypto.randomUUID();
    setUploadStatus("Saving order details...");

    try {
setUploadStatus("Saving order details...");

      const hasPreparationFiles = files.some((item: UploadedFileItem) =>
        snowprintNeedsPreparation(item.file.name)
      );

      const requiresManualPricing = files.some(snowprintFileNeedsManualPricing);
      const manualPricingReason = requiresManualPricing
        ? files.map(snowprintFileManualReason).filter(Boolean).join(", ") || "Manual pricing needed"
        : null;
      const estimatedTotalForOrder = requiresManualPricing
        ? 0
        : Number(pricedSummary.total.toFixed(2));

      const { data: rawOrder, error: orderError } = await supabase
        .rpc("create_snowprint_order", {
          p_client_request_id: clientRequestIdRef.current,
          p_customer_name: customerName,
          p_customer_email: customerEmail,
          p_customer_phone: customerPhone,
          p_payment_method: paymentMethod,
          p_payment_status: hasPreparationFiles
          ? "preparing_files"
          : requiresManualPricing
            ? "pending_pricing"
            : paymentMethod === "cash"
            ? "cash_on_pickup"
            : "pending_verification",
          p_notes: notes,
          p_estimated_total: estimatedTotalForOrder,
          p_total_files: summary.files,
          p_total_pages: summary.billedPages,
          p_total_sheets: summary.sheets
        })
        .single();

      if (orderError) throw orderError;

      if (!rawOrder) {
        throw new Error("No order was returned from Supabase.");
      }

      const order = rawOrder as CreatedSnowprintOrder;

      const { error: orderMetaError } = await supabase
        .from("orders")
        .update({
          is_rush_order: isRushOrder,
          rush_fee_amount: Number(pricedSummary.rushFee.toFixed(2)),
          requires_manual_pricing: hasPreparationFiles ? false : requiresManualPricing,
          pricing_status: hasPreparationFiles
            ? "preparing_files"
            : requiresManualPricing
              ? "pending_pricing"
              : "auto_priced",
          manual_pricing_reason: hasPreparationFiles ? null : manualPricingReason,
          final_total: hasPreparationFiles || requiresManualPricing
            ? null
            : Number(pricedSummary.total.toFixed(2))
        })
        .eq("id", order.id);

      if (orderMetaError) throw orderMetaError;

      const orderFileRows: Array<Record<string, unknown>> = [];

      for (const [index, item] of files.entries()) {
        const line = summary.lines.find((summaryLine) => summaryLine.id === item.id);
        const fileManualPricing = snowprintFileNeedsManualPricing(item);
        const fileManualReason = fileManualPricing
          ? snowprintFileManualReason(item)
          : null;
        const safeFileName = sanitizeStorageFileName(item.file.name);
        const storagePath = `${order.id}/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}-${safeFileName}`;

        setUploadStatus(`Uploading file ${index + 1} of ${files.length}: ${item.file.name}`);

        const { error: uploadError } = await supabase.storage
          .from("snowprint-files")
          .upload(storagePath, item.file, {
            cacheControl: "3600",
            upsert: true,
            contentType: item.file.type || getFileContentType(item.file.name)
          });

        if (uploadError) throw uploadError;

        orderFileRows.push({
          order_id: order.id,
          file_name: item.file.name,
          file_size: item.file.size,
          storage_path: storagePath,

          paper_size: item.config.paperSize,
          print_mode: item.config.printMode,
          side_mode: item.config.sideMode,
          service_type: item.config.serviceType,
          pickup_type: item.config.pickupType,
          range_mode: item.config.rangeMode,

          specific_pages: item.config.specificPages || null,
          copies: item.config.copies,
          extra_copies: item.config.extraCopies,
          page_count: item.config.pageCount,
          colored_pages: item.config.coloredPages,
          billed_pages: line?.billedPages ?? 0,
          sheets: line?.sheets ?? 0,

          average_color_percent: Number(item.analysis.averageColorPercent.toFixed(4)),
          line_total: snowprintNeedsPreparation(item.file.name) || fileManualPricing ? 0 : Number((line?.lineTotal ?? 0).toFixed(2)),
          auto_line_total: Number((line?.lineTotal ?? 0).toFixed(2)),
          final_line_total: snowprintNeedsPreparation(item.file.name) || fileManualPricing ? null : Number((line?.lineTotal ?? 0).toFixed(2)),
          requires_manual_pricing: snowprintNeedsPreparation(item.file.name) ? false : fileManualPricing,
          manual_pricing_reason: snowprintNeedsPreparation(item.file.name) ? null : fileManualReason,
          pricing_status: snowprintNeedsPreparation(item.file.name)
        ? "preparing_files"
        : fileManualPricing
          ? "pending_pricing"
          : "auto_priced",
      needs_print_preparation: snowprintNeedsPreparation(item.file.name),
      preparation_status: snowprintNeedsPreparation(item.file.name) ? "queued" : "not_needed",
      customer_approved_pdf: !snowprintNeedsPreparation(item.file.name),
      preparation_options: snowprintPreparationOptionsFor(item),
      preparation_fee: 0,
      preparation_reason: snowprintNeedsPreparation(item.file.name)
        ? "File will be converted into a print-ready PDF. Final price is computed after conversion."
        : null
        });
      }

      setUploadStatus("Saving uploaded file records...");

      const { error: filesError } = await supabase
        .from("order_files")
        .insert(orderFileRows);

      if (filesError) throw filesError;

      setSubmittedOrder({
        orderNumber: order.order_number,
        claimCode: order.claim_code
      });

      setUploadStatus("");

      

      if (hasPreparationFiles) {
        navigate(`/preparing/${order.order_number}`, { replace: true });
        return;
      }

      if (requiresManualPricing) {
        alert(
          `Order uploaded!

Order Number: ${order.order_number}
Claim Code: ${order.claim_code}

This order needs admin pricing first.`
        );

        navigate(`/pricing-wait/${order.order_number}`);
        return;
      }

      alert(
        `Order and files uploaded!

Order Number: ${order.order_number}
Claim Code: ${order.claim_code}

Redirecting to payment page.`
      );

      navigate(`/payment/${order.order_number}`);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message?: unknown }).message)
            : String(error);

      alert(`Order or file upload failed.\n\nReason: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <main className="min-h-screen bg-snow-white pb-12 text-snow-ink">
      <header className="sticky top-0 z-40 border-b border-snow-ice bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-snow-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <BrandLogo
            showText
            subtitle="Upload, analyze, configure, and submit"
          />

          <div className="w-[72px]" />
        </div>
      </header>

      <form
        id="snowprint-order-form"
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_390px]"
      >
        <section className="space-y-8">
          <Panel
            icon={<FileText className="h-5 w-5" />}
            title="Customer Information"
            description="Enter customer details for order updates."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <Input label="Full Name" value={customerName} onChange={setCustomerName} required />
              <Input label="Email" type="email" value={customerEmail} onChange={setCustomerEmail} required />
              <Input label="Phone / Messenger" value={customerPhone} onChange={setCustomerPhone} required />
            </div>
          </Panel>

          <Panel
            icon={<UploadCloud className="h-5 w-5" />}
            title="Upload Files"
            description="PDFs are page-counted automatically. Color pricing is estimated by colored area percentage per page."
          >
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed p-10 text-center ${
                isDragging ? "border-snow-blue bg-snow-ice" : "border-snow-blue/50 bg-snow-white"
              }`}
            >
              <UploadCloud className="h-10 w-10 text-snow-blue" />
              <p className="mt-4 font-black text-snow-navy">Upload documents</p>
              <p className="mt-1 text-sm text-slate-500">
                Click here or drag files into this box
              </p>
              <input
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp"
                onChange={handleFileInput}
              />
            </label>
          </Panel>

          {files.length > 0 && (
            <Panel
              icon={<Printer className="h-5 w-5" />}
              title="Print Configuration"
              description="Choose full print, specific pages only, or full print with extra copies of selected pages."
            >
              <div className="space-y-5">
                {files.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[1.5rem] border border-snow-ice bg-white p-5"
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-black text-snow-navy">
                          {item.file.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <DetectionBadge analysis={item.analysis} />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="rounded-xl p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <Select
                        label="Paper Size"
                        value={item.config.paperSize}
                        onChange={(value) =>
                          updateConfig(item.id, { paperSize: value as PaperSize })
                        }
                        options={[
                          ["short", "Short"],
                          ["a4", "A4"],
                          ["long", "Long"]
                        ]}
                      />

                      <Select
                        label="Color Pricing"
                        value={item.config.printMode}
                        onChange={(value) =>
                          updateConfig(item.id, { printMode: value as PrintMode })
                        }
                        options={[
                          ["auto", "Auto by color %"],
                          ["bw", "Force B&W"],
                          ["colored", "Force all colored"],
                          ["mixed", "Mixed color pages"]
                        ]}
                      />

                      <Select
                        label="Print Side"
                        value={item.config.sideMode}
                        onChange={(value) =>
                          updateConfig(item.id, { sideMode: value as SideMode })
                        }
                        options={[
                          ["single_sided", "Single-sided"],
                          ["double_sided", "Double-sided"]
                        ]}
                      />

                      <Select
                        label="Pages to Print"
                        value={item.config.rangeMode}
                        onChange={(value) =>
                          updateConfig(item.id, { rangeMode: value as RangeMode })
                        }
                        options={[
                          ["full", "Full document"],
                          ["specific", "Specific pages only"],
                          ["full_with_extra", "Full + extra page copies"]
                        ]}
                      />

                      <Select
                        label="Service Type"
                        value={item.config.serviceType}
                        onChange={(value) =>
                          updateConfig(item.id, { serviceType: value as ServiceType })
                        }
                        options={[
                          ["standard", "Standard"],
                          ["bulk", "Bulk"],
                          ["specialty", "Specialty / Quote"]
                        ]}
                      />

                      <Select
                        label="Pickup"
                        value={item.config.pickupType}
                        onChange={(value) =>
                          updateConfig(item.id, { pickupType: value as PickupType })
                        }
                        options={[
                          ["scheduled", "Scheduled pickup"],
                          ["on_the_spot", "On-the-spot"]
                        ]}
                      />

                      <NumberInput
                        label={
                          item.config.rangeMode === "specific"
                            ? "Copies of selected pages"
                            : "Full document copies"
                        }
                        value={item.config.copies}
                        min={1}
                        onChange={(value) => updateConfig(item.id, { copies: value })}
                      />

                      {item.config.rangeMode !== "full" && (
                        <TextInput
                          label={
                            item.config.rangeMode === "specific"
                              ? "Specific pages"
                              : "Extra pages"
                          }
                          value={item.config.specificPages}
                          placeholder="Example: 1-3, 7, 10-12"
                          onChange={(value) =>
                            updateConfig(item.id, { specificPages: value })
                          }
                        />
                      )}

                      {item.config.rangeMode === "full_with_extra" && (
                        <NumberInput
                          label="Extra copies"
                          value={item.config.extraCopies}
                          min={1}
                          onChange={(value) =>
                            updateConfig(item.id, { extraCopies: value })
                          }
                        />
                      )}

                      
                    {snowprintNeedsPreparation(item.file.name) && (
                      <div className="rounded-2xl border border-snow-ice bg-snow-white p-4">
                        <p className="text-sm font-black text-snow-navy">Print Preparation Options</p>
                        <p className="mt-1 text-xs text-snow-muted">
                          SnowPrint will convert this file into a print-ready PDF before computing the final price.
                        </p>

                        {snowprintIsPresentationFile(item.file.name) && (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="block text-xs font-black uppercase tracking-wide text-snow-muted">
                              Slides per paper
                              <select
                                value={item.config.slidesPerPage ?? 1}
                                onChange={(event) =>
                                  updateConfig(item.id, { slidesPerPage: Number(event.target.value) })
                                }
                                className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
                              >
                                <option value={1}>1 slide per page</option>
                                <option value={2}>2 slides per page</option>
                                <option value={4}>4 slides per page</option>
                                <option value={6}>6 slides per page</option>
                                <option value={9}>9 slides per page</option>
                              </select>
                            </label>

                            <label className="block text-xs font-black uppercase tracking-wide text-snow-muted">
                              Orientation
                              <select
                                value={item.config.prepOrientation ?? "landscape"}
                                onChange={(event) =>
                                  updateConfig(item.id, {
                                    prepOrientation: event.target.value as "portrait" | "landscape"
                                  })
                                }
                                className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
                              >
                                <option value="landscape">Landscape</option>
                                <option value="portrait">Portrait</option>
                              </select>
                            </label>

                            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-snow-navy sm:col-span-2">
                              <input
                                type="checkbox"
                                checked={item.config.slideBorder ?? true}
                                onChange={(event) =>
                                  updateConfig(item.id, { slideBorder: event.target.checked })
                                }
                              />
                              Add slide borders
                            </label>
                          </div>
                        )}

                        {!snowprintIsPresentationFile(item.file.name) && (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="block text-xs font-black uppercase tracking-wide text-snow-muted">
                              Orientation
                              <select
                                value={item.config.prepOrientation ?? "portrait"}
                                onChange={(event) =>
                                  updateConfig(item.id, {
                                    prepOrientation: event.target.value as "portrait" | "landscape"
                                  })
                                }
                                className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
                              >
                                <option value="portrait">Portrait</option>
                                <option value="landscape">Landscape</option>
                              </select>
                            </label>

                            <label className="block text-xs font-black uppercase tracking-wide text-snow-muted">
                              Margins
                              <select
                                value={item.config.prepMargins ?? "normal"}
                                onChange={(event) =>
                                  updateConfig(item.id, {
                                    prepMargins: event.target.value as "normal" | "narrow" | "wide"
                                  })
                                }
                                className="mt-2 w-full rounded-2xl border border-snow-ice bg-white px-4 py-3 text-sm font-bold text-snow-navy outline-none"
                              >
                                <option value="normal">Normal</option>
                                <option value="narrow">Narrow</option>
                                <option value="wide">Wide</option>
                              </select>
                            </label>
                          </div>
                        )}

                        <div className="mt-4 rounded-2xl bg-white p-3 text-xs font-bold text-snow-muted">
                          Preview will appear after conversion on the preparing/payment page.
                        </div>
                      </div>
                    )}

<NumberInput
                        label="Pages before conversion"
                        value={item.config.pageCount}
                        min={1}
                        onChange={(value) =>
                          updateConfig(item.id, {
                            pageCount: value,
                            coloredPages: clamp(item.config.coloredPages, 0, value)
                          })
                        }
                      />

                      <NumberInput
                        label="Colored pages before conversion"
                        value={item.config.coloredPages}
                        min={0}
                        max={item.config.pageCount}
                        onChange={(value) =>
                          updateConfig(item.id, {
                            coloredPages: clamp(value, 0, item.config.pageCount)
                          })
                        }
                      />
                    </div>

                    {item.analysis.pages.length > 0 && (
                      <div className="mt-4 rounded-2xl bg-snow-white p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Color analysis
                        </p>
                        <p className="mt-1 text-sm font-bold text-snow-navy">
                          Average colored area: {item.analysis.averageColorPercent.toFixed(2)}%
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Pricing tiers: 0–0.1% B&W, 0.11–2% light color,
                          2.01–15% medium color, above 15% full color.
                        </p>
                      </div>
                    )}

                    {item.config.serviceType === "specialty" && (
                      <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">
                        Specialty printing can still be submitted, but the final price needs quotation.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            icon={<Wallet className="h-5 w-5" />}
            title="Payment and Notes"
            description="Cash and online payment options are supported."
          >
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["cash", "Cash"],
                ["gcash", "GCash"],
                ["maya", "Maya"],
                ["bank_transfer", "Bank Transfer"]
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-2xl border p-4 text-sm font-black ${
                    paymentMethod === value
                      ? "border-snow-blue bg-snow-ice text-snow-navy"
                      : "border-snow-ice bg-white text-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={value}
                    checked={paymentMethod === value}
                    onChange={() => setPaymentMethod(value as PaymentMethod)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>

            <textarea
              className="mt-5 min-h-28 w-full rounded-2xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
              placeholder="Special notes, pickup request, or page instructions..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Panel>
        </section>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <RushOrderToggle
        enabled={isRushOrder}
        fee={10}
        onChange={setIsRushOrder}
      />

      <SummaryBox summary={pricedSummary} submitting={submitting} submittedOrder={submittedOrder} uploadStatus={uploadStatus} onStartNewOrder={startNewOrder} />
        </aside>
      </form>
    </main>
  );
}

function buildSummaryLine(item: UploadedFileItem): SummaryLine {
  const pageCount = Math.max(1, item.config.pageCount);
  const copies = Math.max(1, item.config.copies);
  const extraCopies = Math.max(1, item.config.extraCopies);

  const allPages = range(1, pageCount);
  const selectedPages = parsePageSelection(item.config.specificPages, pageCount);

  const basePages =
    item.config.rangeMode === "specific" ? selectedPages : allPages;

  const extraPages =
    item.config.rangeMode === "full_with_extra" ? selectedPages : [];

  const baseTotal = basePages.reduce(
    (sum, pageNumber) => sum + getPagePriceForItem(item, pageNumber),
    0
  ) * copies;

  const extraTotal = extraPages.reduce(
    (sum, pageNumber) => sum + getPagePriceForItem(item, pageNumber),
    0
  ) * extraCopies;

  const beforeDiscount = baseTotal + extraTotal;
  const billedPages = basePages.length * copies + extraPages.length * extraCopies;

  let discount = 0;

  if (item.config.serviceType === "bulk" && billedPages >= 50) {
    discount = beforeDiscount * 0.1;
  }

  const countedPages = [
    ...repeatPages(basePages, copies),
    ...repeatPages(extraPages, extraCopies)
  ];

  const tierCounts = countedPages.reduce(
    (counts, pageNumber) => {
      const info = getPageInfoForItem(item, pageNumber);
      counts[info.tier] += 1;
      return counts;
    },
    { bw: 0, light: 0, medium: 0, full: 0 }
  );

  const sheets =
    calculateSheets(basePages.length, item.config.sideMode) * copies +
    calculateSheets(extraPages.length, item.config.sideMode) * extraCopies;

  return {
    id: item.id,
    filename: item.file.name,
    modeLabel: getRangeModeLabel(item.config.rangeMode),
    pageCount,
    billedPages,
    copies,
    extraCopies,
    basePageCount: basePages.length,
    extraPageCount: extraPages.length,
    sheets,
    bwPages: tierCounts.bw,
    lightPages: tierCounts.light,
    mediumPages: tierCounts.medium,
    fullColorPages: tierCounts.full,
    averageColorPercent: item.analysis.averageColorPercent,
    discount,
    lineTotal: beforeDiscount - discount,
    needsQuote: item.config.serviceType === "specialty"
  };
}

async function analyzePdfFile(
  file: File,
  onProgress: (message: string) => void
): Promise<FileAnalysis> {
  const originalBuffer = await file.arrayBuffer();

  let pageCount = 1;

  try {
    const pdfDoc = await PDFDocument.load(new Uint8Array(originalBuffer.slice(0)), {
      ignoreEncryption: true
    });
    pageCount = pdfDoc.getPageCount();
  } catch {
    pageCount = 1;
  }

  const pages: PageColorInfo[] = [];
  let renderFailures = 0;

  try {
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(originalBuffer.slice(0)),
      disableFontFace: true,
      useSystemFonts: true,
      isEvalSupported: false
    } as any).promise;

    pageCount = pdf.numPages || pageCount;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      onProgress(`Analyzing color percentage on page ${pageNumber} of ${pageCount}...`);

      let page: any = null;

      try {
        page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.6 });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (!context) {
          renderFailures += 1;
          pages.push({
            pageNumber,
            colorPercent: 0,
            tier: "bw"
          });
          continue;
        }

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        await page.render({
          canvasContext: context,
          viewport
        } as any).promise;

        const colorPercent = measureColorPercent(context, canvas.width, canvas.height);
        const tier = getColorTier(colorPercent);

        pages.push({
          pageNumber,
          colorPercent,
          tier
        });
      } catch (pageError) {
        console.error("Color scan failed on page", pageNumber, pageError);
        renderFailures += 1;
        pages.push({
          pageNumber,
          colorPercent: 0,
          tier: "bw"
        });
      } finally {
        try {
          page?.cleanup?.();
        } catch {
          // Ignore cleanup errors.
        }
      }
    }

    try {
      await (pdf as unknown as { destroy?: () => Promise<void> | void }).destroy?.();
    } catch {
      // Ignore destroy errors.
    }
  } catch (pdfError) {
    console.error("PDF render setup failed", pdfError);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      pages.push({
        pageNumber,
        colorPercent: 0,
        tier: "bw"
      });
    }

    renderFailures = pageCount;
  }

  while (pages.length < pageCount) {
    pages.push({
      pageNumber: pages.length + 1,
      colorPercent: 0,
      tier: "bw"
    });
  }

  const averageColorPercent =
    pages.reduce((sum, page) => sum + page.colorPercent, 0) /
    Math.max(1, pages.length);

  const colorPages = pages.filter((page) => page.tier !== "bw").length;

  const message =
    renderFailures === 0
      ? `${pageCount} page(s) detected. ${colorPages} page(s) have color. Avg color area: ${averageColorPercent.toFixed(2)}%.`
      : `${pageCount} page(s) detected. Color estimate available. ${colorPages} page(s) have color. Avg color area: ${averageColorPercent.toFixed(2)}%.`;

  return {
    status: renderFailures === pageCount ? "partial" : "detected",
    pageCount,
    averageColorPercent,
    pages,
    message
  };
}

async function analyzeImageColorPercent(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");

  const scale = Math.min(1, 450 / bitmap.width);
  canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
  canvas.height = Math.max(1, Math.floor(bitmap.height * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    bitmap.close();
    return 0;
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const percent = measureColorPercent(context, canvas.width, canvas.height);

  bitmap.close();
  return percent;
}

function measureColorPercent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const data = context.getImageData(0, 0, width, height).data;

  let pagePixels = 0;
  let coloredPixels = 0;

  for (let i = 0; i < data.length; i += 4 * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 20) continue;

    pagePixels += 1;

    const brightness = (r + g + b) / 3;
    const colorSpread = Math.max(r, g, b) - Math.min(r, g, b);

    const isVisibleInk = brightness < 248 && brightness > 8;
    const isColoredInk = colorSpread > 14;

    if (isVisibleInk && isColoredInk) {
      coloredPixels += 1;
    }
  }

  if (pagePixels === 0) return 0;

  return (coloredPixels / pagePixels) * 100;
}

function getPageInfoForItem(item: UploadedFileItem, pageNumber: number): PageColorInfo {
  if (item.config.printMode === "bw") {
    return { pageNumber, colorPercent: 0, tier: "bw" };
  }

  if (item.config.printMode === "colored") {
    return { pageNumber, colorPercent: 100, tier: "full" };
  }

  if (item.config.printMode === "mixed") {
    const isColored = pageNumber <= item.config.coloredPages;
    return {
      pageNumber,
      colorPercent: isColored ? 100 : 0,
      tier: isColored ? "full" : "bw"
    };
  }

  return (
    item.analysis.pages.find((page) => page.pageNumber === pageNumber) ?? {
      pageNumber,
      colorPercent: 0,
      tier: "bw"
    }
  );
}

function getPagePriceForItem(item: UploadedFileItem, pageNumber: number) {
  const info = getPageInfoForItem(item, pageNumber);
  return getPagePrice(item.config.paperSize, info.colorPercent, info.tier);
}

function getColorTier(colorPercent: number): PageColorInfo["tier"] {
  if (colorPercent <= 0.1) return "bw";
  if (colorPercent <= 2) return "light";
  if (colorPercent <= 15) return "medium";
  return "full";
}

function getPagePrice(
  paperSize: PaperSize,
  colorPercent: number,
  tier: PageColorInfo["tier"]
) {
  const bw = PRICE.bw[paperSize];
  const full = PRICE.colored[paperSize];
  const gap = full - bw;

  if (tier === "bw") return bw;

  const percentMultiplier = Math.min(1, colorPercent / 15);
  const minimumColorCharge = 0.25;

  return bw + gap * Math.max(minimumColorCharge, percentMultiplier);
}

function parsePageSelection(input: string, maxPage: number) {
  const pages = new Set<number>();
  const parts = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = Number(startRaw.trim());
      const end = Number(endRaw.trim());

      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

      const from = Math.max(1, Math.min(start, end));
      const to = Math.min(maxPage, Math.max(start, end));

      for (let page = from; page <= to; page++) {
        pages.add(page);
      }
    } else {
      const page = Number(part);

      if (Number.isFinite(page) && page >= 1 && page <= maxPage) {
        pages.add(page);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

function range(start: number, end: number) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function repeatPages(pages: number[], times: number) {
  return Array.from({ length: times }).flatMap(() => pages);
}

function calculateSheets(pageLength: number, sideMode: SideMode) {
  if (pageLength <= 0) return 0;
  return sideMode === "double_sided" ? Math.ceil(pageLength / 2) : pageLength;
}

function getRangeModeLabel(mode: RangeMode) {
  if (mode === "specific") return "Specific pages only";
  if (mode === "full_with_extra") return "Full document + extra pages";
  return "Full document";
}



function RushOrderToggle({
  enabled,
  fee,
  onChange
}: {
  enabled: boolean;
  fee: number;
  onChange: (value: boolean) => void;
}) {
  return (
    <section
      className={`rounded-[2rem] border p-5 shadow-card transition ${
        enabled ? "border-amber-200 bg-amber-50" : "border-snow-ice bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-5">
        <div>
          <p className="font-black text-snow-navy">Rush / urgent order</p>
          <p className="mt-1 text-sm leading-6 text-snow-muted">
            Turn this on only if the order needs urgent priority. This is separate from on-the-spot printing.
          </p>
          <p className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-amber-800">
            Adds ₱{Number(fee).toFixed(2)} once per order
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={`relative h-9 w-17 shrink-0 rounded-full p-1 transition ${
            enabled ? "bg-amber-400" : "bg-snow-ice"
          }`}
        >
          <span
            className={`block h-7 w-7 rounded-full bg-white shadow-soft transition-transform ${
              enabled ? "translate-x-8" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </section>
  );
}


function SummaryBox({
  summary,
  submitting,
  submittedOrder,
  uploadStatus
}: {
  summary: OrderSummary;
  submitting: boolean;
  submittedOrder: { orderNumber: string; claimCode: string } | null;
  uploadStatus: string;
  onStartNewOrder: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-snow-ice bg-white p-6 shadow-card">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-snow-ice">
          <ReceiptText className="h-6 w-6 text-snow-navy" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-snow-navy">Order Summary</h2>
          <p className="text-sm text-snow-muted">Live estimate</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-snow-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-snow-muted">Files</p>
          <p className="mt-1 text-xl font-black text-snow-navy">{summary.files}</p>
        </div>
        <div className="rounded-2xl bg-snow-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-snow-muted">Billed Pages</p>
          <p className="mt-1 text-xl font-black text-snow-navy">{summary.billedPages}</p>
        </div>
        <div className="rounded-2xl bg-snow-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-snow-muted">Sheets</p>
          <p className="mt-1 text-xl font-black text-snow-navy">{summary.sheets}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {summary.lines.map((line) => (
          <div key={line.id} className="rounded-2xl border border-snow-ice bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="break-words font-black text-snow-navy">{line.filename}</p>
                <p className="mt-2 text-xs leading-5 text-snow-muted">
                  Mode: {line.modeLabel}<br />
                  Pages: {line.pageCount}<br />
                  Billed pages: {line.billedPages}<br />
                  Sheets: {line.sheets}
                </p>
              </div>
              <p className="shrink-0 text-lg font-black text-snow-navy">
                ₱{line.lineTotal.toFixed(2)}
              </p>
            </div>
          </div>
        ))}

        {summary.lines.length === 0 && (
          <div className="rounded-2xl bg-snow-white p-4 text-center text-sm font-bold text-snow-muted">
            Upload a file to see your estimate.
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-snow-ice pt-5">
        {summary.rushFee > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3">
            <p className="text-sm font-black text-amber-800">Rush / urgent fee</p>
            <p className="text-sm font-black text-amber-800">₱{summary.rushFee.toFixed(2)}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="font-bold text-snow-muted">Estimated Total</p>
          <p className="text-3xl font-black text-snow-navy">₱{summary.total.toFixed(2)}</p>
        </div>
      </div>

      {uploadStatus && (
        <p className="mt-4 rounded-2xl bg-snow-ice px-4 py-3 text-center text-sm font-bold text-snow-navy">
          {uploadStatus}
        </p>
      )}

      {submittedOrder && (
        <div className="mt-4 rounded-2xl bg-snow-mint p-4 text-center">
          <p className="font-black text-snow-navy">Order submitted</p>
          <p className="mt-1 text-sm font-bold text-snow-navy">
            {submittedOrder.orderNumber} · {submittedOrder.claimCode}
          </p>
        </div>
      )}

      {!submittedOrder && (
        <button
          type="submit"
          disabled={submitting || summary.files === 0}
          className="mt-5 w-full rounded-full bg-snow-navy px-6 py-4 text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Print Order"}
        </button>
      )}
    </section>
  );
}

function Panel({
  icon,
  title,
  description,
  children
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-snow-ice bg-white p-6 shadow-card">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-2xl bg-snow-ice p-3 text-snow-navy">{icon}</div>
        <div>
          <h2 className="text-xl font-black text-snow-navy">{title}</h2>
          <p className="text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-bold text-snow-navy">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
      />
    </label>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-bold text-snow-navy">
      {label}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block text-sm font-bold text-snow-navy">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-bold text-snow-navy">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(clamp(Number(event.target.value), min, max ?? 99999))
        }
        className="mt-2 w-full rounded-xl border border-snow-ice px-4 py-3 text-sm outline-none focus:border-snow-blue"
      />
    </label>
  );
}

function DetectionBadge({ analysis }: { analysis: FileAnalysis }) {
  const base =
    "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold";

  if (analysis.status === "analyzing") {
    return (
      <div className={`${base} bg-snow-ice text-snow-navy`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {analysis.message}
      </div>
    );
  }

  if (analysis.status === "detected") {
    return (
      <div className={`${base} bg-emerald-50 text-emerald-700`}>
        <CheckCircle2 className="h-3 w-3" />
        {analysis.message}
      </div>
    );
  }

  if (analysis.status === "partial") {
    return (
      <div className={`${base} bg-blue-50 text-blue-700`}>
        <CheckCircle2 className="h-3 w-3" />
        {analysis.message}
      </div>
    );
  }

  return (
    <div className={`${base} bg-blue-50 text-blue-700`}>
      <FileText className="h-3 w-3" />
      {analysis.message}
    </div>
  );
}







function snowprintIsPresentationFile(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return ["ppt", "pptx"].includes(extension);
}

function snowprintPreparationOptionsFor(item: UploadedFileItem) {
  const extension = item.file.name.toLowerCase().split(".").pop() ?? "";

  if (["ppt", "pptx"].includes(extension)) {
    return {
      type: "presentation",
      slidesPerPage: item.config.slidesPerPage ?? 1,
      orientation: item.config.prepOrientation ?? "landscape",
      slideBorder: item.config.slideBorder ?? true,
      fitToPage: true
    };
  }

  if (["doc", "docx", "odt"].includes(extension)) {
    return {
      type: "document",
      orientation: item.config.prepOrientation ?? "portrait",
      margins: item.config.prepMargins ?? "normal",
      fitToPage: true
    };
  }

  return {};
}

function snowprintNeedsPreparation(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return ["doc", "docx", "odt", "ppt", "pptx"].includes(extension);
}

function snowprintFileNeedsManualPricing(item: UploadedFileItem) {
  if (snowprintNeedsPreparation(item.file.name)) {
    return false;
  }

  const extension = item.file.name.toLowerCase().split(".").pop() ?? "";

  return (
    ["xls", "xlsx"].includes(extension) ||
    item.config.serviceType === "bulk" ||
    item.config.serviceType === "specialty" ||
    (item.config.printMode as string) === "manual"
  );
}

function snowprintFileManualReason(item: UploadedFileItem) {
  const reasons: string[] = [];
  const extension = item.file.name.toLowerCase().split(".").pop() ?? "";

  if (["xls", "xlsx"].includes(extension)) {
    reasons.push("Print preparation file");
  }

  if (item.config.serviceType === "bulk") {
    reasons.push("Bulk order");
  }

  if (item.config.serviceType === "specialty") {
    reasons.push("Specialty printing");
  }

  if ((item.config.printMode as string) === "manual") {
    reasons.push("Manual color counting");
  }

  return reasons.join(", ");
}

function sanitizeStorageFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFileContentType(fileName: string) {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }

  return "application/octet-stream";
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
