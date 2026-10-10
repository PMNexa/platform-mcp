import { useEffect, useRef, useState } from "react";
import { listConnectedApps, listTokens } from "./api";

export type ConnectionWatchState =
  | { status: "idle" }
  | { status: "waiting" }
  /** `via`: the connected app's name, or the token's. */
  | { status: "connected"; via: string }
  | { status: "timeout" };

/** Every grant and token the caller has, by key, with when it was last used. */
interface Snapshot {
  lastUsed: Map<string, string | null>;
  names: Map<string, string>;
}

async function takeSnapshot(accessToken: string): Promise<Snapshot> {
  const [apps, tokens] = await Promise.all([listConnectedApps(accessToken), listTokens(accessToken)]);
  const lastUsed = new Map<string, string | null>();
  const names = new Map<string, string>();
  for (const app of apps) {
    lastUsed.set(`app:${app.id}`, app.last_used_at);
    names.set(`app:${app.id}`, app.client_name);
  }
  for (const token of tokens) {
    lastUsed.set(`token:${token.id}`, token.last_used_at);
    names.set(`token:${token.id}`, token.name);
  }
  return { lastUsed, names };
}

/**
 * What connected since `before`: an app that signed in (a new OAuth
 * grant - approving the consent page creates it), or a grant or token
 * the server saw in use (its `last_used_at` moved). A token that was only
 * created doesn't count - it hasn't reached the server yet.
 */
function connectedSince(before: Snapshot, after: Snapshot): string | null {
  for (const [key, lastUsed] of after.lastUsed) {
    const isNewApp = key.startsWith("app:") && !before.lastUsed.has(key);
    const used = lastUsed !== null && lastUsed !== before.lastUsed.get(key);
    if (isNewApp || used) return after.names.get(key) ?? null;
  }
  return null;
}

/**
 * Watches for the client the user is setting up to reach the server:
 * while `watchKey` is set it polls the caller's connected apps and tokens
 * against a baseline taken when watching started (no clock comparison -
 * the browser's and the server's clocks may differ). Stops when something
 * connects, or after `timeoutMs` (`restart()` resumes). A new `watchKey`
 * starts over with a fresh baseline.
 *
 * `last_used_at` moves at most once a minute per token, so a token that
 * was in use a few seconds before watching started may not register
 * until the next minute.
 */
export function useConnectionWatch(
  accessToken: string,
  watchKey: string | null,
  { intervalMs = 4000, timeoutMs = 15 * 60_000 }: { intervalMs?: number; timeoutMs?: number } = {},
) {
  const [round, setRound] = useState(0);
  // One watch per client and per restart; its outcome is kept by that key,
  // so a new key reads as "waiting" without resetting state in the effect.
  const run = watchKey === null ? null : `${watchKey}#${round}`;
  const [outcome, setOutcome] = useState<{ run: string; state: ConnectionWatchState } | null>(null);
  // The session's token refreshes every few minutes; that mustn't reset the baseline.
  const tokenRef = useRef(accessToken);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (run === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let baseline: Snapshot | null = null;
    const started = Date.now();

    const tick = async () => {
      try {
        const now = await takeSnapshot(tokenRef.current);
        if (cancelled) return;
        if (baseline === null) {
          baseline = now;
        } else {
          const via = connectedSince(baseline, now);
          if (via !== null) {
            setOutcome({ run, state: { status: "connected", via } });
            return;
          }
        }
      } catch {
        // A failed poll (network blip) just waits for the next one.
      }
      if (cancelled) return;
      if (Date.now() - started > timeoutMs) {
        setOutcome({ run, state: { status: "timeout" } });
        return;
      }
      timer = setTimeout(() => void tick(), intervalMs);
    };
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run, intervalMs, timeoutMs]);

  const state: ConnectionWatchState =
    run === null ? { status: "idle" } : outcome?.run === run ? outcome.state : { status: "waiting" };
  return { state, restart: () => setRound((value) => value + 1) };
}
