// Writes the README's client section from `src/lib/clients.ts` - the one
// record per client the connect wizard also reads - between the
// `<!-- clients:start -->` and `<!-- clients:end -->` markers.
//
//   npm run readme         rewrite the section
//   npm run readme:check   fail (exit 1) when the README is out of date (CI)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { GUIDE_CHAT_IMAGE, GUIDE_IMAGE_DIR, MCP_CLIENTS, MCP_CLIENT_GROUPS, fillGuideText } from "../src/lib/clients.ts";

const README = new URL("../../README.md", import.meta.url);
const START = "<!-- clients:start -->";
const END = "<!-- clients:end -->";
const connection = { name: "goalnexa", url: "https://your-host/api/v1/mcp", token: "gnx_...", site: "your instance" };

const missingImages = [];

function renderImage(image, alt, owner) {
  const path = `backend/${GUIDE_IMAGE_DIR}/${image}`;
  if (!existsSync(new URL(`../../${path}`, import.meta.url))) missingImages.push(`${owner}: ${path}`);
  return `<img src="${path}" alt="${alt.replaceAll('"', "&quot;")}" width="480">`;
}

function renderClient(client) {
  const fill = (text) => fillGuideText(text, connection);
  const lines = [`### ${client.label}`, ""];
  const how = client.signIn === "oauth" ? "Signs in through the browser - no token." : "Uses a personal access token.";
  lines.push(`${fill(client.summary)} ${how}${client.platforms.length ? ` Works in: ${client.platforms.join(", ")}.` : ""}`, "");
  if (client.requirements) {
    lines.push("Before you start:", "", ...client.requirements.map((item) => `- ${fill(item)}`), "");
  }
  client.steps.forEach((step, index) => {
    const url = step.show === "url" ? ` \`${connection.url}\`` : "";
    lines.push(`${index + 1}. ${fill(step.text)}${url}`);
    if (step.image) lines.push("", `   ${renderImage(step.image, `Screenshot: ${fill(step.text)}`, client.id)}`, "");
    if (step.show === "snippet" && client.snippet) {
      lines.push("", "```" + (client.language === "text" ? "" : (client.language ?? "")), client.snippet(connection), "```", "");
    }
  });
  if (lines.at(-1) !== "") lines.push("");
  for (const note of client.notes ?? []) lines.push(fill(note), "");
  lines.push(`Check: ${fill(client.verify)}`, "");
  if (client.troubleshooting) {
    lines.push("If it doesn't work:", "", ...client.troubleshooting.map((item) => `- ${fill(item)}`), "");
  }
  lines.push(client.checkedOn ? `_Steps last checked ${client.checkedOn}._` : "_These steps haven't been tested end to end yet._", "");
  return lines.join("\n");
}

function renderSection() {
  const parts = [
    START,
    "<!-- Generated from frontend/src/lib/clients.ts by `npm run readme` - edit that file, not this section. -->",
    "",
    "Once connected, ask your assistant what it can do with the server:",
    "",
    renderImage(GUIDE_CHAT_IMAGE, `Example: asking “What can you do with ${connection.name}?” in a chat`, "intro"),
    "",
  ];
  for (const group of MCP_CLIENT_GROUPS) {
    for (const client of MCP_CLIENTS.filter((candidate) => candidate.group === group.id)) parts.push(renderClient(client));
  }
  parts.push(END);
  return parts.join("\n");
}

const section = renderSection();
if (missingImages.length) {
  console.error(`Steps name screenshots that don't exist:\n  ${missingImages.join("\n  ")}`);
  process.exit(1);
}
const readme = readFileSync(README, "utf8");
const start = readme.indexOf(START);
const end = readme.indexOf(END);
if (start === -1 || end === -1) {
  console.error(`README.md has no ${START} ... ${END} section.`);
  process.exit(1);
}
const updated = readme.slice(0, start) + section + readme.slice(end + END.length);

if (process.argv.includes("--check")) {
  if (updated !== readme) {
    console.error("README.md's client section is out of date with src/lib/clients.ts - run `npm run readme` in frontend/.");
    process.exit(1);
  }
  console.log("README.md's client section is up to date.");
} else {
  writeFileSync(README, updated);
  console.log(updated === readme ? "README.md already up to date." : "README.md updated.");
}
