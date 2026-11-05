# Generador de videos (fase 1: guion)

Crea guiones de Reels/TikTok para Peach Perfect con el método de `content/peach-perfect-contexto-contenido.md`: gancho con el síntoma, contexto, aterrizaje en el producto y CTA fijo. Por ahora genera y revisa el **guion**. Las imágenes, los clips y la publicación automática son las fases siguientes.

## Formato

- Video vertical 9:16 de **25 segundos máximo**: **5 escenas de 5 segundos**.
- Escena 1 = gancho (la frase va en los primeros 3 s), 2–3 = contexto, 4 = aterrizaje (aquí aparece el producto por primera vez), 5 = cierre con el CTA.
- Cada escena trae su voz, el texto en pantalla, lo que se ve y tres prompts para las fases siguientes: **imagen inicial**, **imagen final** y **movimiento**. Con eso salen 10 imágenes y 5 clips, que luego se unirán en un solo video.
- El guion también define una protagonista y un estilo visual fijos, para que las 10 imágenes se vean del mismo video.

Los números viven en `lib/video/constants.ts` (`SCENE_COUNT`, `CLIP_SECONDS`).

## Cómo usarlo

1. **Videos** en el menú lateral.
2. Escribe la idea desde el síntoma que ella vive (no desde el producto) y elige:
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
- Máximo 13 palabras de voz por escena (lo que cabe en 5 s).
- Ninguna frase prohibida: "sígueme para más", cápsulas, 40:1, antes/después.
- Solo en anuncios: nada de segunda persona sobre la condición.

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
