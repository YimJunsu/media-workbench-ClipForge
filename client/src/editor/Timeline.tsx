/**
 * Multi-track timeline.
 *
 * One scroll container holds everything. The ruler is sticky to the top and the
 * track heads are sticky to the left, so scrolling down keeps the time ruler in
 * view and scrolling sideways keeps the track names in view — and the scroll
 * stays inside this box instead of moving the panels around it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Music2,
  Plus,
  Trash2,
  Type,
  Video as VideoIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Editor } from "./useEditor";
import {
  Clip,
  MIN_CLIP,
  SNAP_SECONDS,
  TRACK_HEIGHT,
  Track,
  TrackKind,
  clipEnd,
  clipLength,
  clipsOn,
  formatTime,
  snap,
  snapPoints,
} from "./model";

const TICKS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
export const HEAD_WIDTH = 168;

type Drag = {
  clip: Clip;
  mode: "move" | "trim-start" | "trim-end";
  originX: number;
};

export default function Timeline({
  editor,
  zoom,
}: {
  editor: Editor;
  zoom: number;
}) {
  const {
    project,
    time,
    seek,
    selectedId,
    setSelectedId,
    commit,
    duration,
    patchTrack,
    removeTrack,
    addTrack,
  } = editor;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const snapshot = useRef(project);
  const liveTime = useRef(time);
  snapshot.current = project;
  liveTime.current = time;

  const span = Math.max(duration + 8, 24);
  const laneWidth = span * zoom;
  const step =
    TICKS.find(value => value * zoom >= 74) ?? TICKS[TICKS.length - 1];
  const ticks: number[] = [];
  for (let at = 0; at <= span; at += step) ticks.push(at);

  const timeFromEvent = useCallback(
    (clientX: number) => {
      const box = scrollRef.current;
      if (!box) return 0;
      const rect = box.getBoundingClientRect();
      return Math.max(
        0,
        (clientX - rect.left + box.scrollLeft - HEAD_WIDTH) / zoom
      );
    },
    [zoom]
  );

  const startDrag = (
    event: React.PointerEvent,
    clip: Clip,
    mode: Drag["mode"]
  ) => {
    const track = project.tracks.find(item => item.id === clip.trackId);
    if (track?.locked) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(clip.id);
    setDrag({ clip, mode, originX: event.clientX });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const raw = (event.clientX - drag.originX) / zoom;
      const source = drag.clip;
      const points = snapPoints(snapshot.current, source.id, liveTime.current);
      const tolerance = SNAP_SECONDS * (60 / zoom) * 2;

      if (drag.mode === "move") {
        const at = Math.max(0, snap(source.at + raw, points, tolerance));
        // Dragging onto another row of the same kind moves the clip there.
        // That is how an overlay ends up on its own video track for PIP.
        const sourceKind = snapshot.current.tracks.find(
          item => item.id === source.trackId
        )?.kind;
        const row = document
          .elementsFromPoint(event.clientX, event.clientY)
          .find(
            node =>
              node instanceof HTMLElement &&
              !!node.dataset.track &&
              node.dataset.kind === sourceKind
          ) as HTMLElement | undefined;
        const trackId = row?.dataset.track ?? source.trackId;
        commit(current => ({
          ...current,
          clips: current.clips.map(clip =>
            clip.id === source.id ? { ...clip, at, trackId } : clip
          ),
        }));
        return;
      }

      const speed = source.speed || 1;
      if (drag.mode === "trim-start") {
        const wantAt = snap(source.at + raw, points, tolerance);
        const shift = wantAt - source.at;
        const start = Math.min(
          Math.max(0, source.start + shift * speed),
          source.end - MIN_CLIP * speed
        );
        const applied = (start - source.start) / speed;
        commit(current => ({
          ...current,
          clips: current.clips.map(clip =>
            clip.id === source.id
              ? { ...clip, start, at: Math.max(0, source.at + applied) }
              : clip
          ),
        }));
      } else {
        const asset = snapshot.current.assets.find(
          item => item.id === source.assetId
        );
        const ceiling =
          asset && asset.kind !== "photo" && asset.duration > 0
            ? asset.duration
            : Number.MAX_SAFE_INTEGER;
        const wantEnd = snap(clipEnd(source) + raw, points, tolerance);
        const end = Math.max(
          source.start + MIN_CLIP * speed,
          Math.min(source.start + (wantEnd - source.at) * speed, ceiling)
        );
        commit(current => ({
          ...current,
          clips: current.clips.map(clip =>
            clip.id === source.id ? { ...clip, end } : clip
          ),
        }));
      }
    };

    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, zoom, commit]);

  return (
    <div
      className="timeline"
      ref={scrollRef}
      onPointerDown={event => {
        const target = event.target as HTMLElement;
        if (target.closest(".clip") || target.closest(".track-head")) return;
        if (target.closest(".add-row")) return;
        setSelectedId(null);
        seek(timeFromEvent(event.clientX));
      }}
    >
      <div className="timeline-grid" style={{ width: HEAD_WIDTH + laneWidth }}>
        <div className="ruler-row" style={{ width: HEAD_WIDTH + laneWidth }}>
          <div className="ruler-corner" style={{ width: HEAD_WIDTH }}>
            <span className="tc-clock">{formatTime(time, true)}</span>
          </div>
          <div className="ruler" style={{ width: laneWidth }}>
            {ticks.map(at => (
              <span key={at} className="tick" style={{ left: at * zoom }}>
                {formatTime(at)}
              </span>
            ))}
            {project.markers.map(at => (
              <i key={at} className="marker" style={{ left: at * zoom }} />
            ))}
          </div>
        </div>

        {project.tracks.map(track => (
          <div
            className="trow"
            key={track.id}
            style={{ height: TRACK_HEIGHT[track.kind] }}
          >
            <TrackHead
              track={track}
              onPatch={patch => patchTrack(track.id, patch)}
              onRemove={() => removeTrack(track.id)}
            />
            <div
              className={`lane lane-${track.kind} ${track.locked ? "is-locked" : ""}`}
              data-track={track.id}
              data-kind={track.kind}
              style={{ width: laneWidth }}
            >
              {clipsOn(project, track.id).map(clip => (
                <ClipBox
                  key={clip.id}
                  clip={clip}
                  track={track}
                  zoom={zoom}
                  editor={editor}
                  selected={clip.id === selectedId}
                  onDrag={startDrag}
                />
              ))}
              {clipsOn(project, track.id).length === 0 && (
                <p className="lane-hint">
                  {track.kind === "video"
                    ? "영상·사진을 가져오면 여기에 놓입니다"
                    : track.kind === "audio"
                      ? "음원이나 녹음이 여기에 놓입니다"
                      : "자막을 추가하면 여기에 놓입니다"}
                </p>
              )}
            </div>
          </div>
        ))}

        <div className="trow add-row" style={{ height: 38 }}>
          <div className="track-head is-add" style={{ width: HEAD_WIDTH }}>
            <span className="add-label">트랙 추가</span>
            <span className="add-buttons">
              <AddTrackButton kind="video" onAdd={addTrack} />
              <AddTrackButton kind="audio" onAdd={addTrack} />
              <AddTrackButton kind="text" onAdd={addTrack} />
            </span>
          </div>
          <div className="lane lane-add" style={{ width: laneWidth }} />
        </div>

        <div
          className="playhead"
          style={{ left: HEAD_WIDTH + time * zoom, height: "100%" }}
        >
          <b />
        </div>
      </div>
    </div>
  );
}

function AddTrackButton({
  kind,
  onAdd,
}: {
  kind: TrackKind;
  onAdd: (kind: TrackKind) => string;
}) {
  const Icon = kind === "video" ? VideoIcon : kind === "audio" ? Music2 : Type;
  const label =
    kind === "video"
      ? "영상 트랙 추가"
      : kind === "audio"
        ? "오디오 트랙 추가"
        : "자막 트랙 추가";
  return (
    <button onClick={() => onAdd(kind)} title={label} aria-label={label}>
      <Icon size={12} />
      <Plus size={9} />
    </button>
  );
}

function TrackHead({
  track,
  onPatch,
  onRemove,
}: {
  track: Track;
  onPatch: (patch: Partial<Track>) => void;
  onRemove: () => void;
}) {
  const Icon =
    track.kind === "video" ? VideoIcon : track.kind === "audio" ? Music2 : Type;
  const MuteIcon =
    track.kind === "audio"
      ? track.muted
        ? VolumeX
        : Volume2
      : track.muted
        ? EyeOff
        : Eye;

  return (
    <div
      className={`track-head kind-${track.kind}`}
      style={{ width: HEAD_WIDTH }}
    >
      <span className="th-icon">
        <Icon size={12} />
      </span>
      <span className="th-name">{track.name}</span>
      <span className="th-tools">
        <button
          className={track.muted ? "is-off" : ""}
          onClick={() => onPatch({ muted: !track.muted })}
          aria-label={track.kind === "audio" ? "음소거" : "숨기기"}
        >
          <MuteIcon size={12} />
        </button>
        <button
          className={track.locked ? "is-on" : ""}
          onClick={() => onPatch({ locked: !track.locked })}
          aria-label="트랙 잠금"
        >
          {track.locked ? <Lock size={12} /> : <LockOpen size={12} />}
        </button>
        <button className="is-danger" onClick={onRemove} aria-label="트랙 삭제">
          <Trash2 size={12} />
        </button>
      </span>
    </div>
  );
}

function ClipBox({
  clip,
  track,
  zoom,
  editor,
  selected,
  onDrag,
}: {
  clip: Clip;
  track: Track;
  zoom: number;
  editor: Editor;
  selected: boolean;
  onDrag: (event: React.PointerEvent, clip: Clip, mode: Drag["mode"]) => void;
}) {
  const asset = editor.assetFor(clip);
  const width = Math.max(12, clipLength(clip) * zoom);
  const label = clip.text
    ? clip.text.content.split("\n")[0]
    : (asset?.name ?? "클립");

  return (
    <div
      className={`clip kind-${track.kind} ${selected ? "is-selected" : ""}`}
      style={{ left: clip.at * zoom, width }}
      onPointerDown={event => onDrag(event, clip, "move")}
      role="button"
      tabIndex={0}
      aria-label={`${label} 클립`}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ")
          editor.setSelectedId(clip.id);
      }}
    >
      {track.kind === "video" && (
        <Filmstrip frames={asset?.frames ?? []} width={width} />
      )}
      {track.kind === "audio" && (
        <Waveform
          peaks={asset?.peaks ?? []}
          duration={asset?.duration ?? 1}
          from={clip.start}
          to={clip.end}
        />
      )}
      <span className="clip-label">
        {track.kind === "text" && <Type size={10} />}
        {label}
      </span>
      {clip.speed !== 1 && <span className="clip-badge">{clip.speed}x</span>}
      {track.kind === "audio" && clip.volume !== 1 && (
        <span className="clip-badge">{Math.round(clip.volume * 100)}%</span>
      )}
      <span
        className="clip-grip left"
        onPointerDown={event => onDrag(event, clip, "trim-start")}
        aria-hidden="true"
      />
      <span
        className="clip-grip right"
        onPointerDown={event => onDrag(event, clip, "trim-end")}
        aria-hidden="true"
      />
    </div>
  );
}

function Filmstrip({ frames, width }: { frames: string[]; width: number }) {
  if (frames.length === 0) return null;
  const tile = 52;
  const count = Math.max(1, Math.ceil(width / tile));
  return (
    <span className="filmstrip" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <i
          key={index}
          style={{ backgroundImage: `url(${frames[index % frames.length]})` }}
        />
      ))}
    </span>
  );
}

function Waveform({
  peaks,
  duration,
  from,
  to,
}: {
  peaks: number[];
  duration: number;
  from: number;
  to: number;
}) {
  if (peaks.length === 0 || duration <= 0) return null;
  const first = Math.floor((from / duration) * peaks.length);
  const last = Math.max(first + 2, Math.ceil((to / duration) * peaks.length));
  const slice = peaks.slice(first, Math.min(last, peaks.length));
  const span = Math.max(1, slice.length - 1);
  const top = slice.map(
    (peak, index) => `${(index / span) * 100},${50 - peak * 44}`
  );
  const bottom = slice
    .map((peak, index) => `${(index / span) * 100},${50 + peak * 44}`)
    .reverse();

  return (
    <svg
      className="waveform"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={[...top, ...bottom].join(" ")} />
    </svg>
  );
}
