/**
 * Keyboard for the whole app.
 *
 * One listener on the window rather than per-component handlers: an editor's
 * keys have to work wherever the eye happens to be, and a single place is also
 * the only way to keep the bindings from quietly disagreeing with each other.
 *
 * Typing always wins. While the focus is in a text field none of this fires,
 * so writing a caption never deletes a clip.
 */
import { useEffect } from "react";
import { Editor } from "./useEditor";
import { clipEnd } from "./model";

/** One video frame at the 30fps the exporter runs at. */
export const FRAME_STEP = 1 / 30;

export type ShortcutHooks = {
  /** Zoom the visible timeline in or out; -1 out, 1 in, 0 fit. */
  onZoom?: (direction: -1 | 0 | 1) => void;
  onToggleHelp?: () => void;
  onFreeze?: () => void;
  /** Something worth telling the user about happened. */
  onNotice?: (message: string) => void;
};

function isTyping(target: EventTarget | null) {
  const node = target as HTMLElement | null;
  if (!node) return false;
  if (node.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName);
}

export function useShortcuts(editor: Editor, hooks: ShortcutHooks = {}) {
  const { onZoom, onToggleHelp, onFreeze, onNotice } = hooks;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const ids = editor.selectedIds;
      const project = editor.project;
      const say = (message: string) => onNotice?.(message);

      // ----------------------------------------------------------- clipboard
      if (mod) {
        switch (event.key.toLowerCase()) {
          case "z":
            event.preventDefault();
            if (event.shiftKey) editor.redo();
            else editor.undo();
            return;
          case "y":
            event.preventDefault();
            editor.redo();
            return;
          case "a":
            event.preventDefault();
            editor.selectAll();
            return;
          case "c": {
            if (ids.length === 0) return;
            event.preventDefault();
            const count = editor.copyClips(ids);
            say(`클립 ${count}개를 복사했습니다.`);
            return;
          }
          case "x": {
            if (ids.length === 0) return;
            event.preventDefault();
            const count = editor.cutClips(ids);
            say(`클립 ${count}개를 잘라냈습니다.`);
            return;
          }
          case "v": {
            event.preventDefault();
            const count = editor.pasteClips();
            if (count === 0) say("붙여넣을 클립이 없습니다.");
            else say(`클립 ${count}개를 재생 위치에 붙였습니다.`);
            return;
          }
          case "d": {
            if (ids.length === 0) return;
            event.preventDefault();
            editor.duplicateClips(ids);
            return;
          }
          default:
            break;
        }
      }

      // ------------------------------------------------------------ deleting
      if (event.key === "Delete" || event.key === "Backspace") {
        if (ids.length === 0) return;
        event.preventDefault();
        const count = event.shiftKey
          ? editor.rippleDelete(ids)
          : editor.removeClips(ids);
        if (count === 0) {
          say("잠긴 트랙의 클립은 지울 수 없습니다.");
        } else if (event.shiftKey) {
          say(`${count}개를 지우고 뒤를 당겼습니다.`);
        }
        return;
      }

      // ----------------------------------------------------------- transport
      if (event.code === "Space") {
        event.preventDefault();
        editor.toggle();
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        editor.seek(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        editor.seek(editor.duration);
        return;
      }

      // --------------------------------------------------- moving and seeking
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const way = event.key === "ArrowRight" ? 1 : -1;
        const step = event.shiftKey ? 1 : FRAME_STEP;
        event.preventDefault();
        // With clips picked the arrows nudge them; with nothing picked they
        // walk the playhead, which is what an empty selection should mean.
        if (ids.length > 0 && !event.altKey) {
          editor.nudgeClips(ids, way * step);
        } else {
          editor.seek(Math.max(0, editor.timeRef.current + way * step));
        }
        return;
      }

      if (event.key === "," || event.key === ".") {
        // Hop between beat marks — the fastest way to work to music.
        if (project.markers.length === 0) return;
        event.preventDefault();
        const at = editor.timeRef.current;
        const target =
          event.key === "."
            ? project.markers.find(mark => mark > at + 0.01)
            : [...project.markers].reverse().find(mark => mark < at - 0.01);
        if (target !== undefined) editor.seek(target);
        return;
      }

      if (event.key === "[" || event.key === "]") {
        // Hop between clip edges on the timeline.
        event.preventDefault();
        const at = editor.timeRef.current;
        const edges = Array.from(
          new Set(project.clips.flatMap(clip => [clip.at, clipEnd(clip)]))
        ).sort((a, b) => a - b);
        const target =
          event.key === "]"
            ? edges.find(edge => edge > at + 0.01)
            : [...edges].reverse().find(edge => edge < at - 0.01);
        if (target !== undefined) editor.seek(target);
        return;
      }

      // ------------------------------------------------------------- editing
      switch (event.key.toLowerCase()) {
        case "s": {
          event.preventDefault();
          if (!editor.splitAtPlayhead())
            say("재생 헤드를 클립 안쪽으로 옮긴 뒤 나누세요.");
          return;
        }
        case "m": {
          event.preventDefault();
          editor.addMarker();
          return;
        }
        case "f": {
          if (!onFreeze) return;
          event.preventDefault();
          onFreeze();
          return;
        }
        case "j": {
          event.preventDefault();
          editor.seek(Math.max(0, editor.timeRef.current - 1));
          return;
        }
        case "k": {
          event.preventDefault();
          editor.setPlaying(false);
          return;
        }
        case "l": {
          event.preventDefault();
          editor.setPlaying(true);
          return;
        }
        case "d": {
          // Bare D picks up everything under the playhead, the way a "select
          // at cursor" key does in an NLE.
          event.preventDefault();
          const hits = editor.selectUnderPlayhead();
          if (hits === 0) say("재생 헤드 아래에 클립이 없습니다.");
          return;
        }
        default:
          break;
      }

      if (event.key === "Escape") {
        editor.clearSelection();
        return;
      }
      // Depending on the layout the browser reports "?" or a shifted slash.
      if (
        event.key === "?" ||
        ((event.key === "/" || event.code === "Slash") && event.shiftKey)
      ) {
        event.preventDefault();
        onToggleHelp?.();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        onZoom?.(1);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        onZoom?.(-1);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        onZoom?.(0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, onZoom, onToggleHelp, onFreeze, onNotice]);
}

