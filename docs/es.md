# Agora Famille Calendario

Esta integración lleva al **calendario de Gladys** lo que el **portal
familiar Agora Famille** (editado por Agora Plus) de su municipio francés
sabe de sus hijos:

- **un calendario por niño**: los días reservados (comedor escolar,
  actividades antes y después de clase, centro de ocio…), en el horario que
  da el portal;
- **un calendario de facturas**: cada factura por pagar, en su fecha límite,
  con el importe pendiente (nunca redondeado).

Solo **lee** el portal: nunca reserva ni cancela nada. Las reservas y las
ausencias se hacen en el portal; el calendario las sigue en la lectura
siguiente.

Completa la integración
[Agora Famille](https://github.com/prohand/gladys-agorafamille)
(dispositivos, disparadores de escena, widget); ambas pueden funcionar
juntas.

## Antes de empezar

- Se necesita **Gladys 5.3 o posterior**.
- Necesita una cuenta **activa** en el portal Agora Famille de su municipio:
  el correo y la contraseña con los que inicia sesión.
- La integración es de tipo **cloud**: necesita internet para llegar al
  portal.

## Activar la integración (cada usuario)

Un calendario son datos personales: **cada usuario de Gladys activa la
integración para sí mismo**, con su propia cuenta.

En Gladys: **Integraciones → Agora Famille Calendrier → Configuración**,
bloque **«Mis calendarios»**:

| Campo                    | Qué poner                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dirección del portal** | La dirección de su portal tal como la muestra su navegador, p. ej. `https://portalssl.agoraplus.fr/miciudad/pck_home.home_view#/`. Basta también con el nombre del municipio (`miciudad`). |
| **Usuario (correo)**     | El correo de su cuenta familiar.                                                                                                                                                           |
| **Contraseña**           | La contraseña del portal. Gladys la guarda como secreto y nunca aparece en los registros.                                                                                                  |

Pulse después **Activar**. Sus calendarios aparecen en la vista
**Calendario** de Gladys tras la primera lectura del portal.

Dos padres pueden activar la integración cada uno por su lado, con la misma
cuenta del portal o con dos: cada uno tiene sus propios calendarios.

### Privado o compartido

Un calendario creado por la integración empieza siendo **privado**: solo
usted lo ve. Para que sirva a las **escenas** (disparador «se acerca un
evento del calendario») y al resto del hogar, **compártalo** en los ajustes
del calendario. También puede **desactivar la sincronización** de un
calendario: la integración lo deja entonces de lado.

## Ajustes de la integración (administrador)

| Campo                          | Qué hace                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Intervalo de lectura (min)** | Cada cuánto se lee el portal (60 min por defecto, 15 min como mínimo).                                     |
| **Días por adelantado**        | Cuántos días por adelantado van a los calendarios (30 por defecto, 90 como máximo).                        |
| **Días pasados actualizados**  | Cuántos días pasados se siguen actualizando (7 por defecto). Los días más antiguos se quedan como están.   |
| **Eventos de día completo**    | Muestra cada reserva durante todo el día en lugar del horario del portal (desactivado por defecto).        |
| **Calendario de facturas**     | Añade el calendario de las facturas por pagar (activado por defecto). Desactivarlo elimina ese calendario. |
| **Registros detallados**       | Registra cada petición al portal, para diagnosticar. Nunca la contraseña.                                  |

El botón **Sincronizar ahora** vuelve a leer el portal para todos los
usuarios e indica, para cada uno, cuántos niños, eventos y calendarios se
actualizaron, o qué falló.

## Qué va a los calendarios

### Un calendario por niño («Léa – Agora Famille»)

- Un evento por actividad **reservada**, con el nombre del portal
  («Restauration scolaire», «Garderie soir»…).
- Un día **solicitado** y aún no validado por el municipio lleva la mención
  «(pendiente)».
- El horario es el del portal; sin horario, el evento ocupa todo el día.
- La descripción indica el lugar y el periodo del portal, y el estado
  («Reservado», «Solicitud pendiente»). Un enlace abre el portal.

Un día cancelado en el portal desaparece del calendario en la lectura
siguiente.

### El calendario de facturas («Facturas Agora Famille»)

- Un evento de día completo en la **fecha límite de pago** de cada factura
  impagada: «Factura por pagar: 64,80 €».
- La descripción indica el concepto de la factura y, si está pagada en
  parte, el importe total y lo que queda por pagar.
- Una factura pagada desaparece del calendario en la lectura siguiente.
- Este calendario no existe si el municipio no tiene el módulo de facturas.

## Ejemplos de escenas

Una vez **compartido** el calendario de un niño:

- **Se acerca un evento del calendario**, calendario «Léa – Agora Famille»,
  1 hora antes → notificación «Léa va pronto al centro de ocio».
- **Se acerca un evento del calendario**, calendario «Facturas Agora
  Famille», 3 días antes → notificación «Una factura de Agora Famille vence
  pronto».

## Solución de problemas

El estado de cada usuario se muestra arriba en la pantalla de configuración.

- **«Indique la dirección del portal… en «Mis calendarios»»**: la cuenta de
  ese usuario está incompleta.
- **«El portal rechazó el usuario o la contraseña»**: compruébelos iniciando
  sesión en el portal desde un navegador. Una cuenta pendiente de validación
  por el ayuntamiento aún no puede iniciar sesión.
- **«El portal no responde»**: puede que el portal esté en mantenimiento; la
  integración lo vuelve a intentar en cada intervalo. Mientras tanto no se
  borra nada de los calendarios.
- **«El portal respondió algo inesperado»**: marque **Registros
  detallados**, pulse **Sincronizar ahora** y consulte los registros de la
  integración.

### Importante: no hay API oficial

Agora Plus no publica ninguna API para su portal familiar. La integración
hace las mismas peticiones que las páginas del portal; están reunidas en un
único archivo, [`src/agora/endpoints.js`](../src/agora/endpoints.js). Una
actualización del portal puede requerir ajustarlas: abra entonces una
[incidencia](https://github.com/prohand/gladys-calendar-agorafamille/issues)
indicando el paso que falla y el código HTTP devuelto (nunca su contraseña).

## Privacidad

- Las credenciales de cada usuario solo sirven para iniciar sesión en el
  portal de su municipio, por HTTPS.
- La contraseña y la sesión nunca se escriben en los registros.
- La planificación y las facturas solo van a los calendarios de Gladys del
  usuario que activó la integración. No se escribe nada en el disco ni se
  envía nada a ningún otro sitio.
