/** Caption templates, subtitle import, the caption list, and beat captions. */
import { useState } from "react";
import { AudioLines, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Editor } from "../useEditor";
import { TEXT_TEMPLATES, formatTime } from "../model";

export default function TextPanel({
  editor,
  onPickSubtitles,
}: {
  editor: Editor;
  onPickSubtitles: () => void;
}) {
  const [lines, setLines] = useState("");
  const { project, bpm, selected } = editor;

  const captions = project.clips
    .filter(clip => clip.text)
    .slice()
    .sort((a, b) => a.at - b.at);

  return (
    <div className="panel-body">
      <p className="group-title">자막 템플릿</p>
      <div className="template-grid">
        {TEXT_TEMPLATES.map(item => (
          <button
            key={item.id}
            className="template"
            onClick={() => {
              editor.addText(item.style);
              toast.success(`${item.name} 을(를) 재생 위치에 넣었습니다.`);
            }}
          >
            <span
              className="template-art"
              style={{
                color: item.style.color ?? "#fff",
                fontWeight: item.style.weight ?? 700,
              }}
            >
              가나다
            </span>
            <span className="template-text">
              <b>{item.name}</b>
              <em>{item.hint}</em>
            </span>
          </button>
        ))}
      </div>

      <button className="drop-tile subtitle-drop" onClick={onPickSubtitles}>
        <FileText size={16} />
        <strong>자막 파일 가져오기</strong>
        <small>.srt · .vtt — 시간까지 그대로 들어옵니다</small>
      </button>

      <p className="group-title">
        <Sparkles size={12} /> 비트마다 자막
      </p>
      <p className="panel-note">
        한 줄에 하나씩 쓰면 마커 하나에 한 줄씩 올라갑니다. 먼저 오디오 탭의
        <b> 비트 찾기</b>로 마커를 만드세요.
      </p>
      <textarea
        className="text-input"
        rows={4}
        placeholder={"첫 번째 줄\n두 번째 줄\n세 번째 줄"}
        value={lines}
        onChange={event => setLines(event.target.value)}
      />
      <div className="stat-row">
        <span>
          마커 <b>{project.markers.length}개</b>
        </span>
        <span>
          템포 <b>{bpm !== null ? `${bpm} BPM` : "—"}</b>
        </span>
      </div>
      <button
        className="wide-button"
        disabled={project.markers.length < 2 || lines.trim().length === 0}
        onClick={() => {
          const made = editor.addCaptionsOnBeats(lines.split("\n"));
          if (made > 0) {
            toast.success(`비트에 맞춰 자막 ${made}개를 놓았습니다.`);
            setLines("");
          } else {
            toast.error("마커가 2개 이상 있어야 합니다.");
          }
        }}
      >
        <Sparkles size={13} /> 비트에 얹기
      </button>

      <button
        className="wide-button"
        onClick={() => {
          editor.addViz();
          toast.success("파형 효과를 재생 위치에 넣었습니다.");
        }}
      >
        <AudioLines size={13} /> 화면에 파형 넣기
      </button>

      <div className="caption-list-head">
        <span>넣은 자막</span>
        <b>{captions.length}개</b>
      </div>
      {captions.length === 0 ? (
        <p className="panel-note">아직 자막이 없습니다.</p>
      ) : (
        <ul className="caption-list">
          {captions.map(clip => (
            <li key={clip.id}>
              <button
                className={`caption-row ${clip.id === selected?.id ? "is-on" : ""}`}
                onClick={() => {
                  editor.setSelectedId(clip.id);
                  editor.seek(clip.at);
                }}
              >
                <span className="caption-at">{formatTime(clip.at)}</span>
                <span className="caption-text">
                  {clip.text?.content.split("\n")[0] || "빈 자막"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
