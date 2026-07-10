import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

export interface BatchRunResult {
  processFile: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

async function ensureWorkDir(): Promise<void> {
  await fs.mkdir(config.workDir, { recursive: true });
}

export function newRunId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function workFilePath(fileName: string): string {
  return path.join(config.workDir, fileName);
}

/**
 * Writes an .rmp XML string to the scratch dir and executes it headlessly via
 * Altair AI Studio's bundled `rapidminer-batch.bat` (scripts\ folder of ALTAIR_HOME).
 * This works even when the Studio GUI is closed, and does not require the optional
 * HTTP bridge extension. Macros are passed through as -M key=value.
 */
export async function runProcessXml(
  xml: string,
  opts: { macros?: Record<string, string>; runId?: string } = {}
): Promise<BatchRunResult> {
  await ensureWorkDir();
  const runId = opts.runId ?? newRunId();
  const processFile = workFilePath(`process-${runId}.rmp`);
  await fs.writeFile(processFile, xml, "utf-8");

  const batchScript = path.join(config.altairHome, config.batchScriptRelativePath);
  const args = ["-f", processFile];
  for (const [k, v] of Object.entries(opts.macros ?? {})) {
    args.push("-M", `${k}=${v}`);
  }

  // ai-studio-batch.bat is a Windows batch file, not a PE executable — spawn()
  // fails with EINVAL unless run through a shell (verified against a real
  // install). With shell:true, Node passes the command through as-is without
  // quoting it for us, so paths containing spaces (e.g. "Program Files") must be
  // quoted manually here, as a single command-line string.
  const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
  const commandLine = [quote(batchScript), ...args.map(quote)].join(" ");

  const started = Date.now();
  const result = await new Promise<BatchRunResult>((resolve, reject) => {
    const child = spawn(commandLine, {
      windowsHide: true,
      cwd: config.altairHome,
      env: { ...process.env, RAPIDMINER_HOME: config.altairHome },
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `Altair AI Studio batch process timed out after ${config.batchTimeoutMs}ms (script: ${batchScript})`
        )
      );
    }, config.batchTimeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to launch rapidminer-batch.bat at "${batchScript}". Verify ALTAIR_HOME points at your Altair AI Studio 2026.0.5 install directory. Original error: ${err.message}`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        processFile,
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });

  return result;
}

export async function readWorkFile(fileName: string): Promise<string> {
  return fs.readFile(workFilePath(fileName), "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
