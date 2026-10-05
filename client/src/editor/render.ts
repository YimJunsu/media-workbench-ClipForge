/**
 * One frame renderer, shared by the program monitor and the exporter.
 *
 * Both call drawFrame, so what you preview is literally what gets encoded —
 * transforms, colour grades, filters, moving effects, transitions, stickers
 * and captions included.
 *
 * Anything that looks random here (glitch slices, for instance) is driven by a
 * hash of the timestamp rather than Math.random, because the exporter renders
 * the same moment on a different schedule and the two have to agree.
 */
import {
  Clip,
  Color,
  Project,
  Sticker,
  TextStyle,
  Transform,
  TransitionState,
  VideoEffect,
  VizStyle,
  assetOf,
  clipEnd,
  clipLength,
  colorFilter,
  defaultBeat,
  fontStack,
  isGraded,
  isTinted,
  levelAt,
  pulseAt,
  transitionState,
  visibleText,
  visibleVideoLayers,
  vizSamples,
  withAlpha,
} from "./model";

/** Fallback only; the live size comes from project.frame. */
export const FRAME_WIDTH = 1280;
export const FRAME_HEIGHT = 720;

type Size = { w: number; h: number };

/** Motion presets are a start-to-end transform, applied across the clip. */
function motionAt(clip: Clip, time: number): Transform {
  const base = clip.transform;
  const motion = clip.motion;
  if (!motion || motion.kind === "none") return base;

  const length = Math.max(0.05, clipEnd(clip) - clip.at);
  const raw = Math.max(0, Math.min(1, (time - clip.at) / length));
  // ease-in-out so the move never starts or stops abruptly
  const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
  const a = motion.amount;

  switch (motion.kind) {
    case "zoom-in":
      return { ...base, scale: base.scale * (1 + a * t), fit: "cover" };
    case "zoom-out":
      return { ...base, scale: base.scale * (1 + a * (1 - t)), fit: "cover" };
    case "pan-left":
      return {
        ...base,
        scale: base.scale * (1 + a),
        x: base.x + a * (0.5 - t),
        fit: "cover",
      };
    case "pan-right":
      return {
        ...base,
        scale: base.scale * (1 + a),
        x: base.x - a * (0.5 - t),
        fit: "cover",
      };
    case "punch": {
      // A quick push in over the first fifth, then hold.
      const push = Math.min(1, raw / 0.2);
      const eased = 1 - Math.pow(1 - push, 3);
      return { ...base, scale: base.scale * (1 + a * eased), fit: "cover" };
    }
    default:
      return base;
  }
}

/** Where a source of the given size lands, after the clip's transform. */
export function placement(
  sourceW: number,
  sourceH: number,
  t: Transform,
  size: Size = { w: FRAME_WIDTH, h: FRAME_HEIGHT }
) {
  const boxW = size.w * t.scale;
  const boxH = size.h * t.scale;
  const cx = size.w / 2 + t.x * size.w;
  const cy = size.h / 2 + t.y * size.h;
  const ratio =
    t.fit === "cover"
      ? Math.max(boxW / sourceW, boxH / sourceH)
      : Math.min(boxW / sourceW, boxH / sourceH);
  const w = sourceW * ratio;
  const h = sourceH * ratio;
  return {
    dx: cx - w / 2,
    dy: cy - h / 2,
    w,
    h,
    box: { x: cx - boxW / 2, y: cy - boxH / 2, w: boxW, h: boxH },
    cropped: t.fit === "cover",
  };
}

/**
 * Last good frame per video element. A decoder can go briefly unreadable while
 * buffering or right after a seek; without this the monitor would flash black
 * on every one of those gaps.
 */
const lastFrames = new WeakMap<HTMLVideoElement, HTMLCanvasElement>();
const lastSnapshot = new WeakMap<HTMLVideoElement, number>();
const SNAPSHOT_EVERY = 150;

