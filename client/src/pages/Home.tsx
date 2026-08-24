/**
 * CreatorCut Studio shell.
 *
 * Two workspaces, as asked: 동영상 편집·생성 and 음원 녹음·편집. They share one
 * project, so audio trimmed in the sound workspace shows up on the video
 * timeline's audio track. The hidden media elements live here so switching
 * workspaces never interrupts playback or breaks the export audio graph.
 */
import { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, Music4, X } from "lucide-react";
import { toast } from "sonner";
import AudioWorkspace from "@/editor/AudioWorkspace";
import VideoWorkspace from "@/editor/VideoWorkspace";
import {
  formatTime,
  isSubtitleFile,
  parseSubtitles,
  tracksOfKind,
} from "@/editor/model";
import { download, exportProject } from "@/editor/exportVideo";
import { canUseWebCodecs, exportMp4 } from "@/editor/exportMp4";
import { useEditor } from "@/editor/useEditor";

type Mode = "video" | "audio";

export default function Home() {
  const editor = useEditor();
  const [mode, setMode] = useState<Mode>("video");
  const [dragging, setDragging] = useState(false);
  const [exportRatio, setExportRatio] = useState<number | null>(null);
  const [exportNote, setExportNote] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);
  const cancelRef = useRef({ cancelled: false });

  const { project, duration, toggle, addFiles, importing, registerAudio } =
    editor;
  // Every audio clip needs its own element so tracks can overlap and mix.
  const sounds = project.clips.filter(clip =>
    tracksOfKind(project, "audio").some(track => track.id === clip.trackId)
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle, editor]);

  /** .srt/.vtt files become caption clips; everything else goes to the library. */
  const takeSubtitles = async (files: File[]) => {
    const subs = files.filter(isSubtitleFile);
    if (subs.length === 0) return [];
    for (const file of subs) {
      const cues = parseSubtitles(await file.text());
      if (cues.length === 0) {
        toast.error(
          `${file.name}에서 자막을 읽지 못했습니다. .srt 또는 .vtt 형식인지 확인해 주세요.`
        );
        continue;
      }
      editor.addSubtitles(cues);
      toast.success(`${file.name}에서 자막 ${cues.length}개를 넣었습니다.`);
    }
    return subs;
  };

  const take = async (files: File[]) => {
    const subs = await takeSubtitles(files);
    const rest = files.filter(file => !subs.includes(file));
    if (rest.length === 0) return;
    const result = await addFiles(rest);
    if (result.rejected > 0) {
      toast.error("영상, 사진, 음원 파일만 가져올 수 있습니다.");
    }
  };

  const runExport = async () => {
    const canvas = canvasRef.current;
    if (duration <= 0) return;
    if (mode !== "video") setMode("video");

    cancelRef.current = { cancelled: false };
    // WebCodecs gives a properly indexed mp4 and runs faster than real time.
    // MediaRecorder stays as the fallback for browsers without it.
    if (canUseWebCodecs()) {
      setExportRatio(0);
      setExportNote("준비 중");
      const started = performance.now();
      try {
        const blob = await exportMp4({
          project,
          duration,
          fps: 30,
          videoFor: editor.videoFor,
          imageFor: editor.imageFor,
          onProgress: (ratio, note) => {
            setExportRatio(ratio);
            setExportNote(note);
          },
          signal: cancelRef.current,
        });
        if (cancelRef.current.cancelled) {
          toast.message("내보내기를 멈췄습니다.");
        } else {
          download(blob, "creatorcut.mp4");
          const took = ((performance.now() - started) / 1000).toFixed(1);
          toast.success(
            "내보내기 완료 · " +
              took +
              "초 걸림 (영상 길이 " +
              duration.toFixed(1) +
              "초)"
          );
        }
      } catch (error) {
        console.error(error);
        toast.error("mp4로 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setExportRatio(null);
        setExportNote("");
      }
      return;
    }

    if (!canvas) return;

    const elements: HTMLMediaElement[] = [];
    Array.from(editor.videoRefs.current.values()).forEach(el =>
      elements.push(el)
    );
    for (const clip of sounds) {
      const element = editor.audioRefs.current.get(clip.id);
      if (element) elements.push(element);
    }

    setExportRatio(0);
    setExportNote("실시간 녹화 중");
    try {
      const blob = await exportProject({
        canvas,
        elements,
        duration,
        fileName: "creatorcut.webm",
        seek: editor.seek,
        setPlaying: editor.setPlaying,
        getTime: () => editor.timeRef.current,
        onProgress: setExportRatio,
        signal: cancelRef.current,
      });
      if (cancelRef.current.cancelled) {
        toast.message("내보내기를 멈췄습니다.");
      } else if (blob.size > 0) {
        download(blob, "creatorcut.webm");
        toast.success(
          "내보내기를 마쳤습니다. creatorcut.webm 파일을 확인하세요."
        );
      } else {
        toast.error("내보낸 파일이 비어 있습니다. 다시 시도해 주세요.");
      }
    } catch {
      toast.error(
        "이 브라우저는 내보내기를 지원하지 않습니다. 최신 Chrome이나 Edge를 사용해 주세요."
      );
    } finally {
      setExportRatio(null);
      setExportNote("");
      editor.setPlaying(false);
    }
  };

  return (
    <div
      className="app"
      onDragOver={event => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={event => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        void take(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="topbar">
        <div className="brand">
          <img src="/assets/mark.svg" alt="" />
          <span>CreatorCut</span>
        </div>

        <nav className="modes" aria-label="작업 메뉴">
          <button
            className={mode === "video" ? "is-on" : ""}
            onClick={() => setMode("video")}
            aria-current={mode === "video"}
          >
            <Film size={15} />
            <span>
              동영상 편집<em>영상·사진으로 만들기</em>
            </span>
          </button>
          <button
            className={mode === "audio" ? "is-on" : ""}
            onClick={() => setMode("audio")}
            aria-current={mode === "audio"}
          >
            <Music4 size={15} />
            <span>
              음원 편집<em>녹음하고 다듬기</em>
            </span>
          </button>
        </nav>

        <div className="topbar-end">
          {importing > 0 && (
            <span className="status">
              <Loader2 size={14} className="spin" /> 불러오는 중 {importing}
            </span>
          )}
          <span className="project-time">{formatTime(duration)}</span>
          <button
            className="export-button"
            onClick={runExport}
            disabled={duration <= 0 || exportRatio !== null}
          >
            <Download size={15} /> 내보내기
          </button>
        </div>
      </header>

      {mode === "video" ? (
        <VideoWorkspace
          editor={editor}
          canvasRef={canvasRef}
          onPickVisual={() => visualInput.current?.click()}
          onPickAudio={() => audioInput.current?.click()}
          onPickSubtitles={() => subtitleInput.current?.click()}
        />
      ) : (
        <AudioWorkspace
          editor={editor}
          onPickAudio={() => audioInput.current?.click()}
        />
      )}

      {/* Hidden transports. They outlive workspace switches on purpose. */}
      {/* One decoder per video track, so tracks can be composited together. */}
      {tracksOfKind(project, "video").map(track => (
        <video
          key={track.id}
          ref={editor.videoRefFor(track.id)}
          className="hidden-media"
          playsInline
          preload="auto"
        />
      ))}
      {sounds.map(clip => {
        const asset = editor.assetFor(clip);
        return asset ? (
          <audio
            key={clip.id}
            ref={element => registerAudio(clip.id, element)}
            src={asset.url}
            className="hidden-media"
            preload="auto"
          />
        ) : null;
      })}

      <input
        ref={visualInput}
        type="file"
        className="hidden-media"
        accept="video/*,image/*"
        multiple
        onChange={event => {
          void take(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={audioInput}
        type="file"
        className="hidden-media"
        accept="audio/*"
        multiple
        onChange={event => {
          void take(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <input
        ref={subtitleInput}
        type="file"
        className="hidden-media"
        accept=".srt,.vtt,text/vtt"
        multiple
        onChange={event => {
          void takeSubtitles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {dragging && <div className="drop-veil">놓으면 가져옵니다</div>}

      {exportRatio !== null && (
        <div className="export-veil" role="status">
          <div className="export-card">
            <strong>내보내는 중</strong>
            <p>
              영상을 처음부터 끝까지 재생하며 녹화합니다. 창을 그대로 두세요.
            </p>
            <div className="export-bar">
              <i style={{ width: `${Math.round(exportRatio * 100)}%` }} />
            </div>
            <span className="export-pct">{Math.round(exportRatio * 100)}%</span>
            <button
              className="ghost-button"
              onClick={() => {
                cancelRef.current.cancelled = true;
              }}
            >
              <X size={14} /> 멈추기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
