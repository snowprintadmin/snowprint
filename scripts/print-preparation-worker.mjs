import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const env = readEnv(".env.local");
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const POLL_MS = Number(process.env.SNOWPRINT_PREP_POLL_MS || 4000);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  console.log("SnowPrint print-preparation worker started.");
  console.log("Keep this terminal open while testing DOCX/ODT/PPT conversion.");

  while (true) {
    try {
      const job = await getNextJob();

      if (job) {
        await processJob(job);
      }
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}] Worker error:`, error.message);
    }

    await sleep(POLL_MS);
  }
}

async function getNextJob() {
  const { data, error } = await supabase
    .from("print_preparation_jobs")
    .select("*")
    .eq("job_status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function processJob(job) {
  console.log(`Preparing job ${job.id}`);

  await supabase
    .from("print_preparation_jobs")
    .update({
      job_status: "processing",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id);

  await supabase
    .from("order_files")
    .update({ preparation_status: "processing" })
    .eq("id", job.order_file_id);

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "snowprint-prep-"));
  const sourceName = path.basename(job.source_storage_path || `source-${job.id}`);
  const sourcePath = path.join(workDir, sourceName);

  try {
    const { data: sourceBlob, error: downloadError } = await supabase.storage
      .from(job.source_bucket)
      .download(job.source_storage_path);

    if (downloadError) throw downloadError;

    const sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer());
    await fsp.writeFile(sourcePath, sourceBuffer);

    await convertToPdf(sourcePath, workDir);

    const pdfPath = await findPdf(workDir);
    const pdfBuffer = await fsp.readFile(pdfPath);
    const pageCount = await getPdfPageCount(pdfPath);

    const targetPath = job.target_storage_path;
    const targetName = path.basename(targetPath);

    const { error: uploadError } = await supabase.storage
      .from(job.target_bucket)
      .upload(targetPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { error: completeError } = await supabase.rpc("snowprint_complete_preparation_job", {
      p_job_id: job.id,
      p_pdf_storage_path: targetPath,
      p_pdf_file_name: targetName,
      p_page_count: pageCount
    });

    if (completeError) throw completeError;

    console.log(`Completed job ${job.id}: ${pageCount} page(s)`);
  } catch (error) {
    console.error(`Failed job ${job.id}:`, error.message);

    await supabase.rpc("snowprint_fail_preparation_job", {
      p_job_id: job.id,
      p_error_message: error.message || "Print preparation failed."
    });
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

async function convertToPdf(sourcePath, outDir) {
  const commands = ["libreoffice", "soffice"];
  let lastError = null;

  for (const command of commands) {
    try {
      await execFileAsync(
        command,
        ["--headless", "--convert-to", "pdf", "--outdir", outDir, sourcePath],
        { timeout: 120000 }
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`LibreOffice conversion failed: ${lastError?.message ?? "unknown error"}`);
}

async function findPdf(dir) {
  const files = await fsp.readdir(dir);
  const pdf = files.find((file) => file.toLowerCase().endsWith(".pdf"));

  if (!pdf) {
    throw new Error("Converted PDF was not created.");
  }

  return path.join(dir, pdf);
}

async function getPdfPageCount(pdfPath) {
  const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 15000 });
  const match = stdout.match(/^Pages:\s+(\d+)/m);

  if (!match) {
    throw new Error("Could not count PDF pages.");
  }

  return Number(match[1]);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
