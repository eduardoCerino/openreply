# Generador de videos (fase 1: guion)

Crea guiones de Reels/TikTok para Peach Perfect con el método de `content/peach-perfect-contexto-contenido.md`: checklist de idea, y guion en 4 partes (gancho, contexto, solución y un CTA a la medida de cada video). Por ahora genera y revisa el **guion**. Las imágenes, los clips y la publicación automática son las fases siguientes.

## Formato y duración

- Video vertical 9:16 en **escenas de 5 segundos**: cada escena es un clip. Un guion de 50 s tiene 10 escenas, es decir 20 imágenes (inicial y final de cada escena) y 10 clips, que luego se unen en un solo video.
- Cada escena pertenece a una de las **4 partes** del guion (ver abajo), en orden.
- Cada escena trae su locución, el texto en pantalla, lo que se ve y tres prompts para las fases siguientes: **imagen inicial**, **imagen final** y **movimiento**.
- El guion también define personajes y un estilo visual fijos, para que todas las imágenes se vean del mismo video.

### Estándar único de duración

**Todos los videos, en cualquier formato, siguen el mismo estándar** (`VIDEO_STANDARD` en `lib/video/constants.ts`):

- **51 a 56 segundos.** Como cada escena es un clip de 5 s, el único largo dentro de ese rango es **55 s = 11 escenas** (`STANDARD_SCENES`), es decir 22 imágenes y 11 clips.
- **170 a 190 palabras habladas.** El texto en pantalla, las acotaciones y las etiquetas de personaje no cuentan.
- **Dos datos nuevos** en el contexto.
- **Cambio de cámara cada 2-3 segundos:** cada escena trae al menos 2 planos en `shots`, con su segundo dentro de la escena, y la revisión los muestra con 🎥.
- **Al menos 3 pausas estratégicas**, marcadas en las acotaciones: antes de la revelación, después del dato que pega y antes del CTA. Si el modelo escribe "[pausa]" dentro del texto hablado, el sistema la mueve a la acotación para que la voz no la lea.

**Validaciones:**
- Los segundos, el rango de palabras y el segundo dato son **críticos**: si no se cumplen, el guion se reescribe.
- Que falten planos o pausas es solo un aviso.

Ya no hay selector de duración en el formulario.

## Paso previo: checklist de idea (por detrás)

Video viral = idea ganadora, siempre. Tú mandas una **idea** corta, de unas cuantas palabras, no un guion. Antes de escribir, una llamada aparte (`lib/video/idea-check.ts`) hace tres cosas:

1. **Evalúa tu idea tal cual** con los 8 filtros: contracorriente, filtro 5-50, unicidad, aplicable a gente común, polémico, formato adecuado, personaje de marca congruente y referencia viral existente.
2. **La desarrolla en un ángulo** que conserva tu idea y cumple al menos 5 de 8 (`IDEA_MIN_SCORE`).
3. **Evalúa ese ángulo.**

El guion se escribe **desde el ángulo**. **La checklist nunca bloquea**: no aparece ninguna pantalla de rechazo. En la revisión, la sección *Checklist de idea* muestra "tu idea X/8 → ángulo Y/8", el ángulo con el que se escribió y los filtros. El resumen del guion dice `idea Y/8`. Los filtros se editan en `IDEA_FILTERS` (`lib/video/constants.ts`).

Los guiones que se quedaron detenidos con la versión anterior (cuando la checklist sí bloqueaba) muestran un botón **Escribir el guion**.

## El gancho: segunda persona por defecto, nunca pregunta