/** Keep a spare copy, but not on every frame — a full-res copy is not free. */
function snapshot(element: HTMLVideoElement, now: number) {
  if (now - (lastSnapshot.get(element) ?? 0) < SNAPSHOT_EVERY) return;
  lastSnapshot.set(element, now);
  let store = lastFrames.get(element);
  if (!store) {
    store = document.createElement("canvas");
    lastFrames.set(element, store);
  }
  if (
    store.width !== element.videoWidth ||
    store.height !== element.videoHeight
  ) {
    store.width = element.videoWidth;
    store.height = element.videoHeight;
  }
  try {
    store.getContext("2d")?.drawImage(element, 0, 0);
  } catch {
    /* nothing decoded yet */
  }
}

/** The element if it can be drawn, otherwise the last frame it produced. */
function videoSurface(element: HTMLVideoElement, now: number) {
  if (element.readyState >= 2 && element.videoWidth > 0) {
    snapshot(element, now);
    return {
      source: element as CanvasImageSource,
      w: element.videoWidth,
      h: element.videoHeight,
    };
  }
  const store = lastFrames.get(element);
  if (store && store.width > 0) {
    return {
      source: store as CanvasImageSource,
      w: store.width,
      h: store.height,
    };
  }
  return null;
}

export type FrameSources = {
  /** A ready-to-draw video element for a clip, or null if it is not decoded yet. */
  videoFor: (clip: Clip) => HTMLVideoElement | null;
  /** A loaded image for a photo clip. */
  imageFor: (assetId: string) => HTMLImageElement | null;
};

// ------------------------------------------------------------------- helpers

