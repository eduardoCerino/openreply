# Generador de videos (fase 1: guion)

Crea guiones de Reels/TikTok para Peach Perfect con el método de `content/peach-perfect-contexto-contenido.md`: gancho con el síntoma, contexto, aterrizaje en el producto y CTA fijo. Por ahora genera y revisa el **guion**. Las imágenes, los clips y la publicación automática son las fases siguientes.

## Formato

- Video vertical 9:16 de **25 segundos máximo**: **5 escenas de 5 segundos**.
- Escena 1 = gancho (la frase va en los primeros 3 s), 2–3 = contexto, 4 = aterrizaje (aquí aparece el producto por primera vez), 5 = cierre con el CTA.
- Cada escena trae su voz, el texto en pantalla, lo que se ve y tres prompts para las fases siguientes: **imagen inicial**, **imagen final** y **movimiento**. Con eso salen 10 imágenes y 5 clips, que luego se unirán en un solo video.
- El guion también define una protagonista y un estilo visual fijos, para que las 10 imágenes se vean del mismo video.

Los números viven en `lib/video/constants.ts` (`SCENE_COUNT`, `CLIP_SECONDS`).

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

El número de palabras es el mismo para todos los formatos (60–75 habladas). El texto en pantalla no cuenta.

**Dónde editarlo.**
- Formatos y tabla de selección: `VIDEO_FORMATS` y `FORMAT_SELECTION` en `lib/video/constants.ts`.
- Validaciones por formato: `runFormatChecks` en `lib/video/script.ts`. Exigen dos personajes en el diálogo, el gancho como primera línea, el reparto dato/emoción entre los personajes, una sola voz en los demás formatos, el comentario en Reacción y texto en pantalla en Dinámico.

## Cómo usarlo

1. **Videos** en el menú lateral.
2. Escribe la idea desde el síntoma que ella vive (no desde el producto) y elige:
   - **Formato:** Auto o uno de los 7.
   - **Producto de aterrizaje:** creatina o inositol.
   - **Canal:** *Orgánico* deja el dolor en segunda persona. *Anuncio pagado* lo reformula en tercera persona, para no chocar con las políticas de salud de Meta/TikTok.
   - **Molde de gancho:** uno de los 8 del método, o deja que la IA elija.
3. **Generar guion** abre la revisión: línea de tiempo de las 5 escenas, gancho, CTA, descripción con hashtags, ideas de historias y la revisión automática del método. **Ver prompts de imagen y video** muestra los prompts de cada fotograma.
4. Acciones:
   - **Reescribir guion:** describe los cambios y se genera una nueva versión que conserva lo demás.
   - **Aprobar guion:** lo deja listo para la fase de imágenes.
   - **Descartar.**

## Revisión automática

`lib/video/script.ts` comprueba cada guion. Si falla una regla crítica, lo regenera una vez solo:

- 5 escenas, que abran con gancho y cierren con CTA.
- Gancho sin la marca ni tecnicismos (mg, myo, 80:1, monohidratada…).
- El bote no aparece antes del aterrizaje.
- El cierre usa el CTA fijo: **GLÚTEOS** (creatina) o **SOP** (inositol).
- **Extensión:** 60–75 palabras de voz en total (25 s de español conversacional son ~70) y máximo 18 por escena. Si el guion queda muy corto, se regenera: el problema es la palabra vacía, no la velocidad.
- **Sin verbos de folleto:** ni "requiere", "produce", "actúa", "acompaña", "apoya", "contribuye a" o "contiene", en ninguna conjugación. Si una frase podría ir impresa en la caja, no va en el guion.
- **Dato nuevo:** al menos una frase del cuerpo dice algo que ella no sabía (un mecanismo, una señal concreta o un dato de tiempo). Se guarda en `newInsight` y tiene que aparecer tal cual en el cuerpo.
- **Emoción:** el cuerpo nombra lo que ella sintió ("pensaste que a ti no te funciona"), no solo lo que le pasó. Se guarda en `feltLine` y tiene que aparecer tal cual en el cuerpo.
- **El producto solo se nombra:** desde el aterrizaje, sin atribuirle efectos (ayuda, mejora, regula, equilibra, reduce…). Se permiten los datos exactos de la ficha, como la proporción 80:1.
- **Sin claims médicos** (cura, trata, regulariza, previene, elimina) ni promesas de resultados con plazo ("en 8 semanas vas a ver"). Los datos de tiempo que explican ("la semana antes de que te baje") sí se permiten.
- **Sin frases prohibidas:** "sígueme para más", cápsulas, 40:1, antes/después.
- **Solo en anuncios:** nada de segunda persona sobre la condición.

Todas estas reglas, salvo el número de palabras por escena y la segunda persona en anuncios, son críticas: si una falla, el guion se regenera una vez antes de mostrártelo. Las listas (verbos de folleto y límites de palabras) están en `lib/video/constants.ts`; las expresiones de efectos, claims y plazos, en `lib/video/script.ts`. Las reglas de escritura y el ejemplo de tono que recibe el modelo están en `lib/video/prompt.ts`.

**CTA y OpenReply.** El CTA del cierre está fijo en `VIDEO_CTA` (`lib/video/constants.ts`). Para que funcione, crea en **Campaigns** una campaña con la palabra clave **GLÚTEOS** o **SOP** que mande el link del producto por DM.

## Editar el contexto

`content/peach-perfect-contexto-contenido.md` se manda completo al modelo como la única fuente de datos sobre la marca, los productos, la audiencia, el método y los guardrails. Edítalo y vuelve a desplegar el worker para que los guiones nuevos lo usen. Las reglas de formato (escenas, frames, salida JSON) están en `lib/video/prompt.ts`.

## Dónde corre

Lo genera el worker de Railway, en la cola `video-generation` (`lib/video/jobs.ts`). Usa `OPENAI_API_KEY` y `OPENAI_MODEL`, las mismas variables que el blog, y no necesita ninguna nueva. Los proyectos se guardan en la tabla `VideoProject` (migración `20261104120000_video_projects`).

## Pendiente (siguientes fases)

1. Generar las 10 imágenes (inicial y final de cada escena) con el modelo de imágenes de OpenAI, usando `startFramePrompt`/`endFramePrompt`, la protagonista y el estilo visual.
2. Generar los 5 clips con el modelo de video a partir de cada par de imágenes y `motionPrompt`.
3. Unir los 5 clips en un solo video de 25 s (por ejemplo con ffmpeg en el worker) y agregar voz y texto en pantalla.
4. Cron de publicación, igual que el blog.
