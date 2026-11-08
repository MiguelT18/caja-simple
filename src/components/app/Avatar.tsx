// Igual que src/components/Avatar.astro, para las islas React.
import { User } from "lucide-react";
import { avatarColor } from "@/lib/format";

export function Avatar({ src, seed, size = 2 }: { src?: string; seed: string; size?: number }) {
  return (
    <span className="avatar-default" style={{ "--avatar": avatarColor(seed), "--avatar-size": `${size}rem` } as React.CSSProperties} aria-hidden="true">
      <User strokeWidth={1.75} />
      {src && (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          decoding="async"
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      )}
    </span>
  );
}
