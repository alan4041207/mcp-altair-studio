import { z } from "zod";

export const dataSourceShape = {
  repositoryEntry: z
    .string()
    .optional()
    .describe(
      'Altair AI Studio repository path, e.g. "//Local Repository/data/customers" or "//Samples/data/Iris". Use this OR csvFile.'
    ),
  csvFile: z
    .string()
    .optional()
    .describe("Absolute path to a local CSV file to read directly (bypasses the repository). Use this OR repositoryEntry."),
};

export function requireOneSource(args: { repositoryEntry?: string; csvFile?: string }) {
  if (!args.repositoryEntry && !args.csvFile) {
    throw new Error("Provide either repositoryEntry or csvFile.");
  }
}
