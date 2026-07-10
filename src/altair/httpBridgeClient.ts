import { config, httpBridgeBaseUrl } from "../config.js";

/**
 * Client for the optional "altair-http-bridge" extension (see /altair-http-bridge
 * in this repo). When that extension is installed and Altair AI Studio 2026.0.5 is
 * running, it exposes a localhost-only HTTP API so the MCP server can talk to the
 * LIVE Studio session instead of only headless batch runs: browsing the repository,
 * reading/replacing the process currently open in the GUI, and running a process
 * with progress feedback.
 *
 * Every method here fails soft: callers should catch and fall back to batch mode
 * (src/altair/batchRunner.ts) when the bridge isn't reachable.
 */

async function request<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const url = `${httpBridgeBaseUrl()}${pathAndQuery}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.httpBridge.timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Altair HTTP bridge returned ${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface BridgeHealth {
  status: "ok";
  studioVersion: string;
  bridgeVersion: string;
}

export async function isBridgeAvailable(): Promise<boolean> {
  if (!config.httpBridge.enabled) return false;
  try {
    await request<BridgeHealth>("/health");
    return true;
  } catch {
    return false;
  }
}

export async function getHealth(): Promise<BridgeHealth> {
  return request<BridgeHealth>("/health");
}

export interface RepositoryEntry {
  name: string;
  path: string;
  type: "FOLDER" | "DATA" | "PROCESS" | "MODEL" | "CONNECTION" | "OTHER";
}

export async function listRepository(entryPath: string): Promise<RepositoryEntry[]> {
  const q = encodeURIComponent(entryPath);
  return request<RepositoryEntry[]>(`/repository/list?path=${q}`);
}

export async function readRepositoryDataAsCsv(entryPath: string, maxRows = 1000): Promise<string> {
  const q = encodeURIComponent(entryPath);
  const res = await request<{ csv: string }>(
    `/repository/read?path=${q}&maxRows=${maxRows}`
  );
  return res.csv;
}

export async function storeCsvToRepository(entryPath: string, csv: string): Promise<void> {
  await request<{ status: string }>("/repository/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: entryPath, csv }),
  });
}

export interface BridgeRunResult {
  logs: string[];
  results: Array<{ portName: string; kind: string; preview: string }>;
  durationMs: number;
}

export async function runProcessOnBridge(
  xml: string,
  macros: Record<string, string> = {}
): Promise<BridgeRunResult> {
  return request<BridgeRunResult>("/process/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xml, macros }),
  });
}

/** Returns the XML of whatever process is currently open in the Studio GUI. */
export async function getCurrentProcessXml(): Promise<string> {
  const res = await request<{ xml: string }>("/process/current");
  return res.xml;
}

/** Replaces the process currently open in the Studio GUI with the given XML. */
export async function openProcessInStudio(xml: string): Promise<void> {
  await request<{ status: string }>("/process/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xml }),
  });
}
