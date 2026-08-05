"use client";

/**
 * Discord Rich Presence — official Discord RPC protocol.
 *
 * This module connects to Discord's local RPC server (exposed by the Discord
 * desktop app on ports 6463–6472) to set the user's Discord activity. It
 * is a BEST-EFFORT feature:
 *
 *   - Requires Discord desktop to be running
 *   - Requires the user to have authorized this RPC client in Discord settings
 *   - Requires the site origin to be registered in Discord Developer Portal
 *
 * If any of these aren't met, the module silently fails and the rest of the
 * app keeps working. This is consistent with Discord's own guidance:
 * https://discord.com/developers/docs/topics/rpc
 *
 * We do NOT use any unofficial libraries. The implementation speaks the
 * official RPC protocol directly via fetch + WebSocket.
 */

const RPC_PORTS = [6463, 6464, 6465, 6466, 6467, 6468, 6469, 6470, 6471, 6472];
const RPC_VERSION = 1;

type RpcCommand = "DISPATCH" | "AUTHORIZE" | "SET_ACTIVITY" | "SUBSCRIBE" | "UNSUBSCRIBE";

interface RpcFrame {
  cmd: RpcCommand;
  nonce?: string;
  evt?: string | null;
  args?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface ActivityAssets {
  largeImage?: string;
  largeText?: string;
  smallImage?: string;
  smallText?: string;
}

export interface SetActivityParams {
  details?: string;
  state?: string;
  assets?: ActivityAssets;
  timestamps?: { start?: number; end?: number };
  buttons?: Array<{ label: string; url: string }>;
}

export type RpcStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "authorizing"
  | "ready"
  | "unavailable"
  | "error";

export interface DiscordRpcClient {
  status: RpcStatus;
  setActivity(params: SetActivityParams): Promise<boolean>;
  clearActivity(): Promise<boolean>;
  close(): void;
}

/**
 * Build the origin string for the current page (Discord uses this for
 * validation during the RPC handshake).
 */
function getOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/**
 * Attempt to connect to Discord's local RPC server. Returns a client that
 * can be used to set activity, or null if Discord desktop isn't reachable.
 */
export async function connectDiscordRpc(clientId: string): Promise<DiscordRpcClient | null> {
  if (typeof window === "undefined") return null;

  const origin = getOrigin();

  // Try each RPC port until one responds.
  let rpcPort: number | null = null;
  for (const port of RPC_PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/?v=${RPC_VERSION}&client_id=${clientId}`, {
        method: "GET",
      });
      if (res.ok) {
        rpcPort = port;
        break;
      }
    } catch {
      // Port not responding — try next.
    }
  }

  if (rpcPort === null) {
    return makeNoopClient("unavailable");
  }

  // Connect via WebSocket to the RPC endpoint.
  const wsUrl = `ws://127.0.0.1:${rpcPort}/?v=${RPC_VERSION}&client_id=${clientId}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl);
  } catch {
    return makeNoopClient("error");
  }

  const pending = new Map<string, (frame: RpcFrame) => void>();
  // Use a ref object so TS can't narrow the string through control-flow.
  const stateRef: { value: RpcStatus } = { value: "connecting" };

  const client: DiscordRpcClient = {
    get status() { return stateRef.value; },

    async setActivity(params) {
      if (status !== "ready") return false;
      const frame = await send({
        cmd: "SET_ACTIVITY",
        args: {
          pid: 0,
          activity: {
            details: params.details,
            state: params.state,
            assets: params.assets ? {
              large_image: params.assets.largeImage,
              large_text: params.assets.largeText,
              small_image: params.assets.smallImage,
              small_text: params.assets.smallText,
            } : undefined,
            timestamps: params.timestamps,
            buttons: params.buttons,
          },
        },
      });
      return !!frame;
    },

    async clearActivity() {
      if (status !== "ready") return false;
      const frame = await send({ cmd: "SET_ACTIVITY", args: { pid: 0, activity: null } });
      return !!frame;
    },

    close() {
      try { ws.close(); } catch { /* noop */ }
      stateRef.value = "idle";
    },
  };

  function send(frame: Partial<RpcFrame>): Promise<RpcFrame | null> {
    return new Promise((resolve) => {
      if (ws.readyState !== WebSocket.OPEN) {
        resolve(null);
        return;
      }
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const full: RpcFrame = { ...frame, nonce } as RpcFrame;
      pending.set(nonce, resolve);
      try {
        ws.send(JSON.stringify(full));
      } catch {
        pending.delete(nonce);
        resolve(null);
      }
      // 5-second timeout to avoid leaked promises.
      setTimeout(() => {
        if (pending.has(nonce)) {
          pending.delete(nonce);
          resolve(null);
        }
      }, 5000);
    });
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* noop */ }
      stateRef.value = "error";
      resolve();
    }, 3000);

    ws.onopen = () => {
      clearTimeout(timeout);
      // Send HANDSHAKE frame (the RPC protocol requires this before anything else).
      try {
        ws.send(JSON.stringify({
          v: RPC_VERSION,
          client_id: clientId,
        }));
      } catch { /* noop */ }
    };

    ws.onmessage = (ev) => {
      let frame: RpcFrame;
      try { frame = JSON.parse(String(ev.data)); } catch { return; }

      if (frame.nonce && pending.has(frame.nonce)) {
        const cb = pending.get(frame.nonce)!;
        pending.delete(frame.nonce);
        cb(frame);
        return;
      }

      // DISPATCH events — handle READY and authorization prompts.
      if (frame.cmd === "DISPATCH" && frame.evt === "READY") {
        stateRef.value = "authorizing";
        // Request authorization — Discord will prompt the user to approve.
        send({
          cmd: "AUTHORIZE",
          args: {
            client_id: clientId,
            scopes: ["rpc.activities.write"],
            rpc_token: "",
          },
        }).then((authFrame) => {
          stateRef.value = authFrame ? "ready" : "error";
          resolve();
        });
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      stateRef.value = "error";
      resolve();
    };

    ws.onclose = () => {
      stateRef.value = "idle";
    };
  });

  if (stateRef.value !== "ready") {
    return makeNoopClient(stateRef.value);
  }

  // Subscribe to ACTIVITY_JOIN / ACTIVITY_SPECTATE so Discord knows we're listening.
  send({ cmd: "SUBSCRIBE", evt: "ACTIVITY_JOIN" } as Partial<RpcFrame>);

  return client;
}

