import { RunOutcome, previewCsv } from "../altair/connector.js";

function toMarkdownTable(columns: string[], rows: string[][]): string {
  if (columns.length === 0) return "(empty result)";
  const header = `| ${columns.join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [header, sep, body].filter(Boolean).join("\n");
}

export async function formatRunOutcome(
  outcome: RunOutcome,
  opts: { maxPreviewRows?: number; labels?: string[]; expectCsv?: boolean } = {}
): Promise<string> {
  const maxRows = opts.maxPreviewRows ?? 25;
  const expectCsv = opts.expectCsv ?? true;
  const parts: string[] = [];
  parts.push(`Execution mode: **${outcome.mode}** (run id \`${outcome.runId}\`)`);

  if (expectCsv && outcome.outputCsvPaths.length === 0) {
    parts.push(
      "No output CSV was produced. This usually means the process failed before reaching its Write CSV step — see the log excerpt below."
    );
  } else if (!expectCsv) {
    parts.push("This result is a non-tabular object (e.g. a performance vector); see the log below for its printed values.");
  }

  for (let i = 0; i < outcome.outputCsvPaths.length; i++) {
    const filePath = outcome.outputCsvPaths[i];
    const label = opts.labels?.[i] ?? `Output ${i + 1}`;
    try {
      const preview = await previewCsv(filePath, maxRows);
      parts.push(
        `### ${label}\nFile: \`${filePath}\`\n\n${toMarkdownTable(preview.columns, preview.rows)}${
          preview.truncated ? `\n\n(showing first ${maxRows} rows)` : ""
        }`
      );
    } catch (err) {
      parts.push(`### ${label}\nFailed to read \`${filePath}\`: ${(err as Error).message}`);
    }
  }

  const logExcerpt = outcome.logs.trim();
  if (logExcerpt.length > 0) {
    const truncatedLog =
      logExcerpt.length > 4000 ? logExcerpt.slice(-4000) + "\n... (truncated, showing tail)" : logExcerpt;
    parts.push(`### Log\n\`\`\`\n${truncatedLog}\n\`\`\``);
  }

  return parts.join("\n\n");
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}
