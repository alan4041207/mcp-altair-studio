package com.mcpaltair.bridge;

import com.rapidminer.Process;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Executes a process XML string inside the already-running Studio JVM using the
 * classic embedding API (com.rapidminer.Process(String xml) + Process.run()) — the
 * same entry point Altair's own documentation shows for embedding RapidMiner in a
 * host Java application. Requests are serialized (synchronized) because log capture
 * temporarily swaps System.out/System.err, which is process-wide state.
 */
final class ProcessBridge {

    private ProcessBridge() {}

    static final class RunResult {
        final List<String> logs;
        final long durationMs;

        RunResult(List<String> logs, long durationMs) {
            this.logs = logs;
            this.durationMs = durationMs;
        }
    }

    static synchronized RunResult run(String xml, Map<String, Object> macros) throws Exception {
        long start = System.currentTimeMillis();
        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        PrintStream tee = new PrintStream(captured, true, StandardCharsets.UTF_8);

        // Substitute %{name} macro references directly in the XML text before
        // parsing, rather than calling into RapidMiner's macro API — this needs no
        // internal API knowledge and matches RapidMiner's well-known %{name} syntax.
        String resolvedXml = xml;
        if (macros != null) {
            for (Map.Entry<String, Object> e : macros.entrySet()) {
                if (e.getValue() != null) {
                    resolvedXml = resolvedXml.replace("%{" + e.getKey() + "}", String.valueOf(e.getValue()));
                }
            }
        }

        List<String> logs = new ArrayList<>();
        try {
            System.setOut(tee);
            System.setErr(tee);

            Process process = new Process(resolvedXml);
            process.run();
        } finally {
            System.setOut(originalOut);
            System.setErr(originalErr);
            for (String line : captured.toString(StandardCharsets.UTF_8).split("\\R")) {
                logs.add(line);
            }
        }

        return new RunResult(logs, System.currentTimeMillis() - start);
    }
}
