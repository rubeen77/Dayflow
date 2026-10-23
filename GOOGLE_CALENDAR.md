# Google Calendar en DAYFLOW

La integración está implementada sobre la aplicación existente. **Todavía no hay una cuenta conectada:** este proyecto no contiene credenciales de Google ni un almacén de tokens configurado. El botón de Ajustes muestra los requisitos pendientes, sin simular una autorización. Las funciones locales siguen disponibles sin configurar Google.

## 1. Google Cloud Console

1. Crea un proyecto para desarrollo, por ejemplo **DAYFLOW Desarrollo**. Para producción utiliza otro proyecto y otro cliente OAuth.
2. En **APIs y servicios → Biblioteca**, habilita **Google Calendar API**.
3. En **Google Auth Platform → Branding**, configura nombre DAYFLOW, correo de asistencia y contacto del desarrollador. Para publicar, añade página principal y política de privacidad reales que expliquen qué datos de Calendar se guardan, cómo desconectar y cómo eliminar las copias. Añade únicamente dominios que controles y verifica su propiedad cuando Google lo requiera. [Guía oficial de consentimiento](https://developers.google.com/workspace/guides/configure-oauth-consent).
4. En **Audience / Público**, selecciona **External / Externo** para una cuenta personal. En pruebas, añade tu dirección de Google como usuario de prueba. El tipo interno solo corresponde a una organización de Google Workspace compatible.
5. En **Data Access / Acceso a datos**, declara estos permisos:

   | Permiso                                                          | Uso                                                      |
   | ---------------------------------------------------------------- | -------------------------------------------------------- |
   | `openid`                                                         | Verificar tu identidad; no se solicitan perfil ni correo |
   | `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Enumerar calendarios disponibles                         |
   | `https://www.googleapis.com/auth/calendar.events.readonly`       | Consultar eventos                                        |
   | `https://www.googleapis.com/auth/calendar.events`                | Escritura opcional, solicitada solo al activarla         |

   El permiso general `calendar`, que permite administrar calendarios y compartirlos, no se solicita. Google puede exigir verificación para publicar con permisos sensibles. En estado **Testing**, los refresh tokens de una aplicación externa con estos permisos normalmente caducan a los siete días; no es un fallo del almacenamiento de DAYFLOW. [Caducidad y revocación de tokens](https://developers.google.com/identity/protocols/oauth2/).

6. En **Clients / Clientes**, crea un **OAuth client ID de tipo Web application / Aplicación web**. No elijas Android, iOS ni aplicación de escritorio: DAYFLOW utiliza el backend web.
7. En el cliente de desarrollo añade exactamente esta **URI de redirección autorizada**:

   ```text
   http://localhost:4173/api/google/callback
   ```

   Si utilizas el servidor de desarrollo en el puerto 5173, añade también `http://localhost:5173/api/google/callback` y cambia `APP_ORIGIN` a `http://localhost:5173`. Abre siempre `localhost`, no `127.0.0.1`, para que el origen y las cookies coincidan.

8. En el cliente de producción registra la URL pública estable con HTTPS, por ejemplo `https://dayflow.tudominio.es/api/google/callback`, sustituyendo el dominio por el tuyo. `APP_ORIGIN` debe ser exactamente `https://dayflow.tudominio.es`, sin barra final ni ruta. Las URI deben coincidir carácter por carácter; no sirven comodines ni fragmentos `#settings`. [Flujo oficial de servidor web](https://developers.google.com/identity/protocols/oauth2/web-server).
9. **Orígenes JavaScript autorizados:** este flujo de código de autorización se ejecuta en el servidor y no utiliza Google Identity Services en el navegador, por lo que ese campo puede quedar vacío. Si lo rellenas, usa solo el origen exacto: `http://localhost:4173` en desarrollo o el origen HTTPS de producción, sin `/api` ni rutas.
10. **Dominios autorizados de Branding:** son distintos de las URI y orígenes anteriores. Registra el dominio propio correspondiente a las páginas públicas y al callback; no añadas `localhost`, puertos, protocolos ni comodines. Para producción es preferible un dominio propio verificable. Si usas una URL de Vercel, usa la URL estable del proyecto en las URI OAuth y sigue la validación de dominio que solicite Google; no declares `vercel.app` como si fuese un dominio de tu propiedad. [Política oficial sobre dominios y producción](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).
11. Copia **Client ID** y **Client secret** al entorno del servidor. No los pegues en el código, en una conversación, en el JSON de copia ni en variables `VITE_*`.

## 2. Almacén privado y variables

Las funciones de Vercel no tienen un disco persistente compartido. La integración usa **Upstash Redis** como almacén duradero privado, con cifrado adicional AES-256-GCM. Puedes crearlo desde **Vercel Marketplace → Upstash Redis**, enlazarlo al proyecto DAYFLOW y obtener sus variables de servidor. No se ha contratado ni aprovisionado un recurso externo automáticamente.

Usa bases y claves diferentes para desarrollo, Preview y producción. Los registros de esta integración llevan el prefijo `dayflow:`. Evita políticas de expulsión de claves activas y conserva un respaldo seguro del almacén y de la clave de cifrado. Si eliminas Redis o pierdes la clave, tendrás que volver a autorizar Google; el cache local de eventos y los datos personales no se borran.

Variables necesarias, también descritas en [.env.example](./.env.example):

| Variable                      | Valor                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| `APP_ORIGIN`                  | Origen exacto de la aplicación                                |
| `GOOGLE_CLIENT_ID`            | ID del cliente web de ese entorno                             |
| `GOOGLE_CLIENT_SECRET`        | Secreto del cliente web                                       |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | 32 bytes aleatorios expresados en 64 caracteres hexadecimales |
| `UPSTASH_REDIS_REST_URL`      | URL REST HTTPS del almacén privado                            |
| `UPSTASH_REDIS_REST_TOKEN`    | Token privado de acceso al almacén                            |
| `CRON_SECRET`                 | Secreto aleatorio opcional para la lectura programada         |

Genera la clave de cifrado en tu terminal y guárdala como secreto:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

No cambies esa clave sin una migración que descifre y vuelva a cifrar los registros existentes. En local, copia el ejemplo a `.env.local` y rellénalo. Está excluido de Git. En Vercel usa **Settings → Environment Variables**, restringe las variables al entorno correspondiente y vuelve a desplegar. Ninguna necesita prefijo público. [Configuración de variables de Vercel](https://vercel.com/docs/environment-variables).

```sh
npm ci
npm run build
npm run preview -- --port 4173
```

Vite incluye el mismo adaptador API en desarrollo y preview para probar el flujo local con credenciales reales. En Vercel, las rutas de [api/google](./api/google) se ejecutan como funciones Node. Despliega el **proyecto completo**, no únicamente el directorio generado `dist`. No hace falta añadir un servidor dedicado ni cambiar el enrutamiento por fragmentos de la interfaz.

## 3. Uso y límites de sincronización

1. Abre **Ajustes → Cuentas conectadas → Conectar Google Calendar**. Se abrirá la página real de Google. En iPhone, completa el flujo en el mismo contexto de Safari o de la PWA; un cambio a otro navegador puede perder la cookie que protege el callback y obligar a repetirlo.
2. Elige los calendarios. **Revisar sincronización** consulta todas sus páginas, expande las recurrencias mediante Google y presenta altas, modificaciones y retiradas. Solo **Confirmar sincronización** modifica la copia de IndexedDB. Cancelar conserva esa copia.
3. La lectura cubre los últimos seis meses y los próximos dieciocho meses, hasta 20 calendarios y 10.000 eventos por consulta. Se conserva lo ya guardado fuera de ese intervalo. El intervalo se desplaza en cada consulta. No se presentan como completos períodos nunca consultados. Se hace una lectura completa acotada; no se usan `syncToken`, por lo que no existe un borrado automático ante un token incremental caducado.
4. Los calendarios desmarcados se ocultan tras confirmar la selección sincronizada; sus registros se conservan. Si un calendario deja de ser accesible, la lectura se detiene para revisar la selección. Una página fallida, un límite de tamaño o un tiempo agotado nunca confirma una lectura parcial.
5. Los eventos llevan una marca **Google** y el color de su calendario en la agenda, semana y mes. Aparecen en Mi día, mañana, búsquedas y cálculo de huecos/solapamientos. Los eventos transparentes no reservan tiempo. Los eventos de Google no se consideran automáticamente actividades completadas ni generan estadísticas de cumplimiento ficticias.
6. Para escribir, usa **Activar escritura bidireccional**, autoriza el permiso adicional y marca **Permitir cambios en Google** en cada calendario editable. Guarda la selección mediante **Revisar sincronización**. Tanto el scope como el calendario elegido se comprueban también en el servidor.
7. Desde un evento de Google puedes editar o eliminar **esa ocurrencia**, siempre con confirmación. Se conservan las demás propiedades del evento al usar PATCH. Las series se expanden en lectura; la edición de toda una serie o de “esta y las siguientes” se realiza en Google Calendar. Los tipos especiales bloqueados por Google se mantienen de solo lectura.
8. Para crear en Google, crea una actividad local y abre **Enviar esta actividad a Google Calendar** desde su detalle. Se transfiere la ocurrencia elegida, no la serie completa. Se conserva el original local como respaldo y se vincula para mostrar un único bloque. Después, ese bloque abre la edición de Google. No se envían automáticamente todas las actividades, tareas, subtareas ni hábitos.
9. Las modificaciones y eliminaciones usan el `etag` y `If-Match`. Un **412** mantiene la copia anterior y solicita sincronizar y revisar antes de volver a editar; no hay una opción de sobrescritura forzada. [Control de versiones de Google Calendar](https://developers.google.com/workspace/calendar/api/guides/version-resources).
10. Cada operación guarda primero un registro de recuperación local sin tokens. Los inserts usan un ID determinista admitido por Google; las operaciones tienen IDs estables y un registro de resultados en el servidor. Si se corta la respuesta, **Operaciones pendientes de comprobar** permite reintentar la misma petición. Los resultados de operaciones se conservan 30 días; una repetición de PATCH también reconoce su marca en Google. No modifiques una petición de resultado incierto: recupérala o revisa primero Google.
11. Los eventos de día completo conservan su final exclusivo. Los eventos que abarcan varios días se dividen únicamente para visualizarlos; se guardan sus límites originales. Las horas se muestran en la zona del dispositivo y se editan en la zona original del evento. Las horas ambiguas o inexistentes introducidas al editar durante un cambio de horario se rechazan explícitamente; las horas originales con desplazamiento siguen siendo válidas.
    La agenda mantiene su cuadrícula civil de 24 horas. Al repetirse una hora se señala el cambio y se evita un bloque de tamaño negativo; el detalle muestra los instantes originales y la duración real. Esa cuadrícula no representa dos filas distintas para una hora repetida: para planificar con precisión dentro de esa hora excepcional, consulta el detalle o Google Calendar.
12. **Desconectar** revoca los tokens, elimina las credenciales y la instantánea reciente del servidor e invalida las sesiones de esa conexión. Conserva los eventos de Google ya guardados en el dispositivo, las copias JSON y todos los registros personales. No borra eventos remotos. No se requiere enviar las tareas personales al backend.

La sincronización de datos personales entre dispositivos sigue fuera de este alcance. Cada dispositivo conserva su propio IndexedDB y debe autorizar una sesión del backend para acceder a su conexión de Google. El cache no es una garantía de persistencia absoluta: iOS puede eliminar almacenamiento; exporta copias fuera del dispositivo.

## 4. Seguridad y arquitectura

- Código de autorización de un solo uso, `state` de diez minutos consumido atómicamente, PKCE S256 y cookie de vinculación HttpOnly.
- Identidad `sub` verificada mediante `google-auth-library`: firma, emisor, caducidad y audiencia del ID token. No se devuelve ese token al frontend.
- Cookie opaca de sesión, HttpOnly, SameSite=Lax y Secure en HTTPS, con duración máxima de 30 días. Se invalida por generación al desconectar. El identificador no contiene tokens de Google.
- Tokens de acceso y renovación cifrados en Redis con AES-256-GCM, clave privada de servidor y contexto autenticado por registro. Las renovaciones y mutaciones se serializan con un bloqueo distribuido, compartido entre funciones.
- Mutaciones únicamente mediante POST JSON, origen exacto y cabecera adicional contra CSRF. No se habilita CORS. No se construyen redirects a partir de Host o de una URL suministrada por el navegador.
- Las respuestas API tienen `Cache-Control: no-store`. El service worker no precachea la API ni trata sus navegaciones como páginas de la aplicación. No hay tokens en IndexedDB, exportaciones, código público o registros de error propios de la integración.
- Migración aditiva **IndexedDB v3**: un almacén separado para Google y metadatos públicos de vínculos, revisión, auditoría y recuperación. Los almacenes personales se conservan; no se reinicializan. Copias JSON formato **3**, compatibles con importación de formatos **1, 2 y 3**.

La infraestructura de Google, Vercel y Redis debe estar bajo tu cuenta y protegida por sus propios controles de acceso. Esta implementación no crea una cuenta de servicio ni utiliza credenciales de GARAGE o BULK. [Buenas prácticas oficiales de OAuth](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).

## 5. Lectura con la aplicación cerrada

La PWA no puede ejecutar una sincronización continua ni escribir su IndexedDB cuando iOS la suspende. Está preparado el endpoint **GET `/api/google/cron`**, protegido con `Authorization: Bearer <CRON_SECRET>`, que renueva credenciales y guarda una instantánea cifrada en el servidor. Nunca escribe ni elimina eventos de Google. Atiende una cuenta por ejecución, con cursor rotatorio y límite de tiempo.

No se ha activado una tarea programada. Para utilizarla, define `CRON_SECRET` y añade a la configuración de Vercel un cron con la frecuencia compatible con tu plan. Por ejemplo, una lectura diaria:

```json
{ "crons": [{ "path": "/api/google/cron", "schedule": "0 6 * * *" }] }
```

Conserva el resto de la configuración existente al añadir esa propiedad. Vercel enviará la cabecera de autorización correspondiente. Una sola cuenta personal se consulta en cada ejecución; para más cuentas usa una cola y planifica su frecuencia. [Autenticación de cron en Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).

La instantánea de servidor caduca a los siete días. Al reabrir DAYFLOW se sigue revisando una lectura actual de Google antes de modificar la copia del dispositivo; no se aplican bajas en segundo plano a IndexedDB. No se han implementado webhooks push de Google, notificaciones de eventos con la PWA cerrada ni sincronización de tareas personales en nube.

## 6. Verificación y prueba real pendiente

Las pruebas automáticas cubren el backend con respuestas HTTP controladas y la interfaz con fixtures aisladas en perfiles de navegador. No equivalen a haber autorizado una cuenta real. El estado sin credenciales también se prueba contra el endpoint local real.

Después de configurar el entorno, realiza esta comprobación con un calendario de pruebas de tu propia cuenta:

1. Autoriza lectura, elige un calendario, revisa y confirma. Comprueba un evento recurrente, uno de día completo y uno con otra zona horaria.
2. Cierra y vuelve a abrir la PWA; comprueba la copia en modo avión.
3. Autoriza escritura para ese calendario y envía una sola actividad de prueba. Reintenta si se interrumpe la respuesta; debe quedar un único evento remoto.
4. Edita la ocurrencia desde DAYFLOW y compruébala en Google. Edita después el mismo evento en Google y verifica que una edición antigua de DAYFLOW devuelve conflicto.
5. Elimina solo ese evento de prueba con confirmación. Desconecta y confirma que tus registros personales y el cache conservado siguen disponibles.

Quedan pendientes la configuración real de Google/Redis, el despliegue remoto y la prueba física de Safari/PWA en iPhone. No se ha enviado ninguna modificación a una cuenta real durante el desarrollo.
