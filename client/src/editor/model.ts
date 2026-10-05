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

/** Shapes and emoji that sit over the picture. They live on text tracks. */
export type StickerKind =
  | "emoji"
  | "circle"
  | "rect"
  | "triangle"
  | "star"
  | "arrow"
  | "heart"
  | "bubble"
  | "burst"
  | "line"
  | "ring"
  | "frame";

export const STICKER_SHAPES: { id: StickerKind; name: string }[] = [
  { id: "circle", name: "원" },
  { id: "ring", name: "링" },
  { id: "rect", name: "사각형" },
  { id: "frame", name: "테두리" },
  { id: "triangle", name: "삼각형" },
  { id: "star", name: "별" },
  { id: "heart", name: "하트" },
  { id: "arrow", name: "화살표" },
  { id: "bubble", name: "말풍선" },
  { id: "burst", name: "폭발" },
  { id: "line", name: "선" },
];

export const STICKER_EMOJI = [
  "🔥",
  "✨",
  "💡",
  "❤️",
  "😂",
  "😮",
  "👍",
  "👀",
  "🎯",
  "⚡",
  "💥",
  "🎉",
  "📌",
  "⭐",
  "💬",
  "🚀",
  "🏆",
  "🔔",
  "❗",
  "❓",
];

export type Sticker = {
  kind: StickerKind;
  /** Only read when kind is "emoji". */
  glyph: string;
  color: string;
  stroke: string;
  strokeWidth: number;
  filled: boolean;
  opacity: number;
  /** Centre and size as fractions of the frame. */
  x: number;
  y: number;
  size: number;
  rotate: number;
  /** Stickers answer the music with the same machinery captions use. */
  beat: BeatStyle;
};

export const defaultSticker = (patch: Partial<Sticker> = {}): Sticker => ({
  kind: "circle",
  glyph: "🔥",
  color: "#e8952e",
  stroke: "#ffffff",
  strokeWidth: 0,
  filled: true,
  opacity: 1,
  x: 0.5,
  y: 0.5,
  size: 0.22,
  rotate: 0,
  beat: defaultBeat(),
  ...patch,
});

/** Ready-made caption looks, the way a template picker offers them. */
export const TEXT_TEMPLATES: {
  id: string;
  name: string;
  hint: string;
  style: Partial<TextStyle>;
}[] = [
  {
    id: "plain",
    name: "기본 자막",
    hint: "아래 가운데, 검은 상자",
    style: { size: 56, y: 0.84, back: "box", color: "#ffffff" },
  },
  {
    id: "title",
    name: "큰 제목",
    hint: "화면 한가운데, 외곽선",
    style: {
      size: 104,
      y: 0.5,
      back: "outline",
      color: "#ffffff",
      weight: 800,
    },
  },
  {
    id: "pop",
    name: "비트 팝",
    hint: "비트마다 튀어오릅니다",
    style: {
      size: 76,
      y: 0.78,
      back: "outline",
      color: "#ffffff",
      weight: 800,
      beat: {
        react: "pop",
        drive: "beat",
        amount: 0.7,
        decay: 0.22,
        color: "#e8952e",
      },
    },
  },
  {
    id: "neon",
    name: "네온",
    hint: "비트마다 빛이 번집니다",
    style: {
      size: 82,
      y: 0.5,
      back: "shadow",
      color: "#8ff6ff",
      backColor: "#0bb8d4",
      weight: 800,
      beat: {
        react: "glow",
        drive: "beat",
        amount: 0.9,
        decay: 0.3,
        color: "#28e0ff",
      },
    },
  },
  {
    id: "karaoke",
    name: "가사형",
    hint: "단어가 차례로 켜집니다",
    style: {
      size: 68,
      y: 0.8,
      back: "outline",
      color: "#ffffff",
      weight: 700,
      karaoke: true,
      karaokeColor: "#ffd27a",
    },
  },
  {
    id: "typing",
    name: "타이핑",
    hint: "한 글자씩 찍힙니다",
    style: {
      size: 58,
      y: 0.82,
      back: "box",
      color: "#9bffb0",
      font: "mono",
      anim: "type",
    },
  },
  {
    id: "shout",
    name: "외침",
    hint: "굵은 고딕, 비트마다 흔들림",
    style: {
      size: 96,
      y: 0.42,
      back: "outline",
      color: "#ffe14d",
      font: "impact",
      weight: 900,
      beat: {
        react: "shake",
        drive: "beat",
        amount: 0.8,
        decay: 0.18,
        color: "#ff5d3c",
      },
    },
  },
  {
    id: "quote",
    name: "인용",
    hint: "명조, 그림자",
    style: {
      size: 62,
      y: 0.46,
      back: "shadow",
      color: "#f4ecdf",
      font: "serif",
      weight: 500,
    },
  },
  {
    id: "handwrite",
    name: "손글씨",
    hint: "가볍게 떠오릅니다",
    style: {
      size: 88,
      y: 0.76,
      back: "shadow",
      color: "#ffffff",
      font: "hand",
      anim: "rise",
    },
  },
];

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
  /** Mirror the picture. Flipping a talking head is an everyday edit. */
  flipX: boolean;
  flipY: boolean;
};

