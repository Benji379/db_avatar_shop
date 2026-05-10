# Dragonbound Avatar Shop - Renderizado de Items y Animaciones

Este proyecto es una práctica técnica enfocada en recrear una vista tipo **Avatar Shop**, donde los items capturados se cargan dinámicamente, se muestran por categorías, se animan mediante spritesheets y se combinan en una vista previa del avatar usando capas.

La aplicación está construida con **HTML**, **CSS**, **JavaScript vanilla** y un pequeño servidor en **Express** para servir archivos estáticos y guardar configuraciones locales.

---

## Objetivo del proyecto

El objetivo principal fue crear una interfaz visual capaz de:

- Cargar items desde archivos `.jsonl`.
- Renderizar tarjetas de items por categoría.
- Mostrar miniaturas animadas de cada item.
- Equipar y quitar items por tipo de capa.
- Componer un avatar en una sola vista previa.
- Controlar posiciones, tamaños y orden visual de las capas.
- Manejar frames y animaciones sin depender de una librería externa.

---

## Estructura general del proyecto

La aplicación está organizada de forma simple para separar interfaz, estilos, lógica, configuración y assets.

```txt
proyecto/
├── index.html
├── js/
│   ├── app.js
│   ├── config.json
│   └── server.js
├── css/
│   └── styles.css
├── img/
│   ├── favicon.ico
│   └── svg.svg
├── sounds/
│   ├── click/
│   └── fondo/
└── items_capturados/
    ├── items_all.jsonl
    ├── items_Head.jsonl
    ├── items_Body.jsonl
    ├── items_Glass.jsonl
    ├── items_Flag.jsonl
    ├── items_Background.jsonl
    ├── items_Foreground.jsonl
    ├── items_Ex-Item.jsonl
    └── images/
        ├── Head/
        ├── Body/
        ├── Glass/
        ├── Flag/
        ├── Background/
        ├── Foreground/
        └── Ex-Item/
```

---

## Estructura de `items_capturados`

La carpeta `items_capturados` contiene toda la información necesaria para construir la tienda y renderizar los sprites.

Dentro de esta carpeta se manejan dos tipos de recursos:

1. **Archivos de datos `.jsonl`**
2. **Imágenes PNG de los items**

### Archivos `.jsonl`

Cada archivo `.jsonl` contiene registros de items en formato JSON por línea.

Ejemplo de organización:

```txt
items_capturados/
├── items_all.jsonl
├── items_Head.jsonl
├── items_Body.jsonl
├── items_Glass.jsonl
├── items_Flag.jsonl
├── items_Background.jsonl
├── items_Foreground.jsonl
└── items_Ex-Item.jsonl
```

La aplicación primero intenta leer el archivo general:

```txt
items_all.jsonl
```

Si ese archivo existe y tiene datos, se usa como fuente principal. Si no existe o está vacío, la aplicación carga los archivos separados por categoría.

Esto permite trabajar de dos formas:

- Con un único archivo consolidado.
- Con archivos separados por tipo de item.

### Carpeta de imágenes

Las imágenes están organizadas por categoría dentro de `items_capturados/images`.

```txt
items_capturados/images/
├── Head/
├── Body/
├── Glass/
├── Flag/
├── Background/
├── Foreground/
└── Ex-Item/
```

La convención usada para encontrar una imagen es:

```txt
items_capturados/images/<categoria>/<ref>.png
```

Por ejemplo:

```txt
items_capturados/images/Head/mh04506.png
items_capturados/images/Body/mb00123.png
items_capturados/images/Glass/mg00456.png
```

La propiedad `ref` del item se usa como nombre del archivo PNG. Esto hace que cada item pueda relacionarse directamente con su imagen sin tener que guardar rutas completas dentro del JSONL.

---

## Carga de items

La carga de datos se realiza desde JavaScript usando `fetch`.

El flujo general es:

1. Se define la ruta base:

```js
const BASE = "./items_capturados";
```

2. Se define el archivo agregado:

```js
const AGGREGATE_FILE = `${BASE}/items_all.jsonl`;
```

3. Se definen los archivos por categoría:

