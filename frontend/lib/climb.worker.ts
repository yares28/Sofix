/// <reference lib="webworker" />
import { climbWindows, type Climb, type Move } from "./arcadeClimb";
import type { ClimbRequest, ClimbReply } from "./climbClient";

/**
 * Arcade's climb runs here, off the page: the plan, and each move's other outcome when it is asked for. A move is named by an id the
 * page sends back, so its lineups never have to be matched by value.
 */
let climb: Climb | null = null;
let moves = new Map<string, Move>();
let count = 0;
const tag = (list: Move[]) => list.map((move) => { const id = `m${count++}`; moves.set(id, move); return { ...move, id }; });
const tagOne = (move: Move | null) => (move ? tag([move])[0]! : null);

self.onmessage = (event: MessageEvent<ClimbRequest>) => {
  const message = event.data;
  let reply: ClimbReply;
  if (message.kind === "plan") {
    climb = climbWindows(...message.args);
    moves = new Map();
    reply = { id: message.id, kind: "plan", plan: { windows: climb.windows, path: tag(climb.path), odds: climb.odds, verdict: { ...climb.verdict, playNow: tagOne(climb.verdict.playNow), hold: tagOne(climb.verdict.hold) } } };
  } else {
    const move = moves.get(message.move);
    reply = { id: message.id, kind: "after", moves: climb && move ? tag(climb.after(move, message.cleared)) : [] };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);
};
