/**
 * The right-hand panel: everything about whatever is selected.
 *
 * It branches on what the clip *is* — a sticker, an on-screen waveform, a
 * caption or a piece of footage — because those have almost nothing in common
 * beyond living on a timeline.
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Activity,
  Blend,
  Copy,
  Gauge,
  LayoutGrid,
  Move,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { Editor } from "./useEditor";
import {
  AUDIO_FX,
  BEAT_REACTS,
  BeatStyle,
  CAPTION_ANIMS,
  EFFECTS,
  FONTS,
  LAYOUTS,
  MOTIONS,
  SPEEDS,
  STICKER_SHAPES,
  Sticker,
  TextStyle,
  VIZ_KINDS,
  VizStyle,
  clipLength,
  defaultBeat,
  formatTime,
} from "./model";

export default function Inspector({ editor }: { editor: Editor }) {
  const { selected } = editor;
  return (
    <aside className="panel inspector">
      <div className="panel-title">
        <h2>속성</h2>
        {selected && <small>{formatTime(clipLength(selected), true)}</small>}
      </div>
      {!selected ? (
        <p className="panel-empty">
          타임라인에서 클립을 선택하면 여기에서 조절합니다.
        </p>
      ) : selected.sticker ? (
        <StickerFields
          editor={editor}
          sticker={selected.sticker}
          id={selected.id}
        />
      ) : selected.viz ? (
        <VizFields editor={editor} viz={selected.viz} id={selected.id} />
      ) : selected.text ? (
        <TextFields editor={editor} text={selected.text} id={selected.id} />
      ) : (
        <MediaFields editor={editor} />
      )}
    </aside>
  );
}

// -------------------------------------------------------------- shared parts

function Length({ editor, id }: { editor: Editor; id: string }) {
  const clip = editor.project.clips.find(item => item.id === id);
  if (!clip) return null;
  return (
    <label className="field tight">
      <span>
        길이 <b>{clipLength(clip).toFixed(1)}초</b>
      </span>
      <input
        type="range"
        min={5}
        max={600}
        value={Math.round(clipLength(clip) * 10)}
        onChange={event =>
          editor.patchClip(id, {
            end: clip.start + Number(event.target.value) / 10,
          })
        }
      />
    </label>
  );
}

function Actions({ editor, id }: { editor: Editor; id: string }) {
  return (
    <div className="split-row">
      <button onClick={() => editor.duplicateClip(id)}>
        <Copy size={13} /> 복제
      </button>
      <button className="danger" onClick={() => editor.removeClip(id)}>
        <Trash2 size={13} /> 삭제
      </button>
    </div>
  );
}

/** The beat reaction, shared by captions and stickers. */
function BeatFields({
  beat,
  markers,
  bpm,
  onPatch,
}: {
  beat: BeatStyle;
  markers: number;
  bpm: number | null;
  onPatch: (patch: Partial<BeatStyle>) => void;
}) {
  const active = beat.react !== "none";
  const hint = BEAT_REACTS.find(item => item.id === beat.react)?.hint ?? "";

  return (
    <>
      <p className="group-title">
        <Activity size={12} /> 비트 반응
      </p>
      <div className="field">
        <div className="chip-grid">
          {BEAT_REACTS.map(item => (
            <button
              key={item.id}
              className={`chip ${beat.react === item.id ? "is-on" : ""}`}
              onClick={() => onPatch({ react: item.id })}
              title={item.hint}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      {active && (
        <>
          <p className="panel-note">{hint}</p>
          <div className="field tight">
            <span>무엇에 맞출까</span>
            <div className="segmented">
              <button
                className={beat.drive === "beat" ? "is-on" : ""}
                onClick={() => onPatch({ drive: "beat" })}
              >
                비트 마커
              </button>
              <button
                className={beat.drive === "level" ? "is-on" : ""}
                onClick={() => onPatch({ drive: "level" })}
              >
                소리 크기
              </button>
            </div>
          </div>
          {beat.drive === "beat" && markers === 0 ? (
            <p className="panel-warn">
              마커가 없습니다. 오디오 탭에서 비트를 찾거나 M 키로 찍으세요.
            </p>
          ) : beat.drive === "beat" ? (
            <p className="panel-note">
              마커 {markers}개{bpm !== null && ` · ${bpm} BPM`}
            </p>
          ) : null}
          <label className="field tight">
            <span>
              세기 <b>{Math.round(beat.amount * 100)}%</b>
            </span>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(beat.amount * 100)}
              onChange={event =>
                onPatch({ amount: Number(event.target.value) / 100 })
              }
            />
          </label>
          {beat.drive === "beat" && (
            <label className="field tight">
              <span>
                여운 <b>{beat.decay.toFixed(2)}초</b>
              </span>
              <input
                type="range"
                min={6}
                max={80}
                value={Math.round(beat.decay * 100)}
                onChange={event =>
                  onPatch({ decay: Number(event.target.value) / 100 })
                }
              />
            </label>
          )}
          {(beat.react === "flash" || beat.react === "glow") && (
            <label className="field tight">
              <span>반응 색</span>
              <input
                type="color"
                className="swatch"
                value={beat.color}
                onChange={event => onPatch({ color: event.target.value })}
              />
            </label>
          )}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ sticker

function StickerFields({
  editor,
  sticker,
  id,
}: {
  editor: Editor;
  sticker: Sticker;
  id: string;
}) {
  const patch = (value: Partial<Sticker>) => editor.patchSticker(id, value);
  return (
    <div className="fields">
      <div className="field-head">
        <strong>스티커</strong>
      </div>
      {sticker.kind === "emoji" ? (
        <label className="field">
          <span>이모지</span>
          <input
            className="text-input"
            value={sticker.glyph}
            onChange={event => patch({ glyph: event.target.value })}
          />
        </label>
      ) : (
        <div className="field">
          <span>도형</span>
          <div className="chip-grid">
            {STICKER_SHAPES.map(shape => (
              <button
                key={shape.id}
                className={`chip ${sticker.kind === shape.id ? "is-on" : ""}`}
                onClick={() => patch({ kind: shape.id })}
              >
                {shape.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {sticker.kind !== "emoji" && (
        <>
          <label className="field tight">
            <span>색</span>
            <input
              type="color"
              className="swatch"
              value={sticker.color}
              onChange={event => patch({ color: event.target.value })}
            />
          </label>
          <label className="field tight">
            <span>
              테두리 <b>{sticker.strokeWidth.toFixed(1)}</b>
            </span>
            <input
              type="range"
              min={0}
              max={20}
              value={Math.round(sticker.strokeWidth * 10)}
              onChange={event =>
                patch({ strokeWidth: Number(event.target.value) / 10 })
              }
            />
          </label>
          {sticker.strokeWidth > 0 && (
            <label className="field tight">
              <span>테두리 색</span>
              <input
                type="color"
                className="swatch"
                value={sticker.stroke}
                onChange={event => patch({ stroke: event.target.value })}
              />
            </label>
          )}
        </>
      )}

      <Slider
        label="크기"
        value={sticker.size}
        min={2}
        max={100}
        onChange={size => patch({ size })}
      />
      <Slider
        label="가로 위치"
        value={sticker.x}
        min={0}
        max={100}
        onChange={x => patch({ x })}
      />
      <Slider
        label="세로 위치"
        value={sticker.y}
        min={0}
        max={100}
        onChange={y => patch({ y })}
      />
      <Slider
        label="진하기"
        value={sticker.opacity}
        min={5}
        max={100}
        onChange={opacity => patch({ opacity })}
      />
      <label className="field tight">
        <span>
          기울이기 <b>{sticker.rotate}°</b>
        </span>
        <input
          type="range"
          min={-180}
          max={180}
          value={sticker.rotate}
          onChange={event => patch({ rotate: Number(event.target.value) })}
        />
      </label>

      <BeatFields
        beat={sticker.beat ?? defaultBeat()}
        markers={editor.project.markers.length}
        bpm={editor.bpm}
        onPatch={value =>
          patch({ beat: { ...(sticker.beat ?? defaultBeat()), ...value } })
        }
      />
      <Length editor={editor} id={id} />
      <Actions editor={editor} id={id} />
    </div>
  );
}

/** A 0..1 value shown as a percentage, which is how people think about these. */
function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field tight">
      <span>
        {label} <b>{Math.round(value * 100)}%</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={Math.round(value * 100)}
        onChange={event => onChange(Number(event.target.value) / 100)}
      />
    </label>
  );
}

// ----------------------------------------------------------------- waveform

function VizFields({
  editor,
  viz,
  id,
}: {
  editor: Editor;
  viz: VizStyle;
  id: string;
}) {
  const patch = (value: Partial<VizStyle>) => editor.patchViz(id, value);
  const sounds = editor.project.clips.filter(clip => {
    const track = editor.project.tracks.find(item => item.id === clip.trackId);
    return track?.kind === "audio";
  });

  return (
    <div className="fields">
      <div className="field-head">
        <strong>파형 효과</strong>
      </div>
      <p className="panel-note">화면 위에서 소리에 맞춰 움직이는 파형입니다.</p>
      <div className="field">
        <span>모양</span>
        <div className="chip-grid">
          {VIZ_KINDS.map(item => (
            <button
              key={item.id}
              className={`chip ${viz.kind === item.id ? "is-on" : ""}`}
              onClick={() => patch({ kind: item.id })}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>따라갈 소리</span>
        <div className="chip-grid">
          <button
            className={`chip ${viz.source === "" ? "is-on" : ""}`}
            onClick={() => patch({ source: "" })}
          >
            가장 큰 소리
          </button>
          {sounds.map(clip => (
            <button
              key={clip.id}
              className={`chip ${viz.source === clip.id ? "is-on" : ""}`}
              onClick={() => patch({ source: clip.id })}
            >
              {editor.assetFor(clip)?.name ?? "오디오"}
            </button>
          ))}
        </div>
      </div>
      <label className="field tight">
        <span>색</span>
        <input
          type="color"
          className="swatch"
          value={viz.color}
          onChange={event => patch({ color: event.target.value })}
        />
      </label>
      <Slider
        label="진하기"
        value={viz.opacity}
        min={10}
        max={100}
        onChange={opacity => patch({ opacity })}
      />
      <Slider
        label="가로 위치"
        value={viz.x}
        min={0}
        max={100}
        onChange={x => patch({ x })}
      />
      <Slider
        label="세로 위치"
        value={viz.y}
        min={0}
        max={100}
        onChange={y => patch({ y })}
      />
      <Slider
        label="너비"
        value={viz.width}
        min={10}
        max={100}
        onChange={width => patch({ width })}
      />
      <Slider
        label="높이"
        value={viz.height}
        min={4}
        max={80}
        onChange={height => patch({ height })}
      />
      <label className="field tight">
        <span>
          막대 수 <b>{viz.bars}</b>
        </span>
        <input
          type="range"
          min={8}
          max={140}
          value={viz.bars}
          onChange={event => patch({ bars: Number(event.target.value) })}
        />
      </label>
      <Length editor={editor} id={id} />
      <Actions editor={editor} id={id} />
    </div>
  );
}

// ------------------------------------------------------------------ caption

function TextFields({
  editor,
  text,
  id,
}: {
  editor: Editor;
  text: TextStyle;
  id: string;
}) {
  const patch = (value: Partial<TextStyle>) => editor.patchText(id, value);

  return (
    <div className="fields">
      <div className="field-head">
        <strong>자막</strong>
      </div>
      <label className="field">
        <span>내용</span>
        <textarea
          className="text-input"
          rows={3}
          value={text.content}
          onChange={event => patch({ content: event.target.value })}
        />
      </label>

      <p className="group-title">글꼴</p>
      <div className="chip-grid">
        {FONTS.map(font => (
          <button
            key={font.id}
            className={`chip ${text.font === font.id ? "is-on" : ""}`}
            onClick={() => patch({ font: font.id })}
            style={{ fontFamily: font.stack }}
          >
            {font.name}
          </button>
        ))}
      </div>
      <label className="field tight">
        <span>
          크기 <b>{text.size}px</b>
        </span>
        <input
          type="range"
          min={18}
          max={200}
          value={text.size}
          onChange={event => patch({ size: Number(event.target.value) })}
        />
      </label>
      <div className="field tight">
        <span>굵기</span>
        <div className="segmented">
          {[400, 600, 700, 900].map(weight => (
            <button
              key={weight}
              className={text.weight === weight ? "is-on" : ""}
              onClick={() => patch({ weight })}
            >
              {weight}
            </button>
          ))}
        </div>
      </div>
      <label className="field tight">
        <span>글자 색</span>
        <input
          type="color"
          className="swatch"
          value={text.color}
          onChange={event => patch({ color: event.target.value })}
        />
      </label>
      <div className="field tight">
        <span>정렬</span>
        <div className="segmented">
          {(["left", "center", "right"] as const).map(align => {
            const Icon =
              align === "left"
                ? AlignLeft
                : align === "center"
                  ? AlignCenter
                  : AlignRight;
            return (
              <button
                key={align}
                className={text.align === align ? "is-on" : ""}
                onClick={() => patch({ align })}
                aria-label={align}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="field tight">
        <span>등장 효과</span>
        <div className="segmented">
          {CAPTION_ANIMS.map(item => (
            <button
              key={item.id}
              className={(text.anim ?? "none") === item.id ? "is-on" : ""}
              onClick={() => patch({ anim: item.id })}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <BeatFields
        beat={text.beat ?? defaultBeat()}
        markers={editor.project.markers.length}
        bpm={editor.bpm}
        onPatch={value => editor.patchBeat(id, value)}
      />
      <div className="field tight">
        <span>가사처럼 한 단어씩</span>
        <div className="segmented">
          <button
            className={!text.karaoke ? "is-on" : ""}
            onClick={() => patch({ karaoke: false })}
          >
            끄기
          </button>
          <button
            className={text.karaoke ? "is-on" : ""}
            onClick={() => patch({ karaoke: true })}
          >
            켜기
          </button>
        </div>
      </div>
      {text.karaoke && (
        <label className="field tight">
          <span>지나간 단어 색</span>
          <input
            type="color"
            className="swatch"
            value={text.karaokeColor ?? "#ffd27a"}
            onChange={event => patch({ karaokeColor: event.target.value })}
          />
        </label>
      )}

      <p className="group-title">배경과 테두리</p>
      <div className="field tight">
        <span>종류</span>
        <div className="segmented">
          {(["box", "outline", "shadow"] as const).map(kind => (
            <button
              key={kind}
              className={text.back === kind ? "is-on" : ""}
              onClick={() => patch({ back: kind })}
            >
              {kind === "box"
                ? "상자"
                : kind === "outline"
                  ? "외곽선"
                  : "그림자"}
            </button>
          ))}
        </div>
      </div>
      <label className="field tight">
        <span>배경 색</span>
        <input
          type="color"
          className="swatch"
          value={text.backColor}
          onChange={event => patch({ backColor: event.target.value })}
        />
      </label>
      <Slider
        label="배경 진하기"
        value={text.backOpacity}
        min={0}
        max={100}
        onChange={backOpacity => patch({ backOpacity })}
      />
      {text.back === "outline" && (
        <Slider
          label="외곽선 두께"
          value={text.outlineWidth}
          min={2}
          max={40}
          onChange={outlineWidth => patch({ outlineWidth })}
        />
      )}

      <p className="group-title">배치</p>
      <Slider
        label="가로 위치"
        value={text.x}
        min={0}
        max={100}
        onChange={x => patch({ x })}
      />
      <Slider
        label="세로 위치"
        value={text.y}
        min={0}
        max={100}
        onChange={y => patch({ y })}
      />
      <label className="field tight">
        <span>
          기울이기 <b>{text.rotate}°</b>
        </span>
        <input
          type="range"
          min={-180}
          max={180}
          value={text.rotate}
          onChange={event => patch({ rotate: Number(event.target.value) })}
        />
      </label>
      <label className="field tight">
        <span>
          줄 간격 <b>{(text.lineHeight ?? 1.28).toFixed(2)}</b>
        </span>
        <input
          type="range"
          min={90}
          max={220}
          value={Math.round((text.lineHeight ?? 1.28) * 100)}
          onChange={event =>
            patch({ lineHeight: Number(event.target.value) / 100 })
          }
        />
      </label>
      <label className="field tight">
        <span>
          자간 <b>{((text.letterSpacing ?? 0) * 100).toFixed(0)}</b>
        </span>
        <input
          type="range"
          min={-10}
          max={40}
          value={Math.round((text.letterSpacing ?? 0) * 100)}
          onChange={event =>
            patch({ letterSpacing: Number(event.target.value) / 100 })
          }
        />
      </label>

      <Length editor={editor} id={id} />
      <button
        className="wide-button"
        onClick={() => {
          const touched = editor.applyTextStyleToAll(id);
          toast.success(
            touched > 0
              ? `다른 자막 ${touched}개에 이 모양을 입혔습니다.`
              : "다른 자막이 없습니다."
          );
        }}
      >
        <Copy size={13} /> 이 모양을 모든 자막에 적용
      </button>
      <button
        className="wide-button"
        onClick={() => {
          const touched = editor.applyBeatToAll(id);
          toast.success(
            touched > 0
              ? `자막 ${touched}개에 같은 비트 반응을 걸었습니다.`
              : "다른 자막이 없습니다."
          );
        }}
      >
        <Activity size={13} /> 비트 반응을 모든 자막에 적용
      </button>
      <Actions editor={editor} id={id} />
    </div>
  );
}

// -------------------------------------------------------- footage and photos

function MediaFields({ editor }: { editor: Editor }) {
  const clip = editor.selected!;
  const id = clip.id;
  const asset = editor.assetFor(clip);
  const effect = clip.effect;

  return (
    <div className="fields">
      <div className="field-head">
        <strong>{asset?.name ?? "클립"}</strong>
        <small>
          {asset?.kind === "photo"
            ? "사진"
            : asset?.kind === "audio"
              ? "오디오"
              : "영상"}
        </small>
      </div>

      {asset?.kind !== "audio" && (
        <>
          <p className="group-title">
            <LayoutGrid size={12} /> 화면 배치
          </p>
          <div className="chip-grid">
            {LAYOUTS.map(layout => (
              <button
                key={layout.name}
                className="chip"
                onClick={() => editor.patchTransform(id, layout.transform)}
              >
                {layout.name}
              </button>
            ))}
          </div>
          <Slider
            label="크기"
            value={clip.transform.scale}
            min={10}
            max={300}
            onChange={scale => editor.patchTransform(id, { scale })}
          />
          <label className="field tight">
            <span>
              <Move size={12} /> 가로 위치{" "}
              <b>{Math.round(clip.transform.x * 100)}</b>
            </span>
            <input
              type="range"
              min={-60}
              max={60}
              value={Math.round(clip.transform.x * 100)}
              onChange={event =>
                editor.patchTransform(id, {
                  x: Number(event.target.value) / 100,
                })
              }
            />
          </label>
          <label className="field tight">
            <span>
              세로 위치 <b>{Math.round(clip.transform.y * 100)}</b>
            </span>
            <input
              type="range"
              min={-60}
              max={60}
              value={Math.round(clip.transform.y * 100)}
              onChange={event =>
                editor.patchTransform(id, {
                  y: Number(event.target.value) / 100,
                })
              }
            />
          </label>
          <Slider
            label="투명도"
            value={clip.transform.opacity}
            min={0}
            max={100}
            onChange={opacity => editor.patchTransform(id, { opacity })}
          />

          <p className="group-title">
            <RotateCcw size={12} /> 움직임
          </p>
          <div className="chip-grid">
            {MOTIONS.map(motion => (
              <button
                key={motion.id}
                className={`chip ${clip.motion?.kind === motion.id ? "is-on" : ""}`}
                onClick={() =>
                  editor.patchClip(id, {
                    motion: { ...clip.motion, kind: motion.id },
                  })
                }
              >
                {motion.name}
              </button>
            ))}
          </div>

          <p className="group-title">
            <Sparkles size={12} /> 화면 효과
          </p>
          <div className="chip-grid">
            {EFFECTS.map(item => (
              <button
                key={item.id}
                className={`chip ${effect?.kind === item.id ? "is-on" : ""}`}
                onClick={() => editor.patchEffect(id, { kind: item.id })}
                title={item.hint}
              >
                {item.name}
              </button>
            ))}
          </div>
          {effect && effect.kind !== "none" && (
            <>
              <Slider
                label="효과 세기"
                value={effect.amount}
                min={5}
                max={100}
                onChange={amount => editor.patchEffect(id, { amount })}
              />
              <div className="field tight">
                <span>박자에 맞추기</span>
                <div className="segmented">
                  <button
                    className={!effect.beat ? "is-on" : ""}
                    onClick={() => editor.patchEffect(id, { beat: false })}
                  >
                    계속
                  </button>
                  <button
                    className={effect.beat ? "is-on" : ""}
                    onClick={() => editor.patchEffect(id, { beat: true })}
                  >
                    비트마다
                  </button>
                </div>
              </div>
            </>
          )}

          <p className="group-title">
            <Palette size={12} /> 색 보정
          </p>
          <Slider
            label="밝기"
            value={clip.color.brightness}
            min={20}
            max={200}
            onChange={brightness => editor.patchColor(id, { brightness })}
          />
          <Slider
            label="대비"
            value={clip.color.contrast}
            min={20}
            max={200}
            onChange={contrast => editor.patchColor(id, { contrast })}
          />
          <Slider
            label="채도"
            value={clip.color.saturate}
            min={0}
            max={250}
            onChange={saturate => editor.patchColor(id, { saturate })}
          />
          <label className="field tight">
            <span>
              색조 <b>{clip.color.hue}°</b>
            </span>
            <input
              type="range"
              min={-180}
              max={180}
              value={clip.color.hue}
              onChange={event =>
                editor.patchColor(id, { hue: Number(event.target.value) })
              }
            />
          </label>
          <Slider
            label="흐리게"
            value={(clip.color.blur ?? 0) / 20}
            min={0}
            max={100}
            onChange={v => editor.patchColor(id, { blur: v * 20 })}
          />
          <Slider
            label="색 입히기"
            value={clip.color.tintAmount ?? 0}
            min={0}
            max={100}
            onChange={tintAmount => editor.patchColor(id, { tintAmount })}
          />
          {(clip.color.tintAmount ?? 0) > 0 && (
            <label className="field tight">
              <span>입힐 색</span>
              <input
                type="color"
                className="swatch"
                value={clip.color.tint ?? "#ffffff"}
                onChange={event =>
                  editor.patchColor(id, { tint: event.target.value })
                }
              />
            </label>
          )}

          <p className="group-title">
            <Blend size={12} /> 전환
          </p>
          <p className="panel-note">
            왼쪽 <b>전환</b> 탭에서 종류를 고릅니다. 지금 걸린 것:{" "}
            <b>{clip.transition.in}</b> / <b>{clip.transition.out}</b>
          </p>
        </>
      )}

      {asset?.kind !== "photo" && (
        <>
          <p className="group-title">
            <Volume2 size={12} /> 소리
          </p>
          <Slider
            label="볼륨"
            value={clip.volume}
            min={0}
            max={200}
            onChange={volume => editor.patchClip(id, { volume })}
          />
          <label className="field tight">
            <span>
              페이드 인 <b>{clip.fadeIn.toFixed(1)}초</b>
            </span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={clip.fadeIn}
              onChange={event =>
                editor.patchClip(id, { fadeIn: Number(event.target.value) })
              }
            />
          </label>
          <label className="field tight">
            <span>
              페이드 아웃 <b>{clip.fadeOut.toFixed(1)}초</b>
            </span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={clip.fadeOut}
              onChange={event =>
                editor.patchClip(id, { fadeOut: Number(event.target.value) })
              }
            />
          </label>
          <Slider
            label="목소리에 맞춰 낮추기"
            value={clip.duck}
            min={0}
            max={100}
            onChange={duck => editor.patchClip(id, { duck })}
          />

          <p className="group-title">
            <Waves size={12} /> 소리 효과
          </p>
          <div className="chip-grid">
            {AUDIO_FX.map(item => (
              <button
                key={item.id}
                className={`chip ${clip.fx.kind === item.id ? "is-on" : ""}`}
                onClick={() => editor.patchFx(id, { kind: item.id })}
                title={item.group}
              >
                {item.name}
              </button>
            ))}
          </div>
          {clip.fx.kind !== "none" && (
            <Slider
              label="효과 세기"
              value={clip.fx.amount}
              min={5}
              max={100}
              onChange={amount => editor.patchFx(id, { amount })}
            />
          )}

          <p className="group-title">
            <Gauge size={12} /> 속도
          </p>
          <div className="segmented">
            {SPEEDS.map(speed => (
              <button
                key={speed}
                className={clip.speed === speed ? "is-on" : ""}
                onClick={() => editor.patchClip(id, { speed })}
              >
                {speed}x
              </button>
            ))}
          </div>
        </>
      )}

      <Actions editor={editor} id={id} />
    </div>
  );
}
