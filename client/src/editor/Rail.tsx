/**
 * The left rail: one icon per kind of thing you can add.
 *
 * Tabs across the top of a panel stop working once there are seven of them,
 * which is why every editor of this shape puts them down the side instead.
 */
import {
  AudioLines,
  Blend,
  Image as ImageIcon,
  Smile,
  Sparkles,
  SwatchBook,
  Type,
} from "lucide-react";

export type RailTab =
  | "media"
  | "audio"
  | "text"
  | "sticker"
  | "effect"
  | "transition"
  | "filter";

const TABS: {
  id: RailTab;
  name: string;
  Icon: typeof ImageIcon;
}[] = [
  { id: "media", name: "미디어", Icon: ImageIcon },
  { id: "audio", name: "오디오", Icon: AudioLines },
  { id: "text", name: "텍스트", Icon: Type },
  { id: "sticker", name: "스티커", Icon: Smile },
  { id: "effect", name: "편집효과", Icon: Sparkles },
  { id: "transition", name: "전환", Icon: Blend },
  { id: "filter", name: "필터", Icon: SwatchBook },
];

export default function Rail({
  tab,
  onTab,
}: {
  tab: RailTab;
  onTab: (tab: RailTab) => void;
}) {
  return (
    <nav className="rail" aria-label="추가할 항목">
      {TABS.map(({ id, name, Icon }) => (
        <button
          key={id}
          className={tab === id ? "is-on" : ""}
          onClick={() => onTab(id)}
          aria-current={tab === id}
          title={name}
        >
          <Icon size={17} />
          <em>{name}</em>
        </button>
      ))}
    </nav>
  );
}
