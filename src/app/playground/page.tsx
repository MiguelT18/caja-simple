"use client";

import { ejecutarEjercicios } from "@/scripts/ejercicios/run";

export default function Playground() {
  const resultados = ejecutarEjercicios();

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>Playground TypeScript</h1>
      <h2>Resultados de ejercicios</h2>
      <pre>{JSON.stringify(resultados, null, 2)}</pre>
    </div>
  );
}
