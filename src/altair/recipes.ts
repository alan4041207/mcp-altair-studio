import path from "node:path";
import { OperatorNode, Connection, Parameter } from "./rmpXml.js";
import { workFilePath } from "./batchRunner.js";

/**
 * Hand-authored "recipes": small, tested operator graphs for the most common
 * data-prep / ML actions, built from operator class keys and port names that have
 * been stable in RapidMiner / Altair AI Studio for many releases (retrieve,
 * read_csv, select_attributes, replace_missing_values, cross_validation, ...).
 *
 * A few less common operators (rename's exact list-parameter key, discretize
 * variants, k-Means' package prefix) are marked "verify" below: if Altair AI
 * Studio reports an unknown operator/parameter when it opens a generated process,
 * open Help > Operator Reference (or search the operator in the GUI, drag it in
 * once, and use Process > Export Process) to confirm the exact key for 2026.0.5,
 * then fix the one line here — the rest of the graph is unaffected.
 */

function op(
  name: string,
  classKey: string,
  parameters: Parameter[] = [],
  extra: Partial<OperatorNode> = {}
): OperatorNode {
  return { name, classKey, parameters, ...extra };
}

function writeCsv(name: string, filePath: string): OperatorNode {
  return op(name, "write_csv", [
    { key: "csv_file", value: filePath },
    { key: "column_separator", value: "," },
    { key: "quote_nominal_values", value: "true" },
    { key: "format_date_attributes", value: "true" },
  ]);
}

export function resultCsvPath(runId: string, index = 1): string {
  return workFilePath(`result-${runId}-${index}.csv`);
}

/** Source operator: either a repository entry ("retrieve") or a raw CSV file ("read_csv"). */
export function sourceOperator(
  name: string,
  source: { repositoryEntry?: string; csvFile?: string }
): OperatorNode {
  if (source.repositoryEntry) {
    return op(name, "retrieve", [{ key: "repository_entry", value: source.repositoryEntry }]);
  }
  if (source.csvFile) {
    return op(name, "read_csv", [
      { key: "csv_file", value: source.csvFile },
      { key: "column_separators", value: "," },
      { key: "first_row_as_names", value: "true" },
      { key: "encoding", value: "UTF-8" },
    ]);
  }
  throw new Error("sourceOperator requires either repositoryEntry or csvFile");
}

export interface RecipeResult {
  operators: OperatorNode[];
  connections: Connection[];
}

/** 1) Import + passthrough: read a CSV/repository entry and export a clean preview CSV. */
export function importDataRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  runId: string
): RecipeResult {
  const src = sourceOperator("Source", source);
  const out = writeCsv("Export", resultCsvPath(runId, 1));
  return {
    operators: [src, out],
    connections: [{ fromOp: "Source", fromPort: "output", toOp: "Export", toPort: "input" }],
  };
}

/** 2) Clean: replace missing values + drop duplicates, optionally drop named columns. */
export function cleanDataRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  opts: { dropColumns?: string[]; missingValueStrategy?: "average" | "minimum" | "maximum" | "zero" | "value"; missingValueReplacement?: string },
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [sourceOperator("Source", source)];
  const connections: Connection[] = [];
  let lastOp = "Source";
  let lastPort = "output";

  if (opts.dropColumns && opts.dropColumns.length > 0) {
    operators.push(
      op("DropColumns", "select_attributes", [
        { key: "attribute_filter_type", value: "subset" },
        { key: "invert_selection", value: "true" },
        { key: "attributes", value: opts.dropColumns.join("|") },
      ])
    );
    connections.push({ fromOp: lastOp, fromPort: lastPort, toOp: "DropColumns", toPort: "example set input" });
    lastOp = "DropColumns";
    lastPort = "example set output";
  }

  operators.push(
    op("ReplaceMissing", "replace_missing_values", [
      { key: "attribute_filter_type", value: "all" },
      { key: "default", value: opts.missingValueStrategy ?? "average" },
      ...(opts.missingValueReplacement
        ? [{ key: "replenishment_value", value: opts.missingValueReplacement }]
        : []),
    ])
  );
  connections.push({ fromOp: lastOp, fromPort: lastPort, toOp: "ReplaceMissing", toPort: "example set input" });

  operators.push(op("DropDuplicates", "remove_duplicates", []));
  connections.push({
    fromOp: "ReplaceMissing",
    fromPort: "example set output",
    toOp: "DropDuplicates",
    toPort: "example set input",
  });

  operators.push(writeCsv("Export", resultCsvPath(runId, 1)));
  connections.push({ fromOp: "DropDuplicates", fromPort: "example set output", toOp: "Export", toPort: "input" });

  return { operators, connections };
}