export type Color = {
  brightness: number;
  contrast: number;
  saturate: number;
  hue: number;
  sepia: number;
  grayscale: number;
  /** Pixels of blur at the project's frame size. */
  blur: number;
  /** A colour washed over the picture, which is what gives a look its mood. */
  tint: string;
  tintAmount: number;
  tintBlend: "overlay" | "soft-light" | "screen" | "multiply" | "color";
};

/** Named looks. Each one is just a Color, so they stack with manual tweaks. */
export type FilterPreset = { id: string; name: string; color: Partial<Color> };

export const FILTERS: FilterPreset[] = [
  { id: "none", name: "없음", color: {} },
  {
    id: "crisp",
    name: "선명",
    color: { contrast: 1.16, saturate: 1.18, brightness: 1.03 },
  },
  {
    id: "warm",
    name: "따뜻",
    color: {
      tint: "#ff9a3c",
      tintAmount: 0.18,
      tintBlend: "soft-light",
      saturate: 1.1,
    },
  },
  {
    id: "cool",
    name: "차가움",
    color: {
      tint: "#3c9aff",
      tintAmount: 0.2,
      tintBlend: "soft-light",
      contrast: 1.06,
    },
  },
  {
    id: "vintage",
    name: "빈티지",
    color: {
      sepia: 0.42,
      saturate: 0.82,
      contrast: 0.94,
      tint: "#d9a066",
      tintAmount: 0.14,
      tintBlend: "overlay",
    },
  },
  { id: "mono", name: "흑백", color: { grayscale: 1, contrast: 1.12 } },
  {
    id: "noir",
    name: "느와르",
    color: { grayscale: 1, contrast: 1.4, brightness: 0.92 },
  },
  {
    id: "film",
    name: "필름",
    color: {
      contrast: 1.1,
      saturate: 0.9,
      tint: "#2b3a4a",
      tintAmount: 0.16,
      tintBlend: "soft-light",
    },
  },
  {
    id: "cinema",
    name: "시네마",
    color: {
      contrast: 1.22,
      saturate: 0.94,
      tint: "#17a2b8",
      tintAmount: 0.15,
      tintBlend: "multiply",
      brightness: 0.98,
    },
  },
  {
    id: "pastel",
    name: "파스텔",
    color: {
      brightness: 1.1,
      saturate: 0.78,
      contrast: 0.9,
      tint: "#ffd6e7",
      tintAmount: 0.2,
      tintBlend: "screen",
    },
  },
  {
    id: "neon",
    name: "네온",
    color: {
      saturate: 1.65,
      contrast: 1.18,
      tint: "#8a2be2",
      tintAmount: 0.16,
      tintBlend: "color",
    },
  },
  {
    id: "faded",
    name: "바랜",
    color: {
      contrast: 0.84,
      saturate: 0.7,
      brightness: 1.07,
      tint: "#bfb5a0",
      tintAmount: 0.18,
      tintBlend: "screen",
    },
  },
];

/**
 * A moving treatment on the picture, as opposed to a filter's fixed look.
 * Anything marked `beat` is driven by the same pulse the captions use.
 */
export type EffectKind =
  | "none"
  | "shake"
  | "glitch"
  | "zoom-pulse"
  | "rgb-split"
  | "vignette"
  | "flash"
  | "scanlines"
  | "spin";