- **Segunda persona (por defecto):** le habla directo a quien ve y nombra su problema como afirmación, para que se identifique y para atacar el problema. Ejemplo: "Haces más y más sentadillas y tus glúteos siguen igual. Nadie te dijo que sin esto el músculo no puede crecer."
- **Primera persona (solo cuando conviene):** cuando el ángulo es una experiencia que ella vivió y ya resolvió, contada como historia. Ejemplo: "Tomé creatina un mes, no vi nada, la tiré a la basura. Ahora sé por qué no funcionó."
- **Estructura (en las dos voces):** una oración con el problema o la experiencia, más una segunda oración corta que abre la curiosidad sin revelar la solución.
- **Muestra la escena, no la describe:** números concretos y detalles visuales que crean una imagen mental instantánea. ❌ "Entrenas más que tu amiga y tus glúteos siguen igual" · ✅ "Mi amiga va al gym tres veces a la semana. Yo voy cinco. Y sus glúteos están mejor que los míos." La revisión avisa si el gancho no trae un número o una cantidad de tiempo (`CONCRETE_NUMBER`).
- **La segunda oración es específica:** anuncia una pieza concreta que falta ("Nadie me dijo que sin esto el músculo no puede crecer"). Las frases vagas como "El problema era otro", "Es otra cosa" o "No es lo que crees" se rechazan (`VAGUE_HOOK` en `lib/video/script.ts`).
- **Voz del gancho (formulario):**
  - **Auto** (por defecto): segunda persona, o primera si el ángulo es una experiencia resuelta.
  - **Segunda persona** o **Primera persona**: si eliges una, el gancho tiene que estar en esa voz. Si no lo está, el guion se reescribe.
  - En anuncios pagados con segunda persona, el gancho no nombra la condición de salud.
- **El guion declara su voz** en `hookVoice`, y la revisión la muestra junto al molde, con "(elegida por ti)" si la fijaste. Las voces y sus ejemplos están en `HOOK_VOICES` (`lib/video/constants.ts`).
- **Validaciones:**
  - Nunca una pregunta retórica ("¿te pasa esto?", "¿sabías que…?"). Es una regla crítica.
  - Nunca una segunda oración vaga. También es crítica.
  - Avisa si el gancho no corresponde a la voz declarada o si le falta la segunda oración corta.
- **Por formato y canal:**
  - En POV y Personaje, el gancho es la primera línea de diálogo.
  - En Reacción, el gancho es el comentario de la seguidora, y ese sí puede ser pregunta.
  - En anuncios pagados no se usa segunda persona sobre la condición de salud: se usa primera o tercera persona.

## Las 4 partes del guion

| # | Parte (`section`) | ~55 s | Qué hace |
| --- | --- | --- | --- |
| 1 | Gancho (`gancho`) | 0:00-0:05 | Para el scroll con el problema o la experiencia, nunca con una pregunta. |
| 2 | Contexto (`contexto`) | 0:05-0:40 | **Una sola historia**, que puede ocupar varias escenas: abre descartando lo obvio con contrastes cortos ("No era X. No era Y. Era Z.") y en el mismo hilo revela el porqué, los datos nuevos y la emoción. |
| 3 | Solución (`solucion`) | 0:40-0:50 | **3a · frase puente** + **3b · producto**. |
| 4 | CTA (`cta`) | 0:50-0:55 | Palabra clave y micro-solución. |

**El contexto tiene que enganchar.**
- **Cómo se escribe:** frases cortas y contundentes. El mecanismo va explicado como una imagen simple ("el músculo se rompe y necesita material para repararse"), cierra con una consecuencia que pega y, cuando aplica, rompe el mito de la categoría.
- **Qué evita:** el diálogo explicativo y tibio. El prompt lo marca como ejemplo de lo que no se debe hacer.
- **Ejemplo de referencia:** el prompt usa el de la creatina ("Me tardé meses en entender por qué. No era genética…").
- **Qué se puede nombrar:** la categoría (la creatina, el inositol) sí; la marca y el bote solo en la solución.

**Frase puente (3a).** Conecta la enseñanza con el producto: habla del problema y de dónde atacarlo, nunca de lo que hace el producto.
- **Patrones:** están en `BRIDGE_PATTERNS`. Por ejemplo, "Si el problema es [X], ahí es donde hay que trabajar."
- **Prohibido:** verbos de efecto (regula, equilibra, corrige, mejora, controla, normaliza), promesas y verbos de folleto.
- **El test:** tiene que seguir siendo verdadera aunque borres el producto. El modelo lo explica en `bridgeTest`, y si la frase nombra el producto o el bote se rechaza como claim disfrazado.
- **3b:** el producto en primera persona, como experiencia vivida (ver más abajo).

