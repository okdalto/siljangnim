// "Try next" cards: techniques that fit the scene on screen (moves/moves.ts). Picking one hands it to the agent.
import { suggestMoves, type Move } from "../../moves/moves";
import { sameScene } from "../../project/history";
import { DEFAULT_SCENE } from "../../scene/schema";
import { resolveLanguage } from "../language";
import { appliedMoves, applyMove } from "../session";
import { useApp } from "../state";

const WEIGHT_LABEL: Record<Move["weight"], { en: string; ko: string } | null> = {
  light: null,
  heavy: { en: "GPU heavy", ko: "GPU 무거움" },
  python: { en: "Runs Python", ko: "Python 실행" },
  "gpu-model": { en: "ML model", ko: "ML 모델" },
};

export function MoveCards() {
  const scene = useApp((s) => s.scene);
  const projectId = useApp((s) => s.project?.id);
  const language = useApp((s) => s.settings.language);
  // Subscribing re-renders when a move is picked; the applied list itself lives outside the store.
  useApp((s) => s.movesRevision);
  const korean = resolveLanguage(language) === "ko";
  // Cheap (a few regexes over the scene code), and only rendered while the agent is idle.
  const suggestions = projectId && !sameScene(scene, DEFAULT_SCENE) ? suggestMoves(scene, { applied: appliedMoves(projectId), limit: 4 }) : [];
  if (!suggestions.length) return null;
  return (
    <section className="space-y-1.5 pt-1" data-testid="moves">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-faint">{korean ? "다음에 해 볼 것" : "Try next"}</h4>
      <div className="grid grid-cols-2 gap-1.5">
        {suggestions.map(({ move }) => {
          const weight = WEIGHT_LABEL[move.weight];
          return (
            <button
              key={move.id}
              type="button"
              data-move={move.id}
              onClick={() => void applyMove(move.id)}
              title={korean ? move.summary_ko : move.summary}
              className="rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:border-faint hover:bg-raised"
            >
              <span className="block text-xs text-fg">{korean ? move.name_ko : move.name}</span>
              <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-muted">{korean ? move.summary_ko : move.summary}</span>
              {weight && <span className="mt-1 inline-block rounded bg-raised px-1 text-[9px] text-faint">{korean ? weight.ko : weight.en}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
