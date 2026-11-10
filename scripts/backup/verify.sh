#!/usr/bin/env bash
# Comprueba una copia: sha256 contra el manifiesto, la descifra, la restaura en una base VACÍA de Supabase (nunca
# producción) y compara las filas de cada tabla con las del manifiesto. Sale con error si algo no cuadra.
#
# Uso: AGE_IDENTITY_FILE=clave.txt scripts/backup/verify.sh <carpeta de la copia> <comando psql>
#   ej.: verify.sh ./copia "docker exec -i supabase_db_restore psql -U postgres -d postgres"
# psql corre dentro del contenedor: así coincide con la versión de pg_dump (17) que hizo la copia.
set -euo pipefail

dir=${1:?Uso: verify.sh <carpeta> <comando psql>}
psql_cmd=${2:?Falta el comando psql de la base vacía}
: "${AGE_IDENTITY_FILE:?Falta AGE_IDENTITY_FILE}"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
read -r -a psql <<< "$psql_cmd"

(cd "$dir" && jq -r '.files | to_entries[] | "\(.value)  \(.key)"' manifest.json | sha256sum -c --quiet)

for f in roles schema data; do
  age -d -i "$AGE_IDENTITY_FILE" "$dir/$f.sql.gz.age" | gunzip > "$tmp/$f.sql"
done

# El orden y el modo réplica (sin triggers ni FKs al cargar los datos) son los que indica Supabase para restaurar.
{
  cat "$tmp/roles.sql" "$tmp/schema.sql"
  echo "SET session_replication_role = replica;"
  cat "$tmp/data.sql"
} | "${psql[@]}" --single-transaction -v ON_ERROR_STOP=1 -q -f - > /dev/null

failed=0
while IFS=$'\t' read -r table expected; do
  got=$("${psql[@]}" -tAc "select count(*) from $table")
  if [[ "$got" != "$expected" ]]; then
    echo "✗ $table: $got filas, se esperaban $expected" >&2
    failed=1
  fi
done < <(jq -r '.rows | to_entries[] | "\(.key)\t\(.value)"' "$dir/manifest.json")

[[ $failed -eq 0 ]] || exit 1
echo "✓ Copia del $(jq -r .created_at "$dir/manifest.json") restaurada: $(jq '.rows | length' "$dir/manifest.json") tablas con las filas esperadas."