export const EFFECTS: { id: EffectKind; name: string; hint: string }[] = [
  { id: "none", name: "없음", hint: "" },
  { id: "shake", name: "흔들림", hint: "화면이 좌우로 떨립니다" },
  { id: "zoom-pulse", name: "줌 펄스", hint: "비트마다 화면이 확 커집니다" },
  { id: "glitch", name: "글리치", hint: "가로로 찢어진 조각이 어긋납니다" },
  { id: "rgb-split", name: "색수차", hint: "빨강·파랑이 어긋나 번집니다" },
  { id: "flash", name: "플래시", hint: "비트마다 화면이 번쩍입니다" },
  { id: "vignette", name: "비네팅", hint: "가장자리가 어두워집니다" },
  { id: "scanlines", name: "스캔라인", hint: "가로줄이 깔린 옛 화면" },
  { id: "spin", name: "회전", hint: "화면이 천천히 돕니다" },
];

export type VideoEffect = {
  kind: EffectKind;
  amount: number;
  /** Follow the beat marks instead of running steadily. */
  beat: boolean;
};

export type TransitionKind =
  | "none"
  | "dissolve"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "wipe-left"
  | "wipe-right"
  | "zoom"
  | "spin"
  | "blur";

export const TRANSITIONS: { id: TransitionKind; name: string }[] = [
  { id: "none", name: "없음" },
  { id: "dissolve", name: "디졸브" },
  { id: "fade", name: "페이드" },
  { id: "slide-left", name: "왼쪽으로 밀기" },
  { id: "slide-right", name: "오른쪽으로 밀기" },
  { id: "slide-up", name: "위로 밀기" },
  { id: "slide-down", name: "아래로 밀기" },
  { id: "wipe-left", name: "왼쪽 와이프" },
  { id: "wipe-right", name: "오른쪽 와이프" },
  { id: "zoom", name: "줌" },
  { id: "spin", name: "회전" },
  { id: "blur", name: "블러" },
];

export type Transition = {
  in: TransitionKind;
  out: TransitionKind;
  duration: number;
};

export type MotionKind =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "punch";

export const MOTIONS: { id: MotionKind; name: string }[] = [
  { id: "none", name: "없음" },
  { id: "zoom-in", name: "천천히 확대" },
  { id: "zoom-out", name: "천천히 축소" },
  { id: "pan-left", name: "왼쪽으로" },
  { id: "pan-right", name: "오른쪽으로" },
  { id: "punch", name: "펀치 인" },
];

export type Motion = { kind: MotionKind; amount: number };

export type AudioFxKind =
  | "none"
  | "echo"
  | "reverb"
  | "lowpass"
  | "highpass"
  | "robot"
  | "telephone"
  | "radio"
  | "chorus"
  | "distort"
  | "denoise";

export type AudioFx = { kind: AudioFxKind; amount: number };

export const AUDIO_FX: {
  id: AudioFxKind;
  name: string;
  group: "공간" | "음색" | "목소리" | "정리";
}[] = [
  { id: "none", name: "없음", group: "공간" },
  { id: "echo", name: "에코", group: "공간" },
  { id: "reverb", name: "공간감", group: "공간" },
  { id: "chorus", name: "코러스", group: "공간" },
  { id: "lowpass", name: "먹먹하게", group: "음색" },
  { id: "highpass", name: "얇게", group: "음색" },
  { id: "distort", name: "거칠게", group: "음색" },
  { id: "robot", name: "로봇", group: "목소리" },
  { id: "telephone", name: "전화기", group: "목소리" },
  { id: "radio", name: "라디오", group: "목소리" },
  { id: "denoise", name: "잡음 줄이기", group: "정리" },
];

export type Clip = {
  id: string;
  trackId: string;
  assetId?: string;
  text?: TextStyle;
  /** An on-screen waveform instead of words. Text tracks carry these too. */
  viz?: VizStyle;
  /** A shape or emoji over the picture. Also a text-track clip. */
  sticker?: Sticker;
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
  /** A moving treatment on the picture: shake, glitch, zoom pulse and so on. */
  effect: VideoEffect;
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
  flipX: false,
  flipY: false,
});

export const defaultColor = (): Color => ({
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  blur: 0,
  tint: "#ffffff",
  tintAmount: 0,
  tintBlend: "soft-light",
});

export const defaultEffect = (): VideoEffect => ({
  kind: "none",
  amount: 0.5,
  beat: true,
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
    effect: defaultEffect(),
    duck: 0,
    ...base,
  };
}

/**
 * CSS filter string for a clip colour grade; canvas understands the same
 * syntax. `blur` is given in frame-height units so a look survives a change of
 * output size — a 2px blur on a 720p frame is a 4px blur on 1440p.
 */