/** 3) Normalize numeric attributes (Z-transformation / range transformation / etc). */
export function normalizeDataRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  method: "Z-transformation" | "range transformation" | "proportion transformation" | "interquartile range",
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    op("Normalize", "normalize", [
      { key: "attribute_filter_type", value: "all" },
      { key: "method", value: method },
    ]),
    writeCsv("Export", resultCsvPath(runId, 1)),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "Normalize", toPort: "example set input" },
    { fromOp: "Normalize", fromPort: "example set output", toOp: "Export", toPort: "input" },
  ];
  return { operators, connections };
}

/** 4) Generate a derived attribute from an expression, e.g. "profit = revenue - cost". */
export function generateAttributeRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  attributeName: string,
  expression: string,
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    op("Generate", "generate_attributes", [], {
      listParameters: [
        { key: "function_descriptions", entries: [{ key: attributeName, value: expression }] },
      ],
    }),
    writeCsv("Export", resultCsvPath(runId, 1)),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "Generate", toPort: "example set input" },
    { fromOp: "Generate", fromPort: "example set output", toOp: "Export", toPort: "input" },
  ];
  return { operators, connections };
}

/** 5) Descriptive statistics summary (mean/min/max/stddev/median per numeric column). */
export function descriptiveStatsRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    op("Stats", "aggregate", [{ key: "attribute_filter_type", value: "all" }], {
      listParameters: [
        {
          key: "aggregation_attributes",
          entries: [
            { key: "average", value: "average" },
            { key: "minimum", value: "minimum" },
            { key: "maximum", value: "maximum" },
            { key: "standard_deviation", value: "standard_deviation" },
            { key: "median", value: "median" },
            { key: "count", value: "count" },
          ],
        },
      ],
    }),
    writeCsv("Export", resultCsvPath(runId, 1)),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "Stats", toPort: "example set input" },
    { fromOp: "Stats", fromPort: "example set output", toOp: "Export", toPort: "input" },
  ];
  return { operators, connections };
}

/** 6) Train/test split, writing two CSVs (train, test). */
export function splitDataRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  trainRatio: number,
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    op("Split", "split_data", [{ key: "sampling_type", value: "shuffled sampling" }], {
      listParameters: [
        {
          key: "partitions",
          entries: [
            { key: "ratio", value: String(trainRatio) },
            { key: "ratio", value: String(1 - trainRatio) },
          ],
        },
      ],
    }),
    writeCsv("ExportTrain", resultCsvPath(runId, 1)),
    writeCsv("ExportTest", resultCsvPath(runId, 2)),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "Split", toPort: "example set" },
    { fromOp: "Split", fromPort: "partition 1", toOp: "ExportTrain", toPort: "input" },
    { fromOp: "Split", fromPort: "partition 2", toOp: "ExportTest", toPort: "input" },
  ];
  return { operators, connections };
}

export type ClassificationLearner =
  | "decision_tree"
  | "random_forest"
  | "naive_bayes"
  | "k_nn"
  | "support_vector_machine"
  | "logistic_regression"
  | "neural_net"
  | "gradient_boosted_trees";

const LEARNER_CLASS_KEY: Record<ClassificationLearner, string> = {
  decision_tree: "concurrency:parallel_decision_tree",
  random_forest: "concurrency:parallel_random_forest",
  naive_bayes: "naive_bayes",
  k_nn: "k_nn",
  support_vector_machine: "support_vector_machine",
  logistic_regression: "logistic_regression",
  neural_net: "neural_net",
  // GBT ships via the H2O extension on most installs; verify the exact key
  // (Extensions > Manage Extensions) if this one reports "unknown operator".
  gradient_boosted_trees: "h2o:gradient_boosted_trees",
};

