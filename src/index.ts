#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDataPrepTools } from "./tools/dataPrepTools.js";
import { registerMlTools } from "./tools/mlTools.js";
import { registerConnectionTools } from "./tools/connectionTools.js";
import { registerAutomationTools } from "./tools/automationTools.js";

const server = new McpServer({
  name: "mcp-altair-studio",
  version: "0.1.0",
});

registerConnectionTools(server);
registerDataPrepTools(server);
registerMlTools(server);
registerAutomationTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-altair-studio: MCP server running on stdio, ready for Claude Desktop.");
}

main().catch((err) => {
  console.error("mcp-altair-studio: fatal error starting server:", err);
  process.exit(1);
});
