# Blog en Shopify (SEO + GEO)

Genera y publica artículos en el blog **suplementos** de la tienda Shopify, optimizados para Google y para que asistentes de IA (ChatGPT, Claude, Gemini, Perplexity) puedan entenderlos, citarlos y recomendar los productos.

Hay dos modos, y los dos usan el mismo pipeline:

- **Automático diario:** el worker toma el siguiente tema de la cola, lo genera y lo publica, una vez al día.
- **Panel manual con revisión:** escribes una idea y el sistema genera el artículo y te muestra un brief. Nada se publica sin tu clic en **Publicar**.

## Qué se agregó

| Pieza | Dónde |
| --- | --- |
| Cola editable (98 temas, priorizada) | `content/blog-queue.json` (esquema en `content/blog-queue.schema.json`) |
| Pipeline: prompt, generación, revisión, imagen, publicación | `lib/blog/` (`pipeline.ts`, `prompt.ts`, `openai.ts`, `shopify.ts`, `html.ts`, `json-ld.ts`, `queue.ts`) |
| Job diario, consumo en el worker | `lib/blog/jobs.ts`, iniciado desde `worker/dm-worker.ts` |
| API | `app/api/blog/` (`drafts`, `drafts/[id]`, `drafts/[id]/publish`, `run`, `images/[id]`) |
| Panel | `/blog` (formulario, cola y ejecuciones) y `/blog/[id]` (brief/preview) |
| Ejecución por terminal | `npm run blog:run` (`scripts/blog-run.ts`) |
| Tablas | `BlogPost`, `BlogQueueState`, `BlogRun` (migración `20261103120000_blog_autopublisher`) |
| llms.txt | `shopify/templates/llms.txt.liquid` |

### Cómo funciona

