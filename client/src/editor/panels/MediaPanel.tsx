/** Imported footage, photos and sounds, with a way to get rid of them. */
import { Music4, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Editor } from "../useEditor";
import { formatTime } from "../model";

export default function MediaPanel({
  editor,
  onPickVisual,
}: {
  editor: Editor;
  onPickVisual: () => void;
}) {
  const { project } = editor;

  return (
    <div className="panel-body">
      <button className="drop-tile" onClick={onPickVisual}>
        <Plus size={16} />
        <strong>영상·사진 가져오기</strong>
        <small>창에 끌어다 놓아도 됩니다</small>
      </button>

      {project.assets.length === 0 ? (
        <p className="panel-note">
          가져온 자료가 여기에 쌓입니다. 타일을 누르면 타임라인에서 그 클립으로
          이동하고, <b>Delete</b> 키나 × 로 지웁니다.
        </p>
      ) : (
        <div className="asset-grid">
          {project.assets.map(item => {
            const uses = project.clips.filter(clip => clip.assetId === item.id);
            const drop = () => {
              const gone = editor.removeAsset(item.id);
              toast.success(
                gone > 0
                  ? `${item.name} 과(와) 클립 ${gone}개를 지웠습니다.`
                  : `${item.name} 을(를) 지웠습니다.`
              );
            };
            return (
              <div
                key={item.id}
                className="asset-tile"
                title={`${item.name} · 누르면 타임라인에서 찾아갑니다`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const first = uses[0];
                  if (!first) return;
                  editor.setSelectedId(first.id);
                  editor.seek(first.at);
                }}
                onKeyDown={event => {
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    event.stopPropagation();
                    drop();
                  }
                }}
              >
                <span
                  className={`asset-art kind-${item.kind}`}
                  style={{
                    backgroundImage: item.frames[0]
                      ? `url(${item.frames[0]})`
                      : undefined,
                  }}
                >
                  {item.kind === "audio" && <Music4 size={16} />}
                  <button
                    className="asset-drop"
                    title="이 소스와 관련 클립 모두 삭제"
                    aria-label={`${item.name} 삭제`}
                    onClick={event => {
                      event.stopPropagation();
                      drop();
                    }}
                  >
                    <X size={11} />
                  </button>
                </span>
                <span className="asset-name">{item.name}</span>
                <span className="asset-len">
                  {item.kind === "photo" ? "사진" : formatTime(item.duration)}
                  {uses.length > 1 && ` · ${uses.length}개 사용`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
