import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFigmaServer } from "../src/figma-serve-cli.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "figma-serve-"));
  dirs.push(dir);
  return dir;
}

describe("figma:serve", () => {
  it("serves plans and routes readback/json and png saves", async () => {
    const figma = await temp();
    await mkdir(path.join(figma, "plans"), { recursive: true });
    await writeFile(path.join(figma, "plans", "figma-plan.today.json"), '{"ok":true}', "utf8");
    const server = await createFigmaServer({ figmaDir: figma, port: 0 });
    try {
      const plan = await fetch(`${server.url}/plans/figma-plan.today.json`);
      expect(plan.status).toBe(200);
      expect(await plan.text()).toBe('{"ok":true}');

      const png = await fetch(`${server.url}/save/figma.today.png`, {
        method: "POST",
        body: new Uint8Array([137, 80, 78, 71]),
      });
      expect(png.status).toBe(200);
      expect((await readFile(path.join(figma, "parity", "figma.today.png"))).length).toBe(4);

      const readback = await fetch(`${server.url}/save/figma-readback.today.json`, {
        method: "POST",
        body: '{"pageId":"today"}',
      });
      expect(readback.status).toBe(200);
      expect(await readFile(path.join(figma, "readback", "figma-readback.today.json"), "utf8")).toContain("today");

      const delivery = await fetch(
        `${server.url}/save/delivery/figma-readback.today.json`,
        {
          method: "POST",
          body: '{"pageId":"today","delivery":true}',
        }
      );
      expect(delivery.status).toBe(200);
      expect(
        await readFile(
          path.join(figma, "readback", "delivery", "figma-readback.today.json"),
          "utf8"
        )
      ).toContain('"delivery":true');
      // The scratch readback is not overwritten by a delivery build.
      expect(
        await readFile(path.join(figma, "readback", "figma-readback.today.json"), "utf8")
      ).not.toContain("delivery");
    } finally {
      await server.close();
    }
  });

  it("rejects path traversal", async () => {
    const figma = await temp();
    const server = await createFigmaServer({ figmaDir: figma, port: 0 });
    try {
      const response = await fetch(`${server.url}/save/../evil.png`, { method: "POST", body: "x" });
      expect(response.status).toBeGreaterThanOrEqual(400);
    } finally {
      await server.close();
    }
  });

  it("rejects save names outside the two exact patterns", async () => {
    const figma = await temp();
    const server = await createFigmaServer({ figmaDir: figma, port: 0 });
    try {
      for (const name of ["figma.today.svg", "readback.today.json", "figma.today.png.js", "%2e%2e%2fevil.png"]) {
        const response = await fetch(`${server.url}/save/${name}`, { method: "POST", body: "x" });
        expect(response.status, name).toBe(400);
      }
    } finally {
      await server.close();
    }
  });

  it("answers OPTIONS for the plugin iframe and 404s unknown routes", async () => {
    const figma = await temp();
    const server = await createFigmaServer({ figmaDir: figma, port: 0 });
    try {
      const preflight = await fetch(`${server.url}/save/figma.today.png`, { method: "OPTIONS" });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

      const missingPlan = await fetch(`${server.url}/plans/figma-plan.unknown.json`);
      expect(missingPlan.status).toBe(404);

      const unknown = await fetch(`${server.url}/nope`);
      expect(unknown.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
