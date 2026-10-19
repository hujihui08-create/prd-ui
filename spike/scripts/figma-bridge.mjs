import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const wsPath =
  "/Users/jihui/brio-mcp/node_modules/.pnpm/ws@8.20.0/node_modules/ws/index.js";
const { WebSocketServer } = require(wsPath);

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = join(here, "..");
const artifacts = join(spikeRoot, "artifacts", "figma");
const logFile = join(artifacts, "figma-bridge.log");

const log = (...args) => {
  const line = `${new Date().toISOString()} ${args
    .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
    .join(" ")}`;
  console.log(line);
  writeFileSync(logFile, `${line}\n`, { flag: "a" });
};

writeFileSync(logFile, "");
log("bridge listening on 127.0.0.1:9500");

let plugin = null;
let started = false;
let nextId = 0;
const pending = new Map();

const wss = new WebSocketServer({ port: 9500 });

wss.on("connection", (ws) => {
  plugin = ws;
  log("plugin connected");

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      log("unparseable message");
      return;
    }

    if (msg.type === "FILE_INFO") {
      log("FILE_INFO", msg.fileName, msg.fileKey);
      if (!started) {
        started = true;
        run(ws).catch((error) => log("RUN ERROR", error.message));
      }
      return;
    }

    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      clearTimeout(entry.timer);
      pending.delete(msg.id);
      if (msg.error) {
        entry.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        entry.resolve(msg);
      }
      return;
    }

    log("message", JSON.stringify(msg).slice(0, 300));
  });

  ws.on("close", () => {
    log("plugin disconnected");
    if (plugin === ws) plugin = null;
  });
});

function execute(ws, code, timeout = 120000) {
  const id = `req_${++nextId}_${Date.now()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout after ${timeout}ms for ${id}`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method: "EXECUTE_CODE", params: { code } }));
  });
}

async function run(ws) {
  const cleanupCode = `
    const stalePages = figma.root.children.filter(
      (p) =>
        p.type === "PAGE" && (p.name === "Spike B" || p.name === "Spike C"),
    );
    for (const page of stalePages) page.remove();

    const staleCollections = figma.variables
      .getLocalVariableCollections()
      .filter((c) => c.name.endsWith(" Tokens"));
    for (const collection of staleCollections) collection.remove();

    const styleNames = ["heading.1", "heading.2", "heading.3", "body.md", "label.sm"];
    for (const style of figma.getLocalTextStyles()) {
      if (styleNames.includes(style.name)) style.remove();
    }

    for (const page of figma.root.children) {
      if (page.type !== "PAGE") continue;
      for (const set of page.findAll(
        (n) => n.type === "COMPONENT_SET" && n.name === "Button",
      )) {
        set.remove();
      }
    }

    return "cleaned";
  `;
  log("cleaning previous spike output...");
  const cleaned = await execute(ws, cleanupCode);
  log("cleanup result", String(cleaned.result));

  let code = readFileSync(
    join(spikeRoot, "figma-plugin", "dist", "code.js"),
    "utf8",
  );

  code = code.replace(
    'figma.closePlugin("Spike pages built")',
    'console.log("Spike pages built")',
  );
  code = code.replace(
    "figma.closePlugin(`Spike failed: ${error.message}`)",
    "console.error(`Spike failed: ${error.message}`)",
  );
  code = code.replace(
    "main().catch(",
    "globalThis.__spikeDone = main().catch(",
  );

  code += `
await globalThis.__spikeDone;
return "spike built";
`;

  log("executing spike plugin build...");
  const build = await execute(ws, code);
  log("build result", String(build.result));
  if (build.logs && build.logs.length) {
    log("build logs", JSON.stringify(build.logs).slice(0, 2000));
  }

  const inspectCode = `
    const pages = figma.root.children
      .filter((p) => p.type === "PAGE")
      .map((p) => {
        const root = p.children.find((n) => n.type === "FRAME");
        return {
          name: p.name,
          id: p.id,
          root: root
            ? {
                name: root.name,
                id: root.id,
                width: root.width,
                height: root.height,
                layoutMode: root.layoutMode,
                primaryAxisSizingMode: root.primaryAxisSizingMode,
                counterAxisSizingMode: root.counterAxisSizingMode,
                children: root.children.map((c) => ({
                  name: c.name,
                  type: c.type,
                  width: "width" in c ? c.width : null,
                  height: "height" in c ? c.height : null,
                  layoutMode: "layoutMode" in c ? c.layoutMode : null,
                  primaryAxisSizingMode:
                    "primaryAxisSizingMode" in c ? c.primaryAxisSizingMode : null,
                  counterAxisSizingMode:
                    "counterAxisSizingMode" in c ? c.counterAxisSizingMode : null,
                  layoutAlign: "layoutAlign" in c ? c.layoutAlign : null,
                  layoutGrow: "layoutGrow" in c ? c.layoutGrow : null,
                })),
              }
            : null,
        };
      });

    const allNodes = figma.root.children
      .filter((p) => p.type === "PAGE")
      .flatMap((p) => p.findAll(() => true));

    return {
      fileName: figma.root.name,
      pages,
      textStyles: figma.getLocalTextStyles().map((s) => ({
        name: s.name,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
      })),
      collections: figma.variables.getLocalVariableCollections().map((c) => ({
        name: c.name,
        variables: c.variableIds.length,
      })),
      componentSets: allNodes
        .filter((n) => n.type === "COMPONENT_SET")
        .map((n) => ({
          name: n.name,
          variants: n.children.length,
          x: n.x,
          y: n.y,
        })),
      instances: allNodes
        .filter((n) => n.type === "INSTANCE")
        .map((n) => ({
          name: n.name,
          mainComponent: n.mainComponent ? n.mainComponent.name : null,
        })),
      textNodeCount: allNodes.filter((n) => n.type === "TEXT").length,
      imageFillCount: allNodes.filter(
        (n) =>
          "fills" in n &&
          Array.isArray(n.fills) &&
          n.fills.some((f) => f.type === "IMAGE"),
      ).length,
      vectorIconNames: allNodes
        .filter((n) => n.type === "FRAME" && n.name === "bookmark")
        .map((n) => n.name),
    };
  `;

  log("inspecting document...");
  const inspect = await execute(ws, inspectCode);
  writeFileSync(
    join(artifacts, "figma-runtime.json"),
    JSON.stringify(inspect.result, null, 2),
  );
  log("inspection written");

  for (const [pageName, fileName] of [
    ["Spike B", "spike-b.png"],
    ["Spike C", "spike-c.png"],
  ]) {
    const shotCode = `
      const page = figma.root.children.find((p) => p.name === "${pageName}");
      if (!page) return { error: "page not found: ${pageName}" };
      const frame = page.children.find((n) => n.type === "FRAME");
      if (!frame) return { error: "frame not found on ${pageName}" };
      const bytes = await frame.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 1 },
      });
      return {
        name: frame.name,
        width: frame.width,
        height: frame.height,
        bytes: Array.from(bytes),
      };
    `;

    log(`exporting ${pageName}...`);
    const shot = await execute(ws, shotCode, 180000);
    if (shot.result && shot.result.bytes) {
      const buffer = Buffer.from(shot.result.bytes);
      writeFileSync(join(artifacts, fileName), buffer);
      log(`wrote ${fileName}`, buffer.length);
    } else {
      log("screenshot failed", pageName, JSON.stringify(shot.result));
    }
  }

  log("DONE");
}
