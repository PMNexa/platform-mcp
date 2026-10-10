# Connect guide screenshots

The connect wizard and the README show a screenshot under a step when
that step's record in `frontend/src/lib/clients.ts` names one
(`image: "<client>/<step>.png"`). Files live in
`backend/platform_mcp/static/platform_mcp/connect/`, are served by the
host at `/static/platform_mcp/connect/`, and ship in the backend package.
`npm run readme` refuses a step whose image file is missing.

Screenshots go stale whenever an app redesigns, so only the chat apps get
them - the editors and command-line tools are a snippet and one line,
which text already covers. Each guide shows when its steps were last
checked (`checkedOn`); retake its pictures when you update that date.

## Our own screens: by script

Two pictures come from a running instance, with the demo account
(`scripts/seed_demo.py` in GoalNexa):

- `consent.png` - the "Allow" page every chat app opens.
- `chat.png` - what using it looks like, shown with "Connected" in the
  wizard and at the top of the README's client guides. A neutral chat
  window ("Your AI app", no real app's look) around a real exchange: the
  server's own name and the tools it lists for that account.

```sh
cd frontend
npx playwright install chromium   # once
BASE_URL=http://localhost:55607 EMAIL=alex@northwind.example PASSWORD='...' npm run screens
```

Re-run it after changing the consent page or the tools.

## Other apps' screens: by hand

1. **Use a throwaway or clean account** - nothing personal in the picture.
   Light mode, English, browser window about 1280 px wide, a Retina (2x)
   screen if you have one.
2. **Take one screenshot per step below** (macOS: Cmd+Shift+4, then
   Space to capture a window). Do the real thing - add the server for
   real - so every screen is one a user actually sees.
3. **Annotate**: crop to the part that matters, outline the ONE thing to
   click, blur names, emails and chat history:

   ```sh
   python scripts/annotate_shot.py raw.png \
     backend/platform_mcp/static/platform_mcp/connect/gemini-web/1.png \
     --crop x,y,w,h --box x,y,w,h --blur x,y,w,h
   ```

   (Or hand the raw files to Claude Code and ask it to annotate them -
   it can read the pictures and pick the coordinates.)

   Claude Code can also take them: it starts Chrome with a throwaway
   profile and `--remote-debugging-port`, you sign in to the app in that
   window, and it drives the pages over CDP (Playwright's
   `connectOverCDP`), then closes Chrome and deletes the profile. Where a
   screen would refuse a duplicate (Claude and Gemini won't add a URL
   twice), it
   used the same URL plus `?ref=guide` to reach the next screen,
   reset the shown URL in the page before capturing, and cancelled.
4. **Wire them in**: add `image: "<client>/<n>.png"` to the step in
   `clients.ts`, set the client's `checkedOn` to today, run `npm run
   readme` in `frontend/`.

## Shot list

`n` = the step number in the guide. Steps that open our consent page
already show `consent.png`.

| App | File | Step | What the picture shows (outline in bold) |
|---|---|---|---|
| Claude | `claude-connector/1.png` | 1 | Customize → Connectors, **Add** → **Add custom connector** (taken 2026-10-10) |
| Claude | `claude-connector/2.png` | 2 | The add dialog with the name and URL filled in, **Continue** (taken 2026-10-10) |
| Claude | `claude-connector/3.png` | 3 | The sign-in settings: **Sign in now** / **Register automatically** (taken 2026-10-10) |
| Claude | `claude-connector/5.png` | 5 | A chat's + → **Connectors** with **the connector's switch** (taken 2026-10-10) |
| ChatGPT | `chatgpt/1.png` | 1 | Plugins, **Add** → **Add custom MCP server** (taken 2026-10-10) |
| ChatGPT | `chatgpt/2.png` | 2 | The form with the **name** and **server URL** filled in (taken 2026-10-10) |
| ChatGPT | `chatgpt/3.png` | 3 | **OAuth**, the **I understand** box, **Create as a plugin** (taken 2026-10-10) |
| ChatGPT | `chatgpt/5.png` | 5 | A chat's **+** menu with **the app** (taken 2026-10-10) |
| Gemini | `gemini-web/1.png` | 1 | Personal Intelligence, **Connected Apps** (taken 2026-10-10) |
| Gemini | `gemini-web/2.png` | 2 | “Connect to an MCP server” with **the URL** pasted, **Next** (taken 2026-10-10) |
| Gemini | `gemini-web/4.png` | 4 | A chat with **@goal** typed and **the app** offered (taken 2026-10-10) |
