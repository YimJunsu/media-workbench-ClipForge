/**
 * MP4 export built on WebCodecs.
 *
 * Video: frames are composed with the same drawFrame the monitor uses, then
 * handed to a VideoEncoder. Photo and caption-only stretches encode as fast as
 * the encoder will take them; stretches backed by real footage cost one seek
 * per frame, which is still well under real time.
 *
 * Audio: the whole mix is rendered once in an OfflineAudioContext (near
 * instant) and then encoded, so audio never gates the wall clock.
 *
 * The result is a properly indexed MP4 — correct duration, seekable, no
 * conversion needed. That is the whole reason for not using MediaRecorder.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import {
  Clip,
  Project,
  assetOf,
  audibleClips,
  clipEnd,
  clipLength,
  covers,
  peakAt,
  projectDuration,
  sourceTime,
  visibleVideoLayers,
} from "./model";
import { FRAME_HEIGHT, FRAME_WIDTH, drawFrame } from "./render";
import { buildFxChain } from "./audioFx";

const SAMPLE_RATE = 48000;
const CHANNELS = 2;

export function canUseWebCodecs() {
  return (
    typeof window !== "undefined" &&
    "VideoEncoder" in window &&
    "VideoFrame" in window &&
    typeof HTMLCanvasElement !== "undefined"
  );
}

/** Decoded source audio, cached so repeat exports do not decode twice. */
const audioCache = new Map<string, AudioBuffer>();

async function decodeSource(url: string, context: BaseAudioContext) {
  const hit = audioCache.get(url);
  if (hit) return hit;
  const response = await fetch(url);
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  audioCache.set(url, buffer);
  return buffer;
}

/** Same duck envelope the preview uses, so the file matches what you heard. */
function duckAt(project: Project, clip: Clip, at: number) {
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
  const presence = Math.max(0, Math.min(1, (loudest - 0.06) / 0.22));
  return 1 - clip.duck * presence;
}

