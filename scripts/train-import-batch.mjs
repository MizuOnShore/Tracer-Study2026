import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, "..")

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function requiredOption(name) {
  const value = option(name)?.trim()
  if (!value) throw new Error("Missing required option " + name)
  return value
}

function pythonExecutable() {
  const configured = process.env.TRAINING_PYTHON?.trim()
  if (configured) return configured
  const local = process.platform === "win32"
    ? join(projectDirectory, ".venv", "Scripts", "python.exe")
    : join(projectDirectory, ".venv", "bin", "python")
  if (existsSync(local)) return local
  return process.platform === "win32" ? "python" : "python3"
}

async function runTraining(datasetPath, outputDirectory, version, selectedK) {
  const args = [
    join(projectDirectory, "ml", "train.py"),
    datasetPath,
    "--output",
    outputDirectory,
    "--version",
    version,
  ]
  if (selectedK !== undefined) args.push("--k", String(selectedK))

  const child = spawn(pythonExecutable(), args, {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PYTHONPATH: join(projectDirectory, "ml"),
      LOKY_MAX_CPU_COUNT: process.env.LOKY_MAX_CPU_COUNT || "4",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  child.stdout.on("data", (chunk) => {
    const text = String(chunk)
    output += text
    process.stdout.write(text)
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    output += text
    process.stderr.write(text)
  })

  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolveExit(code ?? 1))
  })
  if (exitCode === 0) return
  if (selectedK === undefined && output.includes("K_SELECTION_REQUIRED")) {
    console.log("Elbow diagnostics created successfully. Review the candidate-k SSE file and rerun this command with --k <selected-value>.")
    return
  }
  throw new Error("Training process exited with code " + exitCode)
}

async function main() {
  const batchId = requiredOption("--batch-id")
  const version = requiredOption("--version")
  const selectedKText = option("--k")
  const selectedK = selectedKText === undefined ? undefined : Number(selectedKText)
  const outputDirectory = resolve(projectDirectory, option("--output") || "ml/artifacts")

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)) {
    throw new Error("--batch-id must be a valid UUID")
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(version)) {
    throw new Error("--version may contain only letters, numbers, dots, underscores, and hyphens")
  }
  if (selectedK !== undefined && (!Number.isInteger(selectedK) || selectedK < 2 || selectedK > 8)) {
    throw new Error("--k must be a whole number from 2 to 8")
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id,status,storage_path,sha256,total_rows")
    .eq("id", batchId)
    .maybeSingle()

  if (batchError) throw new Error("Import batch lookup failed: " + batchError.message)
  if (!batch) throw new Error("Import batch not found")
  if (batch.status !== "committed") throw new Error("Only a committed import batch can be used for model training")

  const extension = extname(String(batch.storage_path)).toLowerCase()
  if (extension !== ".csv" && extension !== ".xlsx") {
    throw new Error("The committed source file is not CSV or XLSX")
  }

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from("raw-imports")
    .download(String(batch.storage_path))
  if (downloadError || !sourceBlob) {
    throw new Error("The committed source file could not be downloaded from private storage")
  }

  const sourceBytes = Buffer.from(await sourceBlob.arrayBuffer())
  const actualHash = createHash("sha256").update(sourceBytes).digest("hex")
  if (actualHash !== batch.sha256) {
    throw new Error("TRAINING_SOURCE_HASH_MISMATCH: the stored file does not match its committed import checksum")
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "djihs-import-training-"))
  try {
    const datasetPath = join(temporaryDirectory, "committed-import" + extension)
    await writeFile(datasetPath, sourceBytes)
    console.log("Verified committed import batch " + batchId + " (" + Number(batch.total_rows) + " rows).")
    console.log("Training source SHA-256: " + actualHash)
    await runTraining(datasetPath, outputDirectory, version, selectedK)
  } finally {
    if (temporaryDirectory.startsWith(resolve(tmpdir()))) {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Training failed")
  process.exitCode = 1
})
