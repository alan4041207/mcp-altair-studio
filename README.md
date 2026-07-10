# mcp-altair-studio

An MCP (Model Context Protocol) server that lets Claude drive **Altair AI Studio**
(the RapidMiner-based data-mining/ML product from Altair) running on your Windows
PC: import/clean/transform data, train and evaluate ML models, cluster, mine
association rules, and run arbitrary saved processes — all from a Claude
conversation.

## Important version note

You mentioned Altair Studio **2026.0.5**, but the install found on this machine is
**Altair AI Studio 2026.1.1** at:

```
C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1
```

Everything in this project was built and validated against that real, local
install (see "What was actually verified" below) rather than guessed from
documentation. If you also have a 2026.0.5 install elsewhere, point `ALTAIR_HOME`
at it instead — the process XML format and CLI have been stable across recent
releases, but re-run `altair_check_connection` after switching to confirm.

## How it connects (no public "Altair Studio API" exists)

Altair AI Studio is a desktop app with no built-in live REST API for the GUI. This
project uses the two real integration points the product actually offers:

1. **Headless batch execution** (primary, always available): the MCP server
   generates a RapidMiner `.rmp` process XML file on the fly and runs it via
   Altair's bundled `scripts\ai-studio-batch.bat -f <file>` command-line launcher.
   This is fully verified end-to-end (see below) and needs no extra install.
2. **Optional HTTP bridge extension** (`altair-http-bridge/`, addresses task 6 —
   "the complement to add to Altair Studio... for HTTP connection if necessary"):
   a small Java extension you can build and drop into Studio's extensions folder.
   It starts a localhost HTTP server *inside* the running Studio session so Claude
   can browse the repository and read/replace whatever process is currently open
   in the GUI. It's optional — everything else works without it. See
   `altair-http-bridge/README.md`.

## What was actually verified

Rather than guessing RapidMiner operator names from memory (they're easy to get
subtly wrong — e.g. "PCA" is really named `principal_component_analysis`, and
newer operators live behind namespace prefixes like `concurrency:`), this project's
build:

- Inspected the real installed jars (`lib\*.jar`, `lib\plugins\*.jar`) to confirm
  operator keys and their namespace prefixes (`concurrency:`, `blending:`) via
  each extension's `OperatorsXxx.xml` registry and `MANIFEST.MF`.
