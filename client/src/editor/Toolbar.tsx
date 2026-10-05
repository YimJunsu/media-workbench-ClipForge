/**
 * The bar between the player and the timeline: the verbs, as icons.
 *
 * Everything here also has a keyboard shortcut, and the tooltips say which —
 * that is how anyone ever graduates from clicking to typing.
 */
import {
  Copy,
  Crop,
  FlipHorizontal,
  FlipVertical,
  Magnet,
  MapPin,
  Maximize2,
  Redo2,
  Scissors,
  Snowflake,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Editor } from "./useEditor";

export default function Toolbar({
  editor,
  snapBeats,
  onSnapBeats,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onFreeze,
}: {
  editor: Editor;
  snapBeats: boolean;
  onSnapBeats: (on: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onFreeze: () => void;
}) {
  const { selectedIds, selected, project, bpm } = editor;
  const some = selectedIds.length > 0;
  const count = selectedIds.length;

  const flip = (axis: "flipX" | "flipY") => {
    if (!selected) return;
    const on = !selected.transform[axis];
    selectedIds.forEach(id => editor.patchTransform(id, { [axis]: on }));
  };

  return (
    <div className="toolbar">
      <button
        onClick={editor.undo}
        disabled={!editor.canUndo}
        title="실행 취소 (Ctrl+Z)"
      >
        <Undo2 size={15} />
      </button>
      <button
        onClick={editor.redo}
        disabled={!editor.canRedo}
        title="다시 실행 (Ctrl+Shift+Z)"
      >
        <Redo2 size={15} />
      </button>
      <i className="bar-split" />

      <button
        onClick={() => {
          if (!editor.splitAtPlayhead())
            toast.error("재생 헤드를 클립 안쪽으로 옮긴 뒤 나누세요.");
        }}
        title="재생 위치에서 나누기 (S)"
      >
        <Scissors size={15} />
      </button>
      <button
        onClick={() => editor.duplicateClips(selectedIds)}
        disabled={!some}
        title="복제 (Ctrl+D)"
      >
        <Copy size={15} />
      </button>
      <button
        onClick={() => editor.removeClips(selectedIds)}
        disabled={!some}
        title="삭제 (Delete)"
      >
        <Trash2 size={15} />
        {count > 1 && <em>{count}</em>}
      </button>
      <button
        onClick={() => {
          const gone = editor.rippleDelete(selectedIds);
          if (gone > 0) toast.success(`${gone}개를 지우고 뒤를 당겼습니다.`);
        }}
        disabled={!some}
        title="지우고 뒤 당기기 (Shift+Delete)"
      >
        <Crop size={15} />
      </button>
      <button onClick={onFreeze} title="정지 화면 넣기 (F)">
        <Snowflake size={15} />
      </button>
      <i className="bar-split" />

      <button
        onClick={() => flip("flipX")}
        disabled={!selected}
        className={selected?.transform.flipX ? "is-on" : ""}
        title="좌우 반전"
      >
        <FlipHorizontal size={15} />
      </button>
      <button
        onClick={() => flip("flipY")}
        disabled={!selected}
        className={selected?.transform.flipY ? "is-on" : ""}
        title="상하 반전"
      >
        <FlipVertical size={15} />
      </button>
      <i className="bar-split" />

      <button onClick={() => editor.addMarker()} title="마커 찍기 (M)">
        <MapPin size={15} />
      </button>
      <button
        className={snapBeats ? "is-on" : ""}
        onClick={() => onSnapBeats(!snapBeats)}
        title="클립을 끌 때 비트에 붙이기"
      >
        <Magnet size={15} />
      </button>
      {bpm !== null && (
        <span className="bar-bpm" title="마커 간격으로 잰 템포">
          {bpm} BPM
        </span>
      )}
      {project.markers.length > 0 && (
        <span className="bar-count">마커 {project.markers.length}</span>
      )}

      <span className="toolbar-gap" />
      <button onClick={onZoomOut} title="축소 (−)">
        <ZoomOut size={15} />
      </button>
      <button onClick={onZoomIn} title="확대 (+)">
        <ZoomIn size={15} />
      </button>
      <button onClick={onZoomFit} title="전체 보기 (0)">
        <Maximize2 size={15} />
      </button>
    </div>
  );
}
