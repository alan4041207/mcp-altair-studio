import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import path from "node:path";
import { promises as fs } from "node:fs";
import { config } from "../config.js";
import { fileExists } from "../altair/batchRunner.js";
import { isBridgeAvailable, getHealth, listRepository, readRepositoryDataAsCsv, storeCsvToRepository } from "../altair/httpBridgeClient.js";
import { textResult, errorResult } from "./format.js";

export function registerConnectionTools(server: McpServer) {
  server.tool(
    "altair_check_connection",
    "Check how this MCP server can currently reach Altair AI Studio 2026.0.5: whether the optional live HTTP bridge extension is running, and whether the headless batch script (rapidminer-batch.bat) is reachable at ALTAIR_HOME. Run this first when troubleshooting.",
    {},
    async () => {
      const lines: string[] = [];
      const bridgeUp = await isBridgeAvailable();
      if (bridgeUp) {
        try {
          const health = await getHealth();
          lines.push(
            `✅ HTTP bridge reachable at http://${config.httpBridge.host}:${config.httpBridge.port} — Studio version reported: ${health.studioVersion}, bridge version: ${health.bridgeVersion}.`
          );
        } catch (err) {
          lines.push(`⚠️ HTTP bridge responded but health check failed: ${(err as Error).message}`);
        }
      } else {
        lines.push(
          `ℹ️ HTTP bridge not reachable at http://${config.httpBridge.host}:${config.httpBridge.port}. Install/enable the altair-http-bridge extension in a running Altair AI Studio session for live GUI features (repository browse, "what's open right now"), or ignore this if you only need batch execution.`
        );
      }

      const batchScript = path.join(config.altairHome, config.batchScriptRelativePath);
      if (await fileExists(batchScript)) {
        lines.push(`✅ Batch script found: ${batchScript}`);
      } else {
        lines.push(
          `❌ Batch script NOT found at ${batchScript}. Set the ALTAIR_HOME environment variable (in your Claude Desktop config) to your Altair AI Studio 2026.0.5 installation directory — the one containing "scripts\\rapidminer-batch.bat".`
        );
      }

      lines.push(`Scratch/work directory: ${config.workDir}`);
      return textResult(lines.join("\n"));
    }
  );

  server.tool(
    "altair_list_repository",
    'List folders/entries in the Altair AI Studio repository (requires the HTTP bridge extension, since the repository lives inside the running Studio session). Example path: "//Local Repository" or "//Samples/data".',
    { path: z.string().default("//Local Repository") },
    async ({ path: repoPath }) => {
      try {
        const entries = await listRepository(repoPath);
        if (entries.length === 0) return textResult(`No entries found under ${repoPath}.`);
        const lines = entries.map((e) => `- [${e.type}] ${e.path}`);
        return textResult(lines.join("\n"));
      } catch (err) {
        return errorResult(
          new Error(
            `${(err as Error).message}\n\nThis tool requires the altair-http-bridge extension to be installed and Altair AI Studio to be running. Run altair_check_connection to diagnose.`
          )
        );
      }
    }
  );

  server.tool(
    "altair_read_repository_entry",
    "Read a data entry from the Altair AI Studio repository as CSV (requires the HTTP bridge extension).",
    { path: z.string(), maxRows: z.number().int().min(1).max(100000).default(1000) },
    async ({ path: repoPath, maxRows }) => {
      try {
        const csv = await readRepositoryDataAsCsv(repoPath, maxRows);
        return textResult(csv);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_store_csv_to_repository",
    "Write a local CSV file's contents into an Altair AI Studio repository entry (requires the HTTP bridge extension). Covers action 82-83 style export-to-repository / reuse-as-input flows.",
    { path: z.string(), csvFilePath: z.string() },
    async ({ path: repoPath, csvFilePath }) => {
      try {
        const csv = await fs.readFile(csvFilePath, "utf-8");
        await storeCsvToRepository(repoPath, csv);
        return textResult(`Stored ${csvFilePath} into repository entry ${repoPath}.`);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