- Ran the actual `ai-studio-batch.bat` CLI against hand-built test processes and
  iterated on real error messages until they passed, confirming:
  - The CLI syntax is `ai-studio-batch.bat -f <path-to-rmp>` (not the classic
    `rapidminer-batch.sh '//repo/path'` positional-repository syntax some older
    docs describe).
  - A full `Retrieve -> Write CSV` pipeline runs and produces correct output.
  - A full `Set Role -> Cross Validation(Naive Bayes / Apply Model / Performance)`
    pipeline runs end-to-end, which fixed two wrong port-name guesses along the
    way (Cross Validation's outer input port is `example set`, not `training`;
    its Training subprocess's forwarded port is `training set`).
  - A Performance Vector can't feed into `Write CSV` (type mismatch) — it must be
    routed to the process's outer result port instead, where the batch runner
    prints it to stdout.

Recipes for clean/normalize/split/PCA/association-rules/k-Means reuse the exact
same well-established classic ExampleSet port conventions confirmed above, but
weren't each individually re-run this session — if one reports an unknown
operator/port, see "If something goes wrong" below.

**Not verified**: the `altair-http-bridge` Java extension (no JDK was available in
this environment to compile it) and Gradient Boosted Trees (the `H2O` extension is
installed on this machine, but its operator key wasn't confirmed).

**Also discovered**: this install has no active Altair license server reachable, so
Studio falls back to community/RapidMiner licensing. Batch execution of core
operators still worked fine in that state; some Professional-tier operators may be
license-gated depending on your Altair account.

## Setup

### 1. Install dependencies and build

```powershell
cd C:\dev\mcp-altair-studio-curso
npm install
npm run build
```

### 2. Configure Claude Desktop

A config was already written to
`%APPDATA%\Claude\claude_desktop_config.json` (created fresh — no Claude Desktop
config existed on this machine yet):

```json
{
  "mcpServers": {
    "altair-studio": {
      "command": "node",
      "args": ["C:\\dev\\mcp-altair-studio-curso\\dist\\index.js"],
      "env": {
        "ALTAIR_HOME": "C:\\Program Files\\Altair\\RapidMiner\\AI Studio 2026.1.1",
        "ALTAIR_DEFAULT_REPOSITORY": "Local Repository",
        "ALTAIR_HTTP_BRIDGE_ENABLED": "true",
        "ALTAIR_HTTP_BRIDGE_PORT": "8266"
      }
    }
  }
}
```

If you already have other MCP servers configured by the time you read this, merge
the `"altair-studio"` entry into your existing `"mcpServers"` object instead of
overwriting the file. Restart Claude Desktop after any change to this file.

### 3. Sanity check

In a Claude Desktop conversation, ask it to run `altair_check_connection`. It
should report the batch script found at `ALTAIR_HOME`, and whether the optional
HTTP bridge is reachable (it won't be, until you build+install
`altair-http-bridge/`).

## Tools

| Tool | Category | Notes |
|---|---|---|
| `altair_check_connection` | diagnostics | run this first |
| `altair_import_data` | ingestion | CSV file or repository entry |
| `altair_list_repository` | ingestion | requires HTTP bridge |
| `altair_read_repository_entry` | ingestion | requires HTTP bridge |
| `altair_store_csv_to_repository` | ingestion | requires HTTP bridge |
| `altair_clean_data` | prep | missing values, duplicates, column drop |
| `altair_normalize_data` | prep | Z/range/proportion/IQR |
| `altair_generate_attribute` | prep | derived column via expression |
| `altair_split_data` | prep | train/test partition |
| `altair_descriptive_stats` | exploration | mean/min/max/stddev/median/count |
| `altair_train_classifier` | ML | decision tree/random forest/naive bayes/k-NN/SVM/logistic regression/neural net/GBT + k-fold CV |
| `altair_cluster_kmeans` | ML | k-Means |
| `altair_association_rules` | ML | FP-Growth + rules |
| `altair_reduce_dimensions_pca` | ML | PCA |
| `altair_run_process_file` | automation | run any saved `.rmp` headlessly |
| `altair_run_operator_chain` | automation | **escape hatch**: any operator graph you assemble (DBSCAN, hierarchical clustering, database connections, Python/R scripting, Hugging Face/LLM operators, Optimize Parameters, Loop Files, ...) |
| `altair_get_current_process` | GUI hand-off | requires HTTP bridge |
| `altair_open_process_in_studio` | GUI hand-off | requires HTTP bridge |

This intentionally isn't 90 hand-coded one-off tools. RapidMiner/Altair has
hundreds of operators; hardcoding each one from memory (as literally requested by
copy-pasting a 90-item Blender-flavored action list) would mean either an
enormous low-confidence surface area or shipping tools that quietly call the
wrong operator key. Instead: ~17 well-tested tools cover the common cases from
every category in your list, plus `altair_run_operator_chain` as a fully general
building block — pass it any operator class key + parameters + port wiring and it
runs. Build once in the Studio GUI, use Process ▸ Export Process to see the exact
class/port names, and hand that straight to the tool.

## If something goes wrong

1. Run `altair_check_connection`.
2. Read the error log in the tool's response — Altair AI Studio's own error
   messages usually name the exact bad operator/port (this is literally how the
   port names in this project's recipes were fixed).
3. For an operator/port you're unsure about: drag it into a process in the Studio
   GUI, connect it, then **Process ▸ Export Process** (or the process XML view) to
   see the real class key and port names, and either use
   `altair_run_operator_chain` directly or fix the corresponding function in
   `src/altair/recipes.ts`.
4. To inspect the installed product's real operator registry yourself (same
   technique used to build this project):
   ```powershell
   Add-Type -AssemblyName System.IO.Compression.FileSystem
   $zip = [System.IO.Compression.ZipFile]::OpenRead("C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1\lib\plugins\concurrency-12.1.1-all.jar")
   $zip.Entries | Where-Object { $_.FullName -match "Operators.*\.xml" }
   ```

## Project layout

```
src/
  config.ts                 ALTAIR_HOME, ports, scratch dir (all env-overridable)
  altair/
    rmpXml.ts                generic .rmp XML builder
    recipes.ts                hand-authored, tested operator graphs
    batchRunner.ts             spawns ai-studio-batch.bat
    httpBridgeClient.ts        talks to the optional Java extension
    connector.ts               picks bridge vs. batch, reads back result CSVs
  tools/                      MCP tool registrations (zod schemas + handlers)
  index.ts                    MCP server entrypoint (stdio transport)
altair-http-bridge/           optional Java extension (see its own README)
claude-desktop-config.example.json
```
