/** Emoji and shapes you can drop over the picture. */
import { useState } from "react";
import { toast } from "sonner";
import { Editor } from "../useEditor";
import { STICKER_EMOJI, STICKER_SHAPES, StickerKind } from "../model";

const SHAPE_COLORS = [
  "#e8952e",
  "#ffffff",
  "#ff5d3c",
  "#6fd3c4",
  "#8171c7",
  "#ffe14d",
  "#2b2b2b",
];

export default function StickerPanel({ editor }: { editor: Editor }) {
  const [color, setColor] = useState(SHAPE_COLORS[0]);

  const drop = (patch: { kind: StickerKind; glyph?: string }) => {
    editor.addSticker({ ...patch, color });
    toast.success("스티커를 재생 위치에 넣었습니다.");
  };

  return (
    <div className="panel-body">
      <p className="panel-note">
        누르면 재생 위치에 놓입니다. 위치·크기·회전과 비트 반응은 오른쪽
        속성에서 조절합니다.
      </p>

      <p className="group-title">이모지</p>
      <div className="emoji-grid">
        {STICKER_EMOJI.map(glyph => (
          <button
            key={glyph}
            onClick={() => drop({ kind: "emoji", glyph })}
            title={glyph}
          >
            {glyph}
          </button>
        ))}
      </div>

      <p className="group-title">도형</p>
      <div className="swatch-row">
        {SHAPE_COLORS.map(value => (
          <button
            key={value}
            className={`dot ${color === value ? "is-on" : ""}`}
            style={{ background: value }}
            onClick={() => setColor(value)}
            aria-label={`색 ${value}`}
          />
        ))}
      </div>
      <div className="shape-grid">
        {STICKER_SHAPES.map(shape => (
          <button
            key={shape.id}
            onClick={() => drop({ kind: shape.id })}
            title={shape.name}
          >
            <span className={`shape-art shape-${shape.id}`} style={{ color }} />
            <em>{shape.name}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
