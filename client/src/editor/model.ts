/**
 * Project model.
 *
 * Multi-track, like a real NLE: any number of video, audio and text tracks.
 * Every clip carries its own timeline position, so nothing is auto-packed and
 * clips can sit anywhere on their track. Tracks are stored in display order,
 * top row first; compositing walks them bottom-up so the top row wins.
 */

export type AssetKind = "video" | "photo" | "audio";
export type TrackKind = "video" | "audio" | "text";

export type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  url: string;
  duration: number;
  /** Filmstrip frames for video; the image itself for photos. */
  frames: string[];
  /** Normalised 0..1 peaks for audio. */
  peaks: number[];
  /** The file's real loudest sample, for normalising. */
  peak: number;
};

export type CaptionBack = "box" | "outline" | "shadow";
export type CaptionAnim = "none" | "pop" | "rise" | "type";

export const CAPTION_ANIMS: { id: CaptionAnim; name: string }[] = [
  { id: "none", name: "없음" },
  { id: "pop", name: "팝" },
  { id: "rise", name: "떠오르기" },
  { id: "type", name: "타이핑" },
];
export type CaptionFont = "sans" | "impact" | "serif" | "hand" | "mono";

/**
 * How a caption answers the music. `beat` fires on every marker on the
 * timeline; `level` follows how loud the sound actually is right now.
 */
export type BeatReact =
  | "none"
  | "pop"
  | "bounce"
  | "shake"
  | "glow"
  | "flash"
  | "wobble"
  | "jitter";

export const BEAT_REACTS: { id: BeatReact; name: string; hint: string }[] = [
  { id: "none", name: "없음", hint: "가만히 있습니다" },
  { id: "pop", name: "팝", hint: "비트마다 커졌다 돌아옵니다" },
  { id: "bounce", name: "바운스", hint: "비트마다 위로 튑니다" },
  { id: "shake", name: "흔들기", hint: "비트마다 좌우로 떨립니다" },
  { id: "glow", name: "글로우", hint: "비트마다 빛이 번집니다" },
  { id: "flash", name: "컬러 플래시", hint: "비트마다 글자색이 바뀝니다" },
  { id: "wobble", name: "기울임", hint: "비트마다 좌우로 기웁니다" },
  { id: "jitter", name: "지터", hint: "비트마다 사방으로 튀어 오릅니다" },
];

export type BeatDrive = "beat" | "level";

export type BeatStyle = {
  react: BeatReact;
  drive: BeatDrive;
  /** 0..1 — how far the effect travels at full strength. */
  amount: number;
  /** Seconds a single hit takes to fall back to rest. */
  decay: number;
  /** Colour used by flash and glow. */
  color: string;
};

export const defaultBeat = (): BeatStyle => ({
  react: "none",
  drive: "beat",
  amount: 0.55,
  decay: 0.26,
  color: "#e8952e",
});

/** On-screen waveform. Lives on a text track clip, drawn under the captions. */
export type VizKind = "bars" | "wave" | "mirror" | "circle";

export const VIZ_KINDS: { id: VizKind; name: string }[] = [
  { id: "bars", name: "막대" },
  { id: "mirror", name: "위아래 막대" },
  { id: "wave", name: "물결선" },
  { id: "circle", name: "원형" },
];

export type VizStyle = {
  kind: VizKind;
  color: string;
  opacity: number;
  /** Centre of the visualiser, 0..1 of the frame. */
  x: number;
  y: number;
  /** Box size as a fraction of the frame. */
  width: number;
  height: number;
  bars: number;
  /** Follow one audio clip only; empty means everything audible. */
  source: string;
};

export const defaultViz = (): VizStyle => ({
  kind: "bars",
  color: "#e8952e",
  opacity: 0.85,
  x: 0.5,
  y: 0.78,
  width: 0.8,
  height: 0.22,
  bars: 48,
  source: "",
});

