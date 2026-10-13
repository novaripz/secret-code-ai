// The template cards' glyphs: the shared set where it has them, and the one it
// does not (a paintbrush) straight from Lucide with the same defaults.
import { Brush } from "lucide-react";

export { FileCodeIcon, FilesIcon, GamepadIcon, HelpIcon, PlusIcon, UserIcon } from "@/components/icons";

export function BrushIcon({ className }: { className?: string }) {
  return <Brush aria-hidden="true" strokeWidth={1.85} className={className} />;
}
