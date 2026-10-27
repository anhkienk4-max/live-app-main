import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function matcher() {
  const source = read("proxy.ts");
  const match = source.match(/matcher:\s*\[\s*'([^']+)'/);
  assert.ok(match, "proxy.ts must declare a matcher");
  const decoded = match[1].replaceAll("\\\\", "\\");
  return new RegExp("^" + decoded + "$");
}

test("PWA images and manifest are publicly readable", () => {
  const matches = matcher();
  for (const path of [
    "/manifest.webmanifest", "/icon", "/icon1", "/icon2", "/icon3",
    "/apple-icon", "/favicon.ico", "/api/health", "/_next/static/chunk.js",
  ]) {
    assert.equal(matches.test(path), false, path + " should bypass auth proxy");
  }
});

test("business pages still pass through authentication", () => {
  const matches = matcher();
  for (const path of [
    "/", "/login", "/calendar", "/shifts", "/reports", "/payroll",
    "/storage", "/workforce", "/settings",
  ]) {
    assert.equal(matches.test(path), true, path + " must not bypass auth");
  }
});

test("manifest points at real Next.js route handlers", () => {
  const m = read("app/manifest.ts");
  assert.match(m, /start_url:\s*["']\/["']/);
  assert.match(m, /scope:\s*["']\/["']/);
  assert.match(m, /display:\s*["']standalone["']/);
  for (const [name, px, maskable] of [["icon1", 192, false], ["icon2", 512, false], ["icon3", 512, true]]) {
    assert.ok(m.includes('"/' + name + '"'), "missing manifest reference " + name);
    const source = read("app/" + name + "/route.ts");
    assert.ok(source.includes("export function GET()"), "missing GET route for " + name);
    assert.ok(source.includes("createAdaOpsIconResponse(" + px + (maskable ? ", true" : "") + ")"), "wrong image dimensions " + name);
  }
  assert.ok(read("app/icon.tsx").includes("export default function Icon()"));
  assert.ok(read("app/apple-icon.tsx").includes("export default function Icon()"));
});

test("PWA uses the current site, not another backend or offline cache", () => {
  const m = read("app/manifest.ts");
  assert.ok(!m.includes("https://"), "manifest must use same-origin URLs");
  assert.ok(!read("app/layout.tsx").includes("serviceWorker"));
});

test('iPhone reference splash remains public and belongs to supported startup dimensions', () => {
  const proxy = read("proxy.ts")
  assert.ok(proxy.includes('pwa-splash(?:/|$)'))
  const route = read("app/pwa-splash/route.tsx")
  assert.ok(route.includes('new ImageResponse('))
  assert.ok(route.includes('width: 1170, height: 2532'))
  const layout = read("app/layout.tsx")
  assert.ok(layout.includes('startupImage:'))
  assert.ok(layout.includes('url: "/pwa-splash"'))
})