## Nivel de conciencia

Es un parámetro del formulario: **0**, **1** (por defecto), **2** o **Auto**.
- **0:** no sabe que tiene un problema. Contenido entretenido y contracorriente, sin mencionar la categoría.
- **1:** sabe que tiene el problema, pero no cómo resolverlo. Es la zona principal.
- **2:** ya sabe cómo se soluciona. Comparativas y "por qué esta fórmula"; sirve más para historias que para reels.

**Nunca se escribe para los niveles 3-4** (fórmula, dosis, certificaciones, marca contra marca): le hablan al 5% del mercado. La revisión avisa si el guion se va hacia ese terreno. Los niveles están en `AWARENESS_LEVELS`.

## Idea validada

Marca **Idea ya validada** y elige en qué formato se publicó. El guion conserva el dato nuevo y el ángulo central, pero cambia por completo el gancho, el formato y el ejemplo. Repetir el formato anterior se rechaza. Con 7 formatos, cada idea ganadora rinde hasta 7 videos.

## Cada pieza es independiente

Nunca "como les conté", "parte 2", "ya saben que yo…" ni "en el video anterior". Cada guion se escribe como primer contacto, y estas frases son una falla crítica (`SERIES_PHRASES`).

**El tiempo extra se llena con sustancia:** un segundo mecanismo o detalle concreto, una objeción resuelta, una consecuencia práctica o, en diálogo, una réplica más del personaje que no sabe. Nunca con repeticiones, muletillas, adjetivos decorativos, introducciones ni recapitulaciones. El prompt incluye como ejemplo de referencia el guion completo del "acné de la mandíbula" (HAC, 55 s, nivel 1, idea 6/8), con sus 4 partes y la frase puente. Su gancho va en segunda persona, la voz por defecto.

La revisión muestra un resumen como `HAC 51-56s · 55s · rango 170-190 · 182 palabras ✓ · nivel 1 · idea 6/8`.

## Formatos de video

El formato es la puesta en escena. Lo eliges tú, o con **Auto** la IA elige el que mejor comunica la idea y lo explica en una línea. **Regla madre:** se elige por cuál comunica mejor, nunca por cuál parece más viral.

| Formato | Qué es | Para | Producción |
| --- | --- | --- | --- |
| HAC · Hablando a cámara | Ella habla directo al espectador, una sola toma | Mecanismo, historia, confesión | 1 persona, cámara fija |
| VOF · Voz en off | Narración sobre b-roll (manos, preparación, detalle) | Dato contraintuitivo, tono íntimo, sin quién salga | B-roll + locución |
| POV | Alguien graba desde su perspectiva e interactúa con otra persona | Pregunta incómoda, descubrimiento | 2 personas |
| Personaje | Dos o más personajes (puede ser la misma persona editada) | Mitos, conflicto, malentendido | 1-2 personas + cambio de ropa o encuadre |
| Vlog | Documenta una actividad mientras habla | Producto en lo cotidiano | 1 persona en movimiento |
| Dinámico | Varios encuadres, cortes, texto en pantalla | Listas, "3 errores", comparaciones | La más cara en edición |
| Reacción | Comentario o DM de su propia audiencia en pantalla; ella responde | Objeción directa, la pregunta que todas hacen | 1 persona |

**Tabla de selección (modo Auto):**
- Mito o creencia falsa → Personaje · Reacción.
- Mecanismo → HAC · Dinámico.
- Lista o varios errores → Dinámico.
- Confesión o lo que ella sintió → HAC · VOF.
- Pregunta incómoda o descubrimiento → POV.
- Producto en lo cotidiano → Vlog.
- Dato contraintuitivo con b-roll → VOF.
- Objeción que ya le hicieron → Reacción.

**Cómo cambia la estructura.** Los cuatro tiempos (gancho → cuerpo → producto → CTA) se mantienen siempre.
- **HAC, VOF, Vlog y Dinámico:** una sola voz.
- **POV y Personaje:** el gancho es la primera línea de diálogo. El dato nuevo lo dice el personaje que sabe y la emoción el que no sabe. Cada línea lleva la etiqueta de su personaje y, cuando aplica, una nota de encuadre o acción entre corchetes.
- **Reacción:** el comentario en pantalla es el gancho, y la primera frase de ella ya es cuerpo. El guion trae un comentario de ejemplo: **cámbialo por uno real de tu audiencia**. Nunca se reacciona al video de otra persona ni se confronta a otra marca o creadora.


