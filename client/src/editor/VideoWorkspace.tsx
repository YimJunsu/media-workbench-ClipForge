/**
 * The editing workbench: rail, panel, player, inspector, toolbar, timeline.
 *
 * This file only arranges those pieces. Each one owns its own behaviour, which
 * is what keeps any single part small enough to read in one sitting — the old
 * single-file version had grown past the point where that was true.
 */
import { useEffect, useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import Inspector from "./Inspector";
import Preview from "./Preview";
import Rail, { RailTab } from "./Rail";
import Timeline from "./Timeline";
import Toolbar from "./Toolbar";
import AudioPanel from "./panels/AudioPanel";
import MediaPanel from "./panels/MediaPanel";
import StickerPanel from "./panels/StickerPanel";
import TextPanel from "./panels/TextPanel";
import { EffectPanel, FilterPanel, TransitionPanel } from "./panels/LookPanels";
import { Editor } from "./useEditor";
import { FRAME_SIZES, formatTime } from "./model";

const PANEL_TITLES: Record<RailTab, string> = {
  media: "미디어",
  audio: "오디오",
  text: "텍스트",
  sticker: "스티커",
  effect: "편집효과",
  transition: "전환",
  filter: "필터",
};

type Props = {
  editor: Editor;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** A ticking zoom request from the keyboard, handled in an effect. */
  zoomNudge?: { tick: number; way: -1 | 0 | 1 };
  onPickVisual: () => void;
  onPickAudio: () => void;
  onPickSubtitles: () => void;
};

export default function VideoWorkspace({
  editor,
  canvasRef,
  zoomNudge,
  onPickVisual,
  onPickAudio,
  onPickSubtitles,
}: Props) {
  const [zoom, setZoom] = useState(56);
  const [tab, setTab] = useState<RailTab>("media");
  const [snapBeats, setSnapBeats] = useState(true);
  const { project, duration, time, playing, toggle, seek, selectedIds } =
    editor;

  const zoomIn = () => setZoom(value => Math.min(400, value * 1.5));
  const zoomOut = () => setZoom(value => Math.max(10, value / 1.5));
  const zoomFit = () =>
    setZoom(duration > 0 ? Math.max(10, 880 / (duration + 4)) : 56);

  useEffect(() => {
    if (!zoomNudge?.tick) return;
    if (zoomNudge.way === 1) zoomIn();
    else if (zoomNudge.way === -1) zoomOut();
    else setZoom(duration > 0 ? Math.max(10, 880 / (duration + 4)) : 56);
    // Only the tick matters; the same direction twice must still fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomNudge?.tick]);

  const freeze = () => {
    if (!editor.freezeFrame(canvasRef.current))
      toast.error("재생 헤드를 영상 클립 위로 옮긴 뒤 눌러 주세요.");
    else toast.success("정지 화면을 넣었습니다.");
  };

  return (
    <div className="workspace video-workspace">
      <Rail tab={tab} onTab={setTab} />

      <aside className="panel browser">
        <div className="panel-title">
          <h2>{PANEL_TITLES[tab]}</h2>
        </div>
        {tab === "media" && (
          <MediaPanel editor={editor} onPickVisual={onPickVisual} />
        )}
        {tab === "audio" && (
          <AudioPanel editor={editor} onPickAudio={onPickAudio} />
        )}
        {tab === "text" && (
          <TextPanel editor={editor} onPickSubtitles={onPickSubtitles} />
        )}
        {tab === "sticker" && <StickerPanel editor={editor} />}
        {tab === "effect" && <EffectPanel editor={editor} />}
        {tab === "transition" && <TransitionPanel editor={editor} />}
        {tab === "filter" && <FilterPanel editor={editor} />}
      </aside>

      <section className="monitor">
        <div className="monitor-bar">
          <span className="mb-title">플레이어</span>
          <div className="size-picker">
            {FRAME_SIZES.map(size => (
              <button
                key={size.id}
                className={project.frame?.id === size.id ? "is-on" : ""}
                onClick={() => editor.setFrameSize(size)}
                title={`${size.width} × ${size.height}`}
              >
                {size.name}
              </button>
            ))}
          </div>
          <span className="mb-meta">
            {project.frame?.width ?? 1280} × {project.frame?.height ?? 720} ·
            30fps
          </span>
        </div>
        <div className="monitor-stage">
          <div className="monitor-frame">
            <Preview
              project={project}
              time={time}
              videoFor={editor.videoFor}
              imageFor={editor.imageFor}
              canvasRef={canvasRef}
            />
            {duration === 0 && (
              <p className="monitor-empty">
                미디어를 가져오면 여기에서 재생됩니다
              </p>
            )}
          </div>
        </div>
        <div className="transport">
          <button
            onClick={() => seek(0)}
            aria-label="처음으로"
            disabled={duration === 0}
          >
            <SkipBack size={15} />
          </button>
          <button
            onClick={() => seek(time - 5)}
            aria-label="5초 뒤로"
            disabled={duration === 0}
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            className="transport-play"
            onClick={toggle}
            aria-label={playing ? "일시정지" : "재생"}
            disabled={duration === 0}
          >
            {playing ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => seek(time + 5)}
            aria-label="5초 앞으로"
            disabled={duration === 0}
          >
            <ChevronsRight size={16} />
          </button>
          <button
            onClick={() => seek(duration)}
            aria-label="끝으로"
            disabled={duration === 0}
          >
            <SkipForward size={15} />
          </button>
          <span className="timecode">
            {formatTime(time, true)} <i>/</i> {formatTime(duration, true)}
          </span>
        </div>
      </section>

      <Inspector editor={editor} />

      <section className="timeline-shell">
        <Toolbar
          editor={editor}
          snapBeats={snapBeats}
          onSnapBeats={setSnapBeats}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomFit={zoomFit}
          onFreeze={freeze}
        />
        <p className="bar-hint">
          {selectedIds.length > 1
            ? `${selectedIds.length}개 선택됨 — 끌면 함께 움직입니다`
            : "빈 곳을 드래그하면 여러 개 선택 · Ctrl+클릭으로 더하기 · Delete로 삭제 · ?로 단축키"}
        </p>
        <Timeline editor={editor} zoom={zoom} snapBeats={snapBeats} />
      </section>
    </div>
  );
}
