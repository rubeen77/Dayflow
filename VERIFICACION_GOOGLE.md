# DAYFLOW · Verificación de Google Calendar

Fecha: 23 de octubre de 2026. Windows, Node 24.13.1, Vite, WebKit con perfil iPhone 13 y Chromium de escritorio.

La integración parte de **Ajustes → Cuentas conectadas**, llama al backend del mismo origen, autoriza Google mediante OAuth de servidor, consulta Calendar API y guarda únicamente datos públicos de eventos en un almacén IndexedDB separado. La escritura es opcional y requiere autorización adicional, selección del calendario y confirmación de cada cambio.

## Resultados ejecutados

| Comprobación                                          | Resultado                   | Evidencia                                                                                                                                                 |
| ----------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, aplicación y backend; producción PWA      | Correcto                    | `npm run build`, incluido el tipado de las funciones API                                                                                                  |
| Pruebas de dominio, repositorio y backend             | 57 superadas                | `npm test`; 35 anteriores y 22 de Google                                                                                                                  |
| Regresión completa de navegador                       | 47 superadas y 1 omitida    | `npm run test:e2e`, WebKit y Chromium                                                                                                                     |
| Google, incluidos los últimos cambios de recuperación | 16 superadas                | `npx playwright test e2e/google.spec.ts`, ambos motores                                                                                                   |
| Anchos móviles WebKit                                 | 32 comprobaciones correctas | `node scripts/mobile-check.mjs`: ocho pantallas, 320/375/390/430 px                                                                                       |
| Formato                                               | Correcto                    | `npm run format:check`                                                                                                                                    |
| Separación de secretos en el bundle público           | Correcto                    | Búsqueda en los assets generados sin referencias al secreto OAuth, token privado de Redis, cifrado de servidor ni biblioteca de autenticación del backend |

La suite completa se ejecutó antes de las últimas mejoras de representación del cambio horario y del flujo de recuperación. Después se repitieron las pruebas específicas de Google sobre la nueva compilación. La prueba omitida corresponde al arrastre nativo en el perfil iPhone; la alternativa táctil y el arrastre en Chromium sí se comprueban.

## Evidencia por frontera

| Frontera                         | Estado                                            | Evidencia y límite                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interfaz → API local             | Verificada                                        | El endpoint real `/api/google/status` informa de configuración pendiente y la interfaz muestra ese estado sin afirmar una conexión                                                        |
| OAuth: preparación y protección  | Automatizada con transporte de prueba             | URL real de Google, scopes mínimos, PKCE, state de un uso, vinculación de navegador, comprobación de origen y generación de sesión. Cookies revisadas en código; recorrido real pendiente |
| API → Google Calendar            | Protocolo probado con respuestas HTTP controladas | Paginación, instancias recurrentes, límites, fallo de página, If-Match, 412, inserts estables y recuperación de duplicados                                                                |
| API → almacén de tokens          | Cifrado probado; servicio real pendiente          | AES-256-GCM autenticado por clave de registro; Redis requiere credenciales reales                                                                                                         |
| Respuesta → revisión → IndexedDB | Verificada en ambos motores                       | Cancelar no guarda, confirmar actualiza, otra pestaña invalida la revisión, retiradas requieren confirmación                                                                              |
| IndexedDB → cierre → reapertura  | Verificada en ambos motores                       | Perfiles persistentes y cierre del proceso, sin sustituir IndexedDB por `storageState`                                                                                                    |
| Google real → cuenta personal    | **Pendiente**                                     | No hay credenciales OAuth ni Redis configurados; no se ha autorizado ni modificado una cuenta real                                                                                        |

Las fixtures están exclusivamente en pruebas aisladas. Se bloquea el service worker en las pruebas que interceptan HTTP para que Playwright pueda controlar las respuestas; la suite previa verifica también la PWA real sin conexión con el service worker activo.

## Flujos cubiertos

- Lectura por defecto y escritura rechazada si falta scope, permiso de calendario o cuenta correspondiente.
- Calendarios paginados; eventos expandidos por Google con IDs de cuenta/calendario/instancia estables, serie y hora original conservados.
- Lectura fallida sin aplicación parcial, y conservación de eventos fuera de la ventana consultada.
- Altas, actualizaciones, bajas y cancelación antes del commit local. Sin duplicados al repetir una sincronización.
- Eventos en calendario, búsqueda, agenda y cálculo de disponibilidad, con transparencia y fin exclusivo de días completos.
- Conversión de instantes a Europe/Madrid, cambio de fecha civil, duración real entre desplazamientos y rechazo de horas ambiguas o inexistentes introducidas en edición.
- Creación remota con ID estable, recuperación de insert confirmado sin respuesta, edición y eliminación condicional de una instancia.
- Publicación desde una actividad local, conservación del original, vínculo para mostrar un solo bloque y recuperación manual de una respuesta interrumpida.
- Desconexión con copia local conservada; exportación JSON sin credenciales, formato 3 compatible con copias anteriores.
- Reapertura de eventos cacheados entre procesos WebKit y Chromium y consulta con la red desactivada.
- Regresión de tareas, subtareas, hábitos, temporizador, plantillas, captura, estadísticas, migración y errores de almacenamiento.

## Pendiente de configuración y comprobación real

1. Configurar proyecto de Google Cloud, Calendar API, consentimiento, usuarios de prueba, cliente web y callback exacto.
2. Configurar Redis privado y variables de servidor; desplegar el proyecto completo en Vercel.
3. Completar OAuth y las operaciones en un calendario de pruebas real.
4. Verificar Safari/PWA en un iPhone físico, incluidos regreso del navegador de Google, instalación, suspensión y reinicio del teléfono.

La agenda usa una cuadrícula civil de 24 horas y no duplica visualmente la fila de una hora repetida por cambio horario; muestra una marca y conserva los instantes y la duración real en el detalle. La lectura cubre seis meses anteriores y dieciocho futuros, con límites explícitos. Las series se editan por ocurrencia desde DAYFLOW. El cron preparado realiza solo lecturas de servidor y está desactivado hasta configurarlo. No se ha verificado un despliegue remoto ni un servicio Redis real.

Pasos y arquitectura: [GOOGLE_CALENDAR.md](./GOOGLE_CALENDAR.md). Informe anterior: [verificación de la segunda fase](./VERIFICACION.md).
