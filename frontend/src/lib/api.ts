import axios from "axios";
import type { AxiosRequestConfig } from "axios";

/**
 * No token store of its own - the host passes the session's access
 * token in (same as goalnexa-frontend). The paths are where a host
 * mounts `platform_mcp.urls` (`api/v1/`), like every other module's
 * frontend package hardcodes its own API paths.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";
export const MCP_PATH = "/api/v1/mcp";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function apiRequest<T>(path: string, accessToken: string, config?: AxiosRequestConfig): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const response = await axios.request<T>({
      url,
      ...config,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...config?.headers },
    });
    return (response.status === 204 ? undefined : response.data) as T;
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error;
    if (!error.response) throw new ApiError(error.message || "Network request failed", 0);
    const { status, data: body } = error.response;
    const fieldErrors = (body as { field_errors?: Record<string, string[]> } | null)?.field_errors;
    const message = fieldErrors
      ? Object.entries(fieldErrors)
          .map(([field, errors]) => `${field}: ${errors.join(" ")}`)
          .join("; ")
      : typeof (body as { message?: unknown } | null)?.message === "string"
        ? (body as { message: string }).message
        : `Request to ${url} failed with status ${status}`;
    throw new ApiError(message, status, body);
  }
}

export interface AccessToken {
  id: string;
  name: string;
  /** The token's first characters, to tell tokens apart. */
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

/** The create response - the only time `token` itself is ever sent. */
export interface CreatedAccessToken extends AccessToken {
  token: string;
}

export async function listTokens(accessToken: string): Promise<AccessToken[]> {
  const body = await apiRequest<{ items: AccessToken[] }>(`${MCP_PATH}/tokens`, accessToken);
  return body.items;
}

export function createToken(
  accessToken: string,
  input: { name: string; expires_in_days: number | null },
): Promise<CreatedAccessToken> {
  return apiRequest<CreatedAccessToken>(`${MCP_PATH}/tokens`, accessToken, { method: "POST", data: input });
}

export function revokeToken(accessToken: string, id: string): Promise<void> {
  return apiRequest<void>(`${MCP_PATH}/tokens/${id}`, accessToken, { method: "DELETE" });
}

export interface ServerInfo {
  name: string;
  toolCount: number;
}

/** Asks the MCP server itself (as the logged-in user) for its name and tool count. */
export async function fetchServerInfo(accessToken: string): Promise<ServerInfo> {
  const rpc = <T,>(id: number, method: string, params: object = {}) =>
    apiRequest<{ result: T }>(MCP_PATH, accessToken, { method: "POST", data: { jsonrpc: "2.0", id, method, params } });
  const [init, tools] = await Promise.all([
    rpc<{ serverInfo: { name: string } }>(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "platform-mcp-frontend", version: "0" } }),
    rpc<{ tools: unknown[] }>(2, "tools/list"),
  ]);
  return { name: init.result.serverInfo.name, toolCount: tools.result.tools.length };
}

/** What the consent page shows - who is asking, and where "Allow" sends the user back to. */
export interface AuthorizationRequest {
  client_name: string;
  redirect_uri: string;
  server_name: string;
}

/**
 * An authorization request the server refused. `redirect_to` is set when
 * the error should go back to the app (the OAuth way); when it's null the
 * app itself is unknown or asked for an unregistered address, so the user
 * stays here.
 */
export class AuthorizationError extends Error {
  redirectTo: string | null;

  constructor(message: string, redirectTo: string | null) {
    super(message);
    this.name = "AuthorizationError";
    this.redirectTo = redirectTo;
  }
}

function asAuthorizationError(thrown: unknown): unknown {
  if (thrown instanceof ApiError && thrown.status === 400) {
    const redirectTo = (thrown.body as { redirect_to?: string | null } | null)?.redirect_to ?? null;
    return new AuthorizationError(thrown.message, redirectTo);
  }
  return thrown;
}

/** The OAuth authorization request, as the page's query string carried it. */
export function authorizationParams(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

export async function checkAuthorization(accessToken: string, search: string): Promise<AuthorizationRequest> {
  try {
    return await apiRequest<AuthorizationRequest>(`${MCP_PATH}/oauth/authorize`, accessToken, {
      params: authorizationParams(search),
    });
  } catch (thrown) {
    throw asAuthorizationError(thrown);
  }
}

/** Allow or deny - returns where to send the browser next (back to the app). */
export async function decideAuthorization(accessToken: string, search: string, approve: boolean): Promise<string> {
  try {
    const body = await apiRequest<{ redirect_to: string }>(`${MCP_PATH}/oauth/authorize`, accessToken, {
      method: "POST",
      data: { ...authorizationParams(search), approve },
    });
    return body.redirect_to;
  } catch (thrown) {
    throw asAuthorizationError(thrown);
  }
}

/** An app connected through OAuth (e.g. a Claude connector). */
export interface ConnectedApp {
  id: string;
  client_name: string;
  created_at: string;
  last_used_at: string | null;
}

export async function listConnectedApps(accessToken: string): Promise<ConnectedApp[]> {
  const body = await apiRequest<{ items: ConnectedApp[] }>(`${MCP_PATH}/oauth/grants`, accessToken);
  return body.items;
}

export function disconnectApp(accessToken: string, id: string): Promise<void> {
  return apiRequest<void>(`${MCP_PATH}/oauth/grants/${id}`, accessToken, { method: "DELETE" });
}