1. **Generación (OpenAI, Responses API con Structured Outputs).** El modelo devuelve JSON con title tag (≤60), meta description (≤155), slug, respuesta directa, cuerpo HTML, FAQ, texto del CTA, tags, ALT y la escena para la portada. El prompt (`lib/blog/prompt.ts`) fija el español de México, el tono, las reglas de SEO on-page y GEO, los hechos permitidos de cada producto y la prohibición de inventar cifras, siglas o fuentes.
2. **Ensamblado y revisión.** El HTML del modelo se limpia: solo se permiten etiquetas de texto, se quitan atributos y enlaces, y el H1 pasa a H2, porque el tema ya muestra el título como único H1. El sistema arma el artículo en este orden: respuesta directa, cuerpo, CTA suave al producto, de 2 a 3 artículos relacionados con el mismo tag (consultados en Shopify; si no hay, se omite la sección) y FAQ. Después corre las revisiones (palabras, keyword en H1, primer párrafo y H2, FAQ, longitudes). Si falla una revisión crítica, regenera una vez.
3. **Tags.** El tag del producto (`inositol` o `creatina`) siempre va primero, porque el CTA dinámico del tema depende de él. Un artículo nunca lleva el tag del otro producto. Los artículos sin producto no llevan ninguno de los dos.
4. **Imagen (opcional).** `gpt-image-2.5-flare` genera una portada flat lay en 16:9 (1536×864) y `sharp` la reduce a 1200×675 en WebP (≈60–150 KB). El estilo se explica en [Estilo de las portadas](#estilo-de-las-portadas). Si la imagen falla, el artículo se publica sin portada.
5. **Publicación (Shopify Admin GraphQL, `articleCreate`).** Se crea el artículo publicado con título, cuerpo, handle, tags, autor “Equipo editorial”, extracto, `global.title_tag`, `global.description_tag` y la portada con su ALT. Después se agrega al cuerpo el JSON-LD (`BlogPosting` + `FAQPage` + `BreadcrumbList`) con la URL, la fecha y la imagen reales.
6. **Idempotencia.** `BlogQueueState` marca cada tema de la cola como `PUBLISHED` o `SKIPPED`. Antes de generar se revisa si ya existe un artículo con ese handle en Shopify: los 3 artículos que ya estaban publicados (SOMP, creatina, inositol) se marcan solos como omitidos. Un borrador solo puede pasar una vez de `READY` a `PUBLISHING`. El job automático no publica dos veces en 20 horas.
7. **Errores y logs.** Las llamadas a OpenAI y Shopify se reintentan hasta 3 veces con backoff (errores de red, 429 y 5xx, respetando `Retry-After`). Cada ejecución queda en `BlogRun` (visible en el panel). Un tema que falla 3 veces se deja de intentar; la causa queda en `lastError`. Nada de esto detiene el worker de DMs.

## Estilo de las portadas

Todas las portadas se ven de la misma marca (flat lay editorial, femenino, premium), pero cada una tiene su propia superficie, props y ángulo. El prompt que recibe el modelo se arma en tres partes, en `lib/blog/image-style.ts`:

1. **CONSTANTES** (`IMAGE_CONSTANTS`): la familia visual. Va siempre igual: fotografía editorial flat lay, paleta rosa, coral, durazno y crema, luz natural, espacio negativo, 16:9, sin personas, texto, logos ni nada clínico.
2. **ESCENA**: la escribe la IA junto con el artículo (campo `imagePrompt`, reglas en `lib/blog/prompt.ts`). Es una oración con los objetos del flat lay según el tema: comparativas con varios botes y scoops alineados, temas de SOP e inositol con una escena sobria y calmada, entrenamiento con un shaker y una liga, etc.
3. **VARIABLES**: cambian en cada portada.

| Lista | Constante | Opciones |
| --- | --- | --- |
| Superficie/fondo | `IMAGE_SURFACES` | mármol claro con vetas rosas, lino beige, papel texturizado crema, superficie rosa durazno, madera clara, cerámica mate rosada, terracota suave |
| Props (2–3 distintos cada vez) | `IMAGE_PROPS` | flores frescas, hojas verdes, vaso con bebida rosada, scoop con polvo, frutas (durazno, frambuesa, limón rosa), tela de lino arrugada, pétalos sueltos |
| Ángulo/composición | `IMAGE_ANGLES` | cenital perfecto, ligeramente en diagonal, composición descentrada, close-up parcial |
| Intensidad de color | `IMAGE_COLOR_INTENSITIES` | pastel y aireado / más saturado y cálido |

Para agregar o quitar opciones, edita esas listas y vuelve a desplegar.

**Regla anti-repetición.** La combinación elegida se guarda en `BlogPost.imageStyle`. Antes de cada portada, `lastImageStyle` (en `lib/blog/pipeline.ts`) lee la de la portada anterior, y `pickImageStyle` (en `lib/blog/image-style.ts`) descarta su superficie y su ángulo y evita repetir exactamente los mismos props. Si una portada falla, su combinación no cuenta. La combinación elegida aparece en la revisión del brief, junto a "Imagen de portada".

## Variables de entorno

Configúralas en **Vercel** y en el **worker de Railway** (las dos apps leen la misma base de datos y Redis).

| Variable | Obligatoria | Valor |
| --- | --- | --- |
| `OPENAI_API_KEY` | Sí | API key de OpenAI |
| `SHOPIFY_CLIENT_ID` | Sí* | *ID de cliente* de la app en el Dev Dashboard de Shopify |
| `SHOPIFY_CLIENT_SECRET` | Sí* | *Secreto del cliente* de esa app |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Alternativa | Solo si tienes un token fijo `shpat_…`; reemplaza al par anterior |
| `SHOPIFY_STORE_DOMAIN` | No | `6uijcm-ma.myshopify.com` (por defecto) |
| `SHOPIFY_BLOG_HANDLE` | No | `suplementos` |
| `SHOP_PUBLIC_URL` | No | `https://peachperfect.com.mx` |
| `SHOPIFY_API_VERSION` | No | `2026-10` |
| `BLOG_AUTHOR` | No | `Equipo editorial` |
| `BLOG_AUTOPUBLISH_ENABLED` | No | `true` para activar la publicación diaria (en el **worker**). Por defecto está apagada. |
| `BLOG_DAILY_CRON` | No | `0 9 * * *` (todos los días a las 9:00) |
| `BLOG_TIMEZONE` | No | `America/Mexico_City` |
| `OPENAI_MODEL` | No | `gpt-6.1-terra` |
| `OPENAI_IMAGE_MODEL` | No | `gpt-image-2.5-flare` |
| `BLOG_PUBLISHER_LOGO_URL` | No | Logo para el JSON-LD (por defecto, el logo actual de la tienda) |

\* Las apps nuevas del Dev Dashboard de Shopify solo muestran *ID de cliente* y *Secreto del cliente*. OpenReply obtiene el token con el *client credentials grant* (dura 24 h y se renueva solo). Para eso, la app tiene que estar **instalada en la tienda** y pertenecer a la **misma organización** que la tienda.

### Permisos de la app de Shopify

En el Dev Dashboard → tu app → **Versions** → crea una versión con estos *Admin API access scopes*, publícala e instálala en la tienda:

- `read_content`, `write_content` (crear artículos y leer los relacionados)

Si cambias los scopes, vuelve a publicar la versión y acepta la actualización en la tienda.

## Cómo editar la cola

Edita `content/blog-queue.json` (en GitHub o en tu editor; el esquema te da autocompletado) y vuelve a desplegar (`git push`). Cada entrada:

```json
{
  "id": "creatina-para-gluteos",
  "order": 7,
  "publishOn": null,
  "enabled": true,
  "keyword": "creatina para gluteos",
  "secondaryKeywords": ["creatina gluteos", "aumentar gluteos creatina"],
  "title": "Creatina para glúteos: cómo ayuda a tu entrenamiento de pierna",
  "angle": "Rol en fuerza y volumen de entrenamiento, rutina sugerida y expectativas realistas",
  "intent": "comercial",
  "product": "creatina",
  "tags": ["creatina", "gluteos", "fuerza"],
  "productUrl": "/products/creatina-para-mujeres",
  "generateImage": true
}
```

- `id` es también el **slug** del artículo en Shopify. No lo cambies una vez publicado.
- El job toma el `order` más bajo que esté pendiente, habilitado y con `publishOn` vacío o ya cumplido (`YYYY-MM-DD`).
- `product`: `inositol`, `creatina` o `none`. El primer tag debe ser el del producto.
- Para saltar un tema, usa `"enabled": false`. Para repetir uno ya consumido, cambia su `id`.
- El orden actual sigue tres bloques: primero tendencias con poca competencia (1–15), luego pilares de alto volumen (16–46) y al final temas ligados a producto, comparativas y mitos (47–98).

## Panel manual

1. Inicia sesión en `https://peach-bot.vercel.app` como dueño o admin del workspace.
2. Ve a **Blog** en el menú lateral.
3. Escribe la idea. Opcionalmente agrega la keyword, el producto y la intención, y marca o desmarca **Generar imagen de portada con IA**.
4. **Generar artículo** abre el brief. Mientras el worker trabaja (1–3 min) la pantalla se actualiza sola. Luego muestra el título, title tag, meta description, slug, tags, la portada, el cuerpo renderizado y la revisión SEO/GEO.
5. **Publicar** lo sube a Shopify; **Descartar** lo elimina del panel.

## Probar en dry-run

El dry-run genera el siguiente tema de la cola como borrador, sin publicar y sin consumir el tema.

- **Desde el panel:** Blog → **Probar (dry-run)**. El borrador aparece en “Borradores y artículos”, desde donde también puedes publicarlo manualmente.
- **Desde la terminal**, con las variables en `.env`:

```bash
npm run blog:run -- --dry-run
```

Otras opciones: `npm run blog:run` (genera y publica el siguiente), `-- --force` (ignora el límite de uno cada 20 h) y `-- --enqueue` (lo manda al worker en vez de correrlo localmente).

## llms.txt

Shopify ya sirve `/llms.txt` en tu dominio y permite reemplazarlo desde el tema. Para usar el de Peach Perfect:

1. Shopify Admin → **Tienda online → Temas** → en el tema activo, **⋯ → Editar código**.
2. En **Templates**, crea un archivo llamado `llms.txt.liquid`.
3. Pega el contenido de `shopify/templates/llms.txt.liquid` y guarda.
4. Abre `https://peachperfect.com.mx/llms.txt` para comprobarlo.

Describe la marca, los dos productos con su diferenciador y las páginas clave, y lista solo los artículos recientes del blog, así que no hay que actualizarlo con cada publicación. Las instrucciones de compra de Shopify para agentes (`/agents.md`) siguen intactas y el archivo enlaza a ellas.
