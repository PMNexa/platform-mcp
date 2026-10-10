// Captures the connect guide's screenshots of OUR OWN screens from a
// running instance, so they never go stale: re-run after changing them.
//   consent.png  the "Allow" page every chat app opens
//   chat.png     what using it looks like: a neutral chat window ("Your AI
//                app", no real app's look) around a real exchange - the
//                server's own name and tools, read from the instance
// Other apps' screens (Claude, ChatGPT, Gemini) are taken by hand - see
// docs/connect-screenshots.md.
//
//   BASE_URL=http://localhost:55607 EMAIL=... PASSWORD=... npm run screens
//
// Use the demo account (GoalNexa's scripts/seed_demo.py), never a real one:
// its name shows in the header. Needs Chromium once: `npx playwright install chromium`.
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright";

const base = (process.env.BASE_URL ?? "http://localhost:55607").replace(/\/+$/, "");
const { EMAIL: email, PASSWORD: password } = process.env;
if (!email || !password) {
  console.error("Set EMAIL and PASSWORD (the demo account's).");
  process.exit(1);
}
const outDir = new URL("../../backend/platform_mcp/static/platform_mcp/connect/", import.meta.url);

async function api(path, body) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

// The consent page needs a real authorization request: register a client
// the way an AI app does (RFC 7591), with a neutral name - the picture is
// shared by every app's guide.
const redirectUri = "https://your-ai-app.example/callback";
const client = await api("/mcp/oauth/register", { client_name: "Your AI app", redirect_uris: [redirectUri] });
const challenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");
const authorize = new URL(`${base}/mcp/authorize`);
for (const [key, value] of Object.entries({
  response_type: "code",
  client_id: client.client_id,
  redirect_uri: redirectUri,
  code_challenge: challenge,
  code_challenge_method: "S256",
  state: "screenshot",
})) {
  authorize.searchParams.set(key, value);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 640 }, deviceScaleFactor: 2, colorScheme: "light" });
await page.goto(`${base}/auth/login?next=${encodeURIComponent(authorize.pathname + authorize.search)}`);
await page.fill("input[type=email]", email);
await page.fill("input[type=password]", password);
await page.keyboard.press("Enter");
const allow = page.getByRole("button", { name: "Allow", exact: true });
await allow.waitFor({ timeout: 20000 });
// The same highlight the hand-taken screenshots get (scripts/annotate_shot.py).
await allow.evaluate((button) => {
  button.style.outline = "4px solid #d63939";
  button.style.outlineOffset = "4px";
});
const card = page.locator(".card").first();
const box = await card.boundingBox();
const margin = 24;
await page.screenshot({
  path: new URL("consent.png", outDir).pathname,
  clip: { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 },
});
console.log("Wrote consent.png");

// chat.png: ask the server what a connected app sees, as the demo account.
const { access_token: accessToken } = await api("/auth/login", { email, password });
async function mcp(id, method, params) {
  const response = await fetch(`${base}/api/v1/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!response.ok) throw new Error(`mcp ${method}: HTTP ${response.status}`);
  return (await response.json()).result;
}
const { serverInfo } = await mcp(1, "initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "capture-screens", version: "1" },
});
const { tools } = await mcp(2, "tools/list", {});
const names = tools.map((tool) => tool.name);
const resources = names.filter((name) => name.endsWith("_schema")).map((name) => name.slice(0, -"_schema".length));
const crud = new RegExp(`^(${resources.join("|")})_(schema|list|get|create|update|delete|link|unlink)$`);
const extras = names.filter((name) => !crud.test(name));
const words = (name) => name.replaceAll("_", " ");
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items.join(""));
const escape = (text) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
const prompt = `What can you do with ${serverInfo.name}?`; // the wizard's default first prompt

await page.setViewportSize({ width: 760, height: 600 });
await page.setContent(`<!doctype html><html><head><style>
  body { margin: 0; padding: 24px; background: #f1f3f6; font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2933; }
  .window { width: 712px; background: #fff; border: 1px solid #dfe3e8; border-radius: 14px; box-shadow: 0 6px 24px rgba(15, 23, 42, .08); overflow: hidden; }
  .bar { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid #eef0f3; font-weight: 600; }
  .logo { width: 24px; height: 24px; border-radius: 7px; background: #c9ced6; }
  .chat { padding: 20px 22px 8px; }
  .user { margin-left: auto; width: fit-content; max-width: 75%; background: #eef1f5; border-radius: 16px; padding: 9px 15px; margin-bottom: 18px; }
  .tool { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #52606d; border: 1px solid #dfe3e8; border-radius: 999px; padding: 3px 11px; margin-bottom: 10px; }
  .tool b { color: #1f2933; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 10px; padding-left: 20px; }
  .input { margin: 8px 18px 18px; border: 1px solid #dfe3e8; border-radius: 12px; padding: 11px 15px; color: #9aa5b1; }
</style></head><body><div class="window">
  <div class="bar"><span class="logo"></span>Your AI app</div>
  <div class="chat">
    <div class="user">${escape(prompt)}</div>
    <div class="tool">⚙ <b>${escape(serverInfo.name)}</b> connected · ${tools.length} tools</div>
    <p>With <b>${escape(serverInfo.name)}</b> I can work with your:</p>
    <ul><li>${escape(list(resources.map(words)))}</li></ul>
    <p>I can list them, look one up, create, update and delete them - as you, with your permissions${
      extras.length ? `. There's also ${escape(list(extras.map(words)))}` : ""
    }.</p>
    <p>What would you like to start with?</p>
  </div>
  <div class="input">Reply…</div>
</div></body></html>`);
await page.locator(".window").screenshot({ path: new URL("chat.png", outDir).pathname });
console.log("Wrote chat.png");
await browser.close();
