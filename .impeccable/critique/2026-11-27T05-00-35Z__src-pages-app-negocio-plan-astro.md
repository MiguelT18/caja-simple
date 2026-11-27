---
target: página de plan
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/wafflez/code/personal/web-apps/caja-simple/src/pages/app/[negocio]/plan.astro"
target_fingerprint: "sha256:2a19bb634419745f0392ced23b0043c77c00c354ef021f4806257a1423ddd321"
target_path: /home/wafflez/code/personal/web-apps/caja-simple/src/pages/app/[negocio]/plan.astro
timestamp: 2026-11-27T05-00-35Z
slug: src-pages-app-negocio-plan-astro
---
Method: dual-agent (A: revisión de diseño · B: detector), sin navegador (no hay Chrome).

## Puntaje: 24/40 (Aceptable)
1 Visibilidad 3 · 2 Mundo real 2 · 3 Control 3 · 4 Consistencia 2 · 5 Prevención 3 · 6 Reconocer 2 · 7 Flexibilidad 3 · 8 Minimalismo 1 · 9 Recuperación 3 · 10 Ayuda 2

## Especificidad
Tabla de precios genérica: no usa arte cuadrado, KPI 800, play-btn ni anillo de selección. Detector: 0 hallazgos (solo regex en .astro).

## Problemas prioritarios
- [P1] Tarjetas de plan idénticas, sin acción; el borde de .plan.current no se dibuja (.app-surface .card border:none).
- [P1] Demasiado texto: tipo de cambio 3 veces (PeriodSwitch, PlanCalculator, cobro pendiente), intro de 38 palabras, 21 viñetas, dos párrafos de fundador.
- [P1] «Pagar tu plan» plano y separado del período; total en US$ atenuado; CTA chico; sin movimiento.
- [P2] Moneda invertida: US$ grande, Bs chico (PlanPrice, PlanCalculator).
- [P2] «Ver QR» en otra pestaña; checks con --color-income; .charge-code muerto.

## Personas
Dueña en el celular pagando por QR: 21 viñetas antes del pago, «período arriba» fuera de pantalla, Bs chico, nueva pestaña. Primera vez: tarjetas sin botón, días de prueba entre paréntesis. Renovación: pasa por la comparación cada vez; 6 acciones con cobro pendiente.

## Menores
«US$ 5,50 + 3,50» sin US$ en el extra; padding de 3.25rem para la X; afiliados tras el pago.
