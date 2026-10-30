import { Moon, Sun, Sunset } from "lucide-react";
import type { ShiftTone } from "@/data/mock";

// Misma etiqueta que ShiftChip.astro, para las islas de React.
const icons = { morning: Sun, afternoon: Sunset, night: Moon };

export function ShiftBadge({ shift }: { shift: { name: string; tone: ShiftTone } }) {
  const Icon = icons[shift.tone];
  return (
    <span className={`chip chip-${shift.tone}`}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {shift.name}
    </span>
  );
}