export function colorFilter(color: Color, frameHeight = 720) {
  const parts = [
    `brightness(${color.brightness})`,
    `contrast(${color.contrast})`,
    `saturate(${color.saturate})`,
    `hue-rotate(${color.hue}deg)`,
  ];
  if (color.sepia) parts.push(`sepia(${color.sepia})`);
  if (color.grayscale) parts.push(`grayscale(${color.grayscale})`);
  if (color.blur) parts.push(`blur(${(color.blur * frameHeight) / 720}px)`);
  return parts.join(" ");
}

export function isGraded(color: Color) {
  return (
    color.brightness !== 1 ||
    color.contrast !== 1 ||
    color.saturate !== 1 ||
    color.hue !== 0 ||
    !!color.sepia ||
    !!color.grayscale ||
    !!color.blur
  );
}

export function isTinted(color: Color) {
  return (color.tintAmount ?? 0) > 0.001;
}

/**
 * What a transition is doing to a clip right now.
 *
 * The old version only knew about opacity, which is all a dissolve needs. A
 * slide, a wipe or a spin is geometry, so the whole state is computed in one
 * place and the renderer applies it — that way the monitor and the exporter
 * cannot drift apart over how a transition looks.
 */
export type TransitionState = {
  alpha: number;
  /** Offset as a fraction of the frame. */
  dx: number;
  dy: number;
  scale: number;
  /** Degrees about the frame centre. */
  spin: number;
  /** Blur in pixels at a 720-high frame. */
  blur: number;
  /** The part of the frame the clip is allowed to paint, 0..1, or null. */
  reveal: { x: number; y: number; w: number; h: number } | null;
  /** Black covering the whole frame, which is what a fade really is. */
  veil: number;
};

const restingTransition = (): TransitionState => ({
  alpha: 1,
  dx: 0,
  dy: 0,
  scale: 1,
  spin: 0,
  blur: 0,
  reveal: null,
  veil: 0,
});

/**
 * `progress` is 1 when the clip is fully present and 0 at the far edge of the
 * transition. `entering` flips the direction a slide or a spin travels.
 */
function applyTransition(
  state: TransitionState,
  kind: TransitionKind,
  progress: number,
  entering: boolean
) {
  const p = Math.max(0, Math.min(1, progress));
  const away = 1 - p;
  if (away <= 0 || kind === "none") return;
  const way = entering ? 1 : -1;

  switch (kind) {
    case "dissolve":
      state.alpha = Math.min(state.alpha, p);
      break;
    case "fade":
      state.veil = Math.max(state.veil, away);
      break;
    case "slide-left":
      state.dx += away * way;
      break;
    case "slide-right":
      state.dx -= away * way;
      break;
    case "slide-up":
      state.dy += away * way;
      break;
    case "slide-down":
      state.dy -= away * way;
      break;
    case "wipe-right":
      state.reveal = { x: 0, y: 0, w: p, h: 1 };
      break;
    case "wipe-left":
      state.reveal = { x: 1 - p, y: 0, w: p, h: 1 };
      break;
    case "zoom":
      state.scale *= 1 + away * 0.45;
      state.alpha = Math.min(state.alpha, p);
      break;
    case "spin":
      state.spin += away * 180 * way;
      state.scale *= 1 - away * 0.35;
      state.alpha = Math.min(state.alpha, p);
      break;
    case "blur":
      state.blur = Math.max(state.blur, away * 18);
      state.alpha = Math.min(state.alpha, Math.min(1, p * 1.6));
      break;
    default:
      break;
  }
}

export function transitionState(clip: Clip, time: number): TransitionState {
  const state = restingTransition();
  const { in: into, out, duration } = clip.transition;
  if (duration <= 0) return state;
  applyTransition(state, into, (time - clip.at) / duration, true);
  applyTransition(state, out, (clipEnd(clip) - time) / duration, false);
  state.alpha = Math.max(0, Math.min(1, state.alpha));
  state.veil = Math.max(0, Math.min(1, state.veil));
  return state;
}

/** Opacity alone, for the callers that only need to know if a clip shows. */
export function transitionAlpha(clip: Clip, time: number) {
  return transitionState(clip, time).alpha;
}

/** True while a fade-to-black transition is covering the frame. */
export function blackVeil(clip: Clip, time: number) {
  return transitionState(clip, time).veil;
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