**Dónde editarlo.**
- Formatos y tabla de selección: `VIDEO_FORMATS` y `FORMAT_SELECTION` en `lib/video/constants.ts`.
- Validaciones por formato: `runFormatChecks` en `lib/video/script.ts`. Exigen dos personajes en el diálogo, el gancho como primera línea, el reparto dato/emoción entre los personajes, una sola voz en los demás formatos, el comentario en Reacción y texto en pantalla en Dinámico.

## Cómo usarlo

1. **Videos** en el menú lateral.
2. Escribe la idea desde el síntoma que ella vive (no desde el producto) y elige:
   - **Formato:** Auto o uno de los 7.
   - **Voz del gancho**, **Modelo de IA**, **Nivel de conciencia** y, si aplica, **Idea ya validada** y **Palabra clave del CTA**.
   - **Producto de aterrizaje:** creatina o inositol.
   - **Canal:** *Orgánico* deja el dolor en segunda persona. *Anuncio pagado* lo reformula en tercera persona, para no chocar con las políticas de salud de Meta/TikTok.
   - **Molde de gancho:** uno de los 8 del método, o deja que la IA elija.
3. **Generar guion** abre la revisión: línea de tiempo de las 5 escenas, gancho, CTA, descripción con hashtags, ideas de historias y la revisión automática del método. **Ver prompts de imagen y video** muestra los prompts de cada fotograma.
4. Acciones:
   - **Reescribir guion:** describe los cambios y se genera una nueva versión que conserva lo demás.
   - **Aprobar guion:** lo deja listo para la fase de imágenes.
   - **Descartar.**

## Cómo se nombra el producto

- **El sabor se dice en español:** "limonada rosa", nunca "Pink Lemonade" en la locución.
- **El país no se dice:** nunca "Peach Perfect México". Basta con "Peach Perfect" o, mejor, con nombrar el producto.
- **Formas correctas:** "la creatina de Peach Perfect", "cinco gramos de creatina por scoop", "limonada rosa", "el inositol de Peach Perfect" (están en `PRODUCT_SPOKEN_NAMES`, en `lib/video/constants.ts`).
- **Prohibido** leer la ficha de catálogo en voz alta: nombre comercial + sabor + país + presentación en una misma frase.

## Locución y texto en pantalla

El guion se lee con voz generada, así que tiene dos capas separadas:

- **LOCUCIÓN** (las líneas de cada escena, el gancho, el dato nuevo, la emoción y el CTA): las palabras en inglés van escritas como se pronuncian en español.
- **TEXTO EN PANTALLA**, caption, título, hashtags e historias: siempre con la grafía correcta.

| Palabra | En la locución |
| --- | --- |
| Peach Perfect | pich pérfect |
| scoop | scup |
| pre workout | pri wórcaut |
| fitness | fítnes |

La tabla está en `PHONETIC_SPELLINGS` (`lib/video/constants.ts`). Al modelo se le pide escribir así, pero además el sistema aplica la conversión solo: `toSpoken` en la locución y `toWritten` en todo lo visible. Así las dos capas nunca se mezclan aunque el modelo se equivoque. Para enseñarle una palabra nueva, agrega una fila. La pantalla de revisión muestra cada escena con su **Locución** y su **Texto en pantalla**, y el **Caption** aparte.

## Revisión automática

`lib/video/script.ts` comprueba cada guion. Si falla una regla crítica, lo regenera una vez solo:

