# Generador de videos (fase 1: guion)

Crea guiones de Reels/TikTok para Peach Perfect con el método de `content/peach-perfect-contexto-contenido.md`: gancho con el síntoma, contexto, aterrizaje en el producto y CTA fijo. Por ahora genera y revisa el **guion**. Las imágenes, los clips y la publicación automática son las fases siguientes.

## Formato y duración

- Video vertical 9:16 en **escenas de 5 segundos**: cada escena es un clip. Un guion de 50 s tiene 10 escenas, es decir 20 imágenes (inicial y final de cada escena) y 10 clips, que luego se unen en un solo video.
- Cada escena pertenece a una de las **5 partes** del guion (ver abajo), en orden.
- Cada escena trae su locución, el texto en pantalla, lo que se ve y tres prompts para las fases siguientes: **imagen inicial**, **imagen final** y **movimiento**.
- El guion también define personajes y un estilo visual fijos, para que todas las imágenes se vean del mismo video.

### Duración por formato

La duración es un rango por formato, no un número global. Solo cuentan las palabras habladas: no el texto en pantalla, ni las acotaciones, ni las etiquetas de personaje.

| Formato | Estándar | Palabras habladas | Datos nuevos |
| --- | --- | --- | --- |
| HAC | 45-55 s | 125-155 | 2 |
| VOF | 45-55 s | 130-160 | 2 |
| Dinámico | 45-55 s | 120-150 | 2 |
| Vlog | 40-50 s | 105-135 | 2 |
| POV | 30-40 s | 70-95 | 1 |
| Personaje | 30-40 s | 65-90 | 1 |
| Reacción | 30-40 s | 70-90 | 1 |
| **Corto** (cualquiera) | 25-30 s | 65-75 (50-60 en POV y Personaje) | 1 |

El parámetro **Duración** del formulario tiene tres opciones:
- **Estándar:** el rango del formato, sin excepciones.
- **Corto:** 25-30 s en cualquier formato.
- **Auto:** el rango estándar, pero si la IA no encuentra un segundo dato real, baja a corto en vez de inflar el guion.

## Paso previo: checklist de idea (bloqueante)

Video viral = idea ganadora, siempre. Antes de escribir, la idea pasa por 8 filtros en una llamada aparte (`lib/video/idea-check.ts`):

1. Contracorriente.
2. Filtro 5-50.
3. Unicidad.
4. Aplicable a gente común.
5. Polémico.
6. Formato adecuado.
7. Personaje de marca congruente.
8. Referencia viral existente.

Necesita **mínimo 5 de 8** (`IDEA_MIN_SCORE`). Si saca menos, **no se escribe el guion**: el proyecto queda como *Idea rechazada* y muestra qué filtros falló, por qué, y **2 reformulaciones** de la misma idea con un botón **Escribir con esta**. Si la idea pasa, la checklist aparece en la revisión del guion. Los filtros se editan en `IDEA_FILTERS` (`lib/video/constants.ts`).

Una **idea validada** (ya funcionó) no se bloquea: se evalúa igual, pero solo para el reporte.

## Las 5 partes del guion

| # | Parte (`section`) | ~55 s | Qué hace |
| --- | --- | --- | --- |
| 1 | Gancho (`gancho`) | 0:00-0:05 | Para el scroll: pregunta, dato curioso o afirmación contracorriente. |
| 2 | Contexto (`contexto`) | 0:05-0:18 | Alarga la retención **sin revelar la respuesta**: nombra el problema y descarta lo obvio. |
| 3 | Moraleja (`moraleja`) | 0:18-0:40 | Aquí sí se revela: los datos nuevos y la emoción nombrada. |
| 4 | Solución (`solucion`) | 0:40-0:50 | **4a · frase puente** (0:40-0:46) + **4b · producto** (0:46-0:50). |
| 5 | CTA (`cta`) | 0:50-0:55 | Palabra clave fija. |

En los rangos de 30-40 s y en corto se mantienen las 5 partes: el contexto se reduce a unos 8 s, la moraleja lleva un solo dato y la frase puente es media frase ("eso se trabaja por dentro").

**Frase puente (4a).** Conecta la enseñanza con el producto: habla del problema y de dónde atacarlo, nunca de lo que hace el producto.
- **Patrones:** están en `BRIDGE_PATTERNS`. Por ejemplo, "Si el problema es [X], ahí es donde hay que trabajar."
- **Prohibido:** verbos de efecto (regula, equilibra, corrige, mejora, controla, normaliza), promesas y verbos de folleto.
- **El test:** tiene que seguir siendo verdadera aunque borres el producto. El modelo lo explica en `bridgeTest`, y si la frase nombra el producto o el bote se rechaza como claim disfrazado.
- **4b:** nombre, ingrediente relevante y sabor. Seco y corto.

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

**El tiempo extra se llena con sustancia:** un segundo mecanismo o detalle concreto, una objeción resuelta, una consecuencia práctica o, en diálogo, una réplica más del personaje que no sabe. Nunca con repeticiones, muletillas, adjetivos decorativos, introducciones ni recapitulaciones. El prompt incluye como ejemplo de referencia el guion completo del "acné de la mandíbula" (HAC, 55 s, nivel 1, idea 6/8), con sus 5 partes y la frase puente.

