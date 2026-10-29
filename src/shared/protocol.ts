import { z } from "zod";
import { MAX_NAME } from "./room";

// Messages the browser sends over the room WebSocket. Anything that doesn't match is rejected.
export const clientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    playerId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    name: z.string().min(1).max(MAX_NAME),
  }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("next") }),
  z.object({
    type: z.literal("guess"),
    letter: z.string().max(4),
    round: z.number().int().positive(),
  }),
  z.object({ type: z.literal("leave") }),
]);

export type ClientMessage = z.infer<typeof clientMessage>;

export const createRoomResponse = z.object({ code: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/) });
