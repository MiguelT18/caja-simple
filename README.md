# Caja Simple

Caja de negocios pequeños con una o varias sucursales: ventas, gastos, productos, turnos y cuadre de caja. Hecha con Astro 7.

> Estado: prototipo. Todavía no hay backend: los datos son de demostración y la autenticación no está conectada.

## Desarrollo

```sh
pnpm install
pnpm dev       # http://localhost:4321
pnpm build     # genera ./dist
pnpm preview
```

Requiere Node ≥ 22.23 y pnpm.

## Documentación

- [`PRODUCT.md`](PRODUCT.md): para quién es, qué resuelve y cómo habla.
- [`DESIGN.md`](DESIGN.md): sistema de diseño (tokens, tipografía, íconos, navegación).
- [`AGENTS.md`](AGENTS.md): mapa del código y convenciones, para personas y agentes de IA.
- [`docs/`](docs/): decisiones de negocio, por ejemplo los [planes de suscripción](docs/planes-de-suscripcion.md).
