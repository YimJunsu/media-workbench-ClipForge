/**
 * The three "pick one, apply it to what is selected" panels: filters, moving
 * effects and transitions. They share a shape, so they share a file.
 */
import { toast } from "sonner";
import { Editor } from "../useEditor";
import {
  EFFECTS,
  EffectKind,
  FILTERS,
  TRANSITIONS,
  TransitionKind,
  colorFilter,
  defaultColor,
} from "../model";

/** Nothing picked is the single most common reason a click seems to do nothing. */
function useTargets(editor: Editor) {
  const ids = editor.selectedIds;
  const picture = editor.project.clips.filter(
    clip =>
      ids.includes(clip.id) &&
      editor.project.tracks.find(track => track.id === clip.trackId)?.kind ===
        "video"
  );
  return picture.map(clip => clip.id);
}

function Empty({ what }: { what: string }) {
  return (
    <p className="panel-warn">
      타임라인에서 영상·사진 클립을 먼저 고르세요. 고른 클립에 {what}{" "}
      적용됩니다.
    </p>
  );
}

// -------------------------------------------------------------------- filter

export function FilterPanel({ editor }: { editor: Editor }) {
  const targets = useTargets(editor);
  // A real frame from the project previews a look far better than a swatch.
  const sample =
    editor.project.assets.find(asset => asset.frames.length > 0)?.frames[0] ??
    null;

  return (
    <div className="panel-body">
      <p className="panel-note">
        색감 프리셋입니다. 고른 뒤 오른쪽 속성에서 밝기·대비를 더 손볼 수
        있습니다.
      </p>
      {targets.length === 0 && <Empty what="색감이" />}
      <div className="look-grid">
        {FILTERS.map(preset => {
          const color = { ...defaultColor(), ...preset.color };
          return (
            <button
              key={preset.id}
              className="look-tile"
              disabled={targets.length === 0}
              onClick={() => {
                const hit = editor.applyFilter(targets, preset.id);
                if (hit > 0)
                  toast.success(
                    `${preset.name} 을(를) 클립 ${hit}개에 입혔습니다.`
                  );
              }}
            >
              <span
                className="look-art"
                style={{
                  backgroundImage: sample ? `url(${sample})` : undefined,
                  filter: colorFilter(color),
                }}
              >
                {color.tintAmount > 0 && (
                  <i
                    style={{
                      background: color.tint,
                      opacity: color.tintAmount,
                      mixBlendMode: color.tintBlend,
                    }}
                  />
                )}
              </span>
              <span className="look-name">{preset.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- effect

export function EffectPanel({ editor }: { editor: Editor }) {
  const targets = useTargets(editor);
  const current = editor.selected?.effect?.kind ?? "none";

  const apply = (kind: EffectKind) => {
    if (targets.length === 0) return;
    targets.forEach(id => editor.patchEffect(id, { kind }));
    const name = EFFECTS.find(item => item.id === kind)?.name ?? kind;
    toast.success(
      kind === "none"
        ? "화면 효과를 껐습니다."
        : `${name} 을(를) 클립 ${targets.length}개에 걸었습니다.`
    );
  };

  return (
    <div className="panel-body">
      <p className="panel-note">
        화면 전체에 걸리는 움직이는 효과입니다. 대부분 <b>비트에 맞춰</b> 터지게
        되어 있고, 세기와 박자 연동은 오른쪽 속성에서 바꿉니다.
      </p>
      {targets.length === 0 && <Empty what="효과가" />}
      <div className="look-grid">
        {EFFECTS.map(item => (
          <button
            key={item.id}
            className={`look-tile ${current === item.id ? "is-on" : ""}`}
            disabled={targets.length === 0}
            onClick={() => apply(item.id)}
            title={item.hint}
          >
            <span className={`look-art fx-${item.id}`} />
            <span className="look-name">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- transition

export function TransitionPanel({ editor }: { editor: Editor }) {
  const targets = useTargets(editor);
  const current = editor.selected?.transition;

  const apply = (kind: TransitionKind, side: "in" | "out" | "both") => {
    if (targets.length === 0) return;
    targets.forEach(id =>
      editor.patchTransition(
        id,
        side === "both" ? { in: kind, out: kind } : { [side]: kind }
      )
    );
    const name = TRANSITIONS.find(item => item.id === kind)?.name ?? kind;
    toast.success(`${name} 전환을 걸었습니다.`);
  };

  return (
    <div className="panel-body">
      <p className="panel-note">
        클립의 <b>시작</b>과 <b>끝</b>에 각각 걸립니다. 두 클립을 이어 붙였다면
        앞 클립의 끝과 뒤 클립의 시작에 같은 전환을 거세요.
      </p>
      {targets.length === 0 && <Empty what="전환이" />}
      <div className="look-grid">
        {TRANSITIONS.map(item => (
          <button
            key={item.id}
            className={`look-tile ${
              current?.in === item.id || current?.out === item.id ? "is-on" : ""
            }`}
            disabled={targets.length === 0}
            onClick={() => apply(item.id, "both")}
          >
            <span className={`look-art tr-${item.id}`} />
            <span className="look-name">{item.name}</span>
          </button>
        ))}
      </div>
      <div className="split-row">
        <button
          disabled={targets.length === 0}
          onClick={() => apply("none", "in")}
        >
          시작 전환 끄기
        </button>
        <button
          disabled={targets.length === 0}
          onClick={() => apply("none", "out")}
        >
          끝 전환 끄기
        </button>
      </div>
      {editor.selected && (
        <label className="field tight">
          <span>
            전환 길이 <b>{editor.selected.transition.duration.toFixed(1)}초</b>
          </span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.1}
            value={editor.selected.transition.duration}
            onChange={event =>
              targets.forEach(id =>
                editor.patchTransition(id, {
                  duration: Number(event.target.value),
                })
              )
            }
          />
        </label>
      )}
    </div>
  );
}
