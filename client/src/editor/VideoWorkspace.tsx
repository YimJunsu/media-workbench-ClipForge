/** 동영상 편집·생성: browser tabs / program monitor / inspector / multi-track timeline. */
import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Blend,
  LayoutGrid,
  Palette,
  RotateCcw,
  Waves,
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
  CAPTION_ANIMS,
  FONTS,
  FRAME_SIZES,
  LAYOUTS,
  MOTIONS,
  SPEEDS,
  clipLength,
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
  onPickVisual: () => void;
  onPickAudio: () => void;
  onPickSubtitles: () => void;
};

export default function VideoWorkspace({
  editor,
  canvasRef,
  onPickVisual,
  onPickAudio,
  onPickSubtitles,
}: Props) {
  const [zoom, setZoom] = useState(56);
  const [tab, setTab] = useState<Tab>("media");
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
  } = editor;

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
              {shown.map(item => (
                <div key={item.id} className="asset-tile" title={item.name}>
                  <span
                    className={`asset-art kind-${item.kind}`}
                    style={{
                      backgroundImage: item.frames[0]
                        ? `url(${item.frames[0]})`
                        : undefined,
                    }}
                  >
                    {item.kind === "audio" && <Music4 size={16} />}
                  </span>
                  <span className="asset-name">{item.name}</span>
                  <span className="asset-len">
                    {item.kind === "photo" ? "사진" : formatTime(item.duration)}
                  </span>
                </div>
              ))}
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
            onClick={() => selected && duplicateClip(selected.id)}
            disabled={!selected}
          >
            <Copy size={15} /> 복제
          </button>
          <button
            onClick={() => selected && removeClip(selected.id)}
            disabled={!selected}
          >
            <Trash2 size={15} /> 삭제
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
          <button
            onClick={() =>
              setZoom(duration > 0 ? Math.max(10, 880 / (duration + 4)) : 56)
            }
            aria-label="전체 보기"
          >
            <Maximize2 size={15} />
          </button>
          <span className="bar-hint">
            클립을 끌어 옮기고, 가장자리를 끌어 자릅니다 · 재생 헤드와 다른 클립
            끝에 자석처럼 붙습니다
          </span>
        </div>
        <Timeline editor={editor} zoom={zoom} />
      </section>
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
