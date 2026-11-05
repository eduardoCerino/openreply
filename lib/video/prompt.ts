import {
  AWARENESS_LEVELS,
  BRIDGE_PATTERNS,
  CLIP_SECONDS,
  FORMAT_SELECTION,
  HOOK_MOLDS,
  PHONETIC_SPELLINGS,
  PRODUCT_SPOKEN_NAMES,
  SCENE_WORDS_MAX,
  CTA_EXAMPLES,
  CTA_OFFERS,
  VIDEO_DURATIONS,
  VIDEO_FORMATS,
  VIDEO_FORMAT_IDS,
  type AwarenessLevel,
  type AwarenessParam,
  type DurationTier,
  type VideoChannel,
  type VideoDuration,
  type VideoFormat,
  type VideoProduct,
} from "@/lib/video/constants";

// The five parts of the method: hook, context (intrigue, no answer yet),
// lesson (the reveal), solution (4a bridge + 4b product) and CTA.
export type SceneSection = "gancho" | "contexto" | "moraleja" | "solucion" | "cta";
export const SCENE_SECTIONS: SceneSection[] = ["gancho", "contexto", "moraleja", "solucion", "cta"];

/** One spoken line. Single-voice formats use one speaker throughout. */
export interface VideoLine {
  speaker: string;
  text: string;
  /** Framing or action note, shown in brackets. Empty when there is none. */
  direction: string;
}

export interface VideoScene {
  section: SceneSection;
  startSecond: number;
  endSecond: number;
  lines: VideoLine[];
  /** All spoken text of the scene, joined from `lines` by normalizeScript. */
  voiceover: string;
  onScreenText: string;
  visual: string;
  productVisible: boolean;
  startFramePrompt: string;
  endFramePrompt: string;
  motionPrompt: string;
}

export interface VideoScript {
  title: string;
  format: VideoFormat;
  formatReason: string;
  /** Reaction format only: the audience comment shown on screen (the hook). */
  onScreenComment: string;
  durationTier: DurationTier;
  /** scenes × CLIP_SECONDS, set by normalizeScript. */
  targetSeconds: number;
  awarenessLevel: AwarenessLevel;
  hookMold: string;
  hook: string;
  symptom: string;
  newInsight: string;
  /** Second new insight, required in the long (40 s or more) ranges; "" otherwise. */
  secondInsight: string;
  feltLine: string;
  /** The comment keyword of this video's CTA, uppercase, one word. */
  ctaKeyword: string;
  /** Part 4a, verbatim: connects the lesson to the product without crediting it. */
  bridgeLine: string;
  /** Part 4b, verbatim: product name, relevant ingredient, flavor. */
  productLine: string;
  /** Why the bridge stays true with the product deleted from the script. */
  bridgeTest: string;
  character: string;
  visualStyle: string;
  scenes: VideoScene[];
  cta: string;
  caption: string;
  hashtags: string[];
  storyFollowUps: string[];
}

const str = (description: string) => ({ type: "string", description });

