# DAYFLOW · Verificación de la segunda fase

Este informe corresponde a la segunda fase anterior a Google Calendar. Resultados y migración actuales: [verificación de Google Calendar](./VERIFICACION_GOOGLE.md).

Fecha: 23 de octubre de 2026. Entorno: Windows, Node 24, compilación de producción Vite. Navegadores automatizados: WebKit con perfil iPhone 13 y Chromium de escritorio. Se ha trabajado sobre el proyecto existente y conservado su paleta, tipografías y componentes.

## Resultados

| Comprobación                                    | Resultado                   | Evidencia                                                                                   |
| ----------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| TypeScript y compilación de producción          | Correcto                    | `npm run build`; generación del manifest, service worker y precaché local                   |
| Dominio, almacenamiento y compatibilidad        | 35 pruebas superadas        | `npm test`, incluidos los tests de la primera fase                                          |
| Suite completa de navegador                     | 33 superadas, 1 omitida     | `npm run test:e2e`, WebKit y Chromium                                                       |
| Regresión posterior del formulario de subtareas | 2 superadas                 | `npx playwright test --grep pospone`, ambos motores                                         |
| Pantallas pequeñas en WebKit                    | 32 comprobaciones correctas | 8 pantallas en anchos de 320, 375, 390 y 430 px, sin desbordamiento horizontal de la página |
| Revisión visual                                 | Realizada                   | Portada y distribución de tarjetas en móvil de 390 px y escritorio de 1440 px               |

La prueba omitida es el arrastre de una actividad por horas en el perfil de iPhone. El arrastre sí se verifica en Chromium. El flujo táctil **Editar / mover** se verifica en ambos motores.

## Flujos comprobados

- Creación, edición, reprogramación, completado y repetición de actividades; horarios semanales y plantillas existentes.
- Captura española de fechas, horas y varios días de repetición; cancelación sin guardar y vista previa obligatoria antes de confirmar.
- Tareas, prioridades, etiquetas, subtareas, filtros, posposición, edición directa de pasos y gesto horizontal con acciones equivalentes mediante botones.
- Conversión de una tarea en bloque enlazado, conservación de IDs, ausencia de duplicado en la agenda y completado sincronizado.
- Personalización del inicio: ocultar tarjetas, cambiar su orden y recuperar la configuración tras recargar.
- Registro de hábitos desde Mi día, descanso, rachas y estadísticas sin datos de ejemplo.
- Temporizador al navegar, pausa, reanudación, recarga y finalización; cálculo mediante fechas límite y tiempo restante. Una sesión se registra una sola vez, también al completarla desde dos conexiones.
- Uso sin conexión, incluida la captura con vista previa y el guardado en IndexedDB.
- Errores de almacenamiento: transacción abortada, ausencia de confirmación falsa y formulario conservado.
- Importación y exportación JSON; aceptación del formato anterior y exportación del nuevo formato protegido.

## Persistencia y actualización

Las pruebas de navegador crean un perfil persistente, guardan datos, **cierran el proceso del navegador** y lo vuelven a abrir. No usan `storageState` como sustituto de IndexedDB.

La prueba específica de actualización crea una base v1 con un ID de tarea, un ID de subtarea, una nota, preferencias y una revisión conocidos. La abre la aplicación actual, que migra a v2 sin limpiar ni reescribir esos registros. Tras cerrar y reabrir el navegador se verifican los mismos valores. Se comprueba también que un cliente v1 recibe `VersionError` al intentar abrir la base actualizada.

Los nuevos campos son opcionales; la inicialización no reemplaza datos existentes. Las escrituras siguen publicando el estado solo después de `transaction.oncomplete`. Las nuevas copias JSON usan formato 2 y la aplicación acepta formatos 1 y 2.

## Límites de esta verificación

- WebKit automatizado en Windows no equivale a probar un iPhone físico. Quedan por comprobar en el dispositivo la instalación desde Safari, teclado real, gestos físicos, audio, suspensión y reinicio del teléfono.
- El gesto horizontal se ejercita mediante eventos de puntero; los botones equivalentes se usan en los flujos completos.
- El sonido opcional no se ha validado acústicamente en un iPhone. Depende del permiso de reproducción y del estado del dispositivo; no se garantiza con la PWA cerrada.
- iOS puede borrar almacenamiento local. La migración segura y las pruebas de reapertura no constituyen una garantía de persistencia absoluta. Conviene mantener copias fuera del dispositivo.
- Se ha verificado la compilación preparada para Vercel; no se ha publicado un despliegue remoto.

Detalles de uso y arquitectura: [README](./README.md).
