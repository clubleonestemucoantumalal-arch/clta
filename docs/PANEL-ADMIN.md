# Panel de administración

Guía para administrar el sitio del **Club de Leones Temuco Antumalal** sin tocar código.

El panel está en **`admin.html`**. Si el sitio está publicado en `leonesantumalal.cl`,
se entra en **`leonesantumalal.cl/admin.html`**.

---

## Cómo está organizado

El menú tiene **dos bloques plegables**:

**Administración e informes** — *Resumen* (contador de visitas, accesos rápidos, pendientes),
*Mensajes* (lo que llega por el cuadro de contacto: reenviar a socios con comentario, responder,
archivar, descargar en Excel), *Agenda* (la misma de la página, con vista previa), *Informes*
(PDF para imprimir y Excel), *Ayuda*, *Ajustes* (letra grande, colores, socios para reenviar)
y *Publicar y respaldos*.

**Mi página web** — todas las secciones que se editan: datos del club, contenido de la página y conexiones.

### Vista previa en vivo

En las secciones de *Mi página web* y en *Agenda* hay una pestaña **Vista previa** al borde derecho. Muestra la
página con los cambios aún sin publicar, salta a la sección que se está editando y se actualiza sola.
Con **Tocar para editar** activo, se toca un texto de la vista para cambiarlo ahí mismo, y sobre las tarjetas
(proyectos, causas, directorio…) aparecen **✕ Quitar** y **＋ Agregar otro**, con **Deshacer**.

### Visitas y mensajes

Usan una base de datos de Cloudflare (D1) que se activa una sola vez: ver
[VISITAS-Y-MENSAJES.md](VISITAS-Y-MENSAJES.md). Sin ella el panel funciona igual y esas dos partes avisan que no están conectadas.

---

## 1. Entrar por primera vez

1. Abre `admin.html` en el navegador.
2. La primera vez te pide **crear una clave**. Elígela, repítela y entra.
3. Desde ahí en adelante te pedirá esa clave cada vez.

> **La clave se guarda en el navegador de ese computador**, no en internet.
> Eso significa dos cosas: que si entras desde otro computador te va a pedir
> crear la clave de nuevo, y que **no es una protección real**. El punto 8
> explica cómo poner un candado de verdad.

Si olvidas la clave: entra al panel desde otro navegador (o borra los datos del sitio
en la configuración del navegador) y crea una nueva. No se pierde nada del contenido,
porque el contenido vive en los archivos del sitio, no en el navegador.

---

## 2. Cómo funciona, en tres pasos

| Paso | Qué pasa |
|---|---|
| **Editas** | Eliges una sección del menú de la izquierda y escribes. Se guarda solo en tu computador. Nadie más lo ve todavía. |
| **Revisas** | El botón **Vista previa** abre el sitio con tus cambios aplicados, tal como quedará. |
| **Publicas** | El botón amarillo **Publicar** deja los cambios en línea, para todo el mundo. |

Mientras tengas cambios sin publicar, arriba dice **"Cambios sin publicar"** en color naranja.
Si cierras la pestaña sin publicar, el navegador te avisa, y de todos modos el borrador
queda guardado: al volver a entrar sigue donde ibas.

---

## 3. Qué se puede editar

**Datos del club**

- *Identidad* — nombre, lema, año de fundación, distrito.
- *Contacto* — correo, teléfono, WhatsApp, dirección, horario y el mapa.
- *Redes sociales* — Instagram, Facebook, YouTube, e-Clubhouse.
  Los íconos del pie de página aparecen solos según lo que llenes.
- *Datos para donar* — la cuenta bancaria del club.

**Contenido de la página**

- *Portada* — foto grande, titular, párrafo y botones.
- *El Club* — el relato, las tres fotos y los datos del pie.
- *Causas*, *Sello de trabajo*, *Valores* — tarjetas con ícono, título y texto.
- *Cifras de impacto* — los números grandes que se animan.
- *Proyectos* — tarjetas con foto.
- *Agenda* — ahora está en el bloque *Administración e informes*; ver punto 5.
- *Directorio* — nombres, cargos y fotos.
- *Testimonios* — el carrusel.
- *Hazte socio*, *Formas de aportar*, *Preguntas frecuentes*, *Sección contacto*, *Pie de página*.

**Conexiones**

