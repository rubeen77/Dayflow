# DAYFLOW

Aplicación personal en español para organizar el día, el calendario, las tareas, los hábitos y las sesiones de concentración. React, TypeScript, Vite, Tailwind CSS, Lucide e IndexedDB. Independiente de GARAGE y BULK. Las funciones locales no necesitan cuenta ni servidor. La integración opcional de Google Calendar requiere OAuth y un backend privado.

## Ejecutar

Requiere Node.js 22.12 o posterior (verificado con Node 24).

```sh
npm ci
npm run dev
```

En PowerShell con restricciones de scripts utiliza `npm.cmd` y `npx.cmd`.

```sh
npm run build
npm run preview
```

El modo sin conexión y el service worker se verifican sobre la compilación de producción. El servidor de desarrollo no registra el service worker.

## Funciones

- **Mi día:** saludo, selector de semana, agenda por horas, marcador de hora actual, progreso basado en elementos completados, tareas, hábitos y próximo bloque.
- **Calendario:** día, semana y mes; actividades por categoría; bloques fijos, todo el día, repeticiones diarias, laborables o semanales, fecha final y excepciones. Edición de una repetición o de toda la serie. Búsqueda por nombre o fecha.
- **Tareas:** captura rápida a la bandeja, listas personalizadas, prioridad, fecha/hora opcionales, duración, fecha límite, etiquetas, subtareas, notas, recurrencias y historial. Búsqueda y filtros.
- **Semana:** movimiento entre días mediante arrastre y alternativa mediante el formulario de edición, huecos, conflictos, horarios recurrentes y plantillas reutilizables con revisión antes de aplicar.
- **Hábitos:** días programados, objetivo semanal, historial editable de días pasados, descansos, rachas, calendario mensual, evolución de cuatro semanas y archivo.
- **Concentración:** trabajo y descanso configurables, pausa, reanudación, recuperación al reabrir, asociación a tareas/categorías, sesiones e historial.
- **Estadísticas:** períodos semanal y mensual, completados, concentración, estudio, hábitos, distribución por categoría, evolución y comparación de tareas con un período anterior de igual duración. No hay registros de ejemplo ni valores estimados.
- **Planificador por reglas:** ordena tareas sin hora por prioridad y fecha límite, respeta el primer día indicado, el horario de descanso, bloques existentes, tareas con hora y 10 minutos de margen. Propone mover bloques flexibles con conflictos, conserva los fijos y no aplica nada sin revisión. Los planes caducan si cambia la agenda.
- **Ajustes:** perfil, intención, horario, inicio de semana, categorías, colores, acento, densidad, instalación y copias JSON.

## Persistencia y copias

### Google Calendar

En Ajustes, **Cuentas conectadas** permite autorizar Google, seleccionar calendarios y revisar una sincronización antes de confirmarla. Se conserva un cache independiente sin tokens. La escritura se solicita aparte, se habilita por calendario y cada cambio requiere confirmación. Los originales locales vinculados se conservan como respaldo. Google aporta las ocurrencias recurrentes; las modificaciones desde DAYFLOW afectan a una ocurrencia. Los errores de versión impiden sobrescribir cambios ajenos.

La migración actual es aditiva a **IndexedDB v3** y las exportaciones usan **JSON 3**, con importación de formatos 1, 2 y 3. No se limpian ni reinicializan los registros existentes.

**No se han incluido credenciales ni simulado una conexión.** Configuración manual de Google Cloud, dominios, servidor Vercel, almacén privado de tokens, variables y límites: [Guía de integración Google Calendar](./GOOGLE_CALENDAR.md).

### Segunda fase: mejoras de uso diario

La identidad visual se mantiene y la portada decorativa ocupa menos altura. Mi día presenta la próxima actividad con cuenta atrás y duración, urgencias, tiempo disponible desde la hora actual, acciones directas y una vista de mañana. Desde **Personalizar Mi día** puedes ocultar y reordenar tarjetas con botones; la configuración se guarda en IndexedDB.

El calendario semanal del iPhone presenta siete días seleccionables y la agenda por horas del día elegido. Se puede deslizar para cambiar de fecha o utilizar los controles. En escritorio, las actividades flexibles se arrastran a otra franja; en todas las pantallas sigue disponible **Editar / mover**. Las franjas vacías permiten crear actividades y los solapamientos se señalan con los nombres de los bloques afectados.

