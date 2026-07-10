# altair-http-bridge

Optional companion extension for Altair AI Studio. It starts a localhost-only HTTP
server (default `http://127.0.0.1:8266`) inside the Studio JVM so the MCP server can
talk to a **live, already-running** Studio session instead of only launching new
headless batch processes.

**You do not need this to use the MCP server.** Every core data-prep/ML tool works
today via headless batch execution (`ai-studio-batch.bat`), which was verified
end-to-end against a real Altair AI Studio 2026.1.1 install. Install this extension
only if you also want:

- `altair_list_repository` / `altair_read_repository_entry` / `altair_store_csv_to_repository`
- `altair_get_current_process` / `altair_open_process_in_studio` (read/replace whatever
  process is currently open in the GUI, so Claude and you can hand a process back and
  forth)

## Prerequisites

- JDK 17+ on your PATH (`javac -version`). Altair AI Studio ships its own **JRE**
  (no compiler) under `<install dir>\jre`, so you need a separate JDK just for building
  this extension.
- [Gradle](https://gradle.org/install/) (any recent version), or use `gradlew` if you
  add a wrapper.

## Build & install

```powershell
cd altair-http-bridge
gradle build -PaltairHome="C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1"
gradle installExtension -PaltairHome="C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1"
```

`installExtension` copies the built jar into
`%USERPROFILE%\.AltairRapidMiner\AI Studio\shared\extensions\` — confirmed by
disassembling `com/rapidminer/tools/plugin/Plugin.class` from the Studio core jar,
which is the directory `getExtensionsDir()` actually scans on startup. This is
version-independent (`shared`, not the Studio version number), and **not**
`%USERPROFILE%\.RapidMiner\extensions\` despite the batch script living under a
"RapidMiner" folder. Restart Studio afterwards. You should see a line like this in
Studio's log (Help > About > show log, or the console if launched from a terminal):

```
[mcp-http-bridge] listening on http://127.0.0.1:8266
```

Then run the `altair_check_connection` MCP tool from Claude — it should report the
bridge as reachable.

## If something doesn't compile or a call fails at runtime

This extension's `ProcessBridge` (process execution) and the `/health` endpoint use
APIs that were directly confirmed by inspecting real Altair AI Studio 2026.1.1 jars
and stack traces during this project's build. `RepositoryBridge` (repository
browsing) and `GuiBridge` (read/replace the open GUI process) are best-effort best
because no JDK was available to compile-test them in the environment that generated
this code — `GuiBridge` specifically uses reflection so a wrong method name fails
softly (a clear HTTP error) instead of breaking the whole build.

To fix a wrong class/method name yourself, the same technique this project used to
get the rest right:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1\lib\rapidminer-studio-core-12.1.1.jar")
$zip.Entries | Where-Object { $_.FullName -match "MainFrame|RepositoryLocation" }
```

Extract the `.class` file you need and run `javap -p` on it (from a JDK, not the
bundled JRE) to see its real method signatures.

## Security note

The server binds to `127.0.0.1` only and is not authenticated beyond that — anything
running as your Windows user can reach it, same as any other localhost dev server.
Don't change the bind address to `0.0.0.0` unless you add authentication first.
