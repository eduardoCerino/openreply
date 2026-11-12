# Facebook (Página + Messenger)

Las campañas de Instagram también pueden correr en la **Página de Facebook** vinculada a la cuenta, y el panel de videos puede publicar ahí el Reel. Es la **misma campaña** para los dos: no se configura nada doble.

## Cómo funciona

- **Conexión:** en **Ajustes → Facebook → Conectar Página de Facebook** se entra con Facebook Login (aparte del login de Instagram, que no cambia). Se guarda el token de cada Página concedida (`FacebookPage`, cifrado). Se vincula con la cuenta de Instagram que tiene enlazada o, si en el espacio solo hay una, con esa. Al conectar, la app se suscribe a los eventos de la Página: `feed`, `messages`, `messaging_postbacks` y `message_reads`.
- **Campañas:** cada campaña tiene el interruptor **También en Facebook** (`Automation.facebookEnabled`). Con él encendido:
  - **Comentario en un post de la Página:** se responde por **Messenger** con un mensaje privado ligado al comentario. Meta lo permite una vez por comentario y dentro de los 7 días. La respuesta pública bajo el comentario también funciona.
  - **¿Qué post?** Si la campaña es para un Reel específico, aplica al **mismo video publicado en Facebook desde el panel de videos** (`instagramMediaIdsForFacebookPost` empata los dos por el proyecto de video). Si es para *cualquier post*, aplica a todos los posts de la Página. Un post de Facebook subido a mano no tiene su par de Instagram, así que solo lo cubren las campañas de cualquier post.
  - **Mensajes directos:** con *también responder por DM*, un mensaje de Messenger con la palabra clave recibe la misma respuesta.
  - **Botones, mensaje de apertura y seguimiento:** funcionan igual, con plantillas de botones de Messenger (máximo 3 botones y 640 caracteres).
  - **Pedir que siga:** **no aplica en Facebook.** Meta no deja revisar si alguien sigue la Página, así que ahí se manda el link directo.
- **Código:** el webhook (`/api/webhook`, objeto `page`) → `lib/queue/process-facebook-webhook.ts` → el mismo worker de DMs con `facebookPageId` en el job. Así las respuestas salen por Messenger (`lib/meta/facebook.ts`) en lugar de Instagram.

## Publicar el video en Facebook

En el panel de videos, **Video final y publicación** deja elegir **Instagram Reels**, **Facebook Reels** o ambos, con el mismo caption. Para Facebook: `video_reels` (start) → subida desde la URL de Vercel Blob → `finish` con `video_state: PUBLISHED`. Luego revisa el estado cada 15 s hasta que el video queda listo, y guarda el link y el id del post para empatar los comentarios.

## Configuración en Meta (app "ChatBot Prueba")

1. **Productos:** agrega **Facebook Login** (o *Facebook Login para empresas*). En *Configuración → URI de redireccionamiento de OAuth válidos* agrega `https://peach-bot.vercel.app/api/facebook/callback`.
   - Con *Facebook Login para empresas* tienes que crear una **configuración** con los permisos de abajo y poner su ID en `FACEBOOK_PAGES_CONFIG_ID`.
2. **Permisos** (con acceso estándar alcanza, porque es tu propia Página): `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_posts`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_messaging` y `business_management`.
3. **Webhooks:** en *Webhooks*, elige el objeto **Page** y suscríbelo a `https://peach-bot.vercel.app/api/webhook` con el mismo token de verificación (`WEBHOOK_VERIFY_TOKEN`). Marca los campos `feed`, `messages`, `messaging_postbacks` y `message_reads`.
4. **Variables:** en Vercel **y** en el worker de Railway:
   - `FACEBOOK_APP_ID` (el *Identificador de la app* en *Configuración → Básica*).
   - `FACEBOOK_APP_SECRET` (ya existe).
   - `FACEBOOK_PAGES_CONFIG_ID` (solo con Facebook Login para empresas).
5. **Conectar:** en OpenReply ve a **Ajustes → Facebook → Conectar Página de Facebook**, elige la Página de Peach Perfect y acepta los permisos.

La app sigue en modo desarrollo, así que solo responde a personas con rol en la app (administradores y testers) hasta que esté en modo en vivo. Lo mismo pasa con Instagram.