- *Noticias* — cuántas mostrar y los textos de la sección.
- *Instagram* — conectar el feed o cargar publicaciones a mano.

En todas las listas (proyectos, causas, preguntas…) cada ficha se puede
**subir, bajar, duplicar o eliminar** con los botones del final.

---

## 4. Fotos

Al subir una foto, el panel la **achica y la comprime solo**. Una foto de
teléfono de 4 MB queda en unos 150 KB sin que se note la diferencia en pantalla.
No hace falta prepararlas antes: se sube la foto tal como salió de la cámara.

Tamaños que quedan mejor:

| Dónde | Forma | Tamaño ideal |
|---|---|---|
| Portada | Horizontal | 1920 × 1080 |
| El Club (foto principal) | Horizontal | 1200 × 750 |
| Proyectos | Horizontal | 1200 × 750 |
| Directorio | Cuadrada, retrato de frente | 700 × 700 |
| Instagram | Cuadrada | 600 × 600 |

En **Publicar y respaldos** aparece cuánto pesan todas las fotos juntas.
Si pasa de unos 2,5 MB el panel avisa: conviene dejar solo las necesarias,
porque el sitio empieza a demorar en abrir.

> **Consejo:** para las fotos que casi nunca cambian (el escudo del club),
> es mejor reemplazar directamente el archivo en `assets/img/`, como explica
> el README. El panel es para lo que se cambia seguido.

---

## 5. La agenda

Se llena de dos maneras al mismo tiempo:

1. **Las sesiones fijas** (2° y 4° lunes de cada mes) **se calculan solas**.
   Nunca queda una fecha vencida en el sitio, sin que nadie tenga que hacer nada.
   En el panel se puede cambiar la hora, el lugar y el nombre de cada sesión.

2. **Las actividades puntuales** (operativos, cenas, aniversarios) se agregan a mano
   con su fecha. Se ordenan junto a las sesiones y **desaparecen solas cuando pasan**,
   así que no hay que acordarse de borrarlas.

Las actividades marcadas como *"Abierta a la comunidad"* salen destacadas.

---

## 6. Publicar

Hay dos caminos. Los dos dejan el mismo resultado; elige el que calce con
dónde está publicado el sitio.

### A) Descargar archivos (sirve siempre)

1. Aprieta **Publicar** → pestaña **Descargar archivos** → **Descargar los 3**.
2. Se guardan tres archivos: `contenido.json`, `imagenes.json` e `instagram.json`.
3. Ponlos dentro de la carpeta `data/` del proyecto, reemplazando los que están.
4. Sube el sitio como siempre:
   - **Netlify:** entra a tu sitio → *Deploys* → arrastra la carpeta completa del proyecto.
   - **FTP:** sube los tres archivos a `public_html/data/`.

### B) Publicar en GitHub (un clic)

Si el sitio está en un repositorio de GitHub conectado a Netlify, Vercel o GitHub Pages,
el panel sube los cambios solo y la web se actualiza en uno o dos minutos.

Se configura una sola vez:

1. En GitHub: **Settings** (tu perfil) → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → *Generate new token*.
2. En *Repository access* elige **solo el repositorio del sitio**.
3. En *Permissions* → *Repository permissions* → **Contents: Read and write**.
   Ese es el único permiso que hace falta.
4. Copia el token (empieza con `github_pat_`). **GitHub lo muestra una sola vez.**
5. En el panel: **Publicar** → pestaña **Publicar en GitHub** → completa usuario,
   repositorio, rama (normalmente `main`) y pega el token.
6. Marca *Recordar el token* solo si es un computador de confianza.

Desde ahí, publicar es apretar un botón.

> Si el token se pierde o queda en un computador ajeno, entra a GitHub y
> **revócalo** desde la misma pantalla donde lo creaste. Con eso deja de servir
> al instante y puedes generar otro.

---

## 7. Respaldos

En **Publicar y respaldos**:

- **Descargar copia de seguridad** — un solo archivo `.json` con todo: textos,
  fotos y publicaciones. Guárdalo cada tanto, sobre todo antes de un cambio grande.
- **Restaurar desde una copia** — vuelve todo al estado de ese archivo.
- **Descartar cambios** — bota el borrador y vuelve a lo que está publicado.

---

## 8. Proteger el panel de verdad

