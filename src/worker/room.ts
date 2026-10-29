import { DurableObject } from "cloudflare:workers";
import { clientMessage } from "../shared/protocol";
import { newRoom, publicView, reduce, type RoomEvent, type RoomState } from "../shared/room";
import type { Env } from "./env";

const STORAGE_KEY = "room";
const IDLE_MS = 30 * 60 * 1000;

interface Attachment {
  playerId: string | null;
  userId: string | null;
}

// Uniform in [0, n). Using a crypto source keeps the secret letter unpredictable to players.
function randomInt(n: number): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value % n;
}

// One Durable Object per room code. It keeps the reducer's state, persists it after each change
// and broadcasts a snapshot to every socket. Rules live in src/shared/room.ts.
export class Room extends DurableObject<Env> {
  private state: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<RoomState>(STORAGE_KEY)) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket upgrade", { status: 426 });
    }
    const code = request.headers.get("X-Room-Code");
    if (!code) return new Response("missing room code", { status: 400 });
    if (!this.state) this.state = newRoom(code);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: Attachment = { playerId: null, userId: request.headers.get("X-User-Id") };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    server.send(JSON.stringify({ type: "snapshot", room: publicView(this.state), you: null }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment;
    if (typeof message !== "string" || !this.state) {
      return this.sendError(ws, "messages must be JSON text");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return this.sendError(ws, "messages must be JSON");
    }
    const result = clientMessage.safeParse(parsed);
    if (!result.success) return this.sendError(ws, "unrecognised message");
    const msg = result.data;

    let event: RoomEvent;
    if (msg.type === "join") {
      if (attachment.playerId && attachment.playerId !== msg.playerId) {
        return this.sendError(ws, "this connection already joined as someone else");
      }
      attachment.playerId = msg.playerId;
      event = { type: "join", playerId: msg.playerId, userId: attachment.userId, name: msg.name };
    } else if (!attachment.playerId) {
      return this.sendError(ws, "join the room first");
    } else if (msg.type === "guess") {
      event = {
        type: "guess",
        playerId: attachment.playerId,
        letter: msg.letter,
        round: msg.round,
      };
    } else if (msg.type === "leave") {
      event = { type: "leave", playerId: attachment.playerId };
      attachment.playerId = null;
    } else {
      event = { type: msg.type, playerId: attachment.playerId };
    }

    const ok = await this.apply(event, ws);
    if (msg.type === "join" && !ok) attachment.playerId = null;
    ws.serializeAttachment(attachment);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment;
    ws.close(code, "closed");
    // A player who leaves the lobby is removed. Mid-match, they keep their seat so they can reconnect.
    if (attachment.playerId && this.state?.phase === "lobby") {
      await this.apply({ type: "leave", playerId: attachment.playerId });
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "socket error");
  }

  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
      return;
    }
    this.state = null;
    await this.ctx.storage.deleteAll();
  }

  private async apply(event: RoomEvent, origin?: WebSocket): Promise<boolean> {
    if (!this.state) return false;
    const outcome = reduce(this.state, event, randomInt);
    if (!outcome.ok) {
      if (origin) this.sendError(origin, outcome.reason);
      return false;
    }

    const before = this.state.phase;
    this.state = outcome.state;
    await this.ctx.storage.put(STORAGE_KEY, this.state);
    if (this.state.phase === "match_over" && before !== "match_over") {
      await this.saveResults(this.state);
    }
    this.broadcast();
    return true;
  }

  private broadcast(): void {
    if (!this.state) return;
    const room = publicView(this.state);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment;
      socket.send(JSON.stringify({ type: "snapshot", room, you: attachment.playerId }));
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    ws.send(JSON.stringify({ type: "error", message }));
  }

  // Signed-in players get their room results saved. Guests are never recorded.
  private async saveResults(state: RoomState): Promise<void> {
    const now = Date.now();
    const statements = state.players
      .filter((p) => p.userId !== null)
      .map((p) =>
        this.env.DB.prepare(
          "INSERT INTO results (user_id, mode, won, rounds_won, created_at) VALUES (?1, 'room', ?2, ?3, ?4)",
        ).bind(p.userId, p.id === state.matchWinner ? 1 : 0, p.wins, now),
      );
    if (statements.length > 0) await this.env.DB.batch(statements);
  }
}
