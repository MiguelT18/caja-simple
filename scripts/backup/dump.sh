#!/usr/bin/env bash
# Copia de la base: roles, esquema y datos con `supabase db dump`, comprimidos y cifrados con age, y un manifiesto
# con el sha256 de cada archivo y las filas de cada tabla (contadas en el propio dump). Ver docs/copias-de-seguridad.md.
#
# Uso: SUPABASE_DB_URL=… AGE_RECIPIENTS="age1… age1…" scripts/backup/dump.sh <carpeta de salida>
# Nunca imprime la URL: lleva la contraseña de la base.
set -euo pipefail

out=${1:?Uso: dump.sh <carpeta de salida>}
: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL}"
: "${AGE_RECIPIENTS:?Falta AGE_RECIPIENTS (claves públicas de age separadas por espacio)}"

mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

supabase db dump --remote="$SUPABASE_DB_URL" --role-only -f "$tmp/roles.sql"
supabase db dump --remote="$SUPABASE_DB_URL" -f "$tmp/schema.sql"
supabase db dump --remote="$SUPABASE_DB_URL" --data-only --use-copy -f "$tmp/data.sql"

# Un dump vacío o cortado no es una copia: mejor fallar ahora que descubrirlo al restaurar.
grep -q 'CREATE TABLE' "$tmp/schema.sql" || { echo "schema.sql no tiene tablas" >&2; exit 1; }
grep -q '^COPY ' "$tmp/data.sql" || { echo "data.sql no tiene datos" >&2; exit 1; }

recipients=()
for r in $AGE_RECIPIENTS; do recipients+=(-r "$r"); done
for f in roles schema data; do
  gzip -9 -c "$tmp/$f.sql" | age "${recipients[@]}" -o "$out/$f.sql.gz.age"
done

# Filas por tabla: con COPY, cada fila es una línea entre «COPY … FROM stdin;» y «\.».
"$(dirname "$0")/count-rows.sh" < "$tmp/data.sql" > "$tmp/rows.tsv"

jq -n \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --rawfile rows "$tmp/rows.tsv" \
  --rawfile sums <(cd "$out" && sha256sum roles.sql.gz.age schema.sql.gz.age data.sql.gz.age) \
  '{
    created_at: $date,
    files: ($sums | split("\n") | map(select(length > 0) | split("  ") | {(.[1]): .[0]}) | add),
    rows: ($rows | split("\n") | map(select(length > 0) | split("\t") | {(.[0]): (.[1] | tonumber)}) | add // {})
  }' > "$out/manifest.json"

echo "Copia lista: $(jq '.rows | length' "$out/manifest.json") tablas con datos."
