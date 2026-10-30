// Punto del arco del día en % del cielo (mismo arco que el SVG de DaySky: centro 600,500, radios 560×340, caja 1200×520).
export function skyPoint(day: number) {
  const angle = Math.PI * (1 - day);
  return {
    x: ((600 + 560 * Math.cos(angle)) / 1200) * 100,
    y: ((500 - 340 * Math.sin(angle)) / 520) * 100,
  };
}

// El astro recorre de SKY_START a SKY_END: así nunca toca el borde del cielo.
export const SKY_START = 0.1;
export const SKY_END = 0.9;
