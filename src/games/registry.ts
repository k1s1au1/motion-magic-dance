import type { GameDef } from "@/engine/game";
import { boxing } from "./boxing";
import { dodge } from "./dodge";
import { target } from "./target";
import { reflex } from "./reflex";
import { rhythm } from "./rhythm";
import { goalie } from "./goalie";

export const GAMES: GameDef[] = [boxing, dodge, target, reflex, rhythm, goalie];

export function getGame(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id);
}
