import path from "node:path";
import os from "node:os";

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : fallback;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

/**
 * ALTAIR_HOME must point at the Altair AI Studio installation directory — the folder
 * that contains "scripts\\ai-studio-batch.bat" (this is what Altair AI Studio
 * 2026.1.1 actually ships; earlier 2026.0.x builds used the same layout under a
 * differently-numbered folder). Confirmed by inspecting a real local install at
 * "C:\\Program Files\\Altair\\RapidMiner\\AI Studio 2026.1.1".
 */
export const config = {
  altairHome: envStr(
    "ALTAIR_HOME",
    "C:\\Program Files\\Altair\\RapidMiner\\AI Studio 2026.1.1"
  ),
  batchScriptRelativePath: "scripts\\ai-studio-batch.bat",

  // Default RapidMiner/Altair repository alias used when the user gives a bare
  // repository path like "//Local Repository/data/customers".
  defaultRepository: envStr("ALTAIR_DEFAULT_REPOSITORY", "Local Repository"),

  // Scratch directory for generated .rmp process files, CSV exports, logs.
  workDir: envStr(
    "ALTAIR_MCP_WORKDIR",
    path.join(os.tmpdir(), "mcp-altair-studio")
  ),

  // Optional companion HTTP bridge running inside a live Altair AI Studio session
  // (see altair-http-bridge/). When reachable, some tools prefer it over batch mode
  // because it can read the state of the process currently open in the GUI.
  httpBridge: {
    enabled: envBool("ALTAIR_HTTP_BRIDGE_ENABLED", true),
    host: envStr("ALTAIR_HTTP_BRIDGE_HOST", "127.0.0.1"),
    port: envInt("ALTAIR_HTTP_BRIDGE_PORT", 8266),
    timeoutMs: envInt("ALTAIR_HTTP_BRIDGE_TIMEOUT_MS", 4000),
  },

  batchTimeoutMs: envInt("ALTAIR_BATCH_TIMEOUT_MS", 5 * 60 * 1000),
};

export function httpBridgeBaseUrl(): string {
  return `http://${config.httpBridge.host}:${config.httpBridge.port}`;
}
