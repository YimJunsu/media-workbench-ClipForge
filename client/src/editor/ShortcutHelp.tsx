/** The keyboard sheet. Opened with ? or from the header. */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "./useShortcuts";

export default function ShortcutHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="keys-dialog">
        <DialogHeader>
          <DialogTitle>단축키</DialogTitle>
          <DialogDescription>
            타임라인이나 미리보기에 마우스를 둔 채로 누르면 됩니다. 글자를 쓰는
            중에는 동작하지 않습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="keys-grid">
          {SHORTCUTS.map(section => (
            <section key={section.group}>
              <h3>{section.group}</h3>
              <dl>
                {section.keys.map(([key, what]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
