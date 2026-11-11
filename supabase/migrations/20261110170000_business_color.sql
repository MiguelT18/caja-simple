-- Color del negocio: uno de la paleta curada de src/data/brand.ts (la misma lista: el check la repite). Dentro del
-- negocio reemplaza al ámbar como acento. Para todos los planes. Los de antes quedan en ámbar, como se veían.

alter table public.businesses
  add column color text not null default 'ambar'
  check (color in ('ambar', 'rojo', 'fucsia', 'violeta', 'azul', 'celeste', 'turquesa', 'verde', 'lima', 'grafito'));

-- Se suman a los permisos por columna que ya tenía la dueña (crear y editar su negocio).
grant insert (color) on public.businesses to authenticated;
grant update (color) on public.businesses to authenticated;
