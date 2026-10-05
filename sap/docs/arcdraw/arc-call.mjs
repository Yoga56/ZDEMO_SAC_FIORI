import { Client } from "/tmp/arc-draw/packages/drawio-mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "/tmp/arc-draw/packages/drawio-mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
export async function connect() { const c = new Client({ name: "deck", version: "1" }, { capabilities: {} }); await c.connect(new StreamableHTTPClientTransport(new URL("http://localhost:3100/mcp"))); return c; }
export async function call(c, name, args) { const r = await c.callTool({ name, arguments: args || {} }); const t = (r.content||[]).map(x => x.text || "").join(""); try { return JSON.parse(t); } catch { return t; } }