function makeNoopClient(status: RpcStatus): DiscordRpcClient {
  return {
    status,
    async setActivity() { return false; },
    async clearActivity() { return false; },
    close() { /* noop */ },
  };
}

/**
 * Convenience: build the canonical you2ube activity payload for "watching".
 */
export function buildWatchingActivity(params: {
  videoTitle: string;
  videoId: number;
  startedAt: number;
  appUrl?: string;
}): SetActivityParams {
  return {
    details: "Watching a video",
    state: params.videoTitle.slice(0, 128),
    timestamps: { start: params.startedAt },
    assets: {
      largeImage: "you2ube_logo",
      largeText: "you2ube",
      smallImage: "playing",
      smallText: "Watching",
    },
    buttons: params.appUrl
      ? [{ label: "Watch on you2ube", url: `${params.appUrl}/?v=${params.videoId}` }]
      : undefined,
  };
}

/**
 * Convenience: build the canonical you2ube activity payload for "hosting".
 */
export function buildHostingActivity(params: {
  partyTitle: string;
  attendeeCount: number;
  startedAt: number;
  appUrl?: string;
}): SetActivityParams {
  return {
    details: "Hosting a watch party",
    state: params.partyTitle.slice(0, 128),
    timestamps: { start: params.startedAt },
    assets: {
      largeImage: "you2ube_logo",
      largeText: "you2ube",
      smallImage: "party",
      smallText: `${params.attendeeCount} watching`,
    },
    buttons: params.appUrl
      ? [{ label: "Join the party", url: params.appUrl }]
      : undefined,
  };
}
