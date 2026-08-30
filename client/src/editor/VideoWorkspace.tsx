/** 동영상 편집·생성: browser tabs / program monitor / inspector / multi-track timeline. */
import { useEffect, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AudioLines,
  Blend,
  Grid3x3,
  LayoutGrid,
  Magnet,
  Palette,
  RotateCcw,
  Sparkles,
  Waves,
  X,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  FileText,
  Gauge,
  Image as ImageIcon,
  Activity,
  Maximize2,
  Move,
  Music4,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  SkipBack,
  SkipForward,
  Snowflake,
  Trash2,
  Type,
  Undo2,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import Preview from "./Preview";
import Timeline from "./Timeline";
import { Editor } from "./useEditor";
import {
  BEAT_REACTS,
  BeatStyle,
  CAPTION_ANIMS,
  TextStyle,
  VizStyle,
  FONTS,
  FRAME_SIZES,
  LAYOUTS,
  MOTIONS,
  SPEEDS,
  VIZ_KINDS,
  clipLength,
  defaultBeat,
  formatTime,
} from "./model";

type Tab = "media" | "audio" | "text";

const CAPTION_PRESETS = [
  {
    name: "기본 자막",
    style: { size: 56, y: 0.84, back: "box" as const, color: "#ffffff" },
  },
  {
    name: "큰 제목",
    style: { size: 104, y: 0.5, back: "outline" as const, color: "#ffffff" },
  },
  {
    name: "강조",
    style: { size: 68, y: 0.2, back: "box" as const, color: "#ffd27a" },
  },
];

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
  const [tab, setTab] = useState<Tab>("media");
  const [snapBeats, setSnapBeats] = useState(true);
  const [beatLines, setBeatLines] = useState("");
  const {
    project,
    duration,
    time,
    playing,
    toggle,
    seek,
    selected,
    patchClip,
    patchText,
    applyTextStyleToAll,
    patchTransform,
    patchColor,
    patchTransition,
    patchFx,
    removeClip,
    duplicateClip,
    addText,
    undo,
    redo,
    canUndo,
    canRedo,
    splitAtPlayhead,
    addTrack,
    setFrameSize,
    markBeats,
    splitAtMarkers,
    freezeFrame,
    selectedIds,
    removeClips,
    rippleDelete,
    duplicateClips,
    removeAsset,
    patchBeat,
    patchViz,
    addViz,
    addMarker,
    clearMarkers,
    applyBeatGrid,
    addCaptionsOnBeats,
    applyBeatToAll,
    bpm,
  } = editor;

  const fitZoom = () =>
    setZoom(duration > 0 ? Math.max(10, 880 / (duration + 4)) : 56);

  useEffect(() => {
    if (!zoomNudge?.tick) return;
    if (zoomNudge.way === 1) setZoom(value => Math.min(400, value * 1.5));
    else if (zoomNudge.way === -1) setZoom(value => Math.max(10, value / 1.5));
    else setZoom(duration > 0 ? Math.max(10, 880 / (duration + 4)) : 56);
    // Only the tick matters; the same direction twice must still fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomNudge?.tick]);

  const asset = selected ? editor.assetFor(selected) : null;
  const visuals = project.assets.filter(item => item.kind !== "audio");
  const sounds = project.assets.filter(item => item.kind === "audio");
  const shown = tab === "audio" ? sounds : visuals;
  const captions = project.clips
    .filter(clip => clip.text)
    .slice()
    .sort((a, b) => a.at - b.at);

  return (
    <div className="workspace video-workspace">
      <aside className="panel browser">
        <div className="tabs">
          <button
            className={tab === "media" ? "is-on" : ""}
            onClick={() => setTab("media")}
          >
            <ImageIcon size={13} /> 미디어
          </button>
          <button
            className={tab === "audio" ? "is-on" : ""}
            onClick={() => setTab("audio")}
          >
            <Music4 size={13} /> 오디오
          </button>
          <button
            className={tab === "text" ? "is-on" : ""}
            onClick={() => setTab("text")}
          >
            <Type size={13} /> 텍스트
          </button>
        </div>

        {tab === "text" ? (
          <div className="preset-list">
            {CAPTION_PRESETS.map(preset => (
              <button
                key={preset.name}
                className="preset"
                onClick={() => {
                  addText(preset.style);
                  toast.success(`${preset.name}을 재생 위치에 넣었습니다.`);
                }}
              >
                <span
                  className="preset-art"
                  style={{
                    fontSize: Math.max(11, preset.style.size / 6),
                    color: preset.style.color,
                    background:
                      preset.style.back === "box"
                        ? "rgba(0,0,0,.55)"
                        : "transparent",
                    textShadow:
                      preset.style.back === "outline"
                        ? "0 0 3px #000, 0 0 3px #000"
                        : "none",
                  }}
                >
                  가나다
                </span>
                <span className="preset-name">{preset.name}</span>
              </button>
            ))}
            <p className="panel-note">
              누르면 재생 헤드 위치에 자막이 놓입니다. 내용과 모양은 오른쪽
              속성에서 고칩니다.
            </p>

            <button
              className="drop-tile subtitle-drop"
              onClick={onPickSubtitles}
            >
              <FileText size={16} />
              <strong>자막 파일 가져오기</strong>
              <small>.srt · .vtt — 시간까지 그대로 들어옵니다</small>
            </button>

            <div className="beat-caption">
              <p className="group-title">
                <Sparkles size={12} /> 비트마다 자막
              </p>
              <p className="panel-note">
                한 줄에 하나씩 쓰면 마커(비트) 하나에 한 줄씩 올라갑니다. 먼저
                아래 타임라인에서 <b>비트 찾기</b>를 눌러 마커를 만드세요.
              </p>
              <textarea
                className="text-input"
                rows={4}
                placeholder={"첫 번째 줄\n두 번째 줄\n세 번째 줄"}
                value={beatLines}
                onChange={event => setBeatLines(event.target.value)}
              />
              <div className="beat-caption-foot">
                <small>
                  마커 {project.markers.length}개
                  {bpm !== null && ` · ${bpm} BPM`}
                </small>
                <button
                  className="wide-button"
                  disabled={
                    project.markers.length < 2 || beatLines.trim().length === 0
                  }
                  onClick={() => {
                    const made = addCaptionsOnBeats(beatLines.split("\n"));
                    if (made > 0) {
                      toast.success(`비트에 맞춰 자막 ${made}개를 놓았습니다.`);
                      setBeatLines("");
                    } else {
                      toast.error(
                        "마커가 2개 이상 있어야 합니다. 비트를 먼저 찾아 주세요."
                      );
                    }
                  }}
                >
                  <Sparkles size={13} /> 비트에 얹기
                </button>
              </div>
            </div>

            <div className="caption-list-head">
              <span>넣은 자막</span>
              <b>{captions.length}개</b>
            </div>
            {captions.length === 0 ? (
              <p className="panel-note">아직 자막이 없습니다.</p>
            ) : (
              <ul className="caption-list">
                {captions.map(clip => (
                  <li key={clip.id}>
                    <button
                      className={`caption-row ${clip.id === selected?.id ? "is-on" : ""}`}
                      onClick={() => {
                        editor.setSelectedId(clip.id);
                        seek(clip.at);
                      }}
                    >
                      <span className="caption-at">{formatTime(clip.at)}</span>
                      <span className="caption-text">
                        {clip.text?.content.split("\n")[0] || "빈 자막"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <button
              className="drop-tile"
              onClick={tab === "audio" ? onPickAudio : onPickVisual}
            >
              <Plus size={16} />
              <strong>
                {tab === "audio" ? "음원 가져오기" : "영상·사진 가져오기"}
              </strong>
              <small>창에 끌어다 놓아도 됩니다</small>
            </button>
            <div className="asset-grid">
              {shown.map(item => {
                const uses = project.clips.filter(
                  clip => clip.assetId === item.id
                );
                const drop = () => {
                  const gone = removeAsset(item.id);
                  toast.success(
                    gone > 0
                      ? `${item.name} 과(와) 타임라인의 클립 ${gone}개를 지웠습니다.`
                      : `${item.name} 을(를) 지웠습니다.`
                  );
                };
                return (
                  <div
                    key={item.id}
                    className="asset-tile"
                    title={`${item.name} · 클릭하면 타임라인에서 찾아갑니다`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const first = uses[0];
                      if (!first) return;
                      editor.setSelectedId(first.id);
                      seek(first.at);
                    }}
                    // Delete works here too: pick a source, press the key.
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
                      {item.kind === "photo"
                        ? "사진"
                        : formatTime(item.duration)}
                      {uses.length > 1 && ` · ${uses.length}개 사용`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </aside>

      <section className="monitor">
        <div className="monitor-bar">
          <span className="mb-title">프로그램 모니터</span>
          <div className="size-picker">
            {FRAME_SIZES.map(size => (
              <button
                key={size.id}
                className={project.frame?.id === size.id ? "is-on" : ""}
                onClick={() => setFrameSize(size)}
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

      <aside className="panel inspector">
        <div className="panel-title">
          <h2>속성</h2>
        </div>
        {!selected ? (
          <p className="panel-empty">
            타임라인에서 클립을 선택하면 여기에서 조절합니다.
          </p>
        ) : selected.viz ? (
          <VizPanel
            editor={editor}
            viz={selected.viz}
            length={clipLength(selected)}
            onPatch={patch => patchViz(selected.id, patch)}
            onLength={seconds =>
              patchClip(selected.id, { end: selected.start + seconds })
            }
            onDuplicate={() => duplicateClip(selected.id)}
            onRemove={() => removeClip(selected.id)}
          />
        ) : selected.text ? (
          <div className="fields">
            <div className="field-head">
              <strong>자막</strong>
              <small>{formatTime(clipLength(selected), true)}</small>
            </div>
            <label className="field">
              <span>내용</span>
              <textarea
                className="text-input"
                rows={3}
                value={selected.text.content}
                onChange={event =>
                  patchText(selected.id, { content: event.target.value })
                }
              />
            </label>
            <p className="group-title">글꼴</p>
            <div className="field">
              <span>글꼴 종류</span>
              <div className="chip-grid">
                {FONTS.map(font => (
                  <button
                    key={font.id}
                    className={`chip ${selected.text!.font === font.id ? "is-on" : ""}`}
                    style={{ fontFamily: font.stack }}
                    onClick={() => patchText(selected.id, { font: font.id })}
                  >
                    {font.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>
                크기 <b>{selected.text.size}px</b>
              </span>
              <input
                type="range"
                min={16}
                max={200}
                value={selected.text.size}
                onChange={event =>
                  patchText(selected.id, { size: Number(event.target.value) })
                }
              />
            </label>
            <div className="field tight">
              <span>굵기</span>
              <div className="segmented">
                {(
                  [
                    [400, "보통"],
                    [700, "굵게"],
                    [900, "아주 굵게"],
                  ] as const
                ).map(([weight, label]) => (
                  <button
                    key={weight}
                    className={selected.text!.weight === weight ? "is-on" : ""}
                    onClick={() => patchText(selected.id, { weight })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field tight">
              <span>글자 색과 정렬</span>
              <div className="row">
                <input
                  className="swatch"
                  type="color"
                  value={selected.text.color}
                  onChange={event =>
                    patchText(selected.id, { color: event.target.value })
                  }
                  aria-label="글자 색"
                />
                <div className="segmented grow">
                  {(["left", "center", "right"] as const).map(align => {
                    const Icon =
                      align === "left"
                        ? AlignLeft
                        : align === "center"
                          ? AlignCenter
                          : AlignRight;
                    return (
                      <button
                        key={align}
                        className={
                          selected.text!.align === align ? "is-on" : ""
                        }
                        onClick={() => patchText(selected.id, { align })}
                        aria-label={`${align} 정렬`}
                      >
                        <Icon size={13} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="field tight">
              <span>등장 효과</span>
              <div className="segmented">
                {CAPTION_ANIMS.map(item => (
                  <button
                    key={item.id}
                    className={
                      (selected.text!.anim ?? "none") === item.id ? "is-on" : ""
                    }
                    onClick={() => patchText(selected.id, { anim: item.id })}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            <BeatPanel
              beat={selected.text.beat ?? defaultBeat()}
              karaoke={selected.text.karaoke ?? false}
              karaokeColor={selected.text.karaokeColor ?? "#ffd27a"}
              markers={project.markers.length}
              bpm={bpm}
              onPatch={patch => patchBeat(selected.id, patch)}
              onPatchText={patch => patchText(selected.id, patch)}
              onApplyAll={() => {
                const touched = applyBeatToAll(selected.id);
                toast.success(
                  touched > 0
                    ? `자막 ${touched}개에 같은 비트 반응을 걸었습니다.`
                    : "다른 자막이 없습니다."
                );
              }}
            />

            <p className="group-title">배경과 테두리</p>
            <div className="field">
              <span>종류</span>
              <div className="segmented">
                {(
                  [
                    ["box", "상자"],
                    ["outline", "외곽선"],
                    ["shadow", "그림자"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    className={selected.text!.back === kind ? "is-on" : ""}
                    onClick={() => patchText(selected.id, { back: kind })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field tight">
              <span>
                색 <b>{Math.round(selected.text.backOpacity * 100)}%</b>
              </span>
              <div className="row">
                <input
                  className="swatch"
                  type="color"
                  value={selected.text.backColor}
                  onChange={event =>
                    patchText(selected.id, { backColor: event.target.value })
                  }
                  aria-label="배경 색"
                />
                <input
                  className="grow"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(selected.text.backOpacity * 100)}
                  onChange={event =>
                    patchText(selected.id, {
                      backOpacity: Number(event.target.value) / 100,
                    })
                  }
                  aria-label="배경 진하기"
                />
              </div>
            </div>
            {selected.text.back === "outline" && (
              <label className="field tight">
                <span>
                  외곽선 두께{" "}
                  <b>{Math.round(selected.text.outlineWidth * 100)}</b>
                </span>
                <input
                  type="range"
                  min={2}
                  max={40}
                  value={Math.round(selected.text.outlineWidth * 100)}
                  onChange={event =>
                    patchText(selected.id, {
                      outlineWidth: Number(event.target.value) / 100,
                    })
                  }
                />
              </label>
            )}

            <p className="group-title">배치</p>
            <div className="field">
              <span>빠른 위치</span>
              <div className="chip-grid">
                {(
                  [
                    ["위", 0.14],
                    ["가운데", 0.5],
                    ["아래", 0.84],
                  ] as const
                ).map(([label, y]) => (
                  <button
                    key={label}
                    className={`chip ${Math.abs(selected.text!.y - y) < 0.01 ? "is-on" : ""}`}
                    onClick={() => patchText(selected.id, { x: 0.5, y })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field tight">
              <span>
                가로 위치 <b>{Math.round(selected.text.x * 100)}%</b>
              </span>
              <input
                type="range"
                min={5}
                max={95}
                value={Math.round(selected.text.x * 100)}
                onChange={event =>
                  patchText(selected.id, {
                    x: Number(event.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="field tight">
              <span>
                세로 위치 <b>{Math.round(selected.text.y * 100)}%</b>
              </span>
              <input
                type="range"
                min={5}
                max={95}
                value={Math.round(selected.text.y * 100)}
                onChange={event =>
                  patchText(selected.id, {
                    y: Number(event.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="field tight">
              <span>
                기울이기 <b>{selected.text.rotate}°</b>
              </span>
              <input
                type="range"
                min={-45}
                max={45}
                value={selected.text.rotate}
                onChange={event =>
                  patchText(selected.id, { rotate: Number(event.target.value) })
                }
              />
            </label>

            <p className="group-title">간격과 시간</p>
            <label className="field">
              <span>
                줄 간격 <b>{selected.text.lineHeight.toFixed(2)}</b>
              </span>
              <input
                type="range"
                min={90}
                max={220}
                value={Math.round(selected.text.lineHeight * 100)}
                onChange={event =>
                  patchText(selected.id, {
                    lineHeight: Number(event.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="field tight">
              <span>
                자간 <b>{Math.round(selected.text.letterSpacing * 100)}</b>
              </span>
              <input
                type="range"
                min={-10}
                max={40}
                value={Math.round(selected.text.letterSpacing * 100)}
                onChange={event =>
                  patchText(selected.id, {
                    letterSpacing: Number(event.target.value) / 100,
                  })
                }
              />
            </label>
            <label className="field tight">
              <span>
                표시 시간 <b>{clipLength(selected).toFixed(1)}초</b>
              </span>
              <input
                type="range"
                min={5}
                max={200}
                value={Math.round(clipLength(selected) * 10)}
                onChange={event =>
                  patchClip(selected.id, {
                    end: selected.start + Number(event.target.value) / 10,
                  })
                }
              />
            </label>

            <button
              className="wide-button"
              onClick={() => {
                const touched = applyTextStyleToAll(selected.id);
                toast.success(
                  touched > 0
                    ? `다른 자막 ${touched}개에 이 모양을 입혔습니다.`
                    : "다른 자막이 없습니다."
                );
              }}
            >
              <Copy size={13} /> 이 모양을 모든 자막에 적용
            </button>

            <ClipActions
              onDuplicate={() => duplicateClip(selected.id)}
              onRemove={() => removeClip(selected.id)}
            />
          </div>
        ) : (
          <div className="fields">
            <div className="field-head">
              <strong>{asset?.name ?? "클립"}</strong>
              <small>
                {asset?.kind === "photo"
                  ? "사진"
                  : asset?.kind === "audio"
                    ? "오디오"
                    : "영상"}{" "}
                · {formatTime(clipLength(selected), true)}
              </small>
            </div>

            {asset?.kind === "photo" ? (
              <label className="field">
                <span>
                  표시 시간 <b>{selected.end.toFixed(1)}초</b>
                </span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={selected.end}
                  onChange={event =>
                    patchClip(selected.id, { end: Number(event.target.value) })
                  }
                />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>
                    <Volume2 size={12} /> 볼륨{" "}
                    <b>{Math.round(selected.volume * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(selected.volume * 100)}
                    onChange={event =>
                      patchClip(selected.id, {
                        volume: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
                {asset?.kind === "video" && (
                  <div className="field">
                    <span>
                      <Gauge size={12} /> 속도
                    </span>
                    <div className="segmented">
                      {SPEEDS.map(speed => (
                        <button
                          key={speed}
                          className={selected.speed === speed ? "is-on" : ""}
                          onClick={() => patchClip(selected.id, { speed })}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {asset?.kind === "audio" && (
                  <>
                    <label className="field">
                      <span>
                        페이드 인 <b>{selected.fadeIn.toFixed(1)}초</b>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={0.1}
                        value={selected.fadeIn}
                        onChange={event =>
                          patchClip(selected.id, {
                            fadeIn: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>
                        페이드 아웃 <b>{selected.fadeOut.toFixed(1)}초</b>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={0.1}
                        value={selected.fadeOut}
                        onChange={event =>
                          patchClip(selected.id, {
                            fadeOut: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </>
            )}

            <div className="field readout">
              <span>시작 위치</span>
              <b>{formatTime(selected.at, true)}</b>
            </div>
            {asset?.kind !== "photo" && (
              <div className="field readout">
                <span>사용 구간</span>
                <b>
                  {formatTime(selected.start, true)} —{" "}
                  {formatTime(selected.end, true)}
                </b>
              </div>
            )}

            {asset?.kind !== "audio" && (
              <>
                <div className="field">
                  <span>
                    <LayoutGrid size={12} /> 화면 배치
                  </span>
                  <div className="chip-grid">
                    {LAYOUTS.map(layout => (
                      <button
                        key={layout.name}
                        className="chip"
                        onClick={() =>
                          patchTransform(selected.id, layout.transform)
                        }
                      >
                        {layout.name}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span>
                    크기 <b>{Math.round(selected.transform.scale * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(selected.transform.scale * 100)}
                    onChange={event =>
                      patchTransform(selected.id, {
                        scale: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    가로 위치 <b>{Math.round(selected.transform.x * 100)}</b>
                  </span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={Math.round(selected.transform.x * 100)}
                    onChange={event =>
                      patchTransform(selected.id, {
                        x: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    세로 위치 <b>{Math.round(selected.transform.y * 100)}</b>
                  </span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={Math.round(selected.transform.y * 100)}
                    onChange={event =>
                      patchTransform(selected.id, {
                        y: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    불투명도{" "}
                    <b>{Math.round(selected.transform.opacity * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(selected.transform.opacity * 100)}
                    onChange={event =>
                      patchTransform(selected.id, {
                        opacity: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>

                <div className="field">
                  <span>
                    <Move size={12} /> 움직임
                  </span>
                  <div className="chip-grid">
                    {MOTIONS.map(item => (
                      <button
                        key={item.id}
                        className={`chip ${(selected.motion?.kind ?? "none") === item.id ? "is-on" : ""}`}
                        onClick={() =>
                          patchClip(selected.id, {
                            motion: {
                              kind: item.id,
                              amount: selected.motion?.amount ?? 0.18,
                            },
                          })
                        }
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
                {(selected.motion?.kind ?? "none") !== "none" && (
                  <label className="field tight">
                    <span>
                      움직임 세기{" "}
                      <b>
                        {Math.round((selected.motion?.amount ?? 0.18) * 100)}%
                      </b>
                    </span>
                    <input
                      type="range"
                      min={4}
                      max={80}
                      value={Math.round(
                        (selected.motion?.amount ?? 0.18) * 100
                      )}
                      onChange={event =>
                        patchClip(selected.id, {
                          motion: {
                            kind: selected.motion?.kind ?? "zoom-in",
                            amount: Number(event.target.value) / 100,
                          },
                        })
                      }
                    />
                  </label>
                )}

                <div className="field">
                  <span>
                    <Palette size={12} /> 색 보정
                    <button
                      className="tiny-reset"
                      onClick={() =>
                        patchColor(selected.id, {
                          brightness: 1,
                          contrast: 1,
                          saturate: 1,
                          hue: 0,
                        })
                      }
                      aria-label="색 보정 되돌리기"
                    >
                      <RotateCcw size={11} />
                    </button>
                  </span>
                </div>
                <label className="field tight">
                  <span>
                    밝기 <b>{Math.round(selected.color.brightness * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    value={Math.round(selected.color.brightness * 100)}
                    onChange={event =>
                      patchColor(selected.id, {
                        brightness: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
                <label className="field tight">
                  <span>
                    대비 <b>{Math.round(selected.color.contrast * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={20}
                    max={200}
                    value={Math.round(selected.color.contrast * 100)}
                    onChange={event =>
                      patchColor(selected.id, {
                        contrast: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
                <label className="field tight">
                  <span>
                    채도 <b>{Math.round(selected.color.saturate * 100)}%</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={250}
                    value={Math.round(selected.color.saturate * 100)}
                    onChange={event =>
                      patchColor(selected.id, {
                        saturate: Number(event.target.value) / 100,
                      })
                    }
                  />
                </label>
                <label className="field tight">
                  <span>
                    색조 <b>{selected.color.hue}°</b>
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selected.color.hue}
                    onChange={event =>
                      patchColor(selected.id, {
                        hue: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}

            <div className="field">
              <span>
                <Blend size={12} /> 전환 효과
              </span>
              <div className="segmented">
                {(["none", "dissolve", "fade"] as const).map(kind => (
                  <button
                    key={kind}
                    className={selected.transition.in === kind ? "is-on" : ""}
                    onClick={() => patchTransition(selected.id, { in: kind })}
                  >
                    {kind === "none"
                      ? "없음"
                      : kind === "dissolve"
                        ? "디졸브"
                        : "페이드"}
                  </button>
                ))}
              </div>
            </div>
            <div className="field tight">
              <span>끝 전환</span>
              <div className="segmented">
                {(["none", "dissolve", "fade"] as const).map(kind => (
                  <button
                    key={kind}
                    className={selected.transition.out === kind ? "is-on" : ""}
                    onClick={() => patchTransition(selected.id, { out: kind })}
                  >
                    {kind === "none"
                      ? "없음"
                      : kind === "dissolve"
                        ? "디졸브"
                        : "페이드"}
                  </button>
                ))}
              </div>
            </div>
            <label className="field tight">
              <span>
                전환 길이 <b>{selected.transition.duration.toFixed(1)}초</b>
              </span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={selected.transition.duration}
                onChange={event =>
                  patchTransition(selected.id, {
                    duration: Number(event.target.value),
                  })
                }
              />
            </label>

            {asset?.kind !== "photo" && (
              <>
                <div className="field">
                  <span>
                    <Waves size={12} /> 소리 효과
                  </span>
                  <div className="chip-grid">
                    {(
                      [
                        ["none", "없음"],
                        ["echo", "에코"],
                        ["reverb", "공간감"],
                        ["lowpass", "먹먹하게"],
                        ["highpass", "얇게"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        className={`chip ${selected.fx.kind === kind ? "is-on" : ""}`}
                        onClick={() => patchFx(selected.id, { kind })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {selected.fx.kind !== "none" && (
                  <label className="field tight">
                    <span>
                      효과 세기 <b>{Math.round(selected.fx.amount * 100)}%</b>
                    </span>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={Math.round(selected.fx.amount * 100)}
                      onChange={event =>
                        patchFx(selected.id, {
                          amount: Number(event.target.value) / 100,
                        })
                      }
                    />
                  </label>
                )}
              </>
            )}
            <ClipActions
              onDuplicate={() => duplicateClip(selected.id)}
              onRemove={() => removeClip(selected.id)}
            />
          </div>
        )}
      </aside>

      <section className="timeline-shell">
        <div className="timeline-bar">
          <button onClick={undo} disabled={!canUndo} aria-label="실행 취소">
            <Undo2 size={15} />
          </button>
          <button onClick={redo} disabled={!canRedo} aria-label="다시 실행">
            <Redo2 size={15} />
          </button>
          <i className="bar-split" />
          <button
            onClick={() => {
              if (!splitAtPlayhead())
                toast.error("재생 헤드를 클립 안쪽으로 옮긴 뒤 나누세요.");
            }}
          >
            <Scissors size={15} /> 나누기
          </button>
          <button
            onClick={() => duplicateClips(selectedIds)}
            disabled={selectedIds.length === 0}
            title="Ctrl+D"
          >
            <Copy size={15} /> 복제
            {selectedIds.length > 1 && <em>{selectedIds.length}</em>}
          </button>
          <button
            onClick={() => removeClips(selectedIds)}
            disabled={selectedIds.length === 0}
            title="Delete"
          >
            <Trash2 size={15} /> 삭제
            {selectedIds.length > 1 && <em>{selectedIds.length}</em>}
          </button>
          <button
            onClick={() => {
              const gone = rippleDelete(selectedIds);
              if (gone > 0) toast.success(`${gone}개를 지우고 뒤를 당겼습니다.`);
            }}
            disabled={selectedIds.length === 0}
            title="Shift+Delete — 지운 자리를 남기지 않습니다"
          >
            <Trash2 size={15} /> 지우고 당기기
          </button>
          <button
            onClick={() => {
              if (!freezeFrame(canvasRef.current))
                toast.error("재생 헤드를 영상 클립 위로 옮긴 뒤 눌러 주세요.");
              else toast.success("정지 화면을 넣었습니다.");
            }}
          >
            <Snowflake size={15} /> 정지 화면
          </button>
          <button
            onClick={() => {
              const found = selected ? markBeats(selected.id) : 0;
              if (found > 0) toast.success(`비트 ${found}개를 찍었습니다.`);
              else toast.error("소리가 있는 클립을 선택한 뒤 눌러 주세요.");
            }}
            disabled={!selected}
          >
            <Activity size={15} /> 비트 찍기
          </button>
          <button
            onClick={() => {
              const cuts = splitAtMarkers();
              if (cuts > 0) toast.success(`비트에 맞춰 ${cuts}번 잘랐습니다.`);
              else toast.error("먼저 비트를 찍어 주세요.");
            }}
            disabled={project.markers.length === 0}
          >
            <Scissors size={15} /> 비트에서 자르기
          </button>
          <button onClick={() => addMarker()} title="M — 재생 위치에 마커">
            <Plus size={13} /> 마커
          </button>
          <button
            className={snapBeats ? "is-on" : ""}
            onClick={() => setSnapBeats(value => !value)}
            title="클립을 끌 때 비트에 달라붙게 합니다"
          >
            <Magnet size={15} /> 비트 스냅
          </button>
          {bpm !== null && (
            <span className="bar-bpm" title="마커 간격으로 잰 템포">
              <Grid3x3 size={12} /> {bpm} BPM
              <button
                onClick={() => {
                  const made = applyBeatGrid(bpm, project.markers[0] ?? 0);
                  if (made > 0)
                    toast.success(
                      `${bpm} BPM 격자 ${made}칸으로 마커를 정리했습니다.`
                    );
                }}
                title="찾은 템포로 마커를 일정한 격자로 바꿉니다"
              >
                격자로
              </button>
              <button
                onClick={() => {
                  clearMarkers();
                  toast.message("마커를 모두 지웠습니다.");
                }}
                title="마커 전부 지우기"
              >
                지우기
              </button>
            </span>
          )}
          <i className="bar-split" />
          <span className="bar-label">트랙</span>
          <button onClick={() => addTrack("video")} title="영상 트랙 추가">
            <Plus size={13} /> 영상
          </button>
          <button onClick={() => addTrack("audio")} title="오디오 트랙 추가">
            <Plus size={13} /> 오디오
          </button>
          <button onClick={() => addTrack("text")} title="자막 트랙 추가">
            <Plus size={13} /> 자막
          </button>
          <i className="bar-split" />
          <button className="is-accent" onClick={() => addText()}>
            <Type size={15} /> 자막 넣기
          </button>
          <button
            onClick={() => {
              addViz();
              toast.success("파형 효과를 재생 위치에 넣었습니다.");
            }}
            title="화면 위에서 소리에 맞춰 움직이는 파형"
          >
            <AudioLines size={15} /> 파형 효과
          </button>
          <i className="bar-split" />
          <button
            onClick={() => setZoom(value => Math.max(10, value / 1.5))}
            aria-label="축소"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={() => setZoom(value => Math.min(400, value * 1.5))}
            aria-label="확대"
          >
            <ZoomIn size={15} />
          </button>
          <button onClick={fitZoom} aria-label="전체 보기">
            <Maximize2 size={15} />
          </button>
          <span className="bar-hint">
            {selectedIds.length > 1
              ? `${selectedIds.length}개 선택됨 — 끌면 함께 움직입니다`
              : "빈 곳을 드래그하면 여러 개 선택 · Ctrl+클릭으로 더하기 · Delete로 삭제 · ?로 단축키"}
          </span>
        </div>
        <Timeline editor={editor} zoom={zoom} snapBeats={snapBeats} />
      </section>
    </div>
  );
}

/**
 * How a caption answers the music. Two drives: the marks on the timeline, or
 * the live loudness of whatever is playing. Both are read straight out of the
 * project at draw time, so the preview and the exported file agree by
 * construction.
 */
function BeatPanel({
  beat,
  karaoke,
  karaokeColor,
  markers,
  bpm,
  onPatch,
  onPatchText,
  onApplyAll,
}: {
  beat: BeatStyle;
  karaoke: boolean;
  karaokeColor: string;
  markers: number;
  bpm: number | null;
  onPatch: (patch: Partial<BeatStyle>) => void;
  onPatchText: (patch: Partial<TextStyle>) => void;
  onApplyAll: () => void;
}) {
  const active = beat.react !== "none";
  const hint = BEAT_REACTS.find(item => item.id === beat.react)?.hint ?? "";

  return (
    <>
      <p className="group-title">
        <Activity size={12} /> 비트 반응
      </p>
      <div className="field">
        <span>움직임</span>
        <div className="chip-grid">
          {BEAT_REACTS.map(item => (
            <button
              key={item.id}
              className={`chip ${beat.react === item.id ? "is-on" : ""}`}
              onClick={() => onPatch({ react: item.id })}
              title={item.hint}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      {active && (
        <>
          <p className="panel-note">{hint}</p>
          <div className="field tight">
            <span>무엇에 맞출까</span>
            <div className="segmented">
              <button
                className={beat.drive === "beat" ? "is-on" : ""}
                onClick={() => onPatch({ drive: "beat" })}
              >
                비트 마커
              </button>
              <button
                className={beat.drive === "level" ? "is-on" : ""}
                onClick={() => onPatch({ drive: "level" })}
              >
                소리 크기
              </button>
            </div>
          </div>
          {beat.drive === "beat" && markers === 0 && (
            <p className="panel-warn">
              아직 마커가 없습니다. 아래 타임라인에서 비트를 찾거나 M 키로
              직접 찍어 주세요.
            </p>
          )}
          {beat.drive === "beat" && markers > 0 && (
            <p className="panel-note">
              마커 {markers}개{bpm !== null && ` · ${bpm} BPM`}
            </p>
          )}
          <label className="field tight">
            <span>
              세기 <b>{Math.round(beat.amount * 100)}%</b>
            </span>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(beat.amount * 100)}
              onChange={event =>
                onPatch({ amount: Number(event.target.value) / 100 })
              }
            />
          </label>
          {beat.drive === "beat" && (
            <label className="field tight">
              <span>
                여운 <b>{beat.decay.toFixed(2)}초</b>
              </span>
              <input
                type="range"
                min={6}
                max={80}
                value={Math.round(beat.decay * 100)}
                onChange={event =>
                  onPatch({ decay: Number(event.target.value) / 100 })
                }
              />
            </label>
          )}
          {(beat.react === "flash" || beat.react === "glow") && (
            <label className="field tight">
              <span>반응 색</span>
              <input
                type="color"
                className="swatch"
                value={beat.color}
                onChange={event => onPatch({ color: event.target.value })}
              />
            </label>
          )}
        </>
      )}

      <div className="field tight">
        <span>가사처럼 한 단어씩</span>
        <div className="segmented">
          <button
            className={!karaoke ? "is-on" : ""}
            onClick={() => onPatchText({ karaoke: false })}
          >
            끄기
          </button>
          <button
            className={karaoke ? "is-on" : ""}
            onClick={() => onPatchText({ karaoke: true })}
          >
            켜기
          </button>
        </div>
      </div>
      {karaoke && (
        <>
          <p className="panel-note">
            띄어쓰기로 나뉜 단어가 차례로 불이 들어옵니다. 클립 안에 마커가
            단어 수만큼 있으면 그 마커에 맞추고, 없으면 클립 길이에 고르게
            나눕니다.
          </p>
          <label className="field tight">
            <span>지나간 단어 색</span>
            <input
              type="color"
              className="swatch"
              value={karaokeColor}
              onChange={event =>
                onPatchText({ karaokeColor: event.target.value })
              }
            />
          </label>
        </>
      )}

      <button className="wide-button" onClick={onApplyAll}>
        <Copy size={13} /> 이 비트 반응을 모든 자막에 적용
      </button>
    </>
  );
}

/** The on-screen waveform clip: what it looks like and where it sits. */
function VizPanel({
  editor,
  viz,
  length,
  onPatch,
  onLength,
  onDuplicate,
  onRemove,
}: {
  editor: Editor;
  viz: VizStyle;
  length: number;
  onPatch: (patch: Partial<VizStyle>) => void;
  onLength: (seconds: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const sounds = editor.project.clips.filter(clip => {
    const track = editor.project.tracks.find(item => item.id === clip.trackId);
    return track?.kind === "audio";
  });

  return (
    <div className="fields">
      <div className="field-head">
        <strong>파형 효과</strong>
        <small>{formatTime(length, true)}</small>
      </div>
      <p className="panel-note">
        화면 위에서 소리에 맞춰 움직이는 파형입니다. 자막과 똑같이 타임라인에서
        옮기고 자를 수 있습니다.
      </p>

      <div className="field">
        <span>모양</span>
        <div className="chip-grid">
          {VIZ_KINDS.map(item => (
            <button
              key={item.id}
              className={`chip ${viz.kind === item.id ? "is-on" : ""}`}
              onClick={() => onPatch({ kind: item.id })}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>따라갈 소리</span>
        <div className="chip-grid">
          <button
            className={`chip ${viz.source === "" ? "is-on" : ""}`}
            onClick={() => onPatch({ source: "" })}
          >
            가장 큰 소리
          </button>
          {sounds.map(clip => (
            <button
              key={clip.id}
              className={`chip ${viz.source === clip.id ? "is-on" : ""}`}
              onClick={() => onPatch({ source: clip.id })}
            >
              {editor.assetFor(clip)?.name ?? "오디오"}
            </button>
          ))}
        </div>
      </div>

      <label className="field tight">
        <span>색</span>
        <input
          type="color"
          className="swatch"
          value={viz.color}
          onChange={event => onPatch({ color: event.target.value })}
        />
      </label>
      <label className="field tight">
        <span>
          진하기 <b>{Math.round(viz.opacity * 100)}%</b>
        </span>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(viz.opacity * 100)}
          onChange={event =>
            onPatch({ opacity: Number(event.target.value) / 100 })
          }
        />
      </label>
      <label className="field tight">
        <span>
          가로 위치 <b>{Math.round(viz.x * 100)}%</b>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(viz.x * 100)}
          onChange={event => onPatch({ x: Number(event.target.value) / 100 })}
        />
      </label>
      <label className="field tight">
        <span>
          세로 위치 <b>{Math.round(viz.y * 100)}%</b>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(viz.y * 100)}
          onChange={event => onPatch({ y: Number(event.target.value) / 100 })}
        />
      </label>
      <label className="field tight">
        <span>
          너비 <b>{Math.round(viz.width * 100)}%</b>
        </span>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(viz.width * 100)}
          onChange={event =>
            onPatch({ width: Number(event.target.value) / 100 })
          }
        />
      </label>
      <label className="field tight">
        <span>
          높이 <b>{Math.round(viz.height * 100)}%</b>
        </span>
        <input
          type="range"
          min={4}
          max={80}
          value={Math.round(viz.height * 100)}
          onChange={event =>
            onPatch({ height: Number(event.target.value) / 100 })
          }
        />
      </label>
      <label className="field tight">
        <span>
          막대 수 <b>{viz.bars}</b>
        </span>
        <input
          type="range"
          min={8}
          max={140}
          value={viz.bars}
          onChange={event => onPatch({ bars: Number(event.target.value) })}
        />
      </label>
      <label className="field tight">
        <span>
          길이 <b>{length.toFixed(1)}초</b>
        </span>
        <input
          type="range"
          min={5}
          max={600}
          value={Math.round(length * 10)}
          onChange={event => onLength(Number(event.target.value) / 10)}
        />
      </label>

      <ClipActions onDuplicate={onDuplicate} onRemove={onRemove} />
    </div>
  );
}

function ClipActions({
  onDuplicate,
  onRemove,
}: {
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="split-row">
      <button onClick={onDuplicate}>
        <Copy size={13} /> 복제
      </button>
      <button className="danger" onClick={onRemove}>
        <Trash2 size={13} /> 삭제
      </button>
    </div>
  );
}
