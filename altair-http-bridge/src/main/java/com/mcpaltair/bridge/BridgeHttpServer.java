package com.mcpaltair.bridge;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Minimal localhost-only JSON HTTP server exposing a live Altair AI Studio session
 * to the mcp-altair-studio MCP server. No external dependencies (uses the JDK's
 * built-in com.sun.net.httpserver so the extension needs nothing beyond Studio's
 * own jars to compile).
 *
 * /health and /process/run (ProcessBridge) use APIs directly evidenced in Altair AI
 * Studio's own stack traces during this project's testing and are reasonably solid.
 * /repository/* (RepositoryBridge) and /process/current, /process/open (GuiBridge)
 * are marked EXPERIMENTAL: this project had no JDK available to compile-test against
 * a real Altair AI Studio jar, so a few method names there are best-effort. If one
 * throws "unsupported" or a reflection error, inspect your own installed jars the
 * same way this project's README explains (unzip, list classes, `javap` a class) and
 * fix the one call site — everything else is unaffected. The headless batch execution
 * path (src/altair/batchRunner.ts on the MCP server side) does not depend on any of
 * this bridge and has been verified end-to-end against a real install.
 */
public class BridgeHttpServer {

    private final HttpServer httpServer;

    public BridgeHttpServer(int port) throws IOException {
        httpServer = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        httpServer.setExecutor(Executors.newCachedThreadPool());
        httpServer.createContext("/health", this::handleHealth);
        httpServer.createContext("/repository/list", this::handleRepositoryList);
        httpServer.createContext("/repository/read", this::handleRepositoryRead);
        httpServer.createContext("/repository/store", this::handleRepositoryStore);
        httpServer.createContext("/process/run", this::handleProcessRun);
        httpServer.createContext("/process/current", this::handleProcessCurrent);
        httpServer.createContext("/process/open", this::handleProcessOpen);
    }

    public void start() {
        httpServer.start();
    }

    // ---- handlers -----------------------------------------------------

    private void handleHealth(HttpExchange ex) throws IOException {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("status", "ok");
        body.put("studioVersion", System.getProperty("rapidminer.version", "unknown"));
        body.put("bridgeVersion", "0.1.0");
        writeJson(ex, 200, body);
    }

    private void handleRepositoryList(HttpExchange ex) throws IOException {
        try {
            String path = queryParam(ex, "path");
            if (path == null) path = "//Local Repository";
            String json = RepositoryBridge.listAsJson(path);
            writeRaw(ex, 200, json);
        } catch (Exception e) {
            writeError(ex, 500, e);
        }
    }

    private void handleRepositoryRead(HttpExchange ex) throws IOException {
        try {
            String path = queryParam(ex, "path");
            String maxRowsStr = queryParam(ex, "maxRows");
            int maxRows = maxRowsStr != null ? Integer.parseInt(maxRowsStr) : 1000;
            String csv = RepositoryBridge.readAsCsv(path, maxRows);
            Map<String, String> body = new LinkedHashMap<>();
            body.put("csv", csv);
            writeJson(ex, 200, body);
        } catch (Exception e) {
            writeError(ex, 500, e);
        }
    }

    private void handleRepositoryStore(HttpExchange ex) throws IOException {
        try {
            Map<String, Object> req = MiniJson.parseObject(readBody(ex));
            String path = (String) req.get("path");
            String csv = (String) req.get("csv");
            RepositoryBridge.storeCsv(path, csv);
            Map<String, String> body = new LinkedHashMap<>();
            body.put("status", "ok");
            writeJson(ex, 200, body);
        } catch (Exception e) {
            writeError(ex, 500, e);
        }
    }

    private void handleProcessRun(HttpExchange ex) throws IOException {
        try {
            Map<String, Object> req = MiniJson.parseObject(readBody(ex));
            String xml = (String) req.get("xml");
            @SuppressWarnings("unchecked")
            Map<String, Object> macros = (Map<String, Object>) req.getOrDefault("macros", Map.of());
            ProcessBridge.RunResult result = ProcessBridge.run(xml, macros);

            StringBuilder json = new StringBuilder();
            json.append("{");
            json.append("\"durationMs\":").append(result.durationMs).append(",");
            json.append("\"logs\":[").append(MiniJson.stringArray(result.logs)).append("],");
            json.append("\"results\":[]");
            json.append("}");
            writeRaw(ex, 200, json.toString());
        } catch (Exception e) {
            writeError(ex, 500, e);
        }
    }

    /** EXPERIMENTAL: reads the process XML currently open in the Studio GUI. */
    private void handleProcessCurrent(HttpExchange ex) throws IOException {
        try {
            String xml = GuiBridge.currentProcessXml();
            Map<String, String> body = new LinkedHashMap<>();
            body.put("xml", xml);
            writeJson(ex, 200, body);
        } catch (Exception e) {
            writeError(ex, 500, e);
        }
    }

    /** EXPERIMENTAL: replaces the process currently open in the Studio GUI. */
    private void handleProcessOpen(HttpExchange ex) throws IOException {
        try {
            Map<String, Object> req = MiniJson.parseObject(readBody(ex));
            String xml = (String) req.get("xml");
            GuiBridge.openProcessXml(xml);
            Map<String, String> body = new LinkedHashMap<>();
            body.put("status", "ok");
            writeJson(ex, 200, body);
        } catch (Exception e) {
            writeError(ex, 500, e);
        }
    }

    // ---- small utilities ------------------------------------------------

    private static String queryParam(HttpExchange ex, String name) {
        String query = ex.getRequestURI().getRawQuery();
        if (query == null) return null;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            if (key.equals(name)) {
                return URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static String readBody(HttpExchange ex) throws IOException {
        try (InputStream in = ex.getRequestBody(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8);
        }
    }

    private static void writeJson(HttpExchange ex, int status, Map<String, String> flatBody) throws IOException {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> e : flatBody.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append(MiniJson.quote(e.getKey())).append(":").append(MiniJson.quote(e.getValue()));
        }
        sb.append("}");
        writeRaw(ex, status, sb.toString());
    }

    private static void writeRaw(HttpExchange ex, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static void writeError(HttpExchange ex, int status, Exception e) throws IOException {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
        writeJson(ex, status, body);
    }
}
