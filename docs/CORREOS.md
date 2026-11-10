# Enviar correos con diseño desde el panel (una sola vez)

Con esto, en **Contactos** aparece el botón **«📨 Enviar ahora»**: cada persona recibe su propio correo con el diseño Lions,
sin copiar ni pegar nada. Se usa el servicio **Resend** (gratis hasta 100 correos por día y 3.000 al mes).

## Pasos

1. Entra a <https://resend.com> y crea una cuenta con el correo del club.
2. En **Domains** → **Add Domain** escribe `clta.cl`. Resend muestra unos registros DNS (SPF y DKIM).
   Agrégalos en Cloudflare (**DNS** → **Records**). Con el botón «Verify» de Resend queda listo.
   (Si Resend ofrece conectar Cloudflare directamente, acepta: pone los registros solo.)
3. En **API Keys** → **Create API Key** (permiso «Sending access») y copia la clave.
4. En una terminal, dentro de la carpeta `worker`:

   ```
   npx wrangler secret put RESEND_API_KEY
   ```

   Pega la clave cuando la pida. La clave queda guardada solo en Cloudflare.

## Cómo funciona

- Los correos salen de `info@clta.cl`; si alguien responde, le llega al correo del club.
- Cada correo lleva al final un aviso para pedir que lo saquen de la lista.
- Límite de seguridad: 100 correos por día (el del plan gratuito) y 100 por envío.
- Siempre se puede **enviar una prueba** a tu propio correo antes de mandar a todos.