export const FONTS: { id: CaptionFont; name: string; stack: string }[] = [
  {
    id: "sans",
    name: "기본",
    stack: '"IBM Plex Sans KR", system-ui, sans-serif',
  },
  {
    id: "impact",
    name: "굵은 고딕",
    stack: '"Black Han Sans", "IBM Plex Sans KR", sans-serif',
  },
  { id: "serif", name: "명조", stack: '"Nanum Myeongjo", serif' },
  { id: "hand", name: "손글씨", stack: '"Nanum Pen Script", cursive' },
  { id: "mono", name: "모노", stack: '"IBM Plex Mono", monospace' },
];

export function fontStack(id: CaptionFont) {
  return FONTS.find(font => font.id === id)?.stack ?? FONTS[0].stack;
}

export type TextStyle = {
  content: string;
  font: CaptionFont;
  size: number;
  color: string;
  weight: number;
  align: "left" | "center" | "right";
  /** Position of the text box centre, 0..1 of the frame. */
  x: number;
  y: number;
  /** Degrees, turned about the text centre. */
  rotate: number;
  /** How the text is made readable against the picture. */
  back: CaptionBack;
  /** Colour of the box fill, the outline stroke, or the drop shadow. */
  backColor: string;
  backOpacity: number;
  /** Outline thickness as a fraction of the font size. */
  outlineWidth: number;
  lineHeight: number;
  /** Letter spacing as a fraction of the font size. */
  letterSpacing: number;
  anim: CaptionAnim;
  /** How this caption moves with the music. */
  beat: BeatStyle;
  /** Light each word up in turn, timed to the beats under the clip. */
  karaoke: boolean;
  karaokeColor: string;
};

export type Transform = {
  /** 1 = full frame. Smaller values make a picture-in-picture box. */
  scale: number;
  /** Offset of the box centre, in frame widths/heights. */
  x: number;
  y: number;
  opacity: number;
  fit: "contain" | "cover";
};

export type Color = {
  brightness: number;
  contrast: number;
  saturate: number;
  hue: number;
};

export type TransitionKind = "none" | "dissolve" | "fade";

export type Transition = {
  in: TransitionKind;
  out: TransitionKind;
  duration: number;
};

export type MotionKind =
  "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "punch";

export const MOTIONS: { id: MotionKind; name: string }[] = [
  { id: "none", name: "없음" },
  { id: "zoom-in", name: "천천히 확대" },
  { id: "zoom-out", name: "천천히 축소" },
  { id: "pan-left", name: "왼쪽으로" },
  { id: "pan-right", name: "오른쪽으로" },
  { id: "punch", name: "펀치 인" },
];

export type Motion = { kind: MotionKind; amount: number };

export type AudioFxKind = "none" | "echo" | "reverb" | "lowpass" | "highpass";

export type AudioFx = { kind: AudioFxKind; amount: number };

export type Clip = {
  id: string;
  trackId: string;
  assetId?: string;
  text?: TextStyle;
  /** An on-screen waveform instead of words. Text tracks carry these too. */
  viz?: VizStyle;
  /** In and out points inside the source, in source seconds. */
  start: number;
  end: number;
  /** Where the clip starts on the timeline. */
  at: number;
  volume: number;
  speed: number;
  fadeIn: number;
  fadeOut: number;
  transform: Transform;
  color: Color;
  transition: Transition;
  fx: AudioFx;
  motion: Motion;
  /** Drop this clip's level while another track is loud. */
  duck: number;
};

export type Track = {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
};

export type FrameSize = {
  id: string;
  name: string;
  width: number;
  height: number;
};

export const FRAME_SIZES: FrameSize[] = [
  { id: "wide", name: "가로 16:9", width: 1280, height: 720 },
  { id: "short", name: "쇼츠 9:16", width: 720, height: 1280 },
  { id: "square", name: "정사각 1:1", width: 1080, height: 1080 },
];

export type Project = {
  assets: Asset[];
  tracks: Track[];
  clips: Clip[];
  frame: FrameSize;
  /** Beat or manual marks on the timeline, in seconds. */
  markers: number[];
};