/** Render every audible clip into one buffer, offline and all at once. */
export async function renderMix(project: Project, duration: number) {
  const frames = Math.max(1, Math.ceil(duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(CHANNELS, frames, SAMPLE_RATE);

  const audible = project.clips.filter(clip => {
    const asset = assetOf(project, clip);
    if (!asset) return false;
    const track = project.tracks.find(item => item.id === clip.trackId);
    if (!track || track.muted) return false;
    if (track.kind === "audio") return true;
    // A video clip carries its own sound unless its track is muted.
    return track.kind === "video" && asset.kind === "video";
  });

  let scheduled = 0;
  for (const clip of audible) {
    const asset = assetOf(project, clip);
    if (!asset) continue;
    let buffer: AudioBuffer;
    try {
      buffer = await decodeSource(asset.url, offline);
    } catch {
      continue; // a file with no decodable audio track just contributes nothing
    }

    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clip.speed || 1;

    const gain = offline.createGain();
    const length = clipLength(clip);
    const level = clip.volume;
    gain.gain.setValueAtTime(clip.fadeIn > 0 ? 0 : level, clip.at);
    if (clip.fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(
        level,
        clip.at + Math.min(clip.fadeIn, length)
      );
    }
    if (clip.fadeOut > 0) {
      const from = Math.max(clip.at, clipEnd(clip) - clip.fadeOut);
      gain.gain.setValueAtTime(level, from);
      gain.gain.linearRampToValueAtTime(0, clipEnd(clip));
    }

    if (clip.duck > 0) {
      // Walk the clip and write the duck envelope as automation points.
      const step = 0.08;
      for (let at = clip.at; at < clipEnd(clip); at += step) {
        gain.gain.setValueAtTime(level * duckAt(project, clip, at), at);
      }
    }

    const chain = buildFxChain(offline, source, clip.fx);
    chain.tail.connect(gain).connect(offline.destination);
    chain.start();
    source.start(clip.at, clip.start, clip.end - clip.start);
    scheduled += 1;
  }

  if (scheduled === 0) return null;
  return offline.startRendering();
}

type Options = {
  project: Project;
  duration: number;
  fps: number;
  /** Video elements the exporter may seek, keyed by track. */
  videoFor: (clip: Clip) => HTMLVideoElement | null;
  imageFor: (assetId: string) => HTMLImageElement | null;
  onProgress: (ratio: number, note: string) => void;
  signal: { cancelled: boolean };
};

function seekTo(element: HTMLVideoElement, time: number) {
  return new Promise<void>(resolve => {
    if (
      Math.abs(element.currentTime - time) < 0.001 &&
      element.readyState >= 2
    ) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      element.removeEventListener("seeked", finish);
      resolve();
    };
    element.addEventListener("seeked", finish);
    try {
      element.currentTime = time;
    } catch {
      finish();
    }
    window.setTimeout(finish, 600);
  });
}

export async function exportMp4(options: Options): Promise<Blob> {
  const { project, duration, fps, videoFor, imageFor, onProgress, signal } =
    options;

  const width = project.frame?.width ?? FRAME_WIDTH;
  const height = project.frame?.height ?? FRAME_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("no 2d context");

  onProgress(0, "소리 정리 중");
  const mix = await renderMix(project, duration);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    ...(mix
      ? {
          audio: {
            codec: "aac",
            sampleRate: SAMPLE_RATE,
            numberOfChannels: CHANNELS,
          },
        }
      : {}),
    fastStart: "in-memory",
  });

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: error => {
      encodeError = error;
    },
  });
  videoEncoder.configure({
    codec: "avc1.4d0028",
    width,
    height,
    bitrate: 6_000_000,
    framerate: fps,
  });

  // Audio first: it is already rendered, so this is quick and keeps the muxer fed.
  if (mix) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: error => {
        encodeError = error;
      },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: 160_000,
    });

    const block = 1024;
    const left = mix.getChannelData(0);
    const right = mix.numberOfChannels > 1 ? mix.getChannelData(1) : left;
    for (let offset = 0; offset < mix.length; offset += block) {
      const count = Math.min(block, mix.length - offset);
      const planar = new Float32Array(count * CHANNELS);
      planar.set(left.subarray(offset, offset + count), 0);
      planar.set(right.subarray(offset, offset + count), count);
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfFrames: count,
        numberOfChannels: CHANNELS,
        timestamp: Math.round((offset / SAMPLE_RATE) * 1e6),
        data: planar,
      });
      audioEncoder.encode(data);
      data.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  const total = Math.max(1, Math.ceil(duration * fps));
  const frameDuration = Math.round(1e6 / fps);

  for (let index = 0; index < total; index += 1) {
    if (signal.cancelled) break;
    const time = index / fps;

    // Only clips actually on screen need their decoder moved.
    for (const clip of visibleVideoLayers(project, time)) {
      const asset = assetOf(project, clip);
      if (asset?.kind !== "video") continue;
      const element = videoFor(clip);
      if (!element) continue;
      await seekTo(
        element,
        Math.min(sourceTime(clip, time), Math.max(0, element.duration - 0.03))
      );
    }

    drawFrame(context, project, time, { videoFor, imageFor });

    const frame = new VideoFrame(canvas, {
      timestamp: index * frameDuration,
      duration: frameDuration,
    });
    videoEncoder.encode(frame, { keyFrame: index % (fps * 2) === 0 });
    frame.close();

    if (videoEncoder.encodeQueueSize > 8) {
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    if (index % 5 === 0) {
      onProgress(index / total, "영상 만드는 중");
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    if (encodeError) throw encodeError;
  }

  onProgress(0.99, "파일로 묶는 중");
  await videoEncoder.flush();
  videoEncoder.close();
  muxer.finalize();

  const target = muxer.target as ArrayBufferTarget;
  return new Blob([target.buffer], { type: "video/mp4" });
}

/** Audible-clip helper reused by the preview graph. */
export function audibleAt(project: Project, time: number) {
  return audibleClips(project, time);
}

export { covers, projectDuration };