- 5 escenas, que abran con gancho y cierren con CTA.
- Gancho sin la marca ni tecnicismos (mg, myo, 80:1, monohidratada…).
- El bote no aparece antes del aterrizaje.
- **Duración:** 51-56 s (11 escenas de 5 s).
- **Extensión:** 170-190 palabras de locución, con un máximo de 22 por escena. Es una regla que se cumple, no un dato informativo: si el guion queda corto o largo, se reescribe con la instrucción exacta ("faltan 12 palabras; agrégalas con un segundo mecanismo, una objeción resuelta o una consecuencia práctica, nunca con relleno").
- **Segundo dato nuevo:** siempre obligatorio (`secondInsight`) y distinto del primero.
- **4 partes en orden** (crítica).
- **Frase puente:** presente antes del producto, sin efecto ni promesa, y verdadera sin el producto. Las tres son críticas.
- **Pieza independiente** (crítica), **nivel de conciencia 3-4** (aviso) y, en ideas validadas, **formato distinto al anterior** (crítica).
- **Nombre del producto:** sin "Pink Lemonade" ni "México" en la locución y sin frases de ficha de catálogo.
- **Sin verbos de folleto:** ni "requiere", "produce", "actúa", "acompaña", "apoya", "contribuye a" o "contiene", en ninguna conjugación. Si una frase podría ir impresa en la caja, no va en el guion.
- **Dato nuevo:** al menos una frase del contexto (dos en los videos largos) dice algo que ella no sabía (un mecanismo, una señal concreta o un dato de tiempo). Se guarda en `newInsight` y tiene que aparecer tal cual en el cuerpo.
- **Emoción:** el cuerpo nombra lo que ella sintió ("pensaste que a ti no te funciona"), no solo lo que le pasó. Se guarda en `feltLine` y tiene que aparecer tal cual en el cuerpo.
- **El producto solo se nombra:** desde el aterrizaje, sin atribuirle efectos (ayuda, mejora, regula, equilibra, reduce…). Se permiten los datos exactos de la ficha, como la proporción 80:1.
- **Sin claims médicos** (cura, trata, regulariza, previene, elimina) ni promesas de resultados con plazo ("en 8 semanas vas a ver"). Los datos de tiempo que explican ("la semana antes de que te baje") sí se permiten.
- **Sin frases prohibidas:** "sígueme para más", cápsulas, 40:1, antes/después.
- **Solo en anuncios:** nada de segunda persona sobre la condición.

Todas estas reglas, salvo el número de palabras por escena y la segunda persona en anuncios, son **críticas**. Si una falla, el guion se reescribe solo hasta 2 veces con las fallas como instrucción. Si después de 3 intentos todavía no cumple, **no se entrega para aprobar**: queda como *Falló*, con el motivo y el guion a la vista, y desde ahí puedes **Reintentar** o **Pedir cambios**. Las listas (verbos de folleto y límites de palabras) están en `lib/video/constants.ts`; las expresiones de efectos, claims y plazos, en `lib/video/script.ts`. Las reglas de escritura y el ejemplo de tono que recibe el modelo están en `lib/video/prompt.ts`.

**CTA dinámico.** Quien llega al final es la más interesada, así que el CTA la lleva al producto: al comentar la palabra clave, el DM automático de OpenReply le manda el link. Cada video escribe el suyo con el patrón **"Si [contexto del dolor], escríbeme PALABRA y te paso el link de la que tomo"**. Por ejemplo: "Si te comparas con tu amiga, escríbeme PROGRESO y te paso el link de la que tomo".
- **La entrada «Si…»** conecta con quien llegó hasta ahí.
- **La palabra clave** es específica al tema (una palabra en mayúsculas de 3 a 14 letras).
- **La oferta** es el link del producto que ella usa, dicho como recomendación a una amiga ("te paso el link de la que tomo", "te mando cuál es la mía").
- **Lo que se rechaza:** lenguaje de venta dura ("compra", "oferta", "promo", "aprovecha", "precio", "solo hoy") y ofertas vacías o inexistentes ("info", guías, descuentos, regalos). Están en `CTA_FORBIDDEN_OFFERS`.
- **Palabra fija para un video:** escríbela en **Palabra clave del CTA** del formulario.
- **Validaciones críticas:** la palabra clave se dice en la última escena, el CTA abre con «Si…», la palabra tiene formato válido y coincide con la que fijaste, y no hay venta dura.
- **En OpenReply:** crea en **Campaigns** una campaña con esa palabra clave que mande por DM el link del producto (`/products/creatina-para-mujeres` o `/products/inositol-en-polvo`). OpenReply compara sin importar mayúsculas ni tildes.

