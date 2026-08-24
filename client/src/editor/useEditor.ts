/**
 * Editor store: multi-track project state with undo history, the playback
 * engine, and the preview audio graph.
 *
 * Clock ownership matters here. While a real video clip is on screen and
 * playing cleanly, that element IS the clock and everything else follows it —
 * a video file cannot be dragged along by an outside timer without stalling its
 * decoder. A wall clock covers photos, captions and gaps, where nothing is
 * decoding.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Asset,
  AudioFx,
  Clip,
  Color,
  Cue,
  FrameSize,
  MIN_CLIP,
  PHOTO_HOLD,
  Project,
  TEXT_HOLD,
  TextStyle,
  Track,
  TrackKind,
  Transform,
  Transition,
  appendAt,
  assetOf,
  audibleClips,
  clipEnd,
  clipLength,
  clipsOn,
  covers,
  defaultText,
  extractFrames,
  extractPeaks,
  fadeGain,
  findBeats,
  findSilence,
  kindOf,
  makeClip,
  makeId,
  newProject,
  peakAt,
  projectDuration,
  sourceTime,
  tracksOfKind,
  visibleVideo,
} from "./model";
import { impulse } from "./exportMp4";

const DRIFT = 0.28;
/** How far a smoothly playing element may wander before we step in. */
const PLAYING_DRIFT = 0.9;

/**
 * Seeking a playing element flushes its decoder, which shows up as a black
 * frame. So while an element is playing cleanly we leave it alone and only
 * realign on an explicit seek, or when it has drifted far enough that it must
 * have lost its place.
 */
function shouldRealign(
  element: HTMLMediaElement,
  want: number,
  force: boolean
) {
  if (force) return true;
  if (element.seeking) return false;
  const smooth = !element.paused && element.readyState >= 3;
  const off = Math.abs(element.currentTime - want);
  return off > (smooth ? PLAYING_DRIFT : DRIFT);
}

export type Editor = ReturnType<typeof useEditor>;

type FxNodes = {
  source: MediaElementAudioSourceNode;
  tail: AudioNode;
  key: string;
};

