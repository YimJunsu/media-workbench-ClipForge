/**
 * 음원 녹음·편집: a stacked multi-lane waveform editor.
 *
 * Every audio clip in the project gets its own lane on a shared time ruler, so
 * several songs, takes and recordings can be laid against each other and any of
 * them edited without leaving the view.
 */
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
  Gauge,
  Mic,
  Music4,
  Pause,
  Play,
  Plus,
  Lock,
  LockOpen,
  Scissors,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Editor } from "./useEditor";
import {
  Clip,
  MIN_CLIP,
  SNAP_SECONDS,
  Track,
  clipEnd,
  clipLength,
  clipsOn,
  formatTime,
  snap,
  snapPoints,
  tracksOfKind,
} from "./model";

const WAVE_HEAD = 168;

type Props = {
  editor: Editor;
  /** A ticking zoom request from the keyboard, handled in an effect. */
  zoomNudge?: { tick: number; way: -1 | 0 | 1 };
  onPickAudio: () => void;
};
type Drag = {
  clip: Clip;
  mode: "move" | "trim-start" | "trim-end";
  originX: number;
};

export default function AudioWorkspace({
  editor,
  zoomNudge,
  onPickAudio,
}: Props) {
  const {
    project,
    time,
    playing,
    toggle,
    seek,
    duration,
    selected,
    selectedIds,
    setSelectedId,
    toggleSelectId,
    removeClips,
    rippleDelete,
    patchClip,
    patchTrack,
    removeClip,
    removeTrack,
    addFiles,
    addTrack,
    splitAtPlayhead,
    commit,
    cutSilence,
    normalize,
    markBeats,
  } = editor;

  const [zoom, setZoom] = useState(64);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopMeterRef = useRef<() => void>(() => {});
  const lanesRef = useRef<HTMLDivElement>(null);
  const snapshot = useRef(project);
  const liveTime = useRef(time);
  snapshot.current = project;
  liveTime.current = time;

  const tracks = tracksOfKind(project, "audio");
  const asset = selected ? editor.assetFor(selected) : null;
  const isAudioClip = Boolean(
    selected && tracks.some(track => track.id === selected.trackId)
  );

  const span = Math.max(duration + 6, 20);
  const width = span * zoom;

  useEffect(() => () => stopMeterRef.current(), []);

  useEffect(() => {
    if (!zoomNudge?.tick) return;
    if (zoomNudge.way === 1) setZoom(value => Math.min(400, value * 1.5));
    else if (zoomNudge.way === -1) setZoom(value => Math.max(10, value / 1.5));
    else setZoom(duration > 0 ? Math.max(10, 880 / (duration + 4)) : 64);
    // Only the tick matters; the same direction twice must still fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomNudge?.tick]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const raw = (event.clientX - drag.originX) / zoom;
      const source = drag.clip;
      const points = snapPoints(snapshot.current, source.id, liveTime.current);
      const tolerance = SNAP_SECONDS * (60 / zoom) * 2;

      if (drag.mode === "move") {
        const at = Math.max(0, snap(source.at + raw, points, tolerance));
        commit(current => ({
          ...current,
          clips: current.clips.map(clip =>
            clip.id === source.id ? { ...clip, at } : clip
          ),
        }));
        return;
      }
      if (drag.mode === "trim-start") {
        const wantAt = snap(source.at + raw, points, tolerance);
        const start = Math.min(
          Math.max(0, source.start + (wantAt - source.at)),
          source.end - MIN_CLIP
        );
        commit(current => ({
          ...current,
          clips: current.clips.map(clip =>
            clip.id === source.id
              ? {
                  ...clip,
                  start,
                  at: Math.max(0, source.at + (start - source.start)),
                }
              : clip
          ),
        }));
        return;
      }
      const ceiling = snapshot.current.assets.find(
        item => item.id === source.assetId
      )?.duration;
      const wantEnd = snap(clipEnd(source) + raw, points, tolerance);
      const end = Math.max(
        source.start + MIN_CLIP,
        Math.min(
          source.start + (wantEnd - source.at),
          ceiling && ceiling > 0 ? ceiling : Infinity
        )
      );
      commit(current => ({
        ...current,
        clips: current.clips.map(clip =>
          clip.id === source.id ? { ...clip, end } : clip
        ),
      }));
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, zoom, commit]);

  const timeFromEvent = (clientX: number) => {
    const box = lanesRef.current;
    if (!box) return 0;
    const rect = box.getBoundingClientRect();
    return Math.max(
      0,
      (clientX - rect.left + box.scrollLeft - WAVE_HEAD) / zoom
    );
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      const context: AudioContext = new Ctx();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      const meter = () => {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const value = Math.abs(buffer[i] - 128) / 128;
          if (value > peak) peak = value;
        }
        setLevel(peak);
        frame = requestAnimationFrame(meter);
      };
      meter();

      const started = performance.now();
      const ticker = window.setInterval(
        () => setSeconds((performance.now() - started) / 1000),
        100
      );
      stopMeterRef.current = () => {
        cancelAnimationFrame(frame);
        window.clearInterval(ticker);
        void context.close();
        stream.getTracks().forEach(track => track.stop());
        setLevel(0);
      };

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = event => chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        stopMeterRef.current();
        stopMeterRef.current = () => {};
        const type = recorder.mimeType || "audio/webm";
        const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
        const file = new File(
          [new Blob(chunksRef.current, { type })],
          `녹음 ${stamp}.webm`,
          {
            type,
          }
        );
        setRecording(false);
        setSeconds(0);
        await addFiles([file]);
        toast.success("녹음을 오디오 트랙에 넣었습니다.");
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error(
        "마이크를 쓸 수 없습니다. 주소창의 자물쇠 아이콘에서 마이크를 허용해 주세요."
      );
    }
  };

  return (
    <div className="workspace audio-workspace">
      <section className="wave-area">
        <div className="wave-bar">
          <span className="mb-title">
            <Music4 size={13} /> 파형 편집기
          </span>
          <button className="mini" onClick={onPickAudio}>
            <Plus size={13} /> 음원 추가
          </button>
          <button className="mini" onClick={() => addTrack("audio")}>
            <Plus size={13} /> 트랙 추가
          </button>
          <i className="bar-split" />
          <button
            className="mini"
            onClick={() => {
              if (!splitAtPlayhead())
                toast.error("재생 헤드를 클립 안쪽으로 옮긴 뒤 나누세요.");
            }}
          >
            <Scissors size={13} /> 나누기
          </button>
          <button
            className="mini"
            onClick={() => removeClips(selectedIds)}
            disabled={selectedIds.length === 0}
            title="Delete"
          >
            <Trash2 size={13} /> 삭제
            {selectedIds.length > 1 && <em> {selectedIds.length}</em>}
          </button>
          <button
            className="mini"
            onClick={() => {
              const gone = rippleDelete(selectedIds);
              if (gone > 0)
                toast.success(`${gone}개를 지우고 뒤를 당겼습니다.`);
            }}
            disabled={selectedIds.length === 0}
            title="Shift+Delete — 지운 자리를 남기지 않습니다"
          >
            <Trash2 size={13} /> 지우고 당기기
          </button>
          <i className="bar-split" />
          <button
            className="mini icon"
            onClick={() => setZoom(value => Math.max(10, value / 1.5))}
            aria-label="축소"
          >
            <ZoomOut size={13} />
          </button>
          <button
            className="mini icon"
            onClick={() => setZoom(value => Math.min(400, value * 1.5))}
            aria-label="확대"
          >
            <ZoomIn size={13} />
          </button>
          <span className="bar-hint">
            트랙마다 파형이 따로 그려집니다. 아무 파형이나 끌어 옮기고
            가장자리로 자르세요
          </span>
        </div>

        <div className="wave-body" ref={lanesRef}>
          <div
            className="wave-grid"
            style={{ width: WAVE_HEAD + width }}
            onPointerDown={event => {
              const target = event.target as HTMLElement;
              if (target.closest(".wave-clip") || target.closest(".wave-head"))
                return;
              setSelectedId(null);
              seek(timeFromEvent(event.clientX));
            }}
          >
            <div
              className="wave-ruler-row"
              style={{ width: WAVE_HEAD + width }}
            >
              <div className="wave-corner" style={{ width: WAVE_HEAD }}>
                {formatTime(time, true)}
              </div>
              <div className="wave-ruler" style={{ width }}>
                {Array.from({
                  length: Math.ceil(span / rulerStep(zoom)) + 1,
                }).map((_, index) => (
                  <span
                    key={index}
                    style={{ left: index * rulerStep(zoom) * zoom }}
                  >
                    {formatTime(index * rulerStep(zoom))}
                  </span>
                ))}
              </div>
            </div>

            {tracks.map(track => (
              <div className="wave-row" key={track.id}>
                <div className="wave-head" style={{ width: WAVE_HEAD }}>
                  <span className="wh-name">{track.name}</span>
                  <span className="wh-tools">
                    <button
                      className={track.muted ? "is-off" : ""}
                      onClick={() =>
                        patchTrack(track.id, { muted: !track.muted })
                      }
                      aria-label="음소거"
                    >
                      {track.muted ? (
                        <VolumeX size={12} />
                      ) : (
                        <Volume2 size={12} />
                      )}
                    </button>
                    <button
                      className={track.locked ? "is-on" : ""}
                      onClick={() =>
                        patchTrack(track.id, { locked: !track.locked })
                      }
                      aria-label="트랙 잠금"
                    >
                      {track.locked ? (
                        <Lock size={12} />
                      ) : (
                        <LockOpen size={12} />
                      )}
                    </button>
                    <button
                      className="is-danger"
                      onClick={() => removeTrack(track.id)}
                      aria-label="트랙 삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
                <div
                  className={`wave-lane ${track.muted ? "is-muted" : ""} ${track.locked ? "is-locked" : ""}`}
                  data-track={track.id}
                  data-kind="audio"
                  style={{ width }}
                >
                  {clipsOn(project, track.id).map(clip => (
                    <WaveClip
                      key={clip.id}
                      clip={clip}
                      zoom={zoom}
                      editor={editor}
                      selected={selectedIds.includes(clip.id)}
                      onDrag={(event, mode) => {
                        if (track.locked) return;
                        event.stopPropagation();
                        event.preventDefault();
                        // Ctrl/Shift picks without dragging, same as the
                        // video timeline, so Delete can take several at once.
                        if (event.ctrlKey || event.metaKey || event.shiftKey) {
                          toggleSelectId(clip.id);
                          return;
                        }
                        setSelectedId(clip.id);
                        setDrag({ clip, mode, originX: event.clientX });
                      }}
                    />
                  ))}
                  {clipsOn(project, track.id).length === 0 && (
                    <p className="lane-hint">이 트랙은 비어 있습니다</p>
                  )}
                </div>
              </div>
            ))}

            <div className="wave-row add-row">
              <button
                className="wave-head is-add"
                style={{ width: WAVE_HEAD }}
                onClick={() => addTrack("audio")}
              >
                <Plus size={13} /> 트랙 추가
              </button>
              <div className="wave-lane is-ghost" style={{ width }} />
            </div>

            <div
              className="wave-playhead"
              style={{ left: WAVE_HEAD + time * zoom }}
            >
              <b />
            </div>
          </div>
        </div>

        <div className="transport">
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
          <span className="timecode">
            {formatTime(time, true)} <i>/</i> {formatTime(duration, true)}
          </span>
        </div>
      </section>

      <aside className="panel inspector">
        <div className="panel-title">
          <h2>녹음</h2>
        </div>
        <button
          className={`record-button ${recording ? "is-live" : ""}`}
          onClick={() =>
            recording ? recorderRef.current?.stop() : startRecording()
          }
        >
          {recording ? (
            <Square size={14} fill="currentColor" />
          ) : (
            <Mic size={16} />
          )}
          {recording
            ? `녹음 중 ${seconds.toFixed(1)}초 · 멈추기`
            : "새 녹음 시작"}
        </button>
        <div className="meter" aria-hidden="true">
          {Array.from({ length: 26 }).map((_, index) => (
            <i key={index} className={level * 26 > index ? "is-lit" : ""} />
          ))}
        </div>
        <p className="meter-label">
          입력 레벨 {recording ? `${Math.round(level * 100)}%` : "대기 중"}
        </p>

        <div className="panel-title stacked">
          <h2>선택한 파형</h2>
        </div>
        {!isAudioClip || !selected ? (
          <p className="panel-empty">파형을 하나 고르면 여기에서 조절합니다.</p>
        ) : (
          <div className="fields">
            <div className="field-head">
              <strong>{asset?.name ?? "오디오"}</strong>
              <small>{formatTime(clipLength(selected), true)}</small>
            </div>
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
                  patchClip(selected.id, { fadeIn: Number(event.target.value) })
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
            <div className="field readout">
              <span>시작 위치</span>
              <b>{formatTime(selected.at, true)}</b>
            </div>
            <div className="field readout">
              <span>사용 구간</span>
              <b>
                {formatTime(selected.start, true)} —{" "}
                {formatTime(selected.end, true)}
              </b>
            </div>
            <p className="group-title">다듬기</p>
            <button
              className="wide-button"
              onClick={() => {
                const { removed, saved } = cutSilence(selected.id);
                if (removed > 0)
                  toast.success(
                    `무음 ${removed}군데를 잘라 ${saved.toFixed(1)}초 줄였습니다.`
                  );
                else toast.error("잘라낼 만한 무음 구간을 찾지 못했습니다.");
              }}
            >
              <Scissors size={13} /> 무음 자동 컷
            </button>
            <button
              className="wide-button"
              onClick={() => {
                const gain = normalize(selected.id);
                if (gain > 0)
                  toast.success(
                    `볼륨을 ${Math.round(gain * 100)}%로 맞췄습니다.`
                  );
                else toast.error("소리를 분석하지 못했습니다.");
              }}
            >
              <Gauge size={13} /> 볼륨 자동 맞춤
            </button>
            <button
              className="wide-button"
              onClick={() => {
                const found = markBeats(selected.id);
                if (found > 0) toast.success(`비트 ${found}개를 찍었습니다.`);
                else toast.error("비트를 찾지 못했습니다.");
              }}
            >
              <Activity size={13} /> 비트 찍기
            </button>
            <label className="field">
              <span>
                목소리에 맞춰 낮추기 <b>{Math.round(selected.duck * 100)}%</b>
              </span>
              <input
                type="range"
                min={0}
                max={90}
                value={Math.round(selected.duck * 100)}
                onChange={event =>
                  patchClip(selected.id, {
                    duck: Number(event.target.value) / 100,
                  })
                }
              />
            </label>
            <p className="panel-note">
              다른 트랙에서 소리가 나는 동안 이 클립만 자동으로 작아집니다.
            </p>

            <div className="split-row">
              <button onClick={() => editor.duplicateClip(selected.id)}>
                복제
              </button>
              <button
                className="danger"
                onClick={() => removeClip(selected.id)}
              >
                삭제
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function rulerStep(zoom: number) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  return steps.find(value => value * zoom >= 74) ?? steps[steps.length - 1];
}

function WaveClip({
  clip,
  zoom,
  editor,
  selected,
  onDrag,
}: {
  clip: Clip;
  zoom: number;
  editor: Editor;
  selected: boolean;
  onDrag: (event: React.PointerEvent, mode: Drag["mode"]) => void;
}) {
  const asset = editor.assetFor(clip);
  const width = Math.max(14, clipLength(clip) * zoom);
  const peaks = asset?.peaks ?? [];
  const duration = asset?.duration ?? 1;

  const first = Math.floor((clip.start / duration) * peaks.length);
  const last = Math.max(
    first + 2,
    Math.ceil((clip.end / duration) * peaks.length)
  );
  const slice = peaks.slice(first, Math.min(last, peaks.length));
  const BARS = Math.max(40, Math.min(600, Math.floor(width / 2)));
  const stride = slice.length / BARS;
  const bars =
    slice.length <= BARS
      ? slice
      : Array.from({ length: BARS }, (_, index) => {
          let peak = 0;
          for (
            let i = Math.floor(index * stride);
            i < Math.floor((index + 1) * stride);
            i += 1
          ) {
            if (slice[i] > peak) peak = slice[i];
          }
          return peak;
        });
  const span = Math.max(1, bars.length - 1);

  return (
    <div
      className={`wave-clip ${selected ? "is-selected" : ""}`}
      style={{ left: clip.at * zoom, width }}
      onPointerDown={event => onDrag(event, "move")}
      role="button"
      tabIndex={0}
      aria-label={`${asset?.name ?? "오디오"} 파형`}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ")
          editor.setSelectedId(clip.id);
      }}
    >
      <span className="wc-name">{asset?.name ?? "오디오"}</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="50" x2="100" y2="50" className="wc-axis" />
        {bars.map((peak, index) => (
          <line
            key={index}
            x1={(index / span) * 100}
            x2={(index / span) * 100}
            y1={50 - Math.max(peak, 0.012) * 42}
            y2={50 + Math.max(peak, 0.012) * 42}
            className="wc-bar"
          />
        ))}
      </svg>
      {clip.fadeIn > 0 && (
        <span
          className="fade left"
          style={{
            width: `${Math.min(100, (clip.fadeIn / clipLength(clip)) * 100)}%`,
          }}
        />
      )}
      {clip.fadeOut > 0 && (
        <span
          className="fade right"
          style={{
            width: `${Math.min(100, (clip.fadeOut / clipLength(clip)) * 100)}%`,
          }}
        />
      )}
      <span
        className="clip-grip left"
        onPointerDown={event => onDrag(event, "trim-start")}
      />
      <span
        className="clip-grip right"
        onPointerDown={event => onDrag(event, "trim-end")}
      />
    </div>
  );
}