El candado del panel evita que alguien entre por curiosidad, pero como el sitio
no tiene servidor, **cualquiera que llegue a la dirección puede ver el formulario**.
Lo que sí está protegido es la publicación: sin el token de GitHub (o sin acceso
al hosting) nadie puede cambiar la web.

Para cerrar la puerta de verdad, elige una de estas:

| Dónde está el sitio | Cómo se protege |
|---|---|
| **Netlify** | *Site settings → Access control → Password protection* (requiere plan Pro), o **Netlify Identity** con invitación por correo. |
| **Vercel** | *Settings → Deployment Protection → Password Protection*. |
| **Hosting tradicional** | Un archivo `.htaccess` con autenticación básica sobre `admin.html`. Pídeselo a tu proveedor. |
| **Cualquiera** | La opción más simple: **no subir `admin.html` al servidor**. Se deja solo en el computador del club y se usa con `npm run dev`, publicando con el método A o B. |

El sitio ya viene con `admin.html` excluido de Google (`robots.txt` y la
etiqueta `noindex`), así que no va a aparecer en las búsquedas.

---

## 9. Si algo sale mal

**El panel dice que no puede leer `data/contenido.json`**
Estás abriendo `admin.html` con doble clic. El panel necesita un servidor local:
abre una terminal en la carpeta del proyecto y escribe

```bash
npm run dev
```

Después entra a <http://localhost:5544/admin.html>.

**Publiqué y el sitio se ve igual**
El navegador guardó la versión vieja. Recarga con `Ctrl` + `F5`
(o `Cmd` + `Shift` + `R` en Mac).

**Se rompió algo del contenido**
Restaura la última copia de seguridad, o borra `data/contenido.json` del servidor:
el sitio vuelve solo a los textos originales que están escritos en `index.html`.
**El sitio nunca se cae por un error en el panel.**

**Quiero volver todo al inicio**
Descarta los cambios en el panel y sube de nuevo el `data/contenido.json` original
desde tu copia de seguridad o desde el repositorio.

---

## 10. Para quien mantenga el código

El panel no cambia cómo funciona el sitio: sigue siendo HTML, CSS y JavaScript
estáticos, sin servidor ni base de datos.

```
admin.html                  El panel
assets/css/admin.css        Sus estilos
assets/js/admin.js          Su lógica (formularios, fotos, publicación)
assets/js/iconos.js         Catálogo de íconos, compartido con el sitio
assets/js/almacen.js        Guardado local del borrador (localStorage + IndexedDB)
assets/js/contenido.js      Aplica data/contenido.json sobre index.html
data/contenido.json         Todos los textos editables
data/imagenes.json          Las fotos subidas, ya comprimidas
data/instagram.json         Las publicaciones cargadas a mano
```

Cómo se conecta con el HTML:

| Marca en `index.html` | Qué hace |
|---|---|
| `data-ed="clave"` | Reemplaza el contenido del elemento |
| `data-ed-txt="clave"` | Reemplaza solo el texto (respeta los íconos SVG del botón) |
| `data-ed-num="clave"` | Reemplaza el atributo `data-contador` |
| `data-ed-parrafos="clave"` | Reemplaza una lista de párrafos |
| `data-ed-chips="clave"` | Reemplaza una lista de `<span>` |
| `data-img="clave"` | Reemplaza la imagen desde `data/imagenes.json` |
| `id="gridCausas"` y similares | Contenedores que se vuelven a dibujar completos |

Notas:

- `contenido.js` se carga **antes** que `main.js`: aplica el contenido y recién
  después carga `main.js`, `noticias.js` e `instagram.js`. Si `data/contenido.json`
  falta o está roto, los carga igual y el sitio queda con los textos del HTML.
- Los textos pasan por un limpiador que solo deja etiquetas de formato
  (`<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<small>`, `<br>`, `<span>`, `<a>`, `<p>`).
- Para agregar un campo nuevo al panel: agrega su descriptor al arreglo `SECCIONES`
  en `admin.js` y la marca `data-ed` correspondiente en `index.html`.
- Para agregar un ícono: una línea nueva en `assets/js/iconos.js`. Aparece solo
  en el selector del panel.
- La vista previa usa `index.html?borrador=1`, que lee el borrador del navegador
  en vez de los archivos publicados.