/** Blend two #rrggbb colours; `ratio` 0 keeps the first, 1 takes the second. */
function mixHex(from: string, to: string, ratio: number) {
  const read = (hex: string) => {
    const clean = hex.replace("#", "");
    const full =
      clean.length === 3
        ? clean
            .split("")
            .map(c => c + c)
            .join("")
        : clean;
    const value = Number.parseInt(full, 16);
    if (Number.isNaN(value)) return [255, 255, 255];
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const a = read(from);
  const b = read(to);
  const t = Math.max(0, Math.min(1, ratio));
  const mix = a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/** Opacity alone — overlays need nothing else out of the transition. */
function transitionAlpha(clip: Clip, time: number) {
  return transitionState(clip, time).alpha;
}

/** Deterministic 0..1 from a number, so a "random" look replays identically. */
function hashed(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** One reused offscreen canvas; the channel split would otherwise allocate. */
let scratch: HTMLCanvasElement | null = null;
function scratchOf(w: number, h: number) {
  if (!scratch) scratch = document.createElement("canvas");
  const width = Math.max(1, Math.ceil(w));
  const height = Math.max(1, Math.ceil(h));
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const context = scratch.getContext("2d");
  context?.clearRect(0, 0, width, height);
  return { canvas: scratch, context };
}

// ------------------------------------------------------------------- effects

type EffectState = {
  dx: number;
  dy: number;
  scale: number;
  spin: number;
  blur: number;
  glitch: number;
  split: number;
  flash: number;
  vignette: number;
  scanlines: number;
};

const restingEffect = (): EffectState => ({
  dx: 0,
  dy: 0,
  scale: 1,
  spin: 0,
  blur: 0,
  glitch: 0,
  split: 0,
  flash: 0,
  vignette: 0,
  scanlines: 0,
});

/**
 * What a moving effect is doing now. `pulse` is the shared beat envelope, so a
 * zoom pulse and a caption pop land on the same drum.
 */
function effectAt(
  effect: VideoEffect | undefined,
  time: number,
  pulse: number
): EffectState {
  const state = restingEffect();
  if (!effect || effect.kind === "none") return state;

  // A vignette or scanlines is a look, not a hit — those ignore the beat even
  // when the clip is set to follow it, or they would simply blink.
  const steady = effect.kind === "vignette" || effect.kind === "scanlines";
  const k = steady
    ? effect.amount
    : effect.beat
      ? pulse * effect.amount
      : effect.amount;
  if (k <= 0.001) return state;

  switch (effect.kind) {
    case "shake":
      state.dx = Math.sin(time * 41) * k * 0.022;
      state.dy = Math.cos(time * 33) * k * 0.016;
      break;
    case "zoom-pulse":
      state.scale = 1 + k * 0.28;
      break;
    case "glitch":
      state.glitch = k;
      break;
    case "rgb-split":
      state.split = k;
      break;
    case "flash":
      state.flash = k * 0.65;
      break;
    case "vignette":
      state.vignette = k;
      break;
    case "scanlines":
      state.scanlines = k;
      break;
    case "spin":
      state.spin = time * k * 24;
      break;
    default:
      break;
  }
  return state;
}

// -------------------------------------------------------------------- drawing

function drawTint(
  context: CanvasRenderingContext2D,
  color: Color,
  box: { x: number; y: number; w: number; h: number }
) {
  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.w, box.h);
  context.clip();
  context.globalCompositeOperation = color.tintBlend ?? "soft-light";
  context.globalAlpha = color.tintAmount;
  context.fillStyle = color.tint ?? "#ffffff";
  context.fillRect(box.x, box.y, box.w, box.h);
  context.restore();
}

/** Horizontal slices knocked sideways — the classic broken-signal look. */
function drawGlitch(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  place: { dx: number; dy: number; w: number; h: number },
  strength: number,
  time: number
) {
  const frame = Math.floor(time * 14);
  const slices = 3 + Math.round(strength * 5);
  for (let i = 0; i < slices; i += 1) {
    const at = hashed(frame * 31 + i * 7);
    const height = 0.03 + hashed(frame * 17 + i) * 0.1;
    const top = Math.min(1 - height, at);
    const shove =
      (hashed(frame * 53 + i * 3) - 0.5) * strength * place.w * 0.14;
    context.drawImage(
      source,
      0,
      sh * top,
      sw,
      sh * height,
      place.dx + shove,
      place.dy + place.h * top,
      place.w,
      place.h * height
    );
  }
}

/**
 * Chromatic aberration. The red and cyan halves are drawn separately and added
 * back together offset, which is literally what the effect is — at zero offset
 * the two sum to the original picture.
 */
function drawSplit(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  place: { dx: number; dy: number; w: number; h: number },
  strength: number
) {
  const shove = strength * Math.max(2, place.w * 0.012);
  const halves: [string, number][] = [
    ["#ff0000", -shove],
    ["#00ffff", shove],
  ];
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const [channel, offset] of halves) {
    const { canvas, context: pad } = scratchOf(place.w, place.h);
    if (!pad) break;
    pad.drawImage(source, 0, 0, canvas.width, canvas.height);
    pad.globalCompositeOperation = "multiply";
    pad.fillStyle = channel;
    pad.fillRect(0, 0, canvas.width, canvas.height);
    pad.globalCompositeOperation = "source-over";
    context.drawImage(canvas, place.dx + offset, place.dy, place.w, place.h);
  }
  context.restore();
}

function drawVignette(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  strength: number
) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radius = Math.max(box.w, box.h) * 0.72;
  const shade = context.createRadialGradient(
    cx,
    cy,
    radius * 0.4,
    cx,
    cy,
    radius
  );
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, strength)})`);
  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.w, box.h);
  context.clip();
  context.fillStyle = shade;
  context.fillRect(box.x, box.y, box.w, box.h);
  context.restore();
}

function drawScanlines(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  strength: number
) {
  context.save();
  context.beginPath();
  context.rect(box.x, box.y, box.w, box.h);
  context.clip();
  context.globalAlpha = Math.min(0.6, strength * 0.55);
  context.fillStyle = "#000000";
  const step = Math.max(2, Math.round(box.h / 220));
  for (let y = box.y; y < box.y + box.h; y += step * 2) {
    context.fillRect(box.x, y, box.w, step);
  }
  context.restore();
}

/**
 * When each word lights up. Beats under the clip drive it when there are
 * enough of them; otherwise the words are simply spread over the clip.
 */
function karaokeStarts(words: number, length: number, beats: number[]) {
  const usable = beats
    .filter(at => at >= 0 && at <= length)
    .sort((a, b) => a - b);
  if (usable.length >= words) return usable.slice(0, words);
  return Array.from({ length: words }, (_, i) => (i * length) / words);
}

/** The shared beat displacement, used by both captions and stickers. */
function beatMove(
  beat: ReturnType<typeof defaultBeat>,
  pulse: number,
  progress: number,
  size: Size
) {
  const kick = beat.react === "none" ? 0 : pulse * (beat.amount ?? 0.55);
  const move = { shiftX: 0, shiftY: 0, tilt: 0, glow: 0, grow: 1, kick };
  if (kick <= 0.001) return move;

  switch (beat.react) {
    case "pop":
      move.grow = 1 + kick * 0.45;
      break;
    case "bounce":
      move.shiftY = -kick * size.h * 0.055;
      break;
    case "shake":
      move.shiftX = Math.sin(progress * 46) * kick * size.w * 0.018;
      break;
    case "wobble":
      move.tilt = Math.sin(progress * 30) * kick * 9;
      break;
    case "jitter":
      move.shiftX = Math.sin(progress * 53) * kick * size.w * 0.014;
      move.shiftY = Math.cos(progress * 61) * kick * size.h * 0.02;
      move.grow = 1 + kick * 0.16;
      break;
    case "glow":
      move.glow = kick;
      break;
    default:
      break;
  }
  return move;
}

function drawCaption(
  context: CanvasRenderingContext2D,
  style: TextStyle,
  alpha: number,
  size: Size,
  progress: number,
  length: number,
  pulse: number,
  beats: number[]
) {
  const anim = style.anim ?? "none";
  // The entrance plays over the first third of a second.
  const enter = Math.max(0, Math.min(1, progress / 0.34));
  const eased = 1 - Math.pow(1 - enter, 3);
  let content = style.content;
  let rise = 0;
  let grow = 1;
  if (anim === "type") {
    const shown = Math.ceil(content.length * enter);
    content = content.slice(0, Math.max(1, shown));
  } else if (anim === "rise") {
    rise = (1 - eased) * size.h * 0.06;
  } else if (anim === "pop") {
    grow = 0.72 + 0.28 * eased + Math.sin(eased * Math.PI) * 0.08;
  }

  // The beat reaction rides on top of the entrance, so a caption can both
  // arrive and then keep answering the drum for as long as it is on screen.
  const beat = style.beat ?? defaultBeat();
  const move = beatMove(beat, pulse, progress, size);
  grow *= move.grow;
  let fill = style.color;
  if (beat.react === "flash" && move.kick > 0.001) {
    fill = mixHex(style.color, beat.color ?? "#e8952e", move.kick);
  }

  const lines = content.split("\n");
  const fontSize = style.size * grow;
  // Fall back for every field a clip made before this style existed may lack.
  const lineHeight = fontSize * (style.lineHeight ?? 1.28);
  const backColor = style.backColor ?? "#000000";
  const backOpacity = style.backOpacity ?? 0.55;
  const spacing = (style.letterSpacing ?? 0) * fontSize;

  context.save();
  context.globalAlpha = alpha;
  context.font = `${style.weight} ${fontSize}px ${fontStack(style.font ?? "sans")}`;
  context.textBaseline = "middle";
  context.textAlign = style.align;
  if ("letterSpacing" in context) {
    (
      context as CanvasRenderingContext2D & { letterSpacing: string }
    ).letterSpacing = `${spacing}px`;
  }

  const cx = style.x * size.w + move.shiftX;
  const cy = style.y * size.h + rise + move.shiftY;
  const turn = (style.rotate ?? 0) + move.tilt;
  if (turn) {
    context.translate(cx, cy);
    context.rotate((turn * Math.PI) / 180);
    context.translate(-cx, -cy);
  }
  const top = cy - ((lines.length - 1) * lineHeight) / 2;

  if (style.back === "box") {
    const widest = lines.reduce(
      (max, line) => Math.max(max, context.measureText(line).width),
      0
    );
    const padX = fontSize * 0.42;
    const padY = fontSize * 0.28;
    const boxW = widest + padX * 2;
    const boxH = lines.length * lineHeight + padY * 2 - (lineHeight - fontSize);
    const boxX =
      style.align === "center"
        ? cx - boxW / 2
        : style.align === "right"
          ? cx - boxW
          : cx - padX;
    const boxY = top - fontSize / 2 - padY;
    context.fillStyle = withAlpha(backColor, backOpacity);
    context.beginPath();
    context.roundRect(boxX, boxY, boxW, boxH, Math.min(14, boxH / 3));
    context.fill();
  } else if (style.back === "shadow") {
    context.shadowColor = withAlpha(backColor, Math.min(1, backOpacity + 0.3));
    context.shadowBlur = fontSize * 0.22;
  }

  // A glow reaction burns brighter than the shadow preset and overrides it,
  // because the two would otherwise fight over the same canvas slot.
  if (move.glow > 0.001) {
    context.shadowColor = withAlpha(
      beat.color ?? "#e8952e",
      0.55 + move.glow * 0.45
    );
    context.shadowBlur = fontSize * (0.18 + move.glow * 0.9);
  }

  const outlined = style.back === "outline";
  if (outlined) {
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.lineWidth = Math.max(2, fontSize * (style.outlineWidth ?? 0.14));
    context.strokeStyle = withAlpha(backColor, Math.min(1, backOpacity + 0.35));
  }

  if (style.karaoke) {
    // Words are placed by hand so each one can take its own colour. The line is
    // measured first and laid out from the left, which is what makes the
    // alignment still come out where the non-karaoke path would put it.
    const perLine = lines.map(line => line.split(/\s+/).filter(Boolean));
    const total = perLine.reduce((count, words) => count + words.length, 0);
    const starts = karaokeStarts(total, length, beats);
    const spaceWidth = context.measureText(" ").width;
    const lit = style.karaokeColor ?? "#ffd27a";
    let index = 0;

    context.textAlign = "left";
    perLine.forEach((words, line) => {
      const widths = words.map(word => context.measureText(word).width);
      const lineWidth =
        widths.reduce((sum, width) => sum + width, 0) +
        spaceWidth * Math.max(0, words.length - 1);
      let x =
        style.align === "center"
          ? cx - lineWidth / 2
          : style.align === "right"
            ? cx - lineWidth
            : cx;
      const y = top + line * lineHeight;
      words.forEach((word, position) => {
        if (outlined) context.strokeText(word, x, y);
        context.fillStyle = progress >= (starts[index] ?? 0) ? lit : fill;
        context.fillText(word, x, y);
        x += widths[position] + spaceWidth;
        index += 1;
      });
    });
    context.restore();
    return;
  }

  // Outline is stroked under the fill so the letters stay legible on any shot.
  if (outlined) {
    lines.forEach((line, index) =>
      context.strokeText(line, cx, top + index * lineHeight)
    );
  }

  context.fillStyle = fill;
  lines.forEach((line, index) =>
    context.fillText(line, cx, top + index * lineHeight)
  );
  context.restore();
}

/** Shapes and emoji over the picture, drawn in the clip's own box. */
function drawSticker(
  context: CanvasRenderingContext2D,
  sticker: Sticker,
  alpha: number,
  size: Size,
  progress: number,
  pulse: number
) {
  const beat = sticker.beat ?? defaultBeat();
  const move = beatMove(beat, pulse, progress, size);
  const reach = Math.min(size.w, size.h) * sticker.size * move.grow;
  const cx = sticker.x * size.w + move.shiftX;
  const cy = sticker.y * size.h + move.shiftY;
  let fill = sticker.color;
  if (beat.react === "flash" && move.kick > 0.001) {
    fill = mixHex(sticker.color, beat.color ?? "#e8952e", move.kick);
  }

  context.save();
  context.globalAlpha = alpha * (sticker.opacity ?? 1);
  context.translate(cx, cy);
  context.rotate((((sticker.rotate ?? 0) + move.tilt) * Math.PI) / 180);
  if (move.glow > 0.001) {
    context.shadowColor = withAlpha(
      beat.color ?? "#e8952e",
      0.6 + move.glow * 0.4
    );
    context.shadowBlur = reach * (0.1 + move.glow * 0.5);
  }
  context.fillStyle = fill;
  context.strokeStyle = sticker.stroke ?? "#ffffff";
  context.lineWidth = Math.max(1, reach * (sticker.strokeWidth ?? 0) * 0.06);
  context.lineJoin = "round";
  context.lineCap = "round";

  const r = reach / 2;
  const finish = () => {
    if (sticker.filled) context.fill();
    if ((sticker.strokeWidth ?? 0) > 0) context.stroke();
  };

  switch (sticker.kind) {
    case "emoji": {
      context.font = `${reach}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(sticker.glyph || "🔥", 0, 0);
      break;
    }
    case "circle":
      context.beginPath();
      context.arc(0, 0, r, 0, Math.PI * 2);
      finish();
      break;
    case "ring":
      context.beginPath();
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.lineWidth = Math.max(2, r * 0.22);
      context.strokeStyle = fill;
      context.stroke();
      break;
    case "rect":
      context.beginPath();
      context.roundRect(-r, -r * 0.68, reach, reach * 0.68, r * 0.12);
      finish();
      break;
    case "frame":
      context.beginPath();
      context.roundRect(-r, -r * 0.68, reach, reach * 0.68, r * 0.12);
      context.lineWidth = Math.max(2, r * 0.12);
      context.strokeStyle = fill;
      context.stroke();
      break;
    case "triangle":
      context.beginPath();
      context.moveTo(0, -r);
      context.lineTo(r * 0.92, r * 0.72);
      context.lineTo(-r * 0.92, r * 0.72);
      context.closePath();
      finish();
      break;
    case "star": {
      context.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.46;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      finish();
      break;
    }
    case "heart": {
      context.beginPath();
      context.moveTo(0, r * 0.75);
      context.bezierCurveTo(
        -r * 1.4,
        -r * 0.2,
        -r * 0.5,
        -r * 1.1,
        0,
        -r * 0.4
      );
      context.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.4, -r * 0.2, 0, r * 0.75);
      context.closePath();
      finish();
      break;
    }
    case "arrow":
      context.beginPath();
      context.moveTo(-r, -r * 0.22);
      context.lineTo(r * 0.3, -r * 0.22);
      context.lineTo(r * 0.3, -r * 0.6);
      context.lineTo(r, 0);
      context.lineTo(r * 0.3, r * 0.6);
      context.lineTo(r * 0.3, r * 0.22);
      context.lineTo(-r, r * 0.22);
      context.closePath();
      finish();
      break;
    case "bubble":
      context.beginPath();
      context.roundRect(-r, -r * 0.8, reach, reach * 0.62, r * 0.28);
      context.moveTo(-r * 0.2, r * 0.04);
      context.lineTo(-r * 0.05, r * 0.6);
      context.lineTo(r * 0.3, r * 0.04);
      context.closePath();
      finish();
      break;
    case "burst": {
      context.beginPath();
      for (let i = 0; i < 24; i += 1) {
        const angle = (Math.PI / 12) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.62;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      finish();
      break;
    }
    case "line":
      context.beginPath();
      context.moveTo(-r, 0);
      context.lineTo(r, 0);
      context.lineWidth = Math.max(2, r * 0.16);
      context.strokeStyle = fill;
      context.stroke();
      break;
    default:
      break;
  }
  context.restore();
}

