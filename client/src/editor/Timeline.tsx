/**
 * Multi-track timeline.
 *
 * One scroll container holds everything. The ruler is sticky to the top and the
 * track heads are sticky to the left, so scrolling down keeps the time ruler in
 * view and scrolling sideways keeps the track names in view — and the scroll
 * stays inside this box instead of moving the panels around it.
 *
 * Selection behaves the way an NLE's does: click one clip, ctrl/shift-click to
 * add, drag a box across empty lane to sweep several, and every edit acts on
 * the whole selection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Music2,
  Plus,
  Scissors,
  SkipBack,
  Trash2,
  Type,
  Video as VideoIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
/** Pointer travel before an empty-lane press turns into a selection box. */
const SWEEP_SLOP = 5;

type Drag = {
  clip: Clip;
  /** Every clip moving with this one, captured at press time. */
  group: Clip[];
  mode: "move" | "trim-start" | "trim-end";
  originX: number;
};

type Sweep = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  live: boolean;
};

export default function Timeline({
  editor,
  zoom,
  snapBeats = true,
}: {
  editor: Editor;
  zoom: number;
  snapBeats?: boolean;
}) {
  const {
    project,
    time,
    seek,
    selectedIds,
    setSelectedId,
    toggleSelectId,
    selectMany,
    clearSelection,
    commit,
    duration,
    patchTrack,
    removeTrack,
    addTrack,
  } = editor;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Whether the current press has actually moved anything yet. */
  const dragMoved = useRef(false);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const sweepRef = useRef<Sweep | null>(null);
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
  // Beat lines get dense fast. Past a certain count they read as a grey wash,
  // so they are thinned rather than drawn on top of one another.
  const gridStride = Math.max(
    1,
    Math.ceil(project.markers.length / Math.max(40, laneWidth / 12))
  );

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
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();

    // An additive click picks; it does not start a drag.
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      toggleSelectId(clip.id);
      return;
    }

    // Dragging a clip that is already part of a selection moves the whole
    // selection; dragging any other clip narrows the selection to it first.
    const inSelection = selectedIds.includes(clip.id);
    const ids = inSelection ? selectedIds : [clip.id];
    if (!inSelection) setSelectedId(clip.id);

    const locked = new Set(
      project.tracks.filter(item => item.locked).map(item => item.id)
    );
    const group =
      mode === "move"
        ? project.clips.filter(
            item => ids.includes(item.id) && !locked.has(item.trackId)
          )
        : [clip];
    dragMoved.current = false;
    setDrag({ clip, group, mode, originX: event.clientX });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const raw = (event.clientX - drag.originX) / zoom;
      if (Math.abs(event.clientX - drag.originX) > 2) dragMoved.current = true;
      const source = drag.clip;
      const points = snapPoints(
        snapshot.current,
        drag.group.map(item => item.id),
        liveTime.current,
        snapBeats
      );
      const tolerance = SNAP_SECONDS * (60 / zoom) * 2;

      if (drag.mode === "move") {
        const wanted = Math.max(0, snap(source.at + raw, points, tolerance));
        // The snapped move of the clip under the cursor is applied to every
        // clip in the group, so their spacing survives the drag intact.
        let shift = wanted - source.at;
        const floor = drag.group.reduce(
          (least, item) => Math.min(least, item.at),
          Infinity
        );
        if (floor + shift < 0) shift = -floor;

        // A single clip can also change lane; a group stays on its rows,
        // because there is no one row to drop several clips onto.
        let trackId = source.trackId;
        if (drag.group.length === 1) {
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
          trackId = row?.dataset.track ?? source.trackId;
        }

        const moves = new Map(
          drag.group.map(item => [item.id, Math.max(0, item.at + shift)])
        );
        commit(current => ({
          ...current,
          clips: current.clips.map(clip => {
            const at = moves.get(clip.id);
            if (at === undefined) return clip;
            return clip.id === source.id
              ? { ...clip, at, trackId }
              : { ...clip, at };
          }),
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

    const onUp = () => {
      // A press on an already-selected clip that never travelled is a plain
      // click: narrow the selection to it, the way an NLE does on mouse-up.
      if (!dragMoved.current && drag.group.length > 1) {
        setSelectedId(drag.clip.id);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, zoom, commit, snapBeats, setSelectedId]);

  /** Box-select over empty lane. A press that never travels is still a seek. */
  useEffect(() => {
    if (!sweep) return;
    const box = scrollRef.current;

    // The live box is kept in a ref as well as in state. A state updater is
    // allowed to compute the next box, but it must not reach out and set other
    // components' state, so the selection is decided out here instead.
    const onMove = (event: PointerEvent) => {
      const current = sweepRef.current;
      if (!current) return;
      const travelled =
        Math.abs(event.clientX - current.fromX) > SWEEP_SLOP ||
        Math.abs(event.clientY - current.fromY) > SWEEP_SLOP;
      const next = {
        ...current,
        toX: event.clientX,
        toY: event.clientY,
        live: current.live || travelled,
      };
      sweepRef.current = next;
      setSweep(next);
    };

    const onUp = (event: PointerEvent) => {
      const current = sweepRef.current;
      sweepRef.current = null;
      setSweep(null);
      if (!current) return;

      if (!current.live) {
        clearSelection();
        seek(timeFromEvent(event.clientX));
        return;
      }
      if (!box) return;

      // Turn the screen rectangle into a time range plus a set of rows.
      const rect = box.getBoundingClientRect();
      const toTime = (clientX: number) =>
        Math.max(0, (clientX - rect.left + box.scrollLeft - HEAD_WIDTH) / zoom);
      const from = Math.min(toTime(current.fromX), toTime(event.clientX));
      const to = Math.max(toTime(current.fromX), toTime(event.clientX));
      const top = Math.min(current.fromY, event.clientY);
      const bottom = Math.max(current.fromY, event.clientY);
      const rows = Array.from(box.querySelectorAll<HTMLElement>("[data-track]"))
        .filter(node => {
          const lane = node.getBoundingClientRect();
          return lane.bottom >= top && lane.top <= bottom;
        })
        .map(node => node.dataset.track!);

      const locked = new Set(
        snapshot.current.tracks
          .filter(track => track.locked)
          .map(track => track.id)
      );
      const hits = snapshot.current.clips
        .filter(
          clip =>
            rows.includes(clip.trackId) &&
            !locked.has(clip.trackId) &&
            clipEnd(clip) > from &&
            clip.at < to
        )
        .map(clip => clip.id);
      selectMany(hits);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [sweep, zoom, seek, timeFromEvent, selectMany, clearSelection]);

  const sweepBox = (() => {
    if (!sweep?.live || !scrollRef.current) return null;
    const rect = scrollRef.current.getBoundingClientRect();
    return {
      left: Math.min(sweep.fromX, sweep.toX) - rect.left,
      top: Math.min(sweep.fromY, sweep.toY) - rect.top,
      width: Math.abs(sweep.toX - sweep.fromX),
      height: Math.abs(sweep.toY - sweep.fromY),
    };
  })();

  return (
    <div
      className="timeline"
      ref={scrollRef}
      onPointerDown={event => {
        const target = event.target as HTMLElement;
        if (target.closest(".clip") || target.closest(".track-head")) return;
        if (target.closest(".add-row")) return;
        if (event.button !== 0) return;
        // The ruler is for scrubbing; the lanes are for sweeping a selection.
        if (target.closest(".ruler-row")) {
          clearSelection();
          seek(timeFromEvent(event.clientX));
          return;
        }
        const started: Sweep = {
          fromX: event.clientX,
          fromY: event.clientY,
          toX: event.clientX,
          toY: event.clientY,
          live: false,
        };
        sweepRef.current = started;
        setSweep(started);
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

        {project.markers.length > 0 && (
          <div
            className="beat-grid"
            style={{ left: HEAD_WIDTH, width: laneWidth }}
            aria-hidden="true"
          >
            {project.markers
              .filter((_, index) => index % gridStride === 0)
              .map(at => (
                <i key={at} style={{ left: at * zoom }} />
              ))}
          </div>
        )}

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
                  selected={selectedIds.includes(clip.id)}
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

      {sweepBox && (
        <div
          className="sweep-box"
          style={{
            left: sweepBox.left,
            top: sweepBox.top,
            width: sweepBox.width,
            height: sweepBox.height,
          }}
          aria-hidden="true"
        />
      )}
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
  const label = clip.viz
    ? "파형 효과"
    : clip.text
      ? clip.text.content.split("\n")[0]
      : (asset?.name ?? "클립");
  /** Right-click acts on the whole selection when this clip is part of it. */
  const targets = selected ? editor.selectedIds : [clip.id];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`clip kind-${track.kind} ${selected ? "is-selected" : ""}`}
          style={{ left: clip.at * zoom, width }}
          onPointerDown={event => onDrag(event, clip, "move")}
          onContextMenu={() => {
            if (!selected) editor.setSelectedId(clip.id);
          }}
          role="button"
          tabIndex={0}
          aria-label={`${label} 클립`}
          aria-pressed={selected}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              editor.setSelectedId(clip.id);
            }
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
          {clip.speed !== 1 && (
            <span className="clip-badge">{clip.speed}x</span>
          )}
          {track.kind === "audio" && clip.volume !== 1 && (
            <span className="clip-badge">{Math.round(clip.volume * 100)}%</span>
          )}
          {clip.text?.beat && clip.text.beat.react !== "none" && (
            <span className="clip-badge is-beat">비트</span>
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
      </ContextMenuTrigger>

      <ContextMenuContent className="w-60">
        <ContextMenuItem onSelect={() => editor.splitAtPlayhead()}>
          <Scissors size={13} /> 재생 위치에서 나누기
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.seek(clip.at)}>
          <SkipBack size={13} /> 클립 처음으로 이동
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => editor.copyClips(targets)}>
          <Copy size={13} /> 복사
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.cutClips(targets)}>
          잘라내기
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.pasteClips()}>
          재생 위치에 붙여넣기
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.duplicateClips(targets)}>
          <Copy size={13} /> 복제
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => editor.addMarker(clip.at)}>
          이 클립 앞에 마커 찍기
          <ContextMenuShortcut>M</ContextMenuShortcut>
        </ContextMenuItem>
        {track.kind !== "text" && (
          <ContextMenuItem onSelect={() => editor.markBeats(clip.id)}>
            이 클립에서 비트 찾기
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => editor.removeClips(targets)}
        >
          <Trash2 size={13} /> 삭제
          <ContextMenuShortcut>Delete</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => editor.rippleDelete(targets)}
        >
          <Trash2 size={13} /> 삭제하고 뒤 당기기
          <ContextMenuShortcut>Shift+Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
