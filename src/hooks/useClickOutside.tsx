import { useEffect } from "react";

interface Props<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  onOutside: (event: MouseEvent | TouchEvent) => void;
}

export function useClickOutside<T extends HTMLElement>({
  ref,
  onOutside,
}: Props<T>) {
  useEffect(() => {
    function listener(event: MouseEvent | TouchEvent) {
      if (!ref || ref.current?.contains(event.target as Node)) return;

      onOutside(event);
    }

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, onOutside]);
}
