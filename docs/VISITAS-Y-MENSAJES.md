# Activar visitas y mensajes en el panel (una sola vez)

> **Estado:** activado el 8 de noviembre de 2026 (base `clta-datos`, publicador `clta-publicar`). Esta guía queda por si hay que repetirlo.


El panel ya trae las secciones **Resumen (visitas)** y **Mensajes**. Para que muestren datos hay que crear una
base de datos en Cloudflare y conectarla al publicador. Sin esto el panel funciona igual, pero esas dos partes
avisan «todavía no está conectada» y los mensajes siguen llegando al correo del club.

1. En una terminal, dentro de la carpeta `worker/`:
   ```
   npx wrangler d1 create clta-datos
   ```
   Copia el `database_id` que muestra y pégalo en `worker/wrangler.toml` (reemplaza `PEGAR-AQUI-EL-ID`).
2. Publica el publicador (en esta PC hace falta `NODE_OPTIONS=--use-system-ca`):
   ```
   npx wrangler deploy
   ```
   Las tablas se crean solas la primera vez.
3. En Cloudflare Zero Trust → Access, la aplicación «Panel del club» debe cubrir `/admin.html` y `/api/*`,
   pero **no** `/p/*` (esa ruta la usa la gente que visita la página).
4. Entra al panel: en **Resumen** aparecerán las visitas y en **Mensajes** lo que escriban en el formulario.

Privacidad: no se usan cookies ni se guarda la dirección IP (solo una huella para frenar el spam). Las visitas del
propio computador del club no se cuentan.
