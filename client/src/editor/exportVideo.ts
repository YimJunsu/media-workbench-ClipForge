/**
 * Real export. The canvas that draws the preview is captured with
 * MediaRecorder while the project plays through once, and every media element's
 * audio is routed into the same recording graph.
 *
 * ponytail: real-time capture, so a 30s cut takes 30s. Rendering faster would
 * need WebCodecs frame-by-frame decoding — worth doing only if the wait hurts.
 */

/** A media element can own only one source node for the lifetime of the page. */
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
let sharedContext: AudioContext | null = null;

function audioContext() {
  if (!sharedContext) {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    sharedContext = new Ctx();
  }
  return sharedContext;
}

function routeIntoGraph(element: HTMLMediaElement, target: AudioNode) {
  const context = audioContext();
  let source = sources.get(element);
  if (!source) {
    source = context.createMediaElementSource(element);
    sources.set(element, source);
    // Keep the speakers alive: routing through the graph detaches the default output.
    source.connect(context.destination);
  }
  source.connect(target);
  return source;
}

export type ExportHandle = {
  cancel: () => void;
};

export async function exportProject(options: {
  canvas: HTMLCanvasElement;
  elements: HTMLMediaElement[];
  duration: number;
  fileName: string;
  seek: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  getTime: () => number;
  onProgress: (ratio: number) => void;
  signal: { cancelled: boolean };
}): Promise<Blob> {
  const {
    canvas,
    elements,
    duration,
    seek,
    setPlaying,
    getTime,
    onProgress,
    signal,
  } = options;

  const context = audioContext();
  if (context.state === "suspended") await context.resume();

  const destination = context.createMediaStreamDestination();
  const routed = elements.map(element => routeIntoGraph(element, destination));

  const videoStream = canvas.captureStream(30);
  const tracks = [
    ...videoStream.getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ];
  const stream = new MediaStream(tracks);

  const mimeType = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find(type => MediaRecorder.isTypeSupported(type));

  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<Blob>(resolve => {
    recorder.onstop = () =>
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
  });

  seek(0);
  await new Promise(resolve => window.setTimeout(resolve, 250));
  recorder.start(200);
  setPlaying(true);

  await new Promise<void>(resolve => {
    const watch = () => {
      if (signal.cancelled) return resolve();
      const at = getTime();
      onProgress(duration > 0 ? Math.min(1, at / duration) : 1);
      if (at >= duration - 0.05) return resolve();
      window.setTimeout(watch, 120);
    };
    watch();
  });

  setPlaying(false);
  await new Promise(resolve => window.setTimeout(resolve, 300));
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await finished;

  routed.forEach(source => source.disconnect(destination));
  videoStream.getTracks().forEach(track => track.stop());
  return blob;
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
