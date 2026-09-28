"use client";

import { useRef } from "react";
import style from "./hamburger.module.css";
import { useClickOutside } from "@/hooks/useClickOutside";

type HamburgerButtonProps = {
  checked: boolean;
  onToggle: () => void;
  setIsOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
};

export default function HamburgerButton({
  checked,
  onToggle,
  setIsOpen,
}: HamburgerButtonProps) {
  const hamburgerRef = useRef<HTMLDivElement | null>(null);

  useClickOutside({
    ref: hamburgerRef,
    onOutside: () => setIsOpen(false),
  });

  return (
    <div className={style.hamburger} ref={hamburgerRef}>
      <input
        type="checkbox"
        id="hamburger-toggle"
        className={style.hamburgerInput}
        checked={checked}
        onChange={onToggle}
      />
      <label
        htmlFor="hamburger-toggle"
        className={style.hamburgerLabel}
        aria-label={checked ? "Cerrar menú" : "Abrir menú"}
      >
        <span className={style.line} />
        <span className={style.line} />
        <span className={style.line} />
      </label>
    </div>
  );
}