**El producto (3b) como testimonio.** En primera persona y conectado con el dolor del gancho: cuándo lo toma, cómo lo metió a su rutina y el resultado que ella vivió, plazo incluido. Por ejemplo: "Yo llevo seis semanas tomando esta creatina sabor limonada rosa, una vez al día, y mis glúteos por fin empezaron a crecer". El producto es el medio, no el mensaje.
- **Nunca características técnicas:** gramos, mg, monohidratada, proporciones, ingredientes o certificaciones. Es una regla crítica.
- **Resultado concreto y visible:** qué cambió y cómo se nota ("empezaron a crecer", "la mandíbula dejó de brotar"). Los verbos vagos como "responder", "mejorar", "vi cambios" o "funcionó" se rechazan (`VAGUE_RESULT`). Cuando se puede, el testimonio cierra conectando el resultado con el porqué del contexto ("no cambié el ejercicio: cambié lo que le doy al músculo").
- **Siempre un resultado físico:** el beneficio en el cuerpo que prometió el gancho (glúteos, fuerza, piel, ciclo, antojos…). Un cambio mental ("dejé de pensar que necesitaba más sentadillas") no es un resultado y se rechaza. La línea tiene que nombrar una parte del cuerpo o un resultado y un cambio (`BODY_OUTCOME` y `CHANGE_MARKER` en `lib/video/script.ts`).
- **Se siguen rechazando:**
  - Los efectos prometidos a quien ve ("te ayuda a…", "regula…").
  - Las promesas con plazo dirigidas a ella ("vas a ver en 8 semanas").
  - Los claims médicos ("cura", "regulariza", "previene").

## Editar el contexto

`content/peach-perfect-contexto-contenido.md` se manda completo al modelo como la única fuente de datos sobre la marca, los productos, la audiencia, el método y los guardrails. Edítalo y vuelve a desplegar el worker para que los guiones nuevos lo usen. Las reglas de formato (escenas, frames, salida JSON) están en `lib/video/prompt.ts`.

## Modelo de IA

El formulario tiene un selector **Modelo de IA**, que se usa para la checklist de idea y para escribir el guion:
- **GPT-6.1 Terra** (`gpt-6.1-terra`, por defecto): rápido y económico.
- **GPT-6.1 Sol** (`gpt-6.1-sol`): mejor calidad, más lento y más caro.

El modelo queda guardado en el proyecto, así que **Reescribir** y **Reintentar** usan el mismo. La lista vive en `VIDEO_TEXT_MODELS` (`lib/video/constants.ts`). El blog sigue usando `OPENAI_MODEL`.

## Dónde corre

Lo genera el worker de Railway, en la cola `video-generation` (`lib/video/jobs.ts`). Usa `OPENAI_API_KEY`, la misma que el blog. El modelo se elige en el formulario. Los proyectos se guardan en la tabla `VideoProject` (migración `20261104120000_video_projects`).

## Fase 2: imágenes iniciales

**Fotos de referencia.**
- En **Videos**, la sección *Fotos de referencia* tiene 4 espacios: modelo de creatina, bote de creatina, modelo de inositol y bote de inositol.
- Las fotos se reducen a WebP de máximo 1536 px y se guardan en la base de datos (`VideoReference`), **no en el repositorio**, porque el fork es público y son personas reales. Solo se pueden ver desde el panel con sesión de admin.
- La modelo de un producto nunca se usa en los videos del otro.
- **Usa solo fotos de personas que dieron su consentimiento** para el uso de su imagen con IA.

**Generación.** En un guion aprobado, **Generar imágenes** crea **la imagen inicial de cada escena** (11 en total). No se genera imagen final: P-Video anima cada clip a partir de una sola imagen, y así el costo de imágenes queda a la mitad.
- **Modelo:** el worker usa `images/edits` de OpenAI (`gpt-image-2.5-flare`, 864×1536, 9:16) con la foto de la modelo, más la del bote si el producto aparece en esa escena.
- **Lo que se le pide:** la misma cara, cabello y cuerpo que la referencia, el bote idéntico a su foto, encuadres de buen gusto y sin texto.
- **Regenerar:** cada imagen se puede regenerar por separado. El código está en `lib/video/frames.ts`.

