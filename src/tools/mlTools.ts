import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dataSourceShape, requireOneSource } from "./shared.js";
import { runGeneratedProcess } from "../altair/connector.js";
import { buildProcessXml } from "../altair/rmpXml.js";
import { trainClassifierRecipe, kMeansRecipe, associationRulesRecipe, pcaRecipe } from "../altair/recipes.js";
import { formatRunOutcome, textResult, errorResult } from "./format.js";

const learnerEnum = z.enum([
  "decision_tree",
  "random_forest",
  "naive_bayes",
  "k_nn",
  "support_vector_machine",
  "logistic_regression",
  "neural_net",
  "gradient_boosted_trees",
]);

export function registerMlTools(server: McpServer) {
  server.tool(
    "altair_train_classifier",
    "Train and evaluate a classification model with k-fold cross validation (Decision Tree, Random Forest, Naive Bayes, k-NN, SVM, Logistic Regression, Neural Net, or Gradient Boosted Trees). Returns the performance vector (accuracy/precision/recall/etc). Covers actions 46-55, 66-74 (supervised learning + validation).",
    {
      ...dataSourceShape,
      labelAttribute: z.string().describe("Name of the target/label column."),
      learner: learnerEnum.default("decision_tree"),
      folds: z.number().int().min(2).max(20).default(10),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = trainClassifierRecipe(args, args.labelAttribute, args.learner, args.folds, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(
          await formatRunOutcome(outcome, {
            labels: [`${args.learner} cross-validated performance`],
            expectCsv: false,
          })
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_cluster_kmeans",
    "Segment data with k-Means clustering; returns the dataset with an added cluster-id column. Covers actions 56, 60, 64-65 (segmentation / clustering).",
    {
      ...dataSourceShape,
      k: z.number().int().min(2).max(50).default(3),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = kMeansRecipe(args, args.k, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Clustered data"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_association_rules",
    "Mine association rules with FP-Growth + Create Association Rules (market-basket analysis). Input data must be in transactional/binominal (item present/absent) form. Covers actions 61-64 (association rules, support/confidence/lift, market basket analysis).",
    {
      ...dataSourceShape,
      minSupport: z.number().min(0.001).max(1).default(0.05),
      minConfidence: z.number().min(0).max(1).default(0.5),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = associationRulesRecipe(args, args.minSupport, args.minConfidence, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["Association rules"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "altair_reduce_dimensions_pca",
    "Reduce dimensionality with PCA, keeping enough components to reach a target variance threshold. Covers action 43 (PCA).",
    {
      ...dataSourceShape,
      varianceThreshold: z.number().min(0.1).max(0.999).default(0.95),
    },
    async (args) => {
      try {
        requireOneSource(args);
        const outcome = await runGeneratedProcess((runId) => {
          const r = pcaRecipe(args, args.varianceThreshold, runId);
          return buildProcessXml({ operators: r.operators, connections: r.connections });
        });
        return textResult(await formatRunOutcome(outcome, { labels: ["PCA-transformed data"] }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
