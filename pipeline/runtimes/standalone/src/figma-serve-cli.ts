import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface FigmaServerOptions {
  figmaDir: string;
  port: number;
}

export interface FigmaServer {
  url: string;
  close: () => Promise<void>;
}

export const USAGE = `Usage: pnpm figma:serve [options]

Serves <figma>/plans/*.json to the Figma plugin and accepts save routes:
  POST /save/figma-readback.<pageId>.json            -> <figma>/readback/
  POST /save/delivery/figma-readback.<pageId>.json   -> <figma>/readback/delivery/
  POST /save/figma.<pageId>.png                       -> <figma>/parity/

The delivery route keeps the scratch and delivery readbacks separate; the
plugin picks it when Build mode is "Delivery page".

Options:
  --figma <dir>   Figma artifact directory (default: artifacts/employee-app-phase2/figma)
  --port <n>      Listen port (default: 9600, 0 picks a free port)
  -h, --help      Print this help and exit`;

const PLAN_NAME = /^figma-plan\.[a-z0-9-]+\.json$/i;
const READBACK_NAME = /^figma-readback\.[a-z0-9-]+\.json$/i;
const PNG_NAME = /^figma\.[a-z0-9-]+\.png$/i;
const SAVE_ROUTE = /^\/save\/(?:(delivery)\/)?([^/]+)$/;

function saveTarget(
  name: string,
  delivery: boolean
): { dir: "readback" | "parity"; subdir?: "delivery"; file: string } | undefined {
  if (READBACK_NAME.test(name)) {
    return { dir: "readback", ...(delivery ? { subdir: "delivery" as const } : {}), file: name };
  }
  // The delivery prefix only applies to readbacks; a delivery PNG still lands
  // in parity/ as the current canvas export.
  if (!delivery && PNG_NAME.test(name)) return { dir: "parity", file: name };
  return undefined;
}

function send(response: ServerResponse, status: number, body = ""): void {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function createFigmaServer(options: FigmaServerOptions): Promise<FigmaServer> {
  const root = path.resolve(options.figmaDir);
  const plansDir = path.join(root, "plans");
  await Promise.all([
    mkdir(plansDir, { recursive: true }),
    mkdir(path.join(root, "readback"), { recursive: true }),
    mkdir(path.join(root, "readback", "delivery"), { recursive: true }),
    mkdir(path.join(root, "parity"), { recursive: true }),
  ]);

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    // Filename routing is the security boundary: only a single decoded segment
    // matching one of the exact name patterns may reach the file system.
    const planMatch = /^\/plans\/([^/]+)$/.exec(pathname);
    if (request.method === "GET" && planMatch?.[1] !== undefined) {
      let name: string;
      try {
        name = decodeURIComponent(planMatch[1]);
      } catch {
        send(response, 400, "bad name");
        return;
      }
      if (!PLAN_NAME.test(name)) {
        send(response, 400, "bad name");
        return;
      }
      try {
        const body = await readFile(path.join(plansDir, name));
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
      return;
    }
    const saveMatch = SAVE_ROUTE.exec(pathname);
    if (request.method === "POST" && saveMatch?.[2] !== undefined) {
      let name: string;
      try {
        name = decodeURIComponent(saveMatch[2]);
      } catch {
        send(response, 400, "bad name");
        return;
      }
      const target = saveTarget(name, saveMatch[1] === "delivery");
      if (target === undefined) {
        send(response, 400, "bad name");
        return;
      }
      try {
        const body = await readBody(request);
        const dir =
          target.subdir === undefined
            ? path.join(root, target.dir)
            : path.join(root, target.dir, target.subdir);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, target.file), body);
        send(response, 200, '{"ok":true}');
      } catch {
        send(response, 500, '{"ok":false}');
      }
      return;
    }
    response.writeHead(404);
    response.end("not found");
  };

  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) send(response, 500, '{"ok":false}');
      else response.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("failed to bind figma plan server");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }
  const unknown = argv.find(
    (argument) => argument.startsWith("--") && !["--figma", "--port"].includes(argument)
  );
  if (unknown !== undefined) {
    io.stderr(`unknown argument: ${unknown}`);
    io.stderr(USAGE);
    return 2;
  }
  const figmaDir = path.resolve(
    value("--figma") ?? path.join("artifacts", "employee-app-phase2", "figma")
  );
  const port = Number(value("--port") ?? 9600);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    io.stderr("--port must be an integer from 0 to 65535");
    return 2;
  }
  const server = await createFigmaServer({ figmaDir, port });
  io.stdout(`Figma plan server: ${server.url}`);
  io.stdout(`Plans: ${path.join(figmaDir, "plans")} -> ${server.url}/plans/<file>`);
  io.stdout(`Saving readbacks to: ${path.join(figmaDir, "readback")}`);
  io.stdout(`Saving delivery readbacks to: ${path.join(figmaDir, "readback", "delivery")}`);
  io.stdout(`Saving PNGs to: ${path.join(figmaDir, "parity")}`);
  await new Promise<void>((resolve) => {
    const stop = (): void => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await server.close();
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath === fileURLToPath(import.meta.url);

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 2;
    });
}
