# Copias de seguridad

El proyecto de Supabase está en el plan Free: Supabase no guarda copias. Las copias son nuestras, fuera de Supabase, en Cloudflare R2.

| Flujo | Cuándo | Qué hace |
|---|---|---|
| `.github/workflows/backup.yml` | cada día, 03:00 de Bolivia (y a mano) | `scripts/backup/dump.sh`: roles, esquema y datos con `supabase db dump`, en gzip y cifrados con age, más `manifest.json` (sha256 de cada archivo y filas por tabla). Después hace un espejo de Storage con `rclone sync`. |
| `.github/workflows/backup-restore-check.yml` | cada lunes, 05:00 (y a mano) | Baja la última copia, la restaura en un Postgres de Supabase vacío **dentro del runner** (`supabase db start`) y compara sha256 y filas con el manifiesto (`scripts/backup/verify.sh`). Falla si la última copia tiene más de 2 días. |

Si un flujo falla, GitHub avisa por correo a quien tiene el repo.

## Qué hay en R2 (bucket `caja-simple-backups`)

| Ruta | Qué | Cuánto dura (regla de ciclo de vida) |
|---|---|---|
| `db/AAAA-MM-DD/` | `roles.sql.gz.age`, `schema.sql.gz.age`, `data.sql.gz.age`, `manifest.json` | 35 días |
| `db-mensual/AAAA-MM/` | la copia del día 1 | 13 meses |
| `storage/<bucket>/…` | espejo de los 5 buckets (`avatars`, `branch-images`, `feedback-images`, `product-images`, `sale-receipts`) | siempre (se actualiza cada noche) |
| `storage-borrados/AAAA-MM-DD/` | lo que ese día se borró o se reemplazó en Storage | 90 días |

El dump de datos incluye `auth` (cuentas), `storage.objects` (qué archivo es de quién) y `cron.job`. Los archivos de Storage van aparte, en `storage/`.

## Claves

- Cada copia se cifra para **dos** claves de age:
  - **La de restaurar:** la privada la guarda la dueña del proyecto, en el gestor de contraseñas y una copia en papel. Nunca va a GitHub ni a R2. Sin ella no se puede leer ninguna copia: si se pierde, hay que generar una nueva y cambiar `AGE_RECIPIENTS`. Las copias viejas quedan ilegibles.
  - **La de verificación:** vive solo en el secreto `AGE_VERIFY_KEY`, para la prueba semanal. Si se filtra, se genera otra y se actualizan `AGE_RECIPIENTS` y `AGE_VERIFY_KEY`.
- **Secretos del repo:**
  - `SUPABASE_DB_URL`: la URL del pooler en modo sesión, puerto 5432 (ver AGENTS.md);
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`: un token de R2 solo para ese bucket;
  - `SUPABASE_S3_ENDPOINT` (`https://<ref>.storage.supabase.co/storage/v1/s3`), `SUPABASE_S3_KEY_ID` y `SUPABASE_S3_SECRET`: se crean en Supabase › Storage › S3;
  - `AGE_RECIPIENTS`: las dos claves públicas, separadas por un espacio;
  - `AGE_VERIFY_KEY`: la clave privada de verificación.

## Puesta en marcha (una vez)

1. **R2:** crear el bucket `caja-simple-backups` (privado), con las tres reglas de ciclo de vida de la tabla de arriba, y un token de API con «Object Read & Write» solo para ese bucket.
2. **Supabase:** en Storage › S3, crear las claves de acceso.
3. **Claves de age:**
   ```sh
   age-keygen -o caja-backup.key     # la de restaurar: guárdala fuera de la máquina y borra el archivo
   age-keygen -o caja-verify.key     # la de verificación: su contenido va a AGE_VERIFY_KEY
   ```
   Las públicas son las líneas `# public key: age1…` de cada archivo.
4. Cargar los secretos en GitHub › Settings › Secrets and variables › Actions.
5. Lanzar a mano «Copia de seguridad» y luego «Prueba de restauración». Las dos tienen que terminar en verde.

## Restaurar

Siempre en una base **nueva o local**, nunca encima de producción. Para recuperar unas filas, restaura en local y copia solo lo necesario (ver abajo).

### Todo, en un proyecto nuevo de Supabase

1. Crea el proyecto con la misma región y Postgres 17. Baja la copia: `rclone copy r2:caja-simple-backups/db/<día> copia`.
2. Descifra:
   ```sh
   for f in roles schema data; do age -d -i caja-backup.key copia/$f.sql.gz.age | gunzip > $f.sql; done
   ```
3. Restaura, con la URL del pooler (modo sesión) del proyecto nuevo:
   ```sh
   psql --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql \
     -c 'SET session_replication_role = replica' -f data.sql --dbname "$NUEVA_DB_URL"
   ```
4. Vuelve a poner los archivos de Storage: `rclone copy r2:caja-simple-backups/storage sb-nuevo:`, con un remoto `sb-nuevo` hacia el S3 del proyecto nuevo. Los buckets ya los crea `schema.sql` y las filas de `storage.objects` vienen en `data.sql`.
5. **Lo que no viaja en el dump** (hay que cargarlo a mano):
   - **Vault:** `project_url` y `push_webhook_secret`, cifrados con la clave del proyecto viejo. Créalos de nuevo con `vault.create_secret`. Ver docs/modelo-de-datos.md › Tu cuenta.
   - **Edge Functions:** `supabase secrets set …` y `functions deploy send-push` y `send-invite` (ver AGENTS.md › Comandos).
   - **Auth:** proveedores (Google), SMTP, plantillas de correo, Site URL y URLs de redirección.
   - **Vercel:** `SUPABASE_URL`, `SUPABASE_KEY` y las demás variables que apuntan al proyecto. Después, vuelve a desplegar.
6. Comprueba con `scripts/backup/verify.sh` o abriendo la app: Turnos, Ventas y un comprobante.

### Solo unas filas o una tabla

1. Levanta una base vacía en local (`supabase db start` en una carpeta con `supabase init`) y restaura ahí con `verify.sh`.
2. Exporta lo que necesitas (`\copy (select … from public.sales where …) to 'filas.csv' csv header`) y cárgalo en producción con una migración o una consulta revisada. Nunca restaures el dump entero encima de producción.

## Límites

- Se puede perder hasta un día de datos: la copia es diaria. Para volver a un minuto exacto hace falta el plan Pro con PITR (ver docs/plan-mvp.md).
- GitHub apaga los flujos programados tras 60 días sin actividad en el repo. La prueba semanal avisa si la última copia tiene más de 2 días; si pasa, reactiva el flujo en GitHub › Actions.
- Un proyecto Free se pausa tras una semana sin uso. Si está pausado, la copia falla (y avisa).