```js
const CATEGORY_FILES = {
  Head: `${BASE}/items_Head.jsonl`,
  Body: `${BASE}/items_Body.jsonl`,
  Glass: `${BASE}/items_Glass.jsonl`,
  Flag: `${BASE}/items_Flag.jsonl`,
  Background: `${BASE}/items_Background.jsonl`,
  Foreground: `${BASE}/items_Foreground.jsonl`,
  "Ex-Item": `${BASE}/items_Ex-Item.jsonl`,
};
```

4. Se intenta cargar primero `items_all.jsonl`.
5. Si no hay datos, se cargan los archivos individuales.
6. Los items se agrupan por `category`.
7. Dentro de cada categoría se ordenan por `page` y luego por `ref`.

Este enfoque facilita mantener el proyecto flexible, ya que se puede trabajar con datos separados durante el desarrollo y luego consolidarlos en un solo archivo cuando sea necesario.

---

## Renderizado de categorías

Las categorías visibles en la tienda se controlan mediante un arreglo de orden:

```js
const LAYER_ORDER = [
  "Head",
  "Body",
  "Glass",
  "Flag",
  "Background",
  "Foreground"
];
```

Ese arreglo define:

- El orden de los tabs.
- El orden del listado de equipamiento.
- Las categorías principales que el usuario puede seleccionar desde la interfaz.

La función encargada de pintar los tabs crea botones dinámicamente dentro del contenedor:

```html
<nav id="tabs" class="category-tabs"></nav>
```

Cada botón cambia la categoría actual y vuelve a renderizar la grilla de items.

---

## Renderizado de items en la grilla

Los items se renderizan dentro del contenedor:

```html
<div id="grid" class="item-grid"></div>
```

La función de renderizado limpia la grilla anterior, obtiene los items de la categoría actual y aplica paginación.

La paginación está definida en bloques de 12 items por vista:

```js
const per = 12;
```

Cada item se convierte en una tarjeta visual que incluye:

- Título del item.
- Miniatura animada.
- Precio en Cash o Gold.
- Badge visual de nuevo item.
- Estado equipado/no equipado.
- Botón de equipar o quitar.

Cada tarjeta se crea completamente desde JavaScript usando elementos DOM como `div`, `span` y `button`. Esto permite que la grilla dependa únicamente de los datos cargados desde los JSONL.

---

## Resolución de imágenes

Para mostrar la imagen de un item, se construye una ruta local usando la categoría y la referencia del item:

```js
const local = `${SPRITES_DIR}/${encodeURIComponent(item.category)}/${encodeURIComponent(item.ref)}.png`;
```

Antes de usar la imagen, se valida si existe cargándola con un objeto `Image`.

Si la imagen local existe, se usa esa ruta. Si no existe, la aplicación intenta usar una URL alternativa si el item tiene `img_url` o `imageUrl`.

Esto permite que el sistema funcione tanto con imágenes locales capturadas como con imágenes externas en caso de que sean necesarias.

---

## Técnica usada para los sprites

Los items no se animan con archivos GIF ni videos. Se animan usando spritesheets PNG.

Cada imagen puede contener uno o varios frames en una sola imagen. Para mostrar un frame específico, se usa la imagen como `background-image` de un `div` y se mueve el `background-position`.

Ejemplo conceptual:

```css
.sprite {
  background-image: url("item.png");
  background-repeat: no-repeat;
}
```

Luego, desde JavaScript, se cambia la posición del fondo:

```js
el.style.backgroundPosition = `-${x}px 0px`;
```

De esta forma, solo se muestra una parte del spritesheet en cada momento.

---

## Detección de frames

Una de las partes más importantes del proyecto es la detección inteligente de frames.

Para saber cuántos frames tiene un sprite, la aplicación analiza la imagen usando un `canvas` temporal.

La técnica usada fue:

1. Cargar la imagen en memoria.
2. Dibujarla en un `canvas`.
3. Leer sus píxeles con `getImageData`.
4. Analizar el canal alpha.
5. Detectar segmentos visibles según transparencia.
6. Separar o fusionar segmentos para estimar los frames.

El análisis se hace horizontal o verticalmente dependiendo de la proporción de la imagen.

