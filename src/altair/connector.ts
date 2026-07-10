import { promises as fs } from "node:fs";
import { runProcessXml, workFilePath, fileExists, newRunId } from "./batchRunner.js";
import { isBridgeAvailable, runProcessOnBridge, BridgeRunResult } from "./httpBridgeClient.js";

export interface RunOutcome {
  mode: "http-bridge" | "batch";
  runId: string;
  logs: string;
  outputCsvPaths: string[];
  raw: BridgeRunResult | { exitCode: number | null; stdout: string; stderr: string };
}

/**
 * Executes a generated .rmp XML process, preferring the live HTTP bridge (if the
 * companion Altair AI Studio extension is installed and running) and transparently
 * falling back to headless `rapidminer-batch` execution otherwise.
 *
 * Convention used by every recipe in src/tools: the process XML always finishes by
 * writing its result table(s) with a "Write CSV" operator to a path under the MCP
 * scratch dir named "result-<runId>-<n>.csv", so this function can locate and read
 * them back regardless of which execution mode ran the process.
 */
export async function runGeneratedProcess(
  xmlFactory: (runId: string) => string,
  macros: Record<string, string> = {}
): Promise<RunOutcome> {
  const runId = newRunId();
  const xml = xmlFactory(runId);

  if (await isBridgeAvailable()) {
    try {
      const bridgeResult = await runProcessOnBridge(xml, macros);
      return {
        mode: "http-bridge",
        runId,
        logs: bridgeResult.logs.join("\n"),
        outputCsvPaths: await discoverResultCsvs(runId),
        raw: bridgeResult,
      };
    } catch (err) {
      // Fall through to batch mode below; the bridge may be present but the
      // running Studio session could be busy/locked by the interactive user.
    }
  }

  const batchResult = await runProcessXml(xml, { macros, runId });
  return {
    mode: "batch",
    runId,
    logs: `${batchResult.stdout}\n${batchResult.stderr}`.trim(),
    outputCsvPaths: await discoverResultCsvs(runId),
    raw: batchResult,
  };
}

async function discoverResultCsvs(runId: string): Promise<string[]> {
  const found: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const p = workFilePath(`result-${runId}-${i}.csv`);
    if (await fileExists(p)) found.push(p);
    else break;
  }
  return found;
}

export interface CsvPreview {
  columns: string[];
  rows: string[][];
  totalRowsShown: number;
  truncated: boolean;
}

export async function previewCsv(filePath: string, maxRows = 50): Promise<CsvPreview> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const columns = lines.length > 0 ? splitCsvLine(lines[0]) : [];
  const dataLines = lines.slice(1, 1 + maxRows);
  const rows = dataLines.map(splitCsvLine);
  return {
    columns,
    rows,
    totalRowsShown: rows.length,
    truncated: lines.length - 1 > maxRows,
  };
}

function splitCsvLine(line: string): string[] {
  // Handles simple quoted CSV fields; RapidMiner's default CSV writer quotes fields
  // containing the separator, quotes, or newlines.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
