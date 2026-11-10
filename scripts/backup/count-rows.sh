#!/usr/bin/env bash
# Lee un dump de datos con COPY por stdin y escribe «tabla<TAB>filas» por cada COPY (cada fila es una línea).
set -euo pipefail
awk '
  /^COPY .* FROM stdin;$/ { table = $2; n = 0; next }
  table != "" && $0 == "\\." { print table "\t" n; table = ""; next }
  table != "" { n++ }
'