/**
 * The on-screen waveform. Fed by a short window of the loudest audible source,
 * so it moves with the music rather than being decoration.
 */
function drawViz(
  context: CanvasRenderingContext2D,
  viz: VizStyle,
  samples: number[],
  alpha: number,
  size: Size,
  level: number
) {
  if (samples.length === 0) return;
  const boxW = size.w * viz.width;
  const boxH = size.h * viz.height;
  const cx = viz.x * size.w;
  const cy = viz.y * size.h;
  const left = cx - boxW / 2;
  const bottom = cy + boxH / 2;

  context.save();
  context.globalAlpha = alpha * (viz.opacity ?? 0.85);
  context.fillStyle = viz.color;
  context.strokeStyle = viz.color;

  if (viz.kind === "bars" || viz.kind === "mirror") {
    const slot = boxW / samples.length;
    const width = Math.max(1, slot * 0.62);
    samples.forEach((peak, index) => {
      const height = Math.max(
        2,
        peak * boxH * (viz.kind === "mirror" ? 0.5 : 1)
      );
      const x = left + index * slot + (slot - width) / 2;
      if (viz.kind === "mirror") {
        context.fillRect(x, cy - height, width, height * 2);
      } else {
        context.fillRect(x, bottom - height, width, height);
      }
    });
  } else if (viz.kind === "wave") {
    context.lineWidth = Math.max(2, boxH * 0.035);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    samples.forEach((peak, index) => {
      const x = left + (boxW * index) / Math.max(1, samples.length - 1);
      const y = cy - (peak - 0.5) * boxH * 0.9;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  } else {
    // Circle: spokes around a ring that breathes with the overall level.
    const radius = Math.min(boxW, boxH) * 0.32 * (1 + level * 0.18);
    context.lineWidth = Math.max(2, radius * 0.055);
    context.lineCap = "round";
    samples.forEach((peak, index) => {
      const angle = (index / samples.length) * Math.PI * 2 - Math.PI / 2;
      const reach = radius + peak * Math.min(boxW, boxH) * 0.24;
      context.beginPath();
      context.moveTo(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius
      );
      context.lineTo(
        cx + Math.cos(angle) * reach,
        cy + Math.sin(angle) * reach
      );
      context.stroke();
    });
  }
  context.restore();
}

// ---------------------------------------------------------------- the frame

function drawVideoClip(
  context: CanvasRenderingContext2D,
  clip: Clip,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  size: Size,
  time: number,
  trans: TransitionState,
  fx: EffectState
) {
  const transform = motionAt(clip, time);
  const alpha = transform.opacity * trans.alpha;
  if (alpha <= 0.002) return;

  const place = placement(sw, sh, transform, size);
  context.save();

  // Transition and effect geometry both act about the frame centre, so a slide
  // carries the clip's own box with it rather than sliding inside it.
  const shiftX = (trans.dx + fx.dx) * size.w;
  const shiftY = (trans.dy + fx.dy) * size.h;
  const zoom = trans.scale * fx.scale;
  const spin = trans.spin + fx.spin;
  if (shiftX || shiftY) context.translate(shiftX, shiftY);
  if (zoom !== 1 || spin) {
    context.translate(size.w / 2, size.h / 2);
    if (spin) context.rotate((spin * Math.PI) / 180);
    if (zoom !== 1) context.scale(zoom, zoom);
    context.translate(-size.w / 2, -size.h / 2);
  }

  context.globalAlpha = alpha;
  const blur = trans.blur + fx.blur;
  const graded = isGraded(clip.color);
  if (graded || blur > 0.01) {
    const base = graded ? colorFilter(clip.color, size.h) : "";
    context.filter = blur > 0.01 ? `${base} blur(${blur}px)`.trim() : base;
  }

  // A wipe limits painting to part of the frame; a cover fit limits it to the
  // clip's own box. Both are plain clips, and they intersect naturally.
  if (trans.reveal) {
    context.beginPath();
    context.rect(
      trans.reveal.x * size.w,
      trans.reveal.y * size.h,
      trans.reveal.w * size.w,
      trans.reveal.h * size.h
    );
    context.clip();
  }
  if (place.cropped) {
    context.beginPath();
    context.rect(place.box.x, place.box.y, place.box.w, place.box.h);
    context.clip();
  }

  // Mirroring happens about the clip's own box, not the frame, so a flipped
  // picture-in-picture stays where it was put.
  if (transform.flipX || transform.flipY) {
    const mx = place.box.x + place.box.w / 2;
    const my = place.box.y + place.box.h / 2;
    context.translate(mx, my);
    context.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
    context.translate(-mx, -my);
  }

  if (fx.split > 0.001) {
    drawSplit(context, source, place, fx.split);
  } else {
    context.drawImage(source, place.dx, place.dy, place.w, place.h);
  }
  if (fx.glitch > 0.001) {
    drawGlitch(context, source, sw, sh, place, fx.glitch, time);
  }

  // Everything below is a flat wash, so the picture filter must not apply.
  context.filter = "none";
  if (isTinted(clip.color)) drawTint(context, clip.color, place.box);
  if (fx.vignette > 0.001) drawVignette(context, place.box, fx.vignette);
  if (fx.scanlines > 0.001) drawScanlines(context, place.box, fx.scanlines);
  if (fx.flash > 0.001) {
    context.globalAlpha = alpha * fx.flash;
    context.fillStyle = "#ffffff";
    context.fillRect(place.box.x, place.box.y, place.box.w, place.box.h);
  }

  context.restore();
}

export function drawFrame(
  context: CanvasRenderingContext2D,
  project: Project,
  time: number,
  sources: FrameSources
) {
  const size = {
    w: project.frame?.width ?? FRAME_WIDTH,
    h: project.frame?.height ?? FRAME_HEIGHT,
  };
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.filter = "none";
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#000000";
  context.fillRect(0, 0, size.w, size.h);

  const now = performance.now();
  let veil = 0;
  // Beat energy is the same for every clip in a frame, so it is worked out at
  // most once and only when something actually asks for it.
  let beatPulse: number | null = null;
  let levelPulse: number | null = null;
  const pulseFor = (drive: "beat" | "level", decay: number) => {
    if (drive === "level") {
      if (levelPulse === null) levelPulse = levelAt(project, time);
      return levelPulse;
    }
    if (beatPulse === null) {
      beatPulse = pulseAt(
        project,
        { react: "pop", drive: "beat", amount: 1, decay, color: "#000" },
        time
      );
    }
    return beatPulse;
  };

  for (const clip of visibleVideoLayers(project, time)) {
    const asset = assetOf(project, clip);
    if (!asset) continue;

    let source: CanvasImageSource | null = null;
    let sw = 0;
    let sh = 0;

    if (asset.kind === "video") {
      const element = sources.videoFor(clip);
      const surface = element ? videoSurface(element, now) : null;
      if (surface) {
        source = surface.source;
        sw = surface.w;
        sh = surface.h;
      }
    } else if (asset.kind === "photo") {
      const image = sources.imageFor(asset.id);
      if (image?.complete && image.naturalWidth > 0) {
        source = image;
        sw = image.naturalWidth;
        sh = image.naturalHeight;
      }
    }

    const trans = transitionState(clip, time);
    veil = Math.max(veil, trans.veil);
    if (!source) continue;

    const effect = clip.effect;
    const fx = effectAt(
      effect,
      time,
      effect && effect.kind !== "none" && effect.beat
        ? pulseFor("beat", 0.26)
        : 0
    );
    drawVideoClip(context, clip, source, sw, sh, size, time, trans, fx);
  }

  if (veil > 0) {
    context.save();
    context.globalAlpha = veil;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, size.w, size.h);
    context.restore();
  }

  // Visualisers first, then stickers, then captions: words always on top.
  for (const overlay of visibleText(project, time)) {
    if (!overlay.viz) continue;
    const alpha = overlay.transform.opacity * transitionAlpha(overlay, time);
    if (alpha <= 0.002) continue;
    drawViz(
      context,
      overlay.viz,
      vizSamples(
        project,
        time,
        Math.max(6, Math.min(160, overlay.viz.bars)),
        overlay.viz.source
      ),
      alpha,
      size,
      pulseFor("level", 0.26)
    );
  }

  for (const overlay of visibleText(project, time)) {
    if (!overlay.sticker) continue;
    const alpha = overlay.transform.opacity * transitionAlpha(overlay, time);
    if (alpha <= 0.002) continue;
    const beat = overlay.sticker.beat ?? defaultBeat();
    drawSticker(
      context,
      overlay.sticker,
      alpha,
      size,
      time - overlay.at,
      beat.react === "none" ? 0 : pulseFor(beat.drive, beat.decay)
    );
  }

  for (const caption of visibleText(project, time)) {
    if (!caption.text) continue;
    const alpha = caption.transform.opacity * transitionAlpha(caption, time);
    if (alpha <= 0.002) continue;
    const beat = caption.text.beat ?? defaultBeat();
    const beats = caption.text.karaoke
      ? project.markers
          .filter(at => at >= caption.at && at <= clipEnd(caption))
          .map(at => at - caption.at)
      : [];
    drawCaption(
      context,
      caption.text,
      alpha,
      size,
      time - caption.at,
      clipLength(caption),
      beat.react === "none" ? 0 : pulseFor(beat.drive, beat.decay),
      beats
    );
  }
}