export function useEditor() {
  const [project, setProject] = useState<Project>(newProject);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [importing, setImporting] = useState(0);

  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const timeRef = useRef(0);
  const projectRef = useRef(project);

  const audioCtx = useRef<AudioContext | null>(null);
  const transportSig = useRef("");
  const fxNodes = useRef(new Map<string, FxNodes>());

  // While the frame loop is running it owns timeRef; letting a render write the
  // throttled state value back would drag the clock backwards every render.
  if (!playing) timeRef.current = time;
  projectRef.current = project;

  const duration = useMemo(() => projectDuration(project), [project]);
  const selected = project.clips.find(clip => clip.id === selectedId) ?? null;

  useEffect(() => {
    for (const asset of project.assets) {
      if (asset.kind !== "photo" || images.current.has(asset.id)) continue;
      const image = new Image();
      image.src = asset.url;
      images.current.set(asset.id, image);
    }
  }, [project.assets]);

  const videoFor = useCallback(
    (clip: Clip) => videoRefs.current.get(clip.trackId) ?? null,
    []
  );
  const imageFor = useCallback(
    (assetId: string) => images.current.get(assetId) ?? null,
    []
  );

  // ------------------------------------------------------------------ history

  const commit = useCallback(
    (next: Project | ((current: Project) => Project)) => {
      setProject(current => {
        const value = typeof next === "function" ? next(current) : next;
        if (value === current) return current;
        setPast(stack => [...stack.slice(-59), current]);
        setFuture([]);
        return value;
      });
    },
    []
  );

  const undo = useCallback(() => {
    setPast(stack => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setProject(current => {
        setFuture(forward => [current, ...forward].slice(0, 60));
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture(stack => {
      if (stack.length === 0) return stack;
      const next = stack[0];
      setProject(current => {
        setPast(back => [...back, current]);
        return next;
      });
      return stack.slice(1);
    });
  }, []);

  // ------------------------------------------------------------------- tracks

  const addTrack = useCallback(
    (kind: TrackKind) => {
      // Ids are made out here: React runs updaters later, so an id assigned
      // inside one is not available to the caller.
      const created = makeId(kind);
      commit(current => {
        const count = tracksOfKind(current, kind).length + 1;
        const label =
          kind === "video" ? "영상" : kind === "audio" ? "오디오" : "자막";
        const track: Track = {
          id: created,
          kind,
          name: `${label} ${count}`,
          muted: false,
          locked: false,
        };
        // A new row goes on TOP of its own group, the way V2 sits above V1 in a
        // real NLE — otherwise an overlay lands underneath and never shows.
        const order: TrackKind[] = ["text", "video", "audio"];
        const first = current.tracks.findIndex(item => item.kind === kind);
        const tracks =
          first >= 0
            ? [
                ...current.tracks.slice(0, first),
                track,
                ...current.tracks.slice(first),
              ]
            : [...current.tracks, track].sort(
                (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
              );
        return { ...current, tracks };
      });
      return created;
    },
    [commit]
  );

  const patchTrack = useCallback(
    (id: string, patch: Partial<Track>) => {
      commit(current => ({
        ...current,
        tracks: current.tracks.map(track =>
          track.id === id ? { ...track, ...patch } : track
        ),
      }));
    },
    [commit]
  );

  const removeTrack = useCallback(
    (id: string) => {
      commit(current => {
        if (current.tracks.length <= 1) return current;
        return {
          ...current,
          tracks: current.tracks.filter(track => track.id !== id),
          clips: current.clips.filter(clip => clip.trackId !== id),
        };
      });
    },
    [commit]
  );

  // ------------------------------------------------------------------- import

  const addFiles = useCallback(
    async (files: File[], targetTrackId?: string) => {
      const usable = files.filter(file => kindOf(file));
      if (usable.length === 0) return { added: 0, rejected: files.length };
      setImporting(count => count + usable.length);

      for (const file of usable) {
        const kind = kindOf(file)!;
        const url = URL.createObjectURL(file);
        let asset: Asset = {
          id: makeId("asset"),
          name: file.name,
          kind,
          url,
          duration: 0,
          frames: [],
          peaks: [],
          peak: 0,
        };

        if (kind === "video") {
          const { duration: length, frames } = await extractFrames(url);
          // Footage carries its own sound. Decoding it here is what lets the
          // silence cut and the ducking work on a talking-head clip.
          const sound = await extractPeaks(url, 900);
          asset = {
            ...asset,
            duration: length,
            frames,
            peaks: sound.peaks,
            peak: sound.peak,
          };
        } else if (kind === "photo") {
          asset = { ...asset, duration: 0, frames: [url] };
        } else {
          const { duration: length, peaks, peak } = await extractPeaks(url);
          asset = { ...asset, duration: length || 30, peaks, peak };
        }

        commit(current => {
          const wanted: TrackKind = kind === "audio" ? "audio" : "video";
          const track =
            current.tracks.find(
              item => item.id === targetTrackId && item.kind === wanted
            ) ?? tracksOfKind(current, wanted)[0];
          if (!track) return current;
          const clip = makeClip({
            trackId: track.id,
            assetId: asset.id,
            end: kind === "photo" ? PHOTO_HOLD : asset.duration,
            at: appendAt(current, track.id),
          });
          return {
            ...current,
            assets: [...current.assets, asset],
            clips: [...current.clips, clip],
          };
        });
        setImporting(count => count - 1);
      }
      return { added: usable.length, rejected: files.length - usable.length };
    },
    [commit]
  );

  const addText = useCallback(
    (style: Partial<TextStyle> = {}) => {
      const created = makeId("clip");
      const fallbackTrack = makeId("text");
      commit(current => {
        let tracks = current.tracks;
        let track = tracksOfKind(current, "text")[0];
        if (!track) {
          track = {
            id: fallbackTrack,
            kind: "text",
            name: "자막 1",
            muted: false,
            locked: false,
          };
          tracks = [track, ...tracks];
        }
        const clip = makeClip({
          trackId: track.id,
          end: TEXT_HOLD,
          at: Math.max(0, timeRef.current),
        });
        return {
          ...current,
          tracks,
          clips: [
            ...current.clips,
            {
              ...clip,
              id: created,
              text: { ...defaultText("자막을 입력하세요"), ...style },
            },
          ],
        };
      });
      setSelectedId(created);
      return created;
    },
    [commit]
  );

  /** Turn a parsed .srt/.vtt into one caption clip per cue, timings intact. */
  const addSubtitles = useCallback(
    (cues: Cue[], style: Partial<TextStyle> = {}) => {
      if (cues.length === 0) return 0;
      const ids = cues.map(() => makeId("clip"));
      const fallbackTrack = makeId("text");
      commit(current => {
        let tracks = current.tracks;
        let track = tracksOfKind(current, "text")[0];
        if (!track) {
          track = {
            id: fallbackTrack,
            kind: "text",
            name: "자막 1",
            muted: false,
            locked: false,
          };
          tracks = [track, ...tracks];
        }
        const clips = cues.map((cue, index) => ({
          ...makeClip({
            trackId: track!.id,
            at: cue.start,
            end: Math.max(MIN_CLIP, cue.end - cue.start),
          }),
          id: ids[index],
          text: { ...defaultText(cue.text), ...style },
        }));
        return { ...current, tracks, clips: [...current.clips, ...clips] };
      });
      setSelectedId(ids[0]);
      return cues.length;
    },
    [commit]
  );

  // ------------------------------------------------------------- pro actions

  const setFrameSize = useCallback(
    (frame: FrameSize) => commit(current => ({ ...current, frame })),
    [commit]
  );

  const setMarkers = useCallback(
    (markers: number[]) =>
      commit(current => ({
        ...current,
        markers: markers.slice().sort((a, b) => a - b),
      })),
    [commit]
  );

  /**
   * Cut the quiet out of a clip and close the gaps — the pass that turns a
   * rambling take into a tight one. Splits the clip around every silence,
   * drops the silent pieces, then pulls the rest of the track left.
   */
  const cutSilence = useCallback(
    (
      clipId: string,
      options = { threshold: 0.07, minGap: 0.45, keep: 0.12 }
    ): { removed: number; saved: number } => {
      const current = projectRef.current;
      const clip = current.clips.find(item => item.id === clipId);
      const asset = clip ? assetOf(current, clip) : null;
      if (!clip || !asset || asset.peaks.length === 0)
        return { removed: 0, saved: 0 };

      const gaps = findSilence(asset.peaks, asset.duration, options).filter(
        span => span.to > clip.start && span.from < clip.end
      );
      if (gaps.length === 0) return { removed: 0, saved: 0 };

      // Everything that is NOT silence becomes a piece, in source time.
      const pieces: { from: number; to: number }[] = [];
      let cursor = clip.start;
      for (const gap of gaps) {
        const from = Math.max(cursor, clip.start);
        const to = Math.min(gap.from, clip.end);
        if (to - from > MIN_CLIP) pieces.push({ from, to });
        cursor = Math.max(cursor, gap.to);
      }
      if (clip.end - cursor > MIN_CLIP)
        pieces.push({ from: cursor, to: clip.end });
      if (pieces.length === 0) return { removed: 0, saved: 0 };

      const speed = clip.speed || 1;
      const before = clipLength(clip);
      const kept = pieces.reduce(
        (sum, piece) => sum + (piece.to - piece.from) / speed,
        0
      );
      const ids = pieces.map(() => makeId("clip"));

      commit(value => {
        const shift = before - kept;
        let at = clip.at;
        const rebuilt = pieces.map((piece, index) => {
          const made = {
            ...clip,
            id: ids[index],
            start: piece.from,
            end: piece.to,
            at,
          };
          at += (piece.to - piece.from) / speed;
          return made;
        });
        const clips = value.clips.flatMap(item => {
          if (item.id === clip.id) return rebuilt;
          // Close the hole for anything later on the same track.
          if (
            item.trackId === clip.trackId &&
            item.at >= clipEnd(clip) - 0.001
          ) {
            return [{ ...item, at: Math.max(0, item.at - shift) }];
          }
          return [item];
        });
        return { ...value, clips };
      });
      setSelectedId(ids[0]);
      return { removed: gaps.length, saved: before - kept };
    },
    [commit]
  );

  /** Put a marker on every beat found in a clip's audio. */
  const markBeats = useCallback(
    (clipId: string) => {
      const current = projectRef.current;
      const clip = current.clips.find(item => item.id === clipId);
      const asset = clip ? assetOf(current, clip) : null;
      if (!clip || !asset || asset.peaks.length === 0) return 0;

      const speed = clip.speed || 1;
      const beats = findBeats(asset.peaks, asset.duration)
        .filter(at => at >= clip.start && at <= clip.end)
        .map(at => Number((clip.at + (at - clip.start) / speed).toFixed(3)));
      if (beats.length === 0) return 0;
      commit(value => ({
        ...value,
        markers: Array.from(new Set([...value.markers, ...beats])).sort(
          (a, b) => a - b
        ),
      }));
      return beats.length;
    },
    [commit]
  );

  /** Split every clip that a marker falls inside — a montage cut to music. */
  const splitAtMarkers = useCallback(() => {
    const current = projectRef.current;
    if (current.markers.length === 0) return 0;
    let cuts = 0;
    const rebuilt: Clip[] = [];

    for (const clip of current.clips) {
      const inside = current.markers
        .filter(at => at > clip.at + MIN_CLIP && at < clipEnd(clip) - MIN_CLIP)
        .sort((a, b) => a - b);
      if (inside.length === 0) {
        rebuilt.push(clip);
        continue;
      }
      let head = clip;
      for (const at of inside) {
        const cut = sourceTime(head, at);
        rebuilt.push({ ...head, end: cut });
        head = { ...head, id: makeId("clip"), start: cut, at };
        cuts += 1;
      }
      rebuilt.push(head);
    }
    if (cuts === 0) return 0;
    commit(value => ({ ...value, clips: rebuilt }));
    return cuts;
  }, [commit]);

  /** Lift a clip so its loudest moment sits just under the ceiling. */
  const normalize = useCallback(
    (clipId: string, target = 0.89) => {
      const current = projectRef.current;
      const clip = current.clips.find(item => item.id === clipId);
      const asset = clip ? assetOf(current, clip) : null;
      if (!clip || !asset || asset.peak <= 0) return 0;
      const volume = Math.max(0.05, Math.min(4, target / asset.peak));
      commit(value => ({
        ...value,
        clips: value.clips.map(item =>
          item.id === clipId ? { ...item, volume } : item
        ),
      }));
      return volume;
    },
    [commit]
  );

  /** Live gain for a ducked clip: quiet it while any other source is loud. */
  const duckGain = useCallback((project: Project, clip: Clip, at: number) => {
    if (!clip.duck) return 1;
    let loudest = 0;
    for (const other of project.clips) {
      if (other.id === clip.id || !covers(other, at)) continue;
      const track = project.tracks.find(item => item.id === other.trackId);
      if (!track || track.muted || track.kind === "text") continue;
      const asset = assetOf(project, other);
      if (!asset || asset.peaks.length === 0) continue;
      loudest = Math.max(
        loudest,
        peakAt(asset, sourceTime(other, at)) * other.volume
      );
    }
    // Full duck once the other source is clearly present.
    const presence = Math.max(0, Math.min(1, (loudest - 0.06) / 0.22));
    return 1 - clip.duck * presence;
  }, []);

  /** Freeze the frame under the playhead and drop it in as a still. */
  const freezeFrame = useCallback(
    (canvas: HTMLCanvasElement | null, seconds = 1.5) => {
      const current = projectRef.current;
      const at = timeRef.current;
      if (!canvas) return false;
      const shot = visibleVideo(current, at);
      if (!shot) return false;

      const still = document.createElement("canvas");
      still.width = canvas.width;
      still.height = canvas.height;
      still.getContext("2d")?.drawImage(canvas, 0, 0);
      const url = still.toDataURL("image/jpeg", 0.92);

      const assetId = makeId("asset");
      const clipId = makeId("clip");
      commit(value => {
        const asset: Asset = {
          id: assetId,
          name: "정지 화면",
          kind: "photo",
          url,
          duration: 0,
          frames: [url],
          peaks: [],
          peak: 0,
        };
        const frozen: Clip = {
          ...makeClip({ trackId: shot.trackId, assetId, end: seconds, at }),
          id: clipId,
        };

        // Cut the shot open at the playhead and drop the still into the gap,
        // the way a freeze frame works in a real timeline — an overlay would
        // let the footage keep running underneath.
        const clips: Clip[] = [];
        for (const item of value.clips) {
          if (item.trackId !== shot.trackId) {
            clips.push(item);
            continue;
          }
          if (
            item.id === shot.id &&
            at > item.at + MIN_CLIP &&
            at < clipEnd(item) - MIN_CLIP
          ) {
            const cut = sourceTime(item, at);
            clips.push({ ...item, end: cut });
            clips.push({
              ...item,
              id: makeId("clip"),
              start: cut,
              at: at + seconds,
            });
          } else if (item.at >= at) {
            clips.push({ ...item, at: item.at + seconds });
          } else {
            clips.push(item);
          }
        }
        return {
          ...value,
          assets: [...value.assets, asset],
          clips: [...clips, frozen],
        };
      });
      setSelectedId(clipId);
      return true;
    },
    [commit]
  );

  // ------------------------------------------------------------------ editing

  const patchClip = useCallback(
    (id: string, patch: Partial<Clip>) => {
      commit(current => ({
        ...current,
        clips: current.clips.map(clip =>
          clip.id === id ? { ...clip, ...patch } : clip
        ),
      }));
    },
    [commit]
  );

  const patchText = useCallback(
    (id: string, patch: Partial<TextStyle>) => {
      commit(current => ({
        ...current,
        clips: current.clips.map(clip =>
          clip.id === id && clip.text
            ? { ...clip, text: { ...clip.text, ...patch } }
            : clip
        ),
      }));
    },
    [commit]
  );

  /**
   * Copy one caption's look onto every other caption, leaving each one's own
   * words alone. After importing an .srt this is the difference between styling
   * one caption and styling fifty.
   */
  const applyTextStyleToAll = useCallback(
    (id: string) => {
      // Counted out here, not inside the updater: React runs updaters later, so
      // a tally raised in there is still zero when the caller reads it.
      const current = projectRef.current;
      const source = current.clips.find(clip => clip.id === id)?.text;
      if (!source) return 0;
      const touched = current.clips.filter(
        clip => clip.text && clip.id !== id
      ).length;
      const { content: _ignored, ...look } = source;
      commit(value => ({
        ...value,
        clips: value.clips.map(clip =>
          clip.text && clip.id !== id
            ? { ...clip, text: { ...clip.text, ...look } }
            : clip
        ),
      }));
      return touched;
    },
    [commit]
  );

  const patchTransform = useCallback(
    (id: string, patch: Partial<Transform>) => {
      commit(current => ({
        ...current,
        clips: current.clips.map(clip =>
          clip.id === id
            ? { ...clip, transform: { ...clip.transform, ...patch } }
            : clip
        ),
      }));
    },
    [commit]
  );

  const patchColor = useCallback(
    (id: string, patch: Partial<Color>) => {
      commit(current => ({
        ...current,
        clips: current.clips.map(clip =>
          clip.id === id
            ? { ...clip, color: { ...clip.color, ...patch } }
            : clip
        ),
      }));
    },
    [commit]
  );

  const patchTransition = useCallback(
    (id: string, patch: Partial<Transition>) => {
      commit(current => ({
        ...current,
        clips: current.clips.map(clip =>
          clip.id === id
            ? { ...clip, transition: { ...clip.transition, ...patch } }
            : clip
        ),
      }));
    },
    [commit]
  );

  const patchFx = useCallback(
    (id: string, patch: Partial<AudioFx>) => {
      commit(current => ({
        ...current,
        clips: current.clips.map(clip =>
          clip.id === id ? { ...clip, fx: { ...clip.fx, ...patch } } : clip
        ),
      }));
    },
    [commit]
  );

  const removeClip = useCallback(
    (id: string) => {
      commit(current => ({
        ...current,
        clips: current.clips.filter(clip => clip.id !== id),
      }));
      setSelectedId(current => (current === id ? null : current));
    },
    [commit]
  );

  const duplicateClip = useCallback(
    (id: string) => {
      const created = makeId("clip");
      commit(current => {
        const source = current.clips.find(clip => clip.id === id);
        if (!source) return current;
        return {
          ...current,
          clips: [
            ...current.clips,
            { ...source, id: created, at: clipEnd(source) },
          ],
        };
      });
      setSelectedId(created);
    },
    [commit]
  );

  const splitAtPlayhead = useCallback(() => {
    const current = projectRef.current;
    const at = timeRef.current;
    const targets = current.clips.filter(
      clip => at > clip.at + MIN_CLIP && at < clipEnd(clip) - MIN_CLIP
    );
    if (targets.length === 0) return false;

    const newIds = new Map(targets.map(target => [target.id, makeId("clip")]));
    commit(value => {
      const clips: Clip[] = [];
      for (const clip of value.clips) {
        const fresh = newIds.get(clip.id);
        if (!fresh) {
          clips.push(clip);
          continue;
        }
        const cut = sourceTime(clip, at);
        clips.push(
          { ...clip, end: cut },
          { ...clip, id: fresh, start: cut, at }
        );
      }
      return { ...value, clips };
    });
    setSelectedId(Array.from(newIds.values()).pop() ?? null);
    return true;
  }, [commit]);

  // -------------------------------------------------------------- audio graph

  /** Route an element through its effect chain. One source node per element. */
  const wireFx = useCallback((clip: Clip, element: HTMLAudioElement) => {
    if (clip.fx.kind === "none" && !fxNodes.current.has(clip.id)) return;
    if (!audioCtx.current) {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      audioCtx.current = new Ctx();
    }
    const context = audioCtx.current!;
    const key = `${clip.fx.kind}:${clip.fx.amount.toFixed(2)}`;
    const existing = fxNodes.current.get(clip.id);
    if (existing?.key === key) return;

    let source = existing?.source;
    if (!source) {
      try {
        source = context.createMediaElementSource(element);
      } catch {
        return; // already routed; leave it be
      }
    }
    existing?.tail.disconnect();
    source.disconnect();

    const { kind, amount } = clip.fx;
    let tail: AudioNode = source;
    if (kind === "lowpass" || kind === "highpass") {
      const filter = context.createBiquadFilter();
      filter.type = kind;
      filter.frequency.value =
        kind === "lowpass" ? 320 + (1 - amount) * 9000 : 40 + amount * 2400;
      source.connect(filter);
      tail = filter;
    } else if (kind === "echo" || kind === "reverb") {
      const merge = context.createGain();
      const dry = context.createGain();
      const wet = context.createGain();
      dry.gain.value = 1 - amount * 0.5;
      wet.gain.value = amount;
      source.connect(dry).connect(merge);
      if (kind === "echo") {
        const delay = context.createDelay(2);
        delay.delayTime.value = 0.12 + amount * 0.38;
        const feedback = context.createGain();
        feedback.gain.value = Math.min(0.65, amount * 0.7);
        source.connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(wet).connect(merge);
      } else {
        const convolver = context.createConvolver();
        convolver.buffer = impulse(context, 1.1 + amount * 1.8);
        source.connect(convolver);
        convolver.connect(wet).connect(merge);
      }
      tail = merge;
    }
    tail.connect(context.destination);
    fxNodes.current.set(clip.id, { source, tail, key });
  }, []);

  // ----------------------------------------------------------------- playback

  const syncMedia = useCallback(
    (at: number, force: boolean) => {
      const current = projectRef.current;

      for (const track of current.tracks) {
        if (track.kind !== "video") continue;
        const element = videoRefs.current.get(track.id);
        if (!element) continue;
        const clip = clipsOn(current, track.id)
          .filter(item => covers(item, at))
          .pop();
        const asset = clip ? assetOf(current, clip) : null;

        if (clip && asset?.kind === "video") {
          // The element itself is the record of what it has loaded. A side map
          // could fall out of step and make us reassign src mid-playback, which
          // reloads the file, resets currentTime to 0 and blacks out the frame.
          if (element.getAttribute("src") !== asset.url) {
            element.src = asset.url;
          }
          element.playbackRate = clip.speed || 1;
          element.volume = clip.volume;
          element.muted = track.muted;
          const want = sourceTime(clip, at);
          if (shouldRealign(element, want, force)) {
            try {
              element.currentTime = want;
            } catch {
              /* not seekable yet */
            }
          }
        } else {
          if (!element.paused) element.pause();
          if (element.getAttribute("src")) element.removeAttribute("src");
        }
      }

      const live = new Set(audibleClips(current, at).map(clip => clip.id));
      for (const clip of current.clips) {
        const element = audioRefs.current.get(clip.id);
        if (!element) continue;
        if (live.has(clip.id)) {
          element.volume = Math.max(
            0,
            Math.min(
              1,
              clip.volume * fadeGain(clip, at) * duckGain(current, clip, at)
            )
          );
          wireFx(clip, element);
          const want = sourceTime(clip, at);
          if (shouldRealign(element, want, force)) {
            try {
              element.currentTime = want;
            } catch {
              /* not seekable yet */
            }
          }
        } else if (!element.paused) {
          element.pause();
        }
      }
    },
    [wireFx]
  );

  const seek = useCallback(
    (next: number) => {
      const clamped = Math.max(
        0,
        Math.min(next, projectDuration(projectRef.current) || 0)
      );
      timeRef.current = clamped;
      setTime(clamped);
      syncMedia(clamped, true);
    },
    [syncMedia]
  );

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let published = 0;

    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      const current = projectRef.current;
      const total = projectDuration(current);

      // A real video file cannot be dragged along by an outside clock. While one
      // is on screen and playing cleanly it becomes the clock instead, and the
      // wall clock only covers photos, captions and gaps.
      let next = timeRef.current + delta;
      const shot = visibleVideo(current, timeRef.current);
      const element = shot ? videoRefs.current.get(shot.trackId) : null;
      if (
        shot &&
        element &&
        assetOf(current, shot)?.kind === "video" &&
        !element.paused &&
        !element.seeking &&
        element.readyState >= 3
      ) {
        const fromVideo =
          shot.at + (element.currentTime - shot.start) / (shot.speed || 1);
        if (fromVideo > shot.at - 0.25 && fromVideo < clipEnd(shot) + 0.25) {
          next = fromVideo;
        }
      }

      if (next >= total) {
        timeRef.current = total;
        setTime(total);
        setPlaying(false);
        return;
      }

      timeRef.current = next;
      // The canvas reads timeRef every frame, so React only needs the value
      // often enough for the playhead and the timecode to look alive. Pushing
      // state 60 times a second re-renders the whole editor and starves both
      // this loop and the video decoder.
      if (now - published > 60) {
        published = now;
        setTime(next);
      }
      syncMedia(next, false);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, syncMedia]);

  useEffect(() => {
    if (!playing) syncMedia(timeRef.current, true);
  }, [project, playing, syncMedia]);

  useEffect(() => {
    const current = projectRef.current;
    // This runs on every published frame. Work out what ought to be playing and
    // bail unless that changed — calling play() again each frame interrupts the
    // decoder for no reason.
    const wanted = playing
      ? [
          ...current.tracks
            .filter(track => track.kind === "video")
            .map(track => {
              const clip = clipsOn(current, track.id)
                .filter(item => covers(item, timeRef.current))
                .pop();
              return clip && assetOf(current, clip)?.kind === "video"
                ? `v:${track.id}:${clip.id}`
                : `v:${track.id}:-`;
            }),
          ...audibleClips(current, timeRef.current).map(clip => `a:${clip.id}`),
        ].join("|")
      : "stopped";
    if (wanted === transportSig.current) return;
    transportSig.current = wanted;

    if (playing && audioCtx.current?.state === "suspended")
      void audioCtx.current.resume();

    for (const track of current.tracks) {
      if (track.kind !== "video") continue;
      const element = videoRefs.current.get(track.id);
      if (!element) continue;
      const clip = clipsOn(current, track.id)
        .filter(item => covers(item, timeRef.current))
        .pop();
      const showing = clip ? assetOf(current, clip)?.kind === "video" : false;
      if (playing && showing) void element.play().catch(() => undefined);
      else element.pause();
    }

    const live = new Set(
      audibleClips(current, timeRef.current).map(clip => clip.id)
    );
    for (const clip of current.clips) {
      const element = audioRefs.current.get(clip.id);
      if (!element) continue;
      if (playing && live.has(clip.id))
        void element.play().catch(() => undefined);
      else element.pause();
    }
  }, [playing, time, project]);

  const toggle = useCallback(() => {
    if (projectDuration(projectRef.current) <= 0) return;
    setPlaying(value => {
      if (
        !value &&
        timeRef.current >= projectDuration(projectRef.current) - 0.05
      ) {
        timeRef.current = 0;
        setTime(0);
        syncMedia(0, true);
      }
      return !value;
    });
  }, [syncMedia]);

  const registerAudio = useCallback(
    (id: string, element: HTMLAudioElement | null) => {
      if (element) audioRefs.current.set(id, element);
      else audioRefs.current.delete(id);
    },
    []
  );

  const registerVideo = useCallback(
    (trackId: string, element: HTMLVideoElement | null) => {
      if (element) videoRefs.current.set(trackId, element);
      else videoRefs.current.delete(trackId);
    },
    []
  );

  /**
   * Stable per-track ref callbacks. An inline arrow would be a new function
   * every render, so React would detach and reattach the element each time.
   */
  const videoRefCallbacks = useRef(
    new Map<string, (element: HTMLVideoElement | null) => void>()
  );
  const videoRefFor = useCallback(
    (trackId: string) => {
      let callback = videoRefCallbacks.current.get(trackId);
      if (!callback) {
        callback = element => registerVideo(trackId, element);
        videoRefCallbacks.current.set(trackId, callback);
      }
      return callback;
    },
    [registerVideo]
  );

  return {
    project,
    duration,
    selected,
    selectedId,
    setSelectedId,
    time,
    timeRef,
    playing,
    setPlaying,
    importing,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    videoRefs,
    audioRefs,
    registerAudio,
    registerVideo,
    videoRefFor,
    videoFor,
    imageFor,
    commit,
    undo,
    redo,
    addFiles,
    addText,
    addSubtitles,
    addTrack,
    patchTrack,
    removeTrack,
    patchClip,
    patchText,
    applyTextStyleToAll,
    patchTransform,
    patchColor,
    patchTransition,
    patchFx,
    removeClip,
    duplicateClip,
    splitAtPlayhead,
    setFrameSize,
    setMarkers,
    cutSilence,
    markBeats,
    splitAtMarkers,
    normalize,
    duckGain,
    freezeFrame,
    seek,
    toggle,
    syncMedia,
    assetFor: (clip: Clip) => assetOf(project, clip),
    lengthOf: clipLength,
  };
}
