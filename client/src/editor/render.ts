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
  assetOf,
  blackVeil,
  clipEnd,
  colorFilter,
  fontStack,
  isGraded,
  transitionAlpha,
  visibleText,
  visibleVideoLayers,
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

function drawCaption(
  context: CanvasRenderingContext2D,
  style: TextStyle,
  alpha: number,
  size: Size,
  progress: number
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

  const cx = style.x * size.w;
  const cy = style.y * size.h + rise;
  if (style.rotate) {
    context.translate(cx, cy);
    context.rotate((style.rotate * Math.PI) / 180);
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

  // Outline is stroked under the fill so the letters stay legible on any shot.
  if (style.back === "outline") {
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.lineWidth = Math.max(2, fontSize * (style.outlineWidth ?? 0.14));
    context.strokeStyle = withAlpha(backColor, Math.min(1, backOpacity + 0.35));
    lines.forEach((line, index) =>
      context.strokeText(line, cx, top + index * lineHeight)
    );
  }

  context.fillStyle = style.color;
  lines.forEach((line, index) =>
    context.fillText(line, cx, top + index * lineHeight)
  );
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

  for (const caption of visibleText(project, time)) {
    if (!caption.text) continue;
    const alpha = caption.transform.opacity * transitionAlpha(caption, time);
    if (alpha <= 0.002) continue;
    drawCaption(context, caption.text, alpha, size, time - caption.at);
  }
}
