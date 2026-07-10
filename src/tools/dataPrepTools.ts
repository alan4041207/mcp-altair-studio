import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dataSourceShape, requireOneSource } from "./shared.js";
import { runGeneratedProcess } from "../altair/connector.js";
import { buildProcessXml } from "../altair/rmpXml.js";
import {
  importDataRecipe,
  cleanDataRecipe,
  normalizeDataRecipe,
  generateAttributeRecipe,
  descriptiveStatsRecipe,
  splitDataRecipe,
} from "../altair/recipes.js";
import { formatRunOutcome, textResult, errorResult } from "./format.js";

export function registerDataPrepTools(server: McpServer) {
  server.tool(
    "altair_import_data",
    "Import/preview tabular data through Altair AI Studio, from a repository entry or a local CSV file. Covers CSV/repository ingestion (actions 1-2, 5-7, 9 of the data-ingestion category).",
    { ...dataSourceShape },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = importDataRecipe(args, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Imported data"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_clean_data",
    "Clean a dataset: replace missing values, remove duplicate rows, and optionally drop named columns. Covers missing-value handling, duplicate removal, and column selection (actions 11-15, 20 of data preparation).",
    {
      ...dataSourceShape,
      dropColumns: z.array(z.string()).optional().describe("Column names to remove before cleaning."),
      missingValueStrategy: z
        .enum(["average", "minimum", "maximum", "zero", "value"])
        .optional()
        .describe("How to replace missing values. Default: average."),
      missingValueReplacement: z
        .string()
        .optional()
        .describe('Replacement value when missingValueStrategy is "value".'),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = cleanDataRecipe(
            args,
            {
              dropColumns: args.dropColumns,
              missingValueStrategy: args.missingValueStrategy as any,
              missingValueReplacement: args.missingValueReplacement,
            },
            runId
          );
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Cleaned data"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_normalize_data",
    "Normalize/scale numeric attributes (Z-transformation, range/min-max, proportion, or interquartile range). Covers actions 17-18 (normalize and scale variables).",
    {
      ...dataSourceShape,
      method: z
        .enum(["Z-transformation", "range transformation", "proportion transformation", "interquartile range"])
        .default("Z-transformation"),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = normalizeDataRecipe(args, args.method, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Normalized data"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_generate_attribute",
    'Create a new derived/calculated column using a RapidMiner expression, e.g. attributeName="profit", expression="revenue - cost". Covers action 21 (create new variables via formulas).',
    {
      ...dataSourceShape,
      attributeName: z.string(),
      expression: z.string().describe('RapidMiner expression syntax, e.g. "revenue - cost" or "log(price)".'),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = generateAttributeRecipe(args, args.attributeName, args.expression, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Data with new attribute"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_descriptive_stats",
    "Compute descriptive statistics (average, min, max, standard deviation, median, count) for every numeric column. Covers actions 26-28 (descriptive statistics, distribution summary).",
    { ...dataSourceShape },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = descriptiveStatsRecipe(args, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Descriptive statistics"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_split_data",
    "Split a dataset into train/test partitions. Covers action 66 (train/validation/test split).",
    {
      ...dataSourceShape,
      trainRatio: z.number().min(0.05).max(0.95).default(0.7),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = splitDataRecipe(args, args.trainRatio, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Train partition", "Test partition"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
