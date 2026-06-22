import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

const env = readEnv(".env.local");
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

const PRINTER_NAME = process.env.SNOWPRINT_PRINTER_NAME || "";
const POLL_MS = Number(process.env.SNOWPRINT_PRINTER_POLL_MS || 5000);

const simulateIndex = process.argv.indexOf("--simulate");
const simulatedIssue = simulateIndex >= 0 ? process.argv[simulateIndex + 1] : "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  console.log("SnowPrint printer agent started.");
  console.log(`Printer: ${PRINTER_NAME || "default/all printers"}`);
  console.log(`Polling every ${POLL_MS}ms`);

  if (simulatedIssue) {
    const batch = await getActivePrintingBatch();
    if (!batch) {
      console.log("No active printing batch found. Start a batch first.");
      return;
    }

    await createPrinterAlert(
      batch.id,
      simulatedIssue,
      `Simulated issue: ${formatStatus(simulatedIssue)}`
    );

    console.log(`Simulated ${simulatedIssue} for ${batch.batch_code}`);
    return;
  }

  while (true) {
    try {
      const batch = await getActivePrintingBatch();

      if (batch) {
        const issue = await detectPrinterIssue();

        if (issue) {
          await createPrinterAlert(batch.id, issue.type, issue.message);
          console.log(`[${new Date().toLocaleTimeString()}] Alert: ${issue.type}`);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Agent error:`, error.message);
    }

    await sleep(POLL_MS);
  }
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
        return [key, value];
      })
  );
}

async function getActivePrintingBatch() {
  const url =
    `${SUPABASE_URL}/rest/v1/print_batches` +
    `?select=id,batch_code,batch_status` +
    `&batch_status=eq.printing` +
    `&order=started_at.desc.nullslast,created_at.desc` +
    `&limit=1`;

  const response = await fetch(url, {
    headers: supabaseHeaders()
  });

  if (!response.ok) {
    throw new Error(`Could not get active batch: ${await response.text()}`);
  }

  const rows = await response.json();
  return rows[0] ?? null;
}

async function detectPrinterIssue() {
  const output = await getPrinterStatusText();
  const text = output.toLowerCase();

  if (containsAny(text, ["out of paper", "no paper", "paper-out", "media-empty", "media-needed"])) {
    return {
      type: "no_paper",
      message: "Printer reports no paper. Please place paper in the tray, then continue printing."
    };
  }

  if (containsAny(text, ["paper jam", "jammed", "media-jam", "printer jam"])) {
    return {
      type: "printer_jam",
      message: "Printer reports a paper jam. Please clear the jam, then continue printing."
    };
  }

  if (containsAny(text, ["low ink", "ink low", "toner low", "marker-supply-low", "marker-ink"])) {
    return {
      type: "low_ink",
      message: "Printer reports low ink or poor supply level. Please check ink before continuing."
    };
  }

  if (containsAny(text, ["wrong paper", "paper mismatch", "media-size", "load paper", "load a4", "load letter"])) {
    return {
      type: "wrong_paper",
      message: "Printer may need a different paper size. Please load the correct paper, then continue."
    };
  }

  if (containsAny(text, ["offline", "not connected", "disabled", "unable to connect", "not accepting"])) {
    return {
      type: "printer_offline",
      message: "Printer appears offline or unavailable. Please reconnect or turn it on, then continue."
    };
  }

  if (containsAny(text, ["waste", "maintenance box", "waste tank"])) {
    return {
      type: "waste_tank_full",
      message: "Printer may need waste tank or maintenance box attention before continuing."
    };
  }

  return null;
}

async function getPrinterStatusText() {
  const args = PRINTER_NAME ? ["-l", "-p", PRINTER_NAME] : ["-l", "-p"];

  try {
    const { stdout, stderr } = await execFileAsync("lpstat", args, {
      timeout: 8000
    });

    return `${stdout}\n${stderr}`;
  } catch (error) {
    const text = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`;

    if (text.trim()) {
      return text;
    }

    throw new Error(
      "Could not read printer status. Make sure CUPS/lpstat is installed and your printer is connected."
    );
  }
}

async function createPrinterAlert(batchId, alertType, message) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/snowprint_create_printer_alert`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_batch_id: batchId,
      p_alert_type: alertType,
      p_message: message
    })
  });

  if (!response.ok) {
    throw new Error(`Could not create printer alert: ${await response.text()}`);
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
  };
}

function containsAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatStatus(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