export const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: "재생",
    keys: [
      ["Space", "재생 / 일시정지"],
      ["L / K / J", "재생 · 정지 · 1초 뒤로"],
      ["Home / End", "처음 / 끝으로"],
      ["← →", "한 프레임 이동 (Shift = 1초)"],
      [", .", "이전 / 다음 비트로"],
      ["[ ]", "이전 / 다음 클립 경계로"],
    ],
  },
  {
    group: "선택",
    keys: [
      ["클릭", "클립 하나 선택"],
      ["Ctrl / Shift + 클릭", "선택에 더하거나 빼기"],
      ["빈 트랙에서 드래그", "박스로 여러 개 선택"],
      ["Ctrl+A", "전체 선택"],
      ["D", "재생 헤드 아래 전부 선택"],
      ["Esc", "선택 해제"],
    ],
  },
  {
    group: "편집",
    keys: [
      ["Delete", "선택한 클립 삭제"],
      ["Shift+Delete", "삭제하고 뒤 당기기"],
      ["Ctrl+C / X / V", "복사 · 잘라내기 · 붙여넣기"],
      ["Ctrl+D", "복제"],
      ["S", "재생 위치에서 나누기"],
      ["M", "마커 찍기"],
      ["F", "정지 화면 넣기"],
      ["Ctrl+Z / Ctrl+Shift+Z", "실행 취소 · 다시 실행"],
      ["← →", "선택한 클립을 한 프레임씩 이동"],
    ],
  },
  {
    group: "보기",
    keys: [
      ["+ / -", "타임라인 확대 · 축소"],
      ["0", "전체 보기"],
      ["?", "이 도움말"],
    ],
  },
];