Si la imagen es más ancha que alta, se asume que los frames están distribuidos horizontalmente.

Si la imagen es más alta que ancha, se asume que los frames están distribuidos verticalmente.

También se aplican reglas especiales:

- Si el sprite es muy pequeño, se considera de un solo frame.
- Si los segmentos están muy cerca, se fusionan para evitar falsos frames.
- En items normales se priorizan cantidades estándar como 1, 2, 4 o 6 frames.
- En `Background` y `Foreground` se permite una lógica especial para detectar frames anchos con espacios entre ellos.

Esta metodología permite animar sprites sin tener que declarar manualmente cuántos frames tiene cada imagen.

---

## Animación tipo boomerang

Las animaciones usan una técnica de ida y vuelta, también conocida como efecto `ping-pong` o `boomerang`.

En lugar de reproducir los frames así:

```txt
0 → 1 → 2 → 3 → 0 → 1 → 2 → 3
```

Se reproducen así:

```txt
0 → 1 → 2 → 3 → 2 → 1 → 0
```

Esto genera una animación más suave y natural para items que fueron capturados en secuencias cortas.

La función base calcula el frame usando un ciclo doble:

```js
const cycle = 2 * (frames - 1);
const pos = tickCount % cycle;
const frame = pos < frames ? pos : cycle - pos;
```

Esta misma lógica se usa tanto para las tarjetas de la tienda como para la vista previa del avatar.

---

## Control global de FPS

La velocidad de animación se controla con un valor global de FPS.

```js
let GLOBAL_FPS = 25;
```

El intervalo se calcula con:

```js
const fpsMs = () => Math.max(16, Math.floor(1000 / Math.max(1, GLOBAL_FPS)));
```

Desde la interfaz existe un input para modificar los FPS:

```html
<input id="fpsGlobal" type="number" min="1" max="60" value="25">
```

Cuando el usuario cambia los FPS:

- Se actualiza el valor global.
- Se reinicia la animación del preview.
- Se reinician las animaciones de la grilla.
- Se sincronizan nuevamente los timers activos.

Esto permite probar distintas velocidades sin tocar el código.

---

## Renderizado del preview compuesto

El avatar no se renderiza como imágenes separadas una debajo de otra. Se arma en una sola vista previa usando capas superpuestas.

El orden visual del avatar está definido por:

```js
const PREVIEW_LAYER_ORDER = [
  "Background",
  "Flag",
  "Body",
  "Head",
  "Glass",
  "Foreground"
];
```

Este orden es diferente al orden de los tabs, porque el preview necesita respetar la profundidad visual de cada parte del avatar.

Por ejemplo:

- `Background` va atrás.
- `Body` y `Head` forman el personaje.
- `Glass` va encima de la cabeza.
- `Foreground` puede ir por encima.

Cada capa se posiciona con:

- `x`
- `y`
- `size`
- `z`

Ejemplo de configuración:

```json
"Head": {
  "x": 50,
  "y": 39,
  "size": 94,
  "z": 40
}
```

La posición `x` y `y` se interpreta como porcentaje dentro del cuadro de preview. El tamaño se usa para escalar visualmente el frame, y `z` define la profundidad de la capa.

---

## Configuración de posiciones

La configuración visual del preview se guarda en `config.json`.

Este archivo permite ajustar el tamaño y posición de cada capa sin modificar directamente la lógica principal.

Ejemplo:

```json
{
  "previewCompositeConfig": {
    "Flag": {
      "x": 36,
      "y": 40,
      "size": 82,
      "z": 20
    },
    "Body": {
      "x": 49,
      "y": 61,
      "size": 126,
      "z": 30
    },
    "Head": {
      "x": 50,
      "y": 39,
      "size": 94,
      "z": 40
    }
  }
}
```

También existe una ventana de configuración dentro de la interfaz para mover capas, restaurar valores, descargar JSON y guardar cambios.

Cuando se guarda la configuración:

1. Se guarda en `localStorage`.
2. Se intenta guardar también en el servidor mediante `/api/config`.

