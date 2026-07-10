package com.mcpaltair.bridge;

/**
 * Extension entry point. Altair AI Studio discovers this class via the
 * "Initialization-Class" manifest attribute (see build.gradle) and invokes
 * {@link #initPlugin()} as a **static** method by reflection (target = null) once
 * all extensions have been registered — this is the same convention every bundled
 * Altair extension uses (confirmed by inspecting a real install's plugin jars: e.g.
 * "com.rapidminer.extension.blending.PluginInitBlending"). Declaring it as an
 * instance method makes Plugin.callInitMethod's Method.invoke(null, ...) throw an
 * NPE before our code ever runs, since it can't resolve a null target's class.
 *
 * All this does is start a localhost-only HTTP server on a background thread; it
 * never touches the GUI or blocks Studio's startup.
 */
public class PluginInitMcpBridge {

    private static BridgeHttpServer server;

    public static void initPlugin() {
        int port = 8266;
        String portEnv = System.getenv("ALTAIR_HTTP_BRIDGE_PORT");
        if (portEnv != null) {
            try {
                port = Integer.parseInt(portEnv.trim());
            } catch (NumberFormatException ignored) {
                // keep default
            }
        }
        try {
            server = new BridgeHttpServer(port);
            server.start();
            System.out.println("[mcp-http-bridge] listening on http://127.0.0.1:" + port);
        } catch (Exception e) {
            System.err.println("[mcp-http-bridge] failed to start HTTP bridge: " + e);
        }
    }
}