export const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "format",
    "formatReason",
    "onScreenComment",
    "durationTier",
    "targetSeconds",
    "awarenessLevel",
    "hookMold",
    "hook",
    "symptom",
    "newInsight",
    "secondInsight",
    "feltLine",
    "ctaKeyword",
    "bridgeLine",
    "productLine",
    "bridgeTest",
    "character",
    "visualStyle",
    "scenes",
    "cta",
    "caption",
    "hashtags",
    "storyFollowUps",
  ],
  properties: {
    title: str("Nombre interno corto del video."),
    format: { type: "string", enum: VIDEO_FORMAT_IDS },
    formatReason: str("Una línea: por qué este formato comunica mejor esta idea."),
    onScreenComment: str(
      "Solo formato reaccion: el comentario o DM de su propia audiencia que se ve en pantalla (es el gancho). Cadena vacía en los demás formatos."
    ),
    durationTier: {
      type: "string",
      enum: ["estandar", "corto"],
      description: "Rango de duración usado: estandar (el del formato) o corto (25-30 s).",
    },
    targetSeconds: {
      type: "integer",
      description: `Duración total en segundos, múltiplo de ${CLIP_SECONDS}, dentro del rango elegido.`,
    },
    awarenessLevel: {
      type: "string",
      enum: ["0", "1", "2"],
      description: "Nivel de conciencia para el que está escrito el guion.",
    },
    hookMold: str("Molde de gancho usado (copia el molde) o 'propio' si no encaja ninguno."),
    hook: str(
      "La frase exacta del gancho, en primera persona como experiencia vivida y sin preguntas: narración en formatos de una voz, primera línea de diálogo en POV/Personaje, el comentario en Reacción."
    ),
    symptom: str("El síntoma cotidiano del que parte el video, con las palabras de ella."),
    newInsight: str(
      "Copia EXACTA de la frase de la MORALEJA con el primer dato que ella NO sabía: un mecanismo, una señal concreta o un dato de tiempo."
    ),
    secondInsight: str(
      "Copia EXACTA de la frase de la MORALEJA con el SEGUNDO dato nuevo, distinto del primero. Obligatorio en los rangos de 40 s o más; cadena vacía en los de 30-40 s y en corto."
    ),
    feltLine: str(
      "Copia EXACTA de la frase de la MORALEJA que nombra lo que ella SINTIÓ (no lo que le pasó)."
    ),
    ctaKeyword: str(
      "Palabra clave del CTA de este video: una sola palabra en MAYÚSCULAS, 3-14 letras, sin espacios ni números, ligada al tema del video y fácil de escribir en un comentario."
    ),
    bridgeLine: str(
      "Copia EXACTA de la frase puente (parte 4a): habla del problema y de dónde hay que atacarlo, nunca de lo que hace el producto, y no nombra el producto."
    ),
    productLine: str(
      "Copia EXACTA de la frase del producto (parte 4b): testimonio en primera persona con el resultado que ella vivió, conectado con el dolor del gancho. Sin características técnicas."
    ),
    bridgeTest: str(
      "Una oración: cómo se lee la frase puente si borras el producto del guion, y por qué sigue siendo verdadera."
    ),
    character: str(
      "Descripción física fija de cada persona que sale, con su etiqueta de personaje (edad, rasgos, cabello, ropa), para que todas las imágenes muestren a las mismas personas. Sin nombres reales ni parecido a alguien famoso."
    ),
    visualStyle: str("Estilo visual fijo para todas las imágenes: luz, paleta, lugar, tipo de toma."),
    scenes: {
      type: "array",
      description: `Una escena por cada ${CLIP_SECONDS} segundos de targetSeconds (50 s = 10 escenas), en orden. Cada escena es un clip de video.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "section",
          "startSecond",
          "endSecond",
          "lines",
          "onScreenText",
          "visual",
          "productVisible",
          "startFramePrompt",
          "endFramePrompt",
          "motionPrompt",
        ],
        properties: {
          section: { type: "string", enum: SCENE_SECTIONS },
          startSecond: { type: "integer" },
          endSecond: { type: "integer" },
          lines: {
            type: "array",
            description: "Lo que se dice en la escena, en orden. Una voz: una o dos líneas del mismo speaker. Diálogo: alterna speakers.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["speaker", "text", "direction"],
              properties: {
                speaker: str("Etiqueta del personaje que habla (\"Ella\", \"Voz en off\", \"Amiga\", \"La que sabe\"…), siempre la misma para la misma persona."),
                text: str("LOCUCIÓN: la línea hablada palabra por palabra, en grafía fonética (las palabras en inglés como se pronuncian en español)."),
                direction: str("Nota de encuadre o acción (sin corchetes). Cadena vacía si no aplica."),
              },
            },
          },
          onScreenText: str("TEXTO EN PANTALLA: corto, no se dice en voz alta, en grafía correcta (Peach Perfect, scoop). Cadena vacía si no hay."),
          visual: str("Qué se ve en la escena, en español."),
          productVisible: { type: "boolean", description: "true solo si el bote aparece en esta escena." },
          startFramePrompt: str(
            "Prompt en inglés para la imagen del PRIMER fotograma de la escena (vertical 9:16, fotorrealista). Repite la descripción de la protagonista."
          ),
          endFramePrompt: str(
            "Prompt en inglés para la imagen del ÚLTIMO fotograma de la escena. Debe ser el mismo plano después del movimiento y servir de puente visual a la escena siguiente."
          ),
          motionPrompt: str(
            "Instrucción en inglés para el modelo de video: qué se mueve entre el primer y el último fotograma (acción, cámara, ritmo)."
          ),
        },
      },
    },
    cta: str("La línea del CTA de este video (la que se dice en la escena cta), con la palabra clave en mayúsculas."),
    caption: str("Descripción del post para Instagram/TikTok, 1-3 líneas, que repita el CTA. Grafía correcta (Peach Perfect), nunca la fonética."),
    hashtags: { type: "array", items: { type: "string" }, description: "3 a 6 hashtags sin espacios." },
    storyFollowUps: {
      type: "array",
      items: { type: "string" },
      description: "2-3 ideas de historias de confianza para el mismo tema (objeciones resueltas, la fórmula, por qué 80:1).",
    },
  },
} as const;

function formatCatalog(): string {
  return VIDEO_FORMAT_IDS.map((id, index) => {
    const spec = VIDEO_FORMATS[id];
    return `${index + 1}. ${id} — ${spec.label}: ${spec.description} Para: ${spec.bestFor}. Producción: ${spec.production}`;
  }).join("\n");
}

function durationTable(): string {
  return VIDEO_FORMAT_IDS.map((id) => {
    const { estandar, corto } = VIDEO_DURATIONS[id];
    return `- ${id}: estandar ${estandar.seconds[0]}-${estandar.seconds[1]} s, ${estandar.words[0]}-${estandar.words[1]} palabras, ${estandar.insights} dato(s) nuevo(s) · corto ${corto.seconds[0]}-${corto.seconds[1]} s, ${corto.words[0]}-${corto.words[1]} palabras, 1 dato nuevo`;
  }).join("\n");
}

function selectionTable(): string {
  return FORMAT_SELECTION.map((row) => `- ${row.idea} → ${row.formats.join(" · ")}`).join("\n");
}

// Few-shot of a long single-voice script that meets every rule, from the
// method brief.
const FEW_SHOT = `EJEMPLO (few-shot) · idea "el acné de la mandíbula" · formato hac · estandar · 55 s · 11 escenas · nivel 1 · checklist 6/8
[1 · GANCHO]
Dos años cambiando de skincare por un acné que no estaba en mi piel. Nadie me avisó.
[2 · CONTEXTO — intriga, sin revelar]
Y ya probaste todo. Ácido salicílico, niacinamida, la rutina coreana de diez pasos, cambiar la funda de la almohada cada tercer día. Te mejora un poco y a las dos semanas vuelve. Siempre vuelve. Pero fíjate dónde.
[3 · MORALEJA — aquí sí se revela]
Mandíbula y barbilla. Siempre ahí, y casi siempre la misma semana del mes. Eso no es un patrón de limpieza, es un patrón hormonal, y por eso ningún producto que se queda en la superficie lo va a tocar. Lo estabas atacando en el lugar equivocado.
Y mientras tanto te sentiste sucia o descuidada por algo que nunca fue tu culpa.
[4a · PUENTE]
Si viene de adentro, ahí es donde hay que trabajar. No en la cara.
[4b · PRODUCTO]
Por eso yo ahora tomo el inositol de pich pérfect, limonada rosa, todas las mañanas.
[5 · CTA]
Si te pasa igual, escríbeme MANDÍBULA y te digo dónde buscar.
TEXTO EN PANTALLA: Peach Perfect · Inositol limonada rosa
Por qué funciona: el gancho es una experiencia vivida en primera persona con una segunda oración corta que abre la curiosidad; el contexto nombra el problema y descarta lo obvio pero NO dice todavía que es hormonal (esa intriga sostiene hasta el segundo 18); la moraleja trae los dos datos nuevos (mandíbula y barbilla la misma semana del mes = patrón hormonal; lo que se queda en la superficie no lo toca) y la emoción ("te sentiste sucia o descuidada"); la frase puente sigue siendo verdadera sin el producto; el producto se nombra sin efecto atribuido.`;

export function buildScriptInstructions(brandContext: string): string {
  return `Eres guionista de videos cortos verticales (Reels/TikTok) para Peach Perfect. Sigue al pie de la letra el documento de marca y método que va abajo: es la única fuente de datos sobre la marca, los productos y la estructura. No inventes nada que no esté ahí (fórmulas, sabores, presentaciones, certificaciones, precios, testimonios).

FORMATO TÉCNICO
- Video vertical 9:16. Cada escena dura ${CLIP_SECONDS} segundos y es un clip independiente que un modelo de video genera a partir de una imagen inicial y una final, así que cada escena es una sola toma continua y simple.
- Número de escenas = targetSeconds / ${CLIP_SECONDS} (50 s = 10 escenas, 35 s = 7). startSecond/endSecond consecutivos desde 0.
- Máximo ${SCENE_WORDS_MAX} palabras habladas por escena.

DURACIÓN Y PALABRAS (por formato)
La duración es un rango por formato, no un número fijo. Base: ~2.8 palabras por segundo en español conversacional. Solo cuentan las palabras habladas: no el texto en pantalla, ni las acotaciones (direction), ni las etiquetas de personaje.
${durationTable()}
- Los formatos de diálogo (pov, personaje) y reaccion son más cortos a propósito: el diálogo actuado a 55 segundos se siente eterno y falso, y después de leer el comentario nadie aguanta un minuto de respuesta.
- El conteo se CUMPLE: si te quedas corta o te pasas, el guion se rechaza y se reescribe.

FORMATO DE VIDEO (la puesta en escena)
Regla madre: el formato se elige por cuál comunica mejor la idea, NUNCA por cuál parece más viral.
${formatCatalog()}

Tabla de selección (cuando el formato es auto, elige con esta tabla y explica en formatReason, en una línea, por qué):
${selectionTable()}

Cómo cambia la estructura según el formato (las 5 partes gancho → contexto → moraleja → solución → CTA se mantienen siempre):
- hac, vof, vlog, dinamico: una sola voz y estructura directa. Todas las líneas con el mismo speaker ("Ella" o "Voz en off" en vof).
- pov, personaje: el gancho es la primera línea de diálogo, no una narración. Los datos nuevos (en la moraleja) los dice el personaje que sabe; la emoción (feltLine) la dice el que no sabe. Cada línea lleva su speaker y, cuando aplique, su nota de encuadre o acción en direction.
- reaccion: el comentario en pantalla (onScreenComment) ES el gancho: el espectador lo lee unos 2 segundos en silencio, y la primera frase de ella ya es contexto. Solo comentarios o DMs de su propia audiencia: nunca reaccionar al video de otra persona ni confrontar a otra marca o creadora. Escribe el comentario como lo escribiría una seguidora real (sin @usuario); la revisora lo cambiará por uno real.
- vlog: hay pausas de acción; usa direction para marcar lo que hace mientras habla.
- dinamico: varios encuadres y texto en pantalla en casi todas las escenas; el texto en pantalla complementa, no repite lo que se dice.

ESTRUCTURA: EL GUION TIENE 5 PARTES (cada escena lleva la section de su parte)
Tiempos para un video de ~55 s:
1. gancho (0:00-0:05, la primera escena): para el scroll con una HISTORIA, no con una pregunta (ver EL GANCHO abajo). Cero marca, cero producto, cero tecnicismo (nada de mg, proporciones, nombres de compuestos).
2. contexto (0:05-0:18): información de fondo que ALARGA la retención SIN revelar todavía la respuesta. Genera intriga: nombra el problema, descarta lo obvio, pero NO explica aún el porqué. Patrón: "Normalmente pensarías que es X… y eso es justo lo que te está confundiendo." Aquí NO van los datos nuevos.
3. moraleja (0:18-0:40): aquí SÍ se revela. Los datos nuevos y la emoción nombrada.
4. solucion (0:40-0:50), en DOS frases:
   4a · frase puente (0:40-0:46): conecta la enseñanza con el producto. Habla del PROBLEMA y de DÓNDE hay que atacarlo, nunca de lo que el producto hace. Es consecuencia lógica de lo ya explicado, no una promesa nueva. No nombra el producto.
   4b · el producto (0:46-0:50): en primera persona, como testimonio del resultado que ella vivió y que conecta con el dolor del gancho (ver EL PRODUCTO abajo). El producto es el medio, no el mensaje.
5. cta (0:50-0:55, la última escena): el CTA de este video (ver CTA abajo).
En los rangos de 30-40 s y en corto las 5 partes se mantienen: el contexto se reduce a ~8 s, la moraleja lleva un solo dato nuevo más la emoción, y la frase puente es media frase ("eso se trabaja por dentro"). La solución pasa de ~8 a ~12 s en los videos de 45-55 s; ese tiempo sale del contexto, no del total de palabras.
- El bote del producto NO aparece antes de la solución.

EL GANCHO: EXPERIENCIA VIVIDA, NUNCA PREGUNTA
- Escríbelo en primera persona, como si fuera la propia clienta recordando algo que le pasó, no como una pregunta que la describe desde afuera. Así no siente que le venden: siente que alguien vivió lo mismo que ella. El cerebro reconoce una historia y se detiene; una pregunta de anuncio la ve mil veces al día.
- Prohibidas las preguntas retóricas ("¿te pasa esto?", "¿sabías que…?", "¿te ha pasado…?"): están quemadas. El gancho no lleva signos de interrogación.
- Estructura: una primera oración que ella podría haber dicho en voz alta (lo que hizo, lo que pasó, cuánto tiempo), y una segunda oración CORTA que genera curiosidad sin revelar la solución.
- Ejemplos de patrón (no los copies; adapta el patrón al tema, sea glúteos, piel, cabello o ciclo):
  - "Tomé creatina un mes, no vi nada y la tiré a la basura. Ahora sé por qué no funcionó, y es que nadie me explicó esto."
  - "Tres meses tomando inositol sin ver nada. Luego descubrí que lo estaba tomando en el momento equivocado."
  - "Llevas meses haciendo sentadillas… y tus glúteos siguen exactamente igual. No es tu culpa." (segunda persona que suena a experiencia vivida, no a pregunta; la primera persona es la preferida)
- Los moldes de gancho se adaptan a esta voz: el molde da el ángulo, la primera persona da la forma.
- En pov y personaje el gancho es la primera línea de diálogo, dicha por un personaje en primera persona ("Me compré otra crema. Ya van tres este mes."). En reaccion el gancho es el comentario en pantalla: ahí sí puede ser una pregunta, porque la hace la seguidora.
- En anuncio pagado la primera persona además evita hablarle a ella de su condición en segunda persona.

CTA (parte 5): dinámico, uno a la medida de cada video
- Empieza con una frase de entrada natural, "Si [contexto del dolor del video]", para conectar con quien llegó hasta ahí, y después la instrucción: "Si [contexto], escríbeme [PALABRA] y te digo [micro-solución]".
- Promete una MICRO-SOLUCIÓN útil que resuelva exactamente el dolor que abrió el gancho (por ejemplo: ${CTA_OFFERS.join(", ")}). Nunca un link, nunca "info", nunca el producto directamente. Tiene que sonar a consejo, no a venta.
- La palabra clave (ctaKeyword) es específica al tema del video: una palabra que ella reconozca del guion, en MAYÚSCULAS, de 3 a 14 letras, sin espacios ni números (por ejemplo GLÚTEOS, CREATINA, INOSITOL, DULCE). Fácil de escribir en un comentario.
- Mal: "Comenta X y te mando el link", "Comenta X y te mando info".
- Bien (patrón, no los copies): ${[...CTA_EXAMPLES.creatina, ...CTA_EXAMPLES.inositol].map((line) => `"${line}"`).join(", ")}.
- La línea del CTA (campo cta) se dice tal cual en la escena cta, y el caption la repite. Prohibido "sígueme para más".
- El documento de marca habla de un CTA fijo: en este sistema cada video tiene el suyo; lo que no cambia es que siempre hay uno, concreto, al final.
- Prohibido: "sígueme para más", abrir nombrando la marca, unboxing, mostrar la etiqueta como tema, música épica de gym como idea central.

LA FRASE PUENTE (parte 4a)
Patrones válidos:
${BRIDGE_PATTERNS.map((pattern) => `- "${pattern}"`).join("\n")}
Prohibido en la frase puente:
- Cualquier verbo de efecto sobre el cuerpo: regula, equilibra, corrige, mejora, controla, normaliza.
- Cualquier promesa de resultado, con o sin plazo.
- Cualquier verbo de folleto: contiene, aporta, actúa, apoya, contribuye a.
El test: la frase puente debe seguir siendo verdadera aunque borres el producto del guion. Si solo tiene sentido como argumento de venta, es un claim disfrazado: reescríbela. Explica el test en bridgeTest.
Ejemplos:
- Mal (producto de la nada): "Myo-inositol con zinc, sabor limonada rosa, de pich pérfect." (sin puente)
- Mal (claim médico): "Por eso tomo myo-inositol, que regula tus hormonas y te limpia la piel."
- Bien: "Si el problema es hormonal, ahí es donde hay que trabajar, no en la cara." + "Por eso yo ahora tomo el inositol de pich pérfect, limonada rosa, todas las mañanas, y mi mandíbula por fin está tranquila."
- Bien (creatina, dejó a las tres semanas): "Y si vas a darle las semanas que pide, por lo menos que sea una creatina que sí te tomes todos los días." + "Yo la tomo diario, sabor limonada rosa, y ya no la dejo a las tres semanas."
- Bien (creatina, miedo a inflarse): "O sea que el miedo nunca fue a la creatina, fue a algo que ni siquiera pasa así." + "Yo ahora tomo la creatina de pich pérfect, limonada rosa, sin ese miedo."

EL PRODUCTO (parte 4b): TESTIMONIO EN PRIMERA PERSONA, NO FICHA
- Nunca describas sus características técnicas: nada de gramos, mg, monohidratada, proporciones, ingredientes ni certificaciones. Eso es ficha de catálogo.
- Preséntalo en primera persona, como testimonio: cuándo lo toma, cómo lo metió a su rutina y el resultado que ELLA vivió, el mismo que abrió el gancho, no los ingredientes. El producto se siente como el medio, no como el mensaje.
- Mal: "La creatina de pich pérfect es monohidratada, sabor limonada rosa."
- Bien: "Yo llevo seis semanas tomando esta creatina sabor limonada rosa, una vez al día, y mis glúteos por fin están respondiendo al entrenamiento."
- Es su experiencia, contada por ella: nunca una promesa hacia quien ve ("vas a ver", "te va a funcionar") ni un claim médico ("me curó", "me reguló las hormonas").

NIVEL DE CONCIENCIA (para quién se escribe)
${Object.entries(AWARENESS_LEVELS)
  .map(([level, info]) => `- ${level} · ${info.state} (${info.share} del mercado): ${info.content} Ejemplo: "${info.example}".`)
  .join("\n")}
- 3-4 · Ya sabe con quién o con qué producto: NO hacer reels para este nivel. Los videos que hablan de la fórmula, la dosis, las certificaciones o comparan marcas le hablan al ~5% del mercado: pocas vistas y cero ventas. Es el error crítico a evitar.

CADA PIEZA ES INDEPENDIENTE
El algoritmo muestra cada video a gente que no conoce la cuenta. Nunca escribas "como les conté", "parte 2", "ya saben que yo…", "en el video anterior" ni nada que suponga otro video. Cada guion se escribe como si fuera el primer contacto. Siempre.

EL TIEMPO EXTRA SE LLENA CON SUSTANCIA (regla crítica)
Un video largo con contexto o moraleja flojos retiene PEOR que uno corto, porque la gente abandona a media pieza. El tiempo adicional se llena ÚNICAMENTE con:
- un segundo mecanismo o detalle concreto,
- una objeción anticipada y resuelta,
- una consecuencia práctica de lo explicado,
- en diálogo: una réplica más del personaje que no sabe.
- en el contexto: descartar lo obvio con más precisión (lo que ya probó, por qué no funcionó), sin revelar.
Nunca con más vueltas a lo ya dicho, muletillas, adjetivos decorativos, introducciones ("hoy te voy a contar") ni recapitulaciones.
Si al expandir no encuentras un segundo dato real que aportar, NO infles el guion: cuando la duración pedida sea auto, baja al rango corto (durationTier=corto) y entrega un video de 25-30 s sólido. Es mejor que uno de 55 con relleno.

TRES REGLAS DE ESCRITURA (no negociables)
1. Prohibido el verbo de folleto: nunca "requiere", "produce", "actúa", "acompaña", "apoya", "contribuye a", "contiene" (en ninguna conjugación). Si una frase podría estar impresa en la caja del producto, no va en el guion. Habla como una amiga que sabe del tema, no como una etiqueta.
2. La moraleja le dice algo que ella NO sabía: un mecanismo, una señal concreta o un dato de tiempo. Dos datos distintos en los rangos de 40 s o más (newInsight y secondInsight), uno en los de 30-40 s y en corto. Sin dato nuevo el video es un recordatorio, y los recordatorios no se comparten ni se guardan. Cada dato tiene que ser real y verificable: si no estás segura, no lo uses.
3. Nombra lo que ella SINTIÓ, no solo lo que le pasó: "te sentiste sucia", "pensaste que a ti no te funciona", "hasta te sentiste mal contigo". Va en la moraleja, después del dato: ahí se gana la retención. Cópiala tal cual en feltLine.

${FEW_SHOT}

CÓMO SE NOMBRA EL PRODUCTO (en lo que se dice)
- El sabor siempre en español: "limonada rosa". Nunca "Pink Lemonade" en la locución.
- El país no se dice: nunca "Peach Perfect" seguido del país, ni el país junto a la marca. Solo "Peach Perfect", y en la mayoría de los guiones basta con nombrar el producto.
- Formas correctas: ${[...PRODUCT_SPOKEN_NAMES.creatina, ...PRODUCT_SPOKEN_NAMES.inositol.slice(0, 1)].map((name) => `"${name}"`).join(", ")}.
- Prohibido leer la ficha de catálogo: nunca una frase que enliste nombre comercial + sabor + país + presentación. Ejemplo prohibido: "Esta es Creatina Pink Lemonade de Peach Perfect México, en polvo." Eso suena a comercial justo en la solución, donde más importa no sonar a uno.
- El documento de marca usa los nombres de catálogo ("Creatina Pink Lemonade", "Peach Perfect MX") como referencia interna: en la locución se dicen como arriba.

DOS CAPAS: LOCUCIÓN Y TEXTO EN PANTALLA
- El guion lo lee una voz generada. Toda palabra en inglés va en la LOCUCIÓN (lines[].text, y también hook, newInsight, secondInsight y feltLine, que son copias de la locución) escrita como se pronuncia en español:
${PHONETIC_SPELLINGS.map((row) => `  - ${row.written} → ${row.spoken}`).join("\n")}
  Cualquier otra palabra en inglés sigue la misma lógica.
- La grafía fonética va ÚNICAMENTE en la locución. En el TEXTO EN PANTALLA (onScreenText), el caption, el título, los hashtags y las historias siempre va la grafía correcta: Peach Perfect, scoop.

PROHIBIDO EN TODO EL GUION
- Claims médicos: no cura, no trata, no regulariza, no previene, no elimina. El contenido explica; el producto aparece en su testimonio en primera persona, nunca como promesa hacia quien ve.
- Prometer resultados en un tiempo ("en 8 semanas vas a ver", "en un mes").
- Datos de producto que no estén en la ficha del documento. Inositol siempre 80:1.

IMÁGENES (para la fase siguiente)
- Las mismas personas en todo el video (campo character, una descripción por personaje) y un estilo visual fijo (campo visualStyle): mujeres mexicanas reales de 20-40 años, en situaciones cotidianas creíbles (casa, baño, cocina, gym de barrio, recámara), luz natural, tonos rosa y durazno sutiles. Nada clínico.
- Los fotogramas siguen el formato: hac a cámara fija; vof b-roll de manos, detalle y producto; pov desde la mano de quien graba; personaje con el cambio de ropa o encuadre de cada personaje; vlog en movimiento; dinamico con encuadres variados; reaccion con ella frente a cámara (la captura del comentario se superpone en edición).
- Cada prompt de fotograma es autosuficiente: repite la descripción de la protagonista y el estilo, en inglés, fotorrealista, vertical 9:16.
- Sin texto, letras ni logos dentro de las imágenes (el texto en pantalla se agrega en edición). Cuando aparezca el bote, descríbelo como un bote rosa de suplemento en polvo sin etiqueta legible.
- El fotograma final de una escena y el inicial de la siguiente deben conectar visualmente.

GUARDRAILS (sección 11 del documento)
- Nunca antes/después de peso corporal, restricción alimentaria, conteo obsesivo ni vergüenza corporal. La marca habla de fuerza y de entender el cuerpo.
- Inositol: solo en polvo con scoop, proporción 80:1 (nunca 40:1), nunca cápsulas.
- No prometas curar, tratar, regularizar ni prevenir nada, ni resultados en un plazo.

DOCUMENTO DE MARCA Y MÉTODO
${brandContext}`;
}

export interface ScriptBrief {
  idea: string;
  product: VideoProduct;
  channel: VideoChannel;
  format?: VideoFormat | "auto" | null;
  duration?: VideoDuration | null;
  awareness?: AwarenessParam | null;
  ctaKeyword?: string | null;
  ideaValidated?: boolean;
  previousFormat?: VideoFormat | null;
  hookMold?: string | null;
}

function awarenessInstruction(brief: ScriptBrief): string {
  const level = brief.awareness ?? "1";
  if (level === "auto") {
    return "Nivel de conciencia: auto. Elige 0, 1 o 2 según la idea (1 es la zona principal) y repórtalo en awarenessLevel. Nunca 3-4.";
  }
  const info = AWARENESS_LEVELS[level];
  return `Nivel de conciencia: ${level} (${info.state}). ${info.content} awarenessLevel=${level}.`;
}

function validatedIdeaInstruction(brief: ScriptBrief): string | null {
  if (!brief.ideaValidated) return null;
  return `IDEA VALIDADA: esta idea ya funcionó${
    brief.previousFormat ? ` en formato ${brief.previousFormat}` : ""
  }. Vuelve a contarla con otra entrada, misma idea de fondo: mantén el dato nuevo y el ángulo central; cambia el gancho por completo (otra entrada al mismo tema); ${
    brief.previousFormat ? `usa un formato distinto a ${brief.previousFormat}; ` : ""
  }cambia el ejemplo o la situación concreta. No es repetirse: nadie recuerda qué vio hace cinco videos.`;
}

function durationInstruction(brief: ScriptBrief): string {
  const duration = brief.duration ?? "auto";
  const fixedFormat = brief.format && brief.format !== "auto" ? brief.format : null;
  const range = (tier: DurationTier) => {
    if (!fixedFormat) {
      return tier === "corto" ? "el rango corto (25-30 s)" : "el rango estandar del formato que elijas";
    }
    const budget = VIDEO_DURATIONS[fixedFormat][tier];
    return `${budget.seconds[0]}-${budget.seconds[1]} s y ${budget.words[0]}-${budget.words[1]} palabras habladas`;
  };
  if (duration === "corto") {
    return `Duración: corto (pedida por la revisora). Usa ${range("corto")}; durationTier=corto.`;
  }
  if (duration === "estandar") {
    return `Duración: estandar (pedida por la revisora). Usa ${range("estandar")}; durationTier=estandar. No bajes a corto.`;
  }
  return `Duración: auto. Usa ${range("estandar")} (durationTier=estandar). Si no tienes un segundo dato real para llenar ese rango con sustancia, baja a ${range("corto")} (durationTier=corto) en vez de inflar.`;
}

export function buildScriptInput(
  brief: ScriptBrief,
  revision?: { previous: VideoScript; feedback: string }
): string {
  const lines = [
    `Idea: ${brief.idea}`,
    `Producto de la solución: ${
      brief.product === "creatina"
        ? "la creatina de Peach Perfect, sabor limonada rosa (glúteos)"
        : "el inositol de Peach Perfect, sabor limonada rosa (hormonas, SOP)"
    }`,
    brief.ctaKeyword
      ? `CTA: usa la palabra clave ${brief.ctaKeyword.toUpperCase()} (elegida por la revisora; ctaKeyword=${brief.ctaKeyword.toUpperCase()}). Escribe la línea del CTA y elige la oferta a la medida de este video.`
      : "CTA: crea el de este video, con su propia palabra clave ligada al tema y la oferta que más tenga sentido después de verlo.",
    brief.channel === "pagado"
      ? "Canal: ANUNCIO PAGADO (Meta/TikTok Ads). Nada de segunda persona sobre la condición de salud: reformula el dolor en tercera persona o como pregunta general (\"hay mujeres que...\"). Sin antes/después."
      : "Canal: ORGÁNICO. El dolor puede ir crudo y en segunda persona, con las palabras de ella.",
    brief.format && brief.format !== "auto"
      ? `Formato: ${brief.format} (${VIDEO_FORMATS[brief.format].label}), elegido por la revisora. Úsalo y explica en formatReason cómo lo aprovechas para esta idea.`
      : "Formato: auto. Elige con la tabla de selección el que mejor comunique esta idea y explica por qué en formatReason.",
    durationInstruction(brief),
    awarenessInstruction(brief),
    validatedIdeaInstruction(brief),
    brief.hookMold
      ? `Usa este molde de gancho: ${brief.hookMold}`
      : `Elige el molde de gancho que mejor encaje con la idea:\n${HOOK_MOLDS.map((mold, i) => `${i + 1}. ${mold}`).join("\n")}`,
  ];
  if (revision) {
    lines.push(
      "",
      "Esta es una revisión. Guion anterior (JSON):",
      JSON.stringify(revision.previous),
      "",
      `Cambios que pide la revisora (aplícalos y conserva lo demás): ${revision.feedback}`
    );
  }
  return lines.filter((line): line is string => line !== null).join("\n");
}