## Fase 3: clips con P-Video (Pruna)

Cuando las 11 imágenes están listas, **Generar clips** anima cada escena con **P-Video** de Pruna (`lib/video/pruna.ts` y `lib/video/clips.ts`):
- **Imagen:** la imagen inicial se sube a `/v1/files` y se pasa como `image`.
- **Configuración:** **siempre `draft: true` y `720p`** (`CLIP_SETTINGS`), con 5 s por clip y `save_audio: true`. **El audio lo genera Pruna:** el prompt incluye la locución de la escena (en grafía fonética), el movimiento (`motionPrompt`), los planos y las pausas, y pide que ella hable en español de México sincronizado con los labios, sin música.
- **Proceso:** el worker crea la predicción, consulta su estado cada 5 s y descarga el MP4. Guarda el video en la base de datos (`VideoClip`), porque el link de Pruna caduca en 24 horas. Genera 3 clips a la vez.
- **Revisión:** cada clip se ve en su escena y se puede **Regenerar clip**. Si Pruna bloquea un clip por moderación, el motivo aparece en la escena.
- **Costo:** 11 clips × 5 s × $0.005 = **≈ $0.28 USD por video** (draft 720p).
- **Variable nueva:** `PRUNA_API_KEY`, en **Vercel y en el worker de Railway**.

## Fase 4: video final

Cuando los 11 clips están listos aparece **Video final y publicación** → **Unir video** (`lib/video/render.ts`):
- **Unión:** el worker junta los clips en orden con **ffmpeg** (instalado en la imagen de Docker). Los normaliza a 720×1280, 30 fps y audio de 48 kHz, y los recodifica al formato de Reels: H.264, AAC a 128 kbps y `faststart`.
- **Almacenamiento:** el MP4 final se sube a **Vercel Blob** con una URL pública difícil de adivinar. Instagram solo publica Reels desde una URL pública, y una función de Vercel no puede servir archivos de más de 4.5 MB.
- **Volver a unir:** si regeneras un clip, usa **Volver a unir**; el archivo anterior se borra del Blob.
- **Variable nueva:** `BLOB_READ_WRITE_TOKEN`. En Vercel → *Storage* → *Create* → *Blob*, conecta el store al proyecto (Vercel agrega la variable sola) y **copia el mismo valor al worker de Railway**.

## Fase 5: publicar en Instagram Reels

Con el video listo, eliges la cuenta y revisas el **caption** (viene del guion más los hashtags; máximo 2200 caracteres y 30 hashtags). Luego **Publicar en Reels** (`lib/video/publish.ts`):
- **Flujo:** el worker crea el contenedor de Reel con `video_url`, revisa su estado cada 15 s (hasta 10 min) y lo publica con `media_publish`. Al final guarda el link del Reel (`VideoPublication`).
- **Comparte en el feed:** `share_to_feed: true`.
- **Si falla:** el error aparece en el panel y puedes **Reintentar publicación**. Si el contenedor sigue vigente (24 h) y no cambiaste el caption ni la cuenta, se reutiliza.
- **Permiso nuevo:** `instagram_business_content_publish`. Ya se pide al conectar, pero **la cuenta conectada antes no lo tiene**: hay que agregar el permiso en la app de Meta (*Instagram → Permisos*) y **desconectar y volver a conectar** la cuenta en OpenReply. En modo Facebook Login el permiso es `instagram_content_publish`.
- **Límite de Instagram:** 50 publicaciones por API cada 24 horas por cuenta.
- La palabra del CTA debe tener su **automatización de OpenReply** para ese Reel (o la regla general) para que el DM con el link salga solo.

## Pendiente (siguientes fases)

1. Texto en pantalla (`onScreenText`) quemado en el video.
2. Publicar también en Facebook y TikTok (`VideoPublication.platform`).
3. Cron de publicación, igual que el blog.