export const PHOTO_HOLD = 4;
export const TEXT_HOLD = 3;
export const MIN_CLIP = 0.2;
export const SPEEDS = [0.5, 1, 1.5, 2];
export const SNAP_SECONDS = 0.08;

export const TRACK_HEIGHT: Record<TrackKind, number> = {
  text: 40,
  video: 68,
  audio: 56,
};

export const defaultTransform = (): Transform => ({
  scale: 1,
  x: 0,
  y: 0,
  opacity: 1,
  fit: "contain",
});

export const defaultColor = (): Color => ({
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hue: 0,
});

export const defaultTransition = (): Transition => ({
  in: "none",
  out: "none",
  duration: 0.6,
});

export const defaultFx = (): AudioFx => ({ kind: "none", amount: 0.4 });

export const defaultMotion = (): Motion => ({ kind: "none", amount: 0.18 });

/** Layout presets: what people actually reach for when splitting a frame. */
export const LAYOUTS: { name: string; transform: Partial<Transform> }[] = [
  { name: "전체 화면", transform: { scale: 1, x: 0, y: 0, fit: "contain" } },
  {
    name: "왼쪽 절반",
    transform: { scale: 0.5, x: -0.25, y: 0, fit: "cover" },
  },
  {
    name: "오른쪽 절반",
    transform: { scale: 0.5, x: 0.25, y: 0, fit: "cover" },
  },
  {
    name: "위쪽 절반",
    transform: { scale: 0.5, x: 0, y: -0.25, fit: "cover" },
  },
  {
    name: "아래쪽 절반",
    transform: { scale: 0.5, x: 0, y: 0.25, fit: "cover" },
  },
  {
    name: "작은 화면 (오른쪽 위)",
    transform: { scale: 0.3, x: 0.32, y: -0.32, fit: "cover" },
  },
];

export function makeClip(base: Partial<Clip> & { trackId: string }): Clip {
  return {
    id: makeId("clip"),
    assetId: undefined,
    start: 0,
    end: 1,
    at: 0,
    volume: 1,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    transform: defaultTransform(),
    color: defaultColor(),
    transition: defaultTransition(),
    fx: defaultFx(),
    motion: defaultMotion(),
    duck: 0,
    ...base,
  };
}

/** CSS filter string for a clip colour grade; canvas understands the same syntax. */
export function colorFilter(color: Color) {
  return `brightness(${color.brightness}) contrast(${color.contrast}) saturate(${color.saturate}) hue-rotate(${color.hue}deg)`;
}

export function isGraded(color: Color) {
  return (
    color.brightness !== 1 ||
    color.contrast !== 1 ||
    color.saturate !== 1 ||
    color.hue !== 0
  );
}

/** Opacity from the clip transitions at a given moment, 0..1. */
export function transitionAlpha(clip: Clip, time: number) {
  const { in: into, out, duration } = clip.transition;
  let alpha = 1;
  if (into !== "none" && duration > 0) {
    alpha = Math.min(alpha, (time - clip.at) / duration);
  }
  if (out !== "none" && duration > 0) {
    alpha = Math.min(alpha, (clipEnd(clip) - time) / duration);
  }
  return Math.max(0, Math.min(1, alpha));
}

/** True while a fade-to-black transition is covering the frame. */
export function blackVeil(clip: Clip, time: number) {
  const { in: into, out, duration } = clip.transition;
  if (duration <= 0) return 0;
  let veil = 0;
  if (into === "fade") veil = Math.max(veil, 1 - (time - clip.at) / duration);
  if (out === "fade")
    veil = Math.max(veil, 1 - (clipEnd(clip) - time) / duration);
  return Math.max(0, Math.min(1, veil));
}

export const defaultText = (content: string): TextStyle => ({
  content,
  font: "sans",
  size: 64,
  color: "#ffffff",
  weight: 700,
  align: "center",
  x: 0.5,
  y: 0.82,
  rotate: 0,
  back: "box",
  backColor: "#000000",
  backOpacity: 0.55,
  outlineWidth: 0.14,
  lineHeight: 1.28,
  letterSpacing: 0,
  anim: "none",
  beat: defaultBeat(),
  karaoke: false,
  karaokeColor: "#ffd27a",
});