**Captura inteligente** interpreta texto localmente: hoy, mañana, pasado mañana, fechas ISO y numéricas, días de semana, varias repeticiones, horas y duraciones. Funciona desde Mi día, Tareas y el botón de añadir. Antes de guardar siempre aparece una vista previa editable, incluso si escribes una tarea sin fecha.

Las tareas tienen acciones para posponer, completar subtareas y escoger un hueco libre. **Crear bloque de tiempo** conserva la tarea y su ID, y crea una actividad enlazada. La agenda reserva ese tiempo una sola vez. Completar el bloque o la tarea actualiza ambos. Si una tarea recurrente se convierte en bloque, se planifica la ocurrencia elegida; no se transforma la serie entera. En una tarea puedes deslizar a la derecha para completarla y a la izquierda para abrir acciones, con botones equivalentes.

La barra de concentración mantiene visible la sesión al navegar y permite pausar o reanudar. Los cálculos usan fechas límite y tiempo restante persistidos; el cierre de una sesión se deduplica por ID, incluso con dos conexiones. El sonido es opcional, se habilita con un gesto y depende de que el navegador/dispositivo permita reproducir audio. No se garantiza sonido con la PWA cerrada o el dispositivo silenciado.

Estadísticas incorpora un mapa anual, consulta de actividad por día, comparación entre los mismos días de dos semanas, resumen mensual y logros discretos calculados a partir de registros. Los logros de racha ya alcanzados se conservan aunque después se interrumpa la racha. La constancia suma tareas, hábitos, sesiones y actividades completadas; un bloque enlazado no duplica la tarea en ese mapa.

### Migración compatible

La base IndexedDB se actualiza a **versión 3**, conservando los almacenes y registros personales y añadiendo un almacén independiente para Google. La actualización no usa `clear`, no elimina almacenes y no escribe valores predeterminados sobre preferencias existentes. Los datos antiguos siguen siendo válidos. Al actualizar, las conexiones anteriores reciben `versionchange` y se cierran. Los clientes que intenten abrir una versión anterior después de la migración reciben `VersionError`, evitando que una pestaña antigua elimine campos que no conoce.

Las exportaciones nuevas usan **formato JSON 3**. Se aceptan copias JSON 1, 2 y 3; las versiones anteriores de DAYFLOW rechazan el formato 3, evitando perder metadatos nuevos. La importación conserva su revisión, validación y transacción atómica. Las pruebas incluyen creación real de una base v1, migración a v3, cierre del proceso de navegador y recuperación de IDs, subtareas y preferencias en WebKit y Chromium. También se comprueba la recuperación de eventos de Google entre procesos y su consulta sin conexión.

[IndexedDBRepository](./src/lib/storage.ts) implementa el contrato `Repository`. Los almacenes de actividades, tareas, hábitos, sesiones y plantillas usan identificadores estables. Preferencias, temporizador y revisión se guardan en metadatos. No se usa `localStorage` como base de datos.

Cada modificación lee el último estado y aplica sus cambios dentro de **una transacción atómica**. Solo se publica el nuevo estado y el mensaje de éxito después de `transaction.oncomplete`. Se solicita durabilidad `strict` cuando el navegador la soporta. Las escrituras se serializan también entre conexiones. Un error aborta la transacción y conserva los datos anteriores; el formulario permanece abierto. Las lecturas de arranque no crean registros ni sustituyen datos existentes.

`BroadcastChannel` y la recarga al volver a primer plano actualizan otras ventanas. Los formularios de registros detectan ediciones concurrentes. No hay sincronización en la nube todavía. El contrato del repositorio, los IDs y las fechas de actualización permiten incorporar otro adaptador; una sincronización real necesitará autenticación, política de conflictos y tombstones para eliminaciones.

Exporta desde Ajustes y comprueba el archivo descargado en **Archivos / Descargas**. La importación valida versión, esquema, fechas, IDs, referencias y tamaño antes de mostrar una revisión. Puedes combinar por ID y `updatedAt` (conserva preferencias locales) o restaurar una copia completa (reemplaza el estado). La sesión de foco activa no se transporta. Combinar puede recuperar registros eliminados después de exportar la copia; no es una sincronización.

**iOS puede borrar los datos de un origen por falta de espacio, inactividad o por decisiones del sistema/usuario.** Ni IndexedDB ni instalar la PWA garantizan persistencia absoluta. Conserva copias externas periódicas. Cambiar el dominio, puerto, navegador, perfil o pasar de Safari a una PWA puede cambiar el espacio de almacenamiento. Usa las copias para trasladarlo.

