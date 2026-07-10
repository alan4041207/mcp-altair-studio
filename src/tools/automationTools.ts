import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { promises as fs } from "node:fs";
import { runProcessXml, newRunId } from "../altair/batchRunner.js";
import { buildProcessXml, OperatorNode, Connection } from "../altair/rmpXml.js";
import { getCurrentProcessXml, openProcessInStudio, isBridgeAvailable } from "../altair/httpBridgeClient.js";
import { textResult, errorResult } from "./format.js";

const parameterSchema = z.object({ key: z.string(), value: z.string() });
const listParameterSchema = z.object({ key: z.string(), entries: z.array(parameterSchema) });
const connectionSchema = z.object({
  fromOp: z.string().optional().describe("Omit to connect from an outer sub-process input port."),
  fromPort: z.string(),
  toOp: z.string().optional().describe("Omit to connect to an outer sub-process output port."),
  toPort: z.string(),
});

type OperatorSchemaType = {
  name: string;
  classKey: string;
  parameters?: { key: string; value: string }[];
  listParameters?: { key: string; entries: { key: string; value: string }[] }[];
  subprocesses?: { operators: OperatorSchemaType[]; connections: z.infer<typeof connectionSchema>[] }[];
};

const operatorSchema: z.ZodType<OperatorSchemaType> = z.lazy(() =>
  z.object({
    name: z.string().describe('Unique display name within its parent process, e.g. "Read CSV".'),
    classKey: z
      .string()
      .describe('Exact operator class key, e.g. "read_csv", "decision_tree", "concurrency:cross_validation".'),
    parameters: z.array(parameterSchema).optional(),
    listParameters: z.array(listParameterSchema).optional(),
    subprocesses: z
      .array(z.object({ operators: z.array(operatorSchema), connections: z.array(connectionSchema) }))
      .optional()
      .describe("Nested sub-processes, for control-structure operators like Cross Validation or Loop."),
  })
);

export function registerAutomationTools(server: McpServer) {
  server.tool(
    "altair_run_operator_chain",
    "ADVANCED / escape hatch: run ANY Altair AI Studio / RapidMiner operator graph you assemble yourself, by giving the exact operator class keys, parameters, and port-level connections. Use this for operators not covered by the dedicated tools (DBSCAN, hierarchical clustering, database connections, web/text/scraping extensions, Hugging Face / LLM operators, Optimize Parameters, Loop Files, Python/R scripting, etc). Tip: build the graph once in the Altair AI Studio GUI and use Process > Export Process to see the exact class keys and port names to copy here. The graph must end by writing its result(s) with a 'write_csv' operator to an absolute file path you choose — read that file back afterwards to see the result.",
    {
      operators: z.array(operatorSchema),
      connections: z.array(connectionSchema),
      macros: z.record(z.string()).optional(),
    },
    async ({ operators, connections, macros }) => {
      try {
        const xml = buildProcessXml({
          operators: operators as OperatorNode[],
          connections: connections as Connection[],
          macros,
        });
        const result = await runProcessXml(xml, { macros });
        return textResult(
          `Exit code: ${result.exitCode}\nProcess file: ${result.processFile}\n\n--- stdout ---\n${result.stdout}\n\n--- stderr ---\n${result.stderr}`
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_run_process_file",
    "Execute an existing .rmp process file (already saved on disk or exported from the Studio repository) headlessly via rapidminer-batch. Covers actions 76-80 (run saved/repeatable workflows, automate experiments) and scoring-on-new-data flows (action 84).",
    {
      processFilePath: z.string().describe("Absolute path to the .rmp file to run."),
      macros: z.record(z.string()).optional().describe("Macro overrides, passed as -M key=value."),
    },
    async ({ processFilePath, macros }) => {
      try {
        const xml = await fs.readFile(processFilePath, "utf-8");
        const result = await runProcessXml(xml, { macros, runId: newRunId() });
        return textResult(
          `Exit code: ${result.exitCode}\nDuration: ${result.durationMs}ms\n\n--- stdout ---\n${result.stdout}\n\n--- stderr ---\n${result.stderr}`
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_get_current_process",
    "Read the XML of the process currently open in the Altair AI Studio GUI (requires the HTTP bridge extension). Useful to see what the human user is working on before suggesting changes.",
    {},
    async () => {
      try {
        if (!(await isBridgeAvailable())) {
          return errorResult(new Error("HTTP bridge not reachable. Run altair_check_connection to diagnose."));
        }
        const xml = await getCurrentProcessXml();
        return textResult(xml);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_open_process_in_studio",
    "Replace the process currently open in the Altair AI Studio GUI with the given XML, handing control back to the human user so they can inspect/run/edit it visually (requires the HTTP bridge extension).",
    { xml: z.string() },
    async ({ xml }) => {
      try {
        if (!(await isBridgeAvailable())) {
          return errorResult(new Error("HTTP bridge not reachable. Run altair_check_connection to diagnose."));
        }
        await openProcessInStudio(xml);
        return textResult("Process opened in the Altair AI Studio GUI.");
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