/** #rrggbb + alpha -> a canvas-ready colour. */
export function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map(c => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return `rgba(0, 0, 0, ${alpha})`;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

let counter = 0;
export function makeId(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function newProject(): Project {
  return {
    assets: [],
    tracks: [
      { id: "T1", kind: "text", name: "자막 1", muted: false, locked: false },
      { id: "V1", kind: "video", name: "영상 1", muted: false, locked: false },
      {
        id: "A1",
        kind: "audio",
        name: "오디오 1",
        muted: false,
        locked: false,
      },
    ],
    clips: [],
    frame: FRAME_SIZES[0],
    markers: [],
  };
}

/** How long a clip occupies the timeline, after speed. */
export function clipLength(clip: Clip) {
  return Math.max(MIN_CLIP, (clip.end - clip.start) / (clip.speed || 1));
}

export function clipEnd(clip: Clip) {
  return clip.at + clipLength(clip);
}

export function trackOf(project: Project, clip: Clip) {
  return project.tracks.find(track => track.id === clip.trackId);
}

export function clipsOn(project: Project, trackId: string) {
  return project.clips
    .filter(clip => clip.trackId === trackId)
    .sort((a, b) => a.at - b.at);
}

export function tracksOfKind(project: Project, kind: TrackKind) {
  return project.tracks.filter(track => track.kind === kind);
}

export function projectDuration(project: Project) {
  return project.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
}

export function assetOf(project: Project, clip: Clip) {
  return project.assets.find(asset => asset.id === clip.assetId);
}

export function covers(clip: Clip, time: number) {
  return time >= clip.at && time < clipEnd(clip);
}

/** Where inside the source file this timeline moment falls. */
export function sourceTime(clip: Clip, time: number) {
  return clip.start + (time - clip.at) * (clip.speed || 1);
}

/**
 * The video clip that should be on screen: topmost track wins, and within a
 * track the last one placed wins if they somehow overlap.
 */
export function visibleVideo(project: Project, time: number) {
  for (const track of project.tracks) {
    if (track.kind !== "video" || track.muted) continue;
    const hit = clipsOn(project, track.id)
      .filter(clip => covers(clip, time))
      .pop();
    if (hit) return hit;
  }
  return null;
}

/**
 * Every video clip on screen right now, bottom track first so upper tracks draw
 * over lower ones. Overlapping clips on one track are returned in start order,
 * which is what makes a cross dissolve work.
 */
export function visibleVideoLayers(project: Project, time: number) {
  const rows = project.tracks.filter(
    track => track.kind === "video" && !track.muted
  );
  const out: Clip[] = [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    out.push(
      ...clipsOn(project, rows[i].id).filter(clip => covers(clip, time))
    );
  }
  return out;
}

/** Text clips on screen now, bottom track first so the top row draws last. */
export function visibleText(project: Project, time: number) {
  const rows = project.tracks.filter(
    track => track.kind === "text" && !track.muted
  );
  const out: Clip[] = [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    out.push(
      ...clipsOn(project, rows[i].id).filter(clip => covers(clip, time))
    );
  }
  return out;
}

export function audibleClips(project: Project, time: number) {
  return project.clips.filter(clip => {
    const track = trackOf(project, clip);
    return track?.kind === "audio" && !track.muted && covers(clip, time);
  });
}

/** Fade envelope for an audio clip at a given timeline moment, 0..1. */
export function fadeGain(clip: Clip, time: number) {
  const into = time - clip.at;
  const left = clipEnd(clip) - time;
  let gain = 1;
  if (clip.fadeIn > 0) gain = Math.min(gain, into / clip.fadeIn);
  if (clip.fadeOut > 0) gain = Math.min(gain, left / clip.fadeOut);
  return Math.max(0, Math.min(1, gain));
}

/** First free slot on a track, so imports land after what is already there. */
export function appendAt(project: Project, trackId: string) {
  return clipsOn(project, trackId).reduce(
    (end, clip) => Math.max(end, clipEnd(clip)),
    0
  );
}

/**
 * Candidate magnet points: the playhead, every other clip edge, and — unless
 * turned off — the beat marks, so a cut can land exactly on the drum.
 */
export function snapPoints(
  project: Project,
  ignore: string | string[],
  playhead: number,
  includeMarkers = true
) {
  const skip = new Set(Array.isArray(ignore) ? ignore : [ignore]);
  const points = [0, playhead];
  for (const clip of project.clips) {
    if (skip.has(clip.id)) continue;
    points.push(clip.at, clipEnd(clip));
  }
  if (includeMarkers) points.push(...project.markers);
  return points;
}

export function snap(value: number, points: number[], tolerance: number) {
  let best = value;
  let distance = tolerance;
  for (const point of points) {
    const gap = Math.abs(point - value);
    if (gap < distance) {
      distance = gap;
      best = point;
    }
  }
  return best;
}

export function formatTime(seconds: number, withFrames = false) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const base = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  if (!withFrames) return base;
  const f = Math.floor((safe % 1) * 30);
  return `${base}:${String(f).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ analysis

/** Grab evenly spaced frames so timeline clips read as a filmstrip. */
export function extractFrames(
  url: string,
  wanted = 6
): Promise<{ duration: number; frames: string[] }> {
  return new Promise(resolve => {
    const probe = document.createElement("video");
    const frames: string[] = [];
    let settled = false;
    let targets: number[] = [];
    let index = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      const duration =
        Number.isFinite(probe.duration) && probe.duration > 0
          ? probe.duration
          : 10;
      probe.removeAttribute("src");
      resolve({ duration, frames });
    };

    const capture = () => {
      try {
        const canvas = document.createElement("canvas");
        const ratio =
          probe.videoWidth > 0 ? probe.videoHeight / probe.videoWidth : 0.5625;
        canvas.width = 150;
        canvas.height = Math.round(150 * ratio) || 84;
        canvas
          .getContext("2d")
          ?.drawImage(probe, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        /* undecodable frame: the clip still works without a filmstrip */
      }
    };

    probe.preload = "auto";
    probe.muted = true;
    probe.playsInline = true;
    probe.src = url;

    probe.onloadeddata = () => {
      const length =
        Number.isFinite(probe.duration) && probe.duration > 0
          ? probe.duration
          : 0;
      const count = length > 0 ? wanted : 1;
      targets = Array.from({ length: count }, (_, i) =>
        length > 0 ? Math.min(length - 0.05, (length * (i + 0.5)) / count) : 0.1
      );
      probe.currentTime = targets[0];
    };
    probe.onseeked = () => {
      capture();
      index += 1;
      if (index >= targets.length) return finish();
      probe.currentTime = targets[index];
    };
    probe.onerror = finish;
    window.setTimeout(finish, 9000);
  });
}

/** Decode once for both an accurate duration and the waveform. */
export async function extractPeaks(
  url: string,
  buckets = 1200
): Promise<{ duration: number; peaks: number[]; peak: number }> {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
  const context: AudioContext = new Ctx();
  try {
    const response = await fetch(url);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const data = buffer.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / buckets));
    const peaks: number[] = [];
    let ceiling = 0.0001;
    for (let i = 0; i < buckets; i += 1) {
      let peak = 0;
      const from = i * size;
      for (let j = 0; j < size && from + j < data.length; j += 1) {
        const value = Math.abs(data[from + j]);
        if (value > peak) peak = value;
      }
      if (peak > ceiling) ceiling = peak;
      peaks.push(peak);
    }
    return {
      duration: buffer.duration,
      peaks: peaks.map(peak => peak / ceiling),
      peak: ceiling,
    };
  } catch {
    return { duration: 0, peaks: [], peak: 0 };
  } finally {
    void context.close();
  }
}

export type Cue = { start: number; end: number; text: string };

/** Seconds from an SRT (00:00:01,000) or VTT (00:00:01.000) stamp. */
function parseStamp(raw: string) {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/**
 * Read an .srt or .vtt file into cues. Index lines, the WEBVTT header and cue
 * settings after the timestamps are all ignored, which covers what editors and
 * caption tools actually emit.
 */
export function parseSubtitles(source: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = source
    .replace(/\r\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split("\n").filter(line => line.trim().length > 0);
    if (lines.length === 0) continue;
    const timingIndex = lines.findIndex(line => line.includes("-->"));
    if (timingIndex < 0) continue;

    const [from, rest] = lines[timingIndex].split("-->");
    const start = parseStamp(from);
    const end = parseStamp((rest ?? "").trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null || end <= start) continue;

    const text = lines
      .slice(timingIndex + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

export function isSubtitleFile(file: File) {
  return /\.(srt|vtt)$/i.test(file.name);
}

export type Span = { from: number; to: number };

/**
 * Runs of quiet in a decoded waveform, in source seconds. This is what an
 * "auto cut silence" pass works from: talking-head footage is mostly gaps.
 */
export function findSilence(
  peaks: number[],
  duration: number,
  options: { threshold: number; minGap: number; keep: number }
): Span[] {
  if (peaks.length === 0 || duration <= 0) return [];
  const perBucket = duration / peaks.length;
  const spans: Span[] = [];
  let start: number | null = null;

  for (let i = 0; i <= peaks.length; i += 1) {
    const quiet = i < peaks.length && peaks[i] < options.threshold;
    if (quiet && start === null) start = i;
    if (!quiet && start !== null) {
      const from = start * perBucket;
      const to = i * perBucket;
      if (to - from >= options.minGap) {
        // Leave a breath on each side so speech does not get clipped.
        const trimmed = { from: from + options.keep, to: to - options.keep };
        if (trimmed.to - trimmed.from > 0.05) spans.push(trimmed);
      }
      start = null;
    }
  }
  return spans;
}

/**
 * Rough onset detection: a bucket that jumps well above the local average is
 * called a beat. Good enough to cut a montage to music.
 */
export function findBeats(
  peaks: number[],
  duration: number,
  sensitivity = 1.45
): number[] {
  if (peaks.length < 8 || duration <= 0) return [];
  const perBucket = duration / peaks.length;
  const window = Math.max(4, Math.round(peaks.length / 90));
  const beats: number[] = [];
  let lastBeat = -1;

  for (let i = window; i < peaks.length - 1; i += 1) {
    let sum = 0;
    for (let j = i - window; j < i; j += 1) sum += peaks[j];
    const local = sum / window;
    const rising = peaks[i] > peaks[i - 1];
    // A hit has to stand out from what came just before it, or be loud in its
    // own right. The second half matters: on a sparse track the run-up to a
    // beat is near silence, and a ratio test alone would throw every one away.
    if (
      rising &&
      peaks[i] > 0.12 &&
      (peaks[i] > local * sensitivity || local < 0.02)
    ) {
      const at = i * perBucket;
      // Two beats closer than a 16th at 200bpm are the same hit.
      if (at - lastBeat > 0.16) {
        beats.push(Number(at.toFixed(3)));
        lastBeat = at;
      }
    }
  }
  return beats;
}

/** Loudness of a source at a moment, read straight off its peak table. */
export function peakAt(asset: Asset, sourceSeconds: number) {
  if (asset.peaks.length === 0 || asset.duration <= 0) return 0;
  const index = Math.floor(
    (sourceSeconds / asset.duration) * asset.peaks.length
  );
  return asset.peaks[Math.max(0, Math.min(asset.peaks.length - 1, index))] ?? 0;
}

// -------------------------------------------------------------- beat driving

/**
 * 0..1 that snaps to 1 on every marker and falls away before the next one.
 * This is what makes a caption land ON the drum instead of near it.
 */
export function beatEnergy(markers: number[], time: number, decay = 0.26) {
  if (markers.length === 0 || decay <= 0) return 0;
  let last = -1;
  // Markers are kept sorted, so the last one at or before `time` wins.
  for (let i = 0; i < markers.length; i += 1) {
    if (markers[i] > time + 0.0001) break;
    last = markers[i];
  }
  if (last < 0) return 0;
  const since = time - last;
  if (since > decay) return 0;
  // Fast attack, softer tail — the shape a percussive hit actually has.
  const fall = 1 - since / decay;
  return fall * fall;
}

/** How loud everything audible is right now, 0..1, read off the peak tables. */
export function levelAt(project: Project, time: number) {
  let loudest = 0;
  for (const clip of project.clips) {
    const track = trackOf(project, clip);
    if (!track || track.kind === "text" || track.muted) continue;
    if (!covers(clip, time)) continue;
    const asset = assetOf(project, clip);
    if (!asset || asset.peaks.length === 0) continue;
    loudest = Math.max(
      loudest,
      peakAt(asset, sourceTime(clip, time)) * clip.volume
    );
  }
  return Math.max(0, Math.min(1, loudest));
}

/** The 0..1 drive value a beat style asks for at this moment. */
export function pulseAt(project: Project, beat: BeatStyle, time: number) {
  if (!beat || beat.react === "none") return 0;
  const raw =
    beat.drive === "level"
      ? levelAt(project, time)
      : beatEnergy(project.markers, time, beat.decay);
  return Math.max(0, Math.min(1, raw));
}

/**
 * Tempo from the gaps between markers. The median gap is used rather than the
 * mean because one missed onset would drag an average badly off.
 */
export function detectBpm(markers: number[]): number | null {
  if (markers.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < markers.length; i += 1) {
    const gap = markers[i] - markers[i - 1];
    if (gap > 0.18 && gap < 2) gaps.push(gap);
  }
  if (gaps.length < 3) return null;
  gaps.sort((a, b) => a - b);
  let beat = gaps[Math.floor(gaps.length / 2)];
  // Fold into the range people actually count in.
  while (beat < 0.3) beat *= 2;
  while (beat > 1.2) beat /= 2;
  return Math.round(60 / beat);
}

/** A steady click track: every beat from `offset` up to `span`. */
export function beatGrid(bpm: number, offset: number, span: number) {
  if (bpm <= 0 || span <= 0) return [];
  const step = 60 / bpm;
  const out: number[] = [];
  for (let at = offset; at <= span; at += step) {
    out.push(Number(at.toFixed(3)));
    if (out.length > 4000) break;
  }
  return out;
}

/**
 * A short window of the waveform around now, resampled to `count` bars. This is
 * what the on-screen visualiser draws, so it moves with the actual sound.
 */
export function vizSamples(
  project: Project,
  time: number,
  count: number,
  sourceClipId = "",
  window = 1.1
): number[] {
  let best: { clip: Clip; asset: Asset } | null = null;
  let loudest = -1;
  for (const clip of project.clips) {
    if (sourceClipId && clip.id !== sourceClipId) continue;
    const track = trackOf(project, clip);
    if (!track || track.kind === "text" || track.muted) continue;
    if (!covers(clip, time)) continue;
    const asset = assetOf(project, clip);
    if (!asset || asset.peaks.length === 0 || asset.duration <= 0) continue;
    const level = peakAt(asset, sourceTime(clip, time)) * clip.volume;
    if (level > loudest) {
      loudest = level;
      best = { clip, asset };
    }
  }
  if (!best) return new Array(count).fill(0);

  const { clip, asset } = best;
  const centre = sourceTime(clip, time);
  const perBucket = asset.duration / asset.peaks.length;
  const half = window / 2;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = centre - half + (window * i) / Math.max(1, count - 1);
    const index = Math.round(at / perBucket);
    const peak =
      index >= 0 && index < asset.peaks.length ? asset.peaks[index] : 0;
    out.push(Math.max(0, Math.min(1, peak * clip.volume)));
  }
  return out;
}

export function kindOf(file: File): AssetKind | null {
  if (file.type.startsWith("video")) return "video";
  if (file.type.startsWith("image")) return "photo";
  if (file.type.startsWith("audio")) return "audio";
  return null;
}