## Fechas, horarios y métricas

Las fechas de agenda son civiles (`AAAA-MM-DD`) y las horas son locales (`HH:mm`), sin convertir el día a UTC. Los incrementos de fechas usan mediodía local para atravesar cambios de horario. La zona horaria de creación se conserva como metadato. Al viajar, las actividades mantienen su hora de pared; no se ofrece aún conversión de eventos entre zonas horarias. Las actividades duran dentro del mismo día; divide un bloque nocturno en dos actividades. El horario de vigilia debe terminar después de empezar.

Las sesiones y completados de tareas no recurrentes usan instantes ISO en UTC y se agrupan por la zona local del dispositivo. El temporizador se calcula a partir de una fecha límite, por lo que no depende de que iOS mantenga los intervalos activos. Una sesión que dejaste en marcha sigue contando hasta su duración prevista aunque cierres la aplicación: pausa antes de salir si quieres interrumpirla. El tiempo de estudio es tiempo registrado por el temporizador en Estudios; no se infiere atención real. Las actividades aportan su duración programada cuando se marcan completadas. Los solapamientos cuentan por actividad.

Los días de descanso no rompen las rachas de hábitos ni entran en el denominador. Cambiar los días programados de un hábito recalcula su historial usando el horario actual. Las gráficas indican ausencia de datos; no extrapolan estadísticas.

## PWA e iPhone

Publica sobre HTTPS. En Safari: **Compartir → Añadir a pantalla de inicio**. Tras la primera carga completa, el service worker conserva el código, pantallas diferidas, fuentes e iconos para uso sin conexión. Las actualizaciones se ofrecen mediante un aviso y conservan IndexedDB; conviene cerrar formularios y terminar guardados antes de actualizar.

Los recordatorios se comprueban mientras la app está abierta. Se ofrecen notificaciones mediante service worker cuando hay soporte y permiso, pero **no se prometen alarmas con la PWA cerrada**. Push en segundo plano necesita un servicio externo y se deja para una fase futura. En iOS, los permisos requieren instalación y una versión compatible. No hay dependencia de API de pago.

## Verificar

```sh
npm test
npx playwright install webkit chromium
npm run build
npm run test:e2e
```

`npm run test:e2e:webkit` ejecuta únicamente WebKit con perfil móvil. Playwright arranca el servidor de producción en el puerto 4173. Las pruebas de reapertura crean un **perfil persistente**, cierran el proceso del navegador y lo vuelven a abrir; no usan `storageState` como sustituto de IndexedDB. Los perfiles de prueba quedan dentro del directorio ignorado `test-results`.

La suite incluye transacciones abortadas, conexiones concurrentes, IDs, copias, cambios de horario, recurrencia, descanso, planes obsoletos, revisión del asistente, recuperación del temporizador, funcionamiento sin conexión y flujos de UI. Los datos creados en las pruebas viven en perfiles separados de los datos del usuario.

WebKit automatizado en Windows no sustituye una prueba en un **iPhone físico**, con instalación desde Safari, reinicio del teléfono, modo avión y condiciones reales de almacenamiento. Esa comprobación final del dispositivo sigue siendo necesaria.

## Vercel

Importa este directorio completo como proyecto Vite. Comando de compilación: `npm run build`. Salida: `dist`; Vercel detecta además las funciones de [api/google](./api/google). Las funciones locales no requieren variables; Google Calendar utiliza las variables privadas descritas en [la guía](./GOOGLE_CALENDAR.md). [vercel.json](./vercel.json) incluye configuración, funciones y cabeceras. El enrutamiento usa fragmentos (`/#calendar`), por lo que no necesita reescrituras de páginas. No se ha publicado automáticamente en ninguna cuenta.

## Estructura

- [src/lib](./src/lib): esquema validado, fechas civiles, repositorio, copias y motor determinista intercambiable mediante `PlanningEngine`.
- [src/state](./src/state): estado confirmado, coordinación entre ventanas, recordatorios y cierre de sesiones.
- [src/components](./src/components): componentes accesibles, diálogos, formularios y agenda.
- [src/pages](./src/pages): pantallas funcionales; las secundarias se cargan por separado.
- [tests](./tests) y [e2e](./e2e): pruebas de dominio, repositorio y navegadores.
- [public](./public): iconos propios y recursos locales.

Las fuentes se sirven desde el propio proyecto. Las ilustraciones están construidas con SVG. No hay rastreadores, dependencias de imágenes externas ni servicios de otras aplicaciones.