/**
 * 7) Train + evaluate a classifier with k-fold cross validation.
 * Verified end-to-end against a real Altair AI Studio 2026.1.1 install (Iris sample,
 * Naive Bayes, 5 folds): the outer input port is "example set" (NOT "training" as
 * older RapidMiner docs suggest), and the Training subprocess's forwarded source
 * port is "training set". A Performance Vector cannot flow into Write CSV (type
 * mismatch: "Data table" expected) — the CommandLineLauncher batch runner prints
 * result-port objects to stdout instead, so we route performance straight to the
 * process's outer result port and read it back from the run log.
 */
export function trainClassifierRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  labelAttribute: string,
  learner: ClassificationLearner,
  folds: number,
  runId: string
): RecipeResult {
  const learnerClass = LEARNER_CLASS_KEY[learner];
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    // Studio labels this "Set Role (Deprecated)" in its GUI in favor of the newer
    // Belt-based "blending:set_role", but the classic operator still runs correctly
    // (verified) — kept here for its well-known "example set input/output" ports.
    op("SetLabel", "set_role", [
      { key: "attribute_name", value: labelAttribute },
      { key: "target_role", value: "label" },
    ]),
    op("CrossValidation", "concurrency:cross_validation", [{ key: "number_of_folds", value: String(folds) }], {
      subprocesses: [
        {
          operators: [op("Learner", learnerClass, [])],
          connections: [
            { fromPort: "training set", toOp: "Learner", toPort: "training set" },
            { fromOp: "Learner", fromPort: "model", toPort: "model" },
          ],
        },
        {
          operators: [op("Apply", "apply_model", []), op("Performance", "performance", [])],
          connections: [
            { fromPort: "model", toOp: "Apply", toPort: "model" },
            { fromPort: "test set", toOp: "Apply", toPort: "unlabelled data" },
            { fromOp: "Apply", fromPort: "labelled data", toOp: "Performance", toPort: "labelled data" },
            { fromOp: "Performance", fromPort: "performance", toPort: "performance 1" },
          ],
        },
      ],
    }),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "SetLabel", toPort: "example set input" },
    { fromOp: "SetLabel", fromPort: "example set output", toOp: "CrossValidation", toPort: "example set" },
    { fromOp: "CrossValidation", fromPort: "performance 1", toPort: "result 1" },
  ];
  return { operators, connections };
}

/** 8) k-Means clustering; writes the clustered example set (with a "cluster" column) to CSV. */
export function kMeansRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  k: number,
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    op("KMeans", "k_means", [
      { key: "add_cluster_attribute", value: "true" },
      { key: "k", value: String(k) },
    ]),
    writeCsv("Export", resultCsvPath(runId, 1)),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "KMeans", toPort: "example set" },
    { fromOp: "KMeans", fromPort: "clustered set", toOp: "Export", toPort: "input" },
  ];
  return { operators, connections };
}

/** 9) Association rules (FP-Growth + Create Association Rules) over binominal/transactional data. */
export function associationRulesRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  minSupport: number,
  minConfidence: number,
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    op("FPGrowth", "fp_growth", [
      { key: "min_support", value: String(minSupport) },
      { key: "find_min_number_of_itemsets", value: "false" },
    ]),
    op("Rules", "create_association_rules", [{ key: "min_confidence", value: String(minConfidence) }]),
    writeCsv("Export", resultCsvPath(runId, 1)),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "FPGrowth", toPort: "example set" },
    { fromOp: "FPGrowth", fromPort: "frequent sets", toOp: "Rules", toPort: "item sets" },
    { fromOp: "Rules", fromPort: "rules", toOp: "Export", toPort: "input" },
  ];
  return { operators, connections };
}

/** 10) PCA dimensionality reduction. */
export function pcaRecipe(
  source: { repositoryEntry?: string; csvFile?: string },
  varianceThreshold: number,
  runId: string
): RecipeResult {
  const operators: OperatorNode[] = [
    sourceOperator("Source", source),
    op("PCA", "principal_component_analysis", [
      { key: "dimensionality_reduction", value: "keep variance" },
      { key: "variance_threshold", value: String(varianceThreshold) },
    ]),
    writeCsv("Export", resultCsvPath(runId, 1)),
  ];
  const connections: Connection[] = [
    { fromOp: "Source", fromPort: "output", toOp: "PCA", toPort: "example set input" },
    { fromOp: "PCA", fromPort: "example set output", toOp: "Export", toPort: "input" },
  ];
  return { operators, connections };
}