Los rangos viven en `VIDEO_DURATIONS` (`lib/video/constants.ts`). La revisión muestra un resumen como `HAC 45-55s · 55s · rango 125-155 · 148 palabras ✓ · nivel 1 · idea 6/8`.

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
- El cierre usa el CTA fijo: **GLÚTEOS** (creatina) o **SOP** (inositol).
- **Duración:** los segundos (escenas × 5) dentro del rango del formato y la duración elegidos.
- **Extensión:** las palabras de locución dentro del rango de la tabla y máximo 18 por escena. Es una regla que se cumple, no un dato informativo: si el guion queda corto o largo, se reescribe con la instrucción exacta ("faltan 12 palabras; agrégalas con un segundo mecanismo, una objeción resuelta o una consecuencia práctica, nunca con relleno").
- **Segundo dato nuevo:** obligatorio en los rangos de 40 s o más (`secondInsight`), distinto del primero.
- **5 partes en orden** y **contexto sin revelar el dato:** el dato nuevo aparece en el contexto en vez de la moraleja. Ambas son críticas.
- **Frase puente:** presente antes del producto, sin efecto ni promesa, y verdadera sin el producto. Las tres son críticas.
- **Pieza independiente** (crítica), **nivel de conciencia 3-4** (aviso) y, en ideas validadas, **formato distinto al anterior** (crítica).
- **Nombre del producto:** sin "Pink Lemonade" ni "México" en la locución y sin frases de ficha de catálogo.
- **Sin verbos de folleto:** ni "requiere", "produce", "actúa", "acompaña", "apoya", "contribuye a" o "contiene", en ninguna conjugación. Si una frase podría ir impresa en la caja, no va en el guion.
- **Dato nuevo:** al menos una frase de la moraleja (dos en los videos largos) dice algo que ella no sabía (un mecanismo, una señal concreta o un dato de tiempo). Se guarda en `newInsight` y tiene que aparecer tal cual en el cuerpo.
- **Emoción:** el cuerpo nombra lo que ella sintió ("pensaste que a ti no te funciona"), no solo lo que le pasó. Se guarda en `feltLine` y tiene que aparecer tal cual en el cuerpo.
- **El producto solo se nombra:** desde el aterrizaje, sin atribuirle efectos (ayuda, mejora, regula, equilibra, reduce…). Se permiten los datos exactos de la ficha, como la proporción 80:1.
- **Sin claims médicos** (cura, trata, regulariza, previene, elimina) ni promesas de resultados con plazo ("en 8 semanas vas a ver"). Los datos de tiempo que explican ("la semana antes de que te baje") sí se permiten.
- **Sin frases prohibidas:** "sígueme para más", cápsulas, 40:1, antes/después.
- **Solo en anuncios:** nada de segunda persona sobre la condición.

Todas estas reglas, salvo el número de palabras por escena y la segunda persona en anuncios, son **críticas**. Si una falla, el guion se reescribe solo hasta 2 veces con las fallas como instrucción. Si después de 3 intentos todavía no cumple, **no se entrega para aprobar**: queda como *Falló*, con el motivo y el guion a la vista, y desde ahí puedes **Reintentar** o **Pedir cambios**. Las listas (verbos de folleto y límites de palabras) están en `lib/video/constants.ts`; las expresiones de efectos, claims y plazos, en `lib/video/script.ts`. Las reglas de escritura y el ejemplo de tono que recibe el modelo están en `lib/video/prompt.ts`.

**CTA y OpenReply.** El CTA del cierre está fijo en `VIDEO_CTA` (`lib/video/constants.ts`). Para que funcione, crea en **Campaigns** una campaña con la palabra clave **GLÚTEOS** o **SOP** que mande el link del producto por DM.

## Editar el contexto

`content/peach-perfect-contexto-contenido.md` se manda completo al modelo como la única fuente de datos sobre la marca, los productos, la audiencia, el método y los guardrails. Edítalo y vuelve a desplegar el worker para que los guiones nuevos lo usen. Las reglas de formato (escenas, frames, salida JSON) están en `lib/video/prompt.ts`.

## Dónde corre

Lo genera el worker de Railway, en la cola `video-generation` (`lib/video/jobs.ts`). Usa `OPENAI_API_KEY` y `OPENAI_MODEL`, las mismas variables que el blog, y no necesita ninguna nueva. Los proyectos se guardan en la tabla `VideoProject` (migración `20261104120000_video_projects`).

## Pendiente (siguientes fases)

1. Generar las imágenes (inicial y final de cada escena: 2 por cada 5 s) con el modelo de imágenes de OpenAI, usando `startFramePrompt`/`endFramePrompt`, la protagonista y el estilo visual.
2. Generar los clips (uno por escena) con el modelo de video a partir de cada par de imágenes y `motionPrompt`.
3. Unir los clips en un solo video (por ejemplo con ffmpeg en el worker) y agregar voz y texto en pantalla.
4. Cron de publicación, igual que el blog.