Esto permite que el proyecto funcione incluso si se ejecuta en un entorno estático donde el servidor no puede guardar archivos.

---

## Manejo de equipamiento

Los items equipados se guardan en un `Map` llamado `equipped`.

```js
const equipped = new Map();
```

La clave es la categoría del item y el valor contiene:

- El objeto del item.
- La URL del sprite.
- La información calculada del sprite.

Estructura conceptual:

```js
category => { item, url, info }
```

Esto permite que solo exista un item equipado por categoría.

Cuando el usuario hace clic en una tarjeta:

- Si el item ya está equipado, se quita.
- Si no está equipado, se carga su sprite y se guarda en el mapa.
- Se actualiza la lista de equipamiento.
- Se vuelve a renderizar el preview.
- Se vuelve a pintar la grilla para mostrar el estado visual actualizado.

---

## Metodología usada para animaciones

La metodología de animación se basa en timers controlados y limpieza de intervalos.

Para la grilla:

- Cada item visible tiene su propio intervalo.
- Los timers se guardan en `gridTimers`.
- Antes de volver a renderizar la grilla, se limpian todos los timers anteriores.

Esto evita que queden animaciones duplicadas ejecutándose en segundo plano.

Para el preview:

- Se usa un timer independiente llamado `previewTimer`.
- Antes de redibujar el preview principal, se limpia la animación anterior.
- Las capas usan el mismo tick para mantenerse sincronizadas visualmente.

La idea principal fue evitar animaciones desordenadas y mantener control explícito sobre cada ciclo de frames.

---

## Metodología usada para el renderizado

El renderizado sigue una metodología basada en estado:

1. Se carga la data.
2. Se agrupa por categoría.
3. Se guarda la categoría actual.
4. Se renderizan los tabs.
5. Se renderiza la grilla según la categoría actual.
6. Se guarda el equipamiento seleccionado.
7. Se renderiza el preview usando el estado actual.

Este enfoque permite que la interfaz se reconstruya cada vez que cambia una parte importante del estado, como la categoría, la página o los items equipados.

No se usó React ni un framework de componentes. La lógica de componentes se implementó manualmente usando JavaScript y manipulación directa del DOM.

---

## Estilos visuales

El estilo visual se definió en `styles.css`.

Se usó una estética inspirada en una tienda de avatares, con:

- Layout de dos paneles.
- Vista previa a la izquierda.
- Grilla de items a la derecha.
- Tarjetas visuales para cada item.
- Sombras suaves.
- Bordes redondeados.
- Estados hover.
- Estado seleccionado por teclado.
- Estado equipado.
- Soporte responsive.

También se usaron capas visuales como fondos, paneles de estadísticas, precios y controles de audio para reforzar la sensación de interfaz tipo juego.

---

## Servidor local

El archivo `server.js` usa Express para servir el proyecto en local.

Sus responsabilidades son:

- Servir archivos estáticos.
- Exponer `GET /api/config` para leer configuración.
- Exponer `POST /api/config` para guardar configuración.
- Servir `index.html` como fallback.

El proyecto queda disponible en:

```txt
http://localhost:3000
```

---

## Técnicas principales usadas

En resumen, las técnicas principales usadas fueron:

- Carga dinámica de archivos `.jsonl`.
- Renderizado manual con JavaScript vanilla.
- Agrupación de datos por categoría.
- Paginación por bloques de 12 items.
- Resolución dinámica de rutas de sprites.
- Validación de existencia de imágenes.
- Uso de `canvas` para analizar transparencia.
- Detección automática de frames.
- Animación por `background-position`.
- Efecto boomerang para ciclos suaves.
- Composición de avatar por capas.
- Control de profundidad con `z-index`.
- Configuración persistente con `localStorage` y servidor Express.
- Limpieza de timers para evitar duplicación de animaciones.

---

## Agradecimiento

Agradecimiento especial a **DragonBound**, ya que este proyecto toma inspiración visual de su estilo de tienda, sus avatares, sus capas y su forma de presentar items dentro de una interfaz de juego.

---

## Nota final

Todo este proyecto fue realizado únicamente con motivos de práctica y aprendizaje, sin fines comerciales ni uso comercial.
