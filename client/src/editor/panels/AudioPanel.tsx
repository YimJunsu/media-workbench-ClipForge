/**
 * The audio panel: a sound-effect library, the project's own sounds, and the
 * beat tools.
 *
 * The effects are synthesised on demand rather than shipped as files, so the
 * tiles render their own waveform once the effect has been built for preview.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Music4, Play, Plus, Scissors, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Editor } from "../useEditor";
import {
  SFX,
  SFX_CATEGORIES,
  Sfx,
  SfxCategory,
  previewSfx,
  sfxPeaks,
} from "../sfx";
import { formatTime, tracksOfKind } from "../model";

type Tab = "sfx" | "mine" | "beat";

export default function AudioPanel({
  editor,
  onPickAudio,
}: {
  editor: Editor;
  onPickAudio: () => void;
}) {
  const [tab, setTab] = useState<Tab>("sfx");
  const [category, setCategory] = useState<SfxCategory>("transition");
  const [busy, setBusy] = useState<string | null>(null);
  const { project, bpm, selected, selectedIds } = editor;

  const sounds = project.assets.filter(item => item.kind === "audio");
  const videos = project.assets.filter(item => item.kind === "video");
  const shown = SFX.filter(item => item.category === category);

  const place = async (sfx: Sfx) => {
    setBusy(sfx.id);
    try {
      await editor.addSfx(sfx);
      toast.success(`${sfx.name} 을(를) 재생 위치에 넣었습니다.`);
    } catch {
      toast.error("효과음을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel-body">
      <div className="panel-tabs">
        <button
          className={tab === "sfx" ? "is-on" : ""}
          onClick={() => setTab("sfx")}
        >
          효과음
        </button>
        <button
          className={tab === "mine" ? "is-on" : ""}
          onClick={() => setTab("mine")}
        >
          내 오디오
        </button>
        <button
          className={tab === "beat" ? "is-on" : ""}
          onClick={() => setTab("beat")}
        >
          비트
        </button>
      </div>

      {tab === "sfx" && (
        <>
          <div className="chip-row">
            {SFX_CATEGORIES.map(item => (
              <button
                key={item.id}
                className={`chip ${category === item.id ? "is-on" : ""}`}
                onClick={() => setCategory(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <p className="panel-note">
            눌러서 미리 듣고, <b>+</b> 로 재생 위치에 넣습니다. 전부 그 자리에서
            합성되므로 받아올 파일이 없습니다.
          </p>
          <ul className="sfx-list">
            {shown.map(sfx => (
              <SfxRow
                key={sfx.id}
                sfx={sfx}
                busy={busy === sfx.id}
                onPlay={() => void previewSfx(sfx)}
                onAdd={() => void place(sfx)}
              />
            ))}
          </ul>
        </>
      )}

      {tab === "mine" && (
        <>
          <button className="drop-tile" onClick={onPickAudio}>
            <Plus size={16} />
            <strong>음원 가져오기</strong>
            <small>창에 끌어다 놓아도 됩니다</small>
          </button>

          {videos.length > 0 && (
            <>
              <p className="group-title">영상에서 소리 빼기</p>
              <ul className="row-list">
                {videos.map(asset => {
                  const clip = project.clips.find(
                    item => item.assetId === asset.id
                  );
                  return (
                    <li key={asset.id}>
                      <button
                        onClick={async () => {
                          if (!clip) return;
                          const ok = await editor.extractAudio(clip.id);
                          if (ok)
                            toast.success(
                              `${asset.name} 의 소리를 오디오 트랙으로 뺐습니다.`
                            );
                          else
                            toast.error("이 영상에서 소리를 읽지 못했습니다.");
                        }}
                        disabled={!clip}
                      >
                        <Scissors size={13} />
                        <span className="row-name">{asset.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <p className="group-title">넣은 소리</p>
          {sounds.length === 0 ? (
            <p className="panel-note">아직 오디오가 없습니다.</p>
          ) : (
            <ul className="row-list">
              {sounds.map(asset => {
                const clip = project.clips.find(
                  item => item.assetId === asset.id
                );
                return (
                  <li key={asset.id}>
                    <button
                      onClick={() => {
                        if (!clip) return;
                        editor.setSelectedId(clip.id);
                        editor.seek(clip.at);
                      }}
                    >
                      <Music4 size={13} />
                      <span className="row-name">{asset.name}</span>
                      <span className="row-meta">
                        {formatTime(asset.duration)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {tab === "beat" && (
        <>
          <p className="panel-note">
            음악의 타점을 찾아 타임라인에 마커로 찍습니다. 찍어 두면
            자막·스티커의 비트 반응, 비트 스냅, 비트에서 자르기가 전부 이 마커를
            씁니다.
          </p>
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
            disabled={!selected}
            onClick={() => {
              const found = selected ? editor.markBeats(selected.id) : 0;
              if (found > 0) toast.success(`비트 ${found}개를 찾았습니다.`);
              else toast.error("소리가 있는 클립을 선택한 뒤 눌러 주세요.");
            }}
          >
            <Sparkles size={13} /> 선택한 클립에서 비트 찾기
          </button>
          <button
            className="wide-button"
            disabled={project.markers.length === 0}
            onClick={() => {
              const cuts = editor.splitAtMarkers();
              if (cuts > 0) toast.success(`비트에 맞춰 ${cuts}번 잘랐습니다.`);
              else toast.error("자를 수 있는 클립이 없습니다.");
            }}
          >
            <Scissors size={13} /> 비트에서 자르기
          </button>
          <button
            className="wide-button"
            disabled={bpm === null}
            onClick={() => {
              if (bpm === null) return;
              const made = editor.applyBeatGrid(bpm, project.markers[0] ?? 0);
              if (made > 0)
                toast.success(`${bpm} BPM 격자 ${made}칸으로 정리했습니다.`);
            }}
          >
            격자로 정리
          </button>
          <button
            className="wide-button"
            disabled={project.markers.length === 0}
            onClick={() => {
              editor.clearMarkers();
              toast.message("마커를 모두 지웠습니다.");
            }}
          >
            마커 전부 지우기
          </button>

          <p className="group-title">무음 정리</p>
          <button
            className="wide-button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              const { removed, saved } = editor.cutSilence(selected.id);
              if (removed > 0)
                toast.success(
                  `조용한 구간 ${removed}곳을 잘라 ${saved.toFixed(1)}초 줄였습니다.`
                );
              else toast.error("잘라낼 만한 조용한 구간이 없습니다.");
            }}
          >
            <Scissors size={13} /> 무음 자동 컷
          </button>
          <button
            className="wide-button"
            disabled={selectedIds.length === 0}
            onClick={() => {
              if (!selected) return;
              const gain = editor.normalize(selected.id);
              if (gain > 0)
                toast.success(
                  `음량을 ${Math.round(gain * 100)}% 로 맞췄습니다.`
                );
              else toast.error("음량을 잴 수 없는 클립입니다.");
            }}
          >
            음량 자동 맞춤
          </button>
          {tracksOfKind(project, "audio").length === 0 && (
            <p className="panel-warn">오디오 트랙이 없습니다.</p>
          )}
        </>
      )}
    </div>
  );
}

/** One effect: its name, a waveform drawn from the real rendered audio, and
 * the two things you can do with it. */
function SfxRow({
  sfx,
  busy,
  onPlay,
  onAdd,
}: {
  sfx: Sfx;
  busy: boolean;
  onPlay: () => void;
  onAdd: () => void;
}) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    // Building every effect up front would stall the panel, so each tile asks
    // for its own shape once and keeps it.
    if (asked.current) return;
    asked.current = true;
    let alive = true;
    sfxPeaks(sfx)
      .then(value => {
        if (alive) setPeaks(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sfx]);

  return (
    <li className="sfx-row">
      <button className="sfx-play" onClick={onPlay} title="미리 듣기">
        <Play size={12} fill="currentColor" />
      </button>
      <span className="sfx-name">{sfx.name}</span>
      <span className="sfx-wave" aria-hidden="true">
        {(peaks ?? []).map((peak, index) => (
          <i key={index} style={{ height: `${Math.max(6, peak * 100)}%` }} />
        ))}
      </span>
      <span className="sfx-len">{sfx.duration.toFixed(1)}초</span>
      <button
        className="sfx-add"
        onClick={onAdd}
        disabled={busy}
        title="타임라인에 넣기"
      >
        {busy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
      </button>
    </li>
  );
}
