/**
 * One frame renderer, shared by the program monitor and the exporter.
 *
 * Both call drawFrame, so what you preview is literally what gets encoded —
 * transforms, colour grades, transitions and captions included.
 */
import {
  Clip,
  Project,
  TextStyle,
  Transform,
  VizStyle,
  assetOf,
  blackVeil,
  clipEnd,
  clipLength,
  colorFilter,
  defaultBeat,
  fontStack,
  isGraded,
  levelAt,
  pulseAt,
  transitionAlpha,
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
  const kick = beat.react === "none" ? 0 : pulse * (beat.amount ?? 0.55);
  let shiftX = 0;
  let shiftY = 0;
  let tilt = 0;
  let glow = 0;
  let fill = style.color;
  if (kick > 0.001) {
    switch (beat.react) {
      case "pop":
        grow *= 1 + kick * 0.45;
        break;
      case "bounce":
        shiftY = -kick * size.h * 0.055;
        break;
      case "shake":
        shiftX = Math.sin(progress * 46) * kick * size.w * 0.018;
        break;
      case "wobble":
        tilt = Math.sin(progress * 30) * kick * 9;
        break;
      case "jitter":
        shiftX = Math.sin(progress * 53) * kick * size.w * 0.014;
        shiftY = Math.cos(progress * 61) * kick * size.h * 0.02;
        grow *= 1 + kick * 0.16;
        break;
      case "glow":
        glow = kick;
        break;
      case "flash":
        fill = mixHex(style.color, beat.color ?? "#e8952e", kick);
        break;
      default:
        break;
    }
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

  const cx = style.x * size.w + shiftX;
  const cy = style.y * size.h + rise + shiftY;
  const turn = (style.rotate ?? 0) + tilt;
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
  if (glow > 0.001) {
    context.shadowColor = withAlpha(beat.color ?? "#e8952e", 0.55 + glow * 0.45);
    context.shadowBlur = fontSize * (0.18 + glow * 0.9);
  }

  const outlined = style.back === "outline";
  const strokeWidth = Math.max(2, fontSize * (style.outlineWidth ?? 0.14));
  const strokeColor = withAlpha(backColor, Math.min(1, backOpacity + 0.35));
  if (outlined) {
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.lineWidth = strokeWidth;
    context.strokeStyle = strokeColor;
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
      const height = Math.max(2, peak * boxH * (viz.kind === "mirror" ? 0.5 : 1));
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
      context.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      context.lineTo(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
      context.stroke();
    });
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
  context.fillStyle = "#000000";
  context.fillRect(0, 0, size.w, size.h);

  const now = performance.now();
  let veil = 0;

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

    veil = Math.max(veil, blackVeil(clip, time));
    if (!source) continue;

    const alpha = motionAt(clip, time).opacity * transitionAlpha(clip, time);
    if (alpha <= 0.002) continue;

    const box = placement(sw, sh, motionAt(clip, time), size);
    context.save();
    context.globalAlpha = alpha;
    if (isGraded(clip.color)) context.filter = colorFilter(clip.color);
    if (box.cropped) {
      context.beginPath();
      context.rect(box.box.x, box.box.y, box.box.w, box.box.h);
      context.clip();
    }
    context.drawImage(source, box.dx, box.dy, box.w, box.h);
    context.restore();
  }

  if (veil > 0) {
    context.save();
    context.globalAlpha = veil;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, size.w, size.h);
    context.restore();
  }

  // Visualisers first, captions after, so words always sit on top of bars.
  let level: number | null = null;
  for (const overlay of visibleText(project, time)) {
    if (!overlay.viz) continue;
    const alpha = overlay.transform.opacity * transitionAlpha(overlay, time);
    if (alpha <= 0.002) continue;
    if (level === null) level = levelAt(project, time);
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
      level
    );
  }

  for (const caption of visibleText(project, time)) {
    if (!caption.text) continue;
    const alpha = caption.transform.opacity * transitionAlpha(caption, time);
    if (alpha <= 0.002) continue;
    const beat = caption.text.beat ?? defaultBeat();
    const pulse = pulseAt(project, beat, time);
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
      pulse,
      beats
    );
  }
}
