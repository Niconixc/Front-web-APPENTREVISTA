# Guía de diseño del panel de administración

El panel es una herramienta de trabajo: se usa para revisar datos y tomar decisiones rápidas. El diseño tiene que verse
sobrio y confiable, como un panel de un producto real. No tiene que parecer una página de demostración.

## Principios

1. **Claro y sobrio, con relieve.**
   - El fondo es gris muy claro y las tarjetas son blancas, con borde fino y una sombra suave (`--sombra-sutil`).
   - El menú lateral es azul marino de marca (tokens `--lateral-*`) y separa la navegación del contenido.
   - Hay un solo color de acento (azul `--acento`), para la acción principal o lo seleccionado.
   - El tema oscuro se activa solo si el sistema lo pide (`prefers-color-scheme`), con los mismos tokens.
2. **Los datos primero.** Las tablas son compactas, los números se alinean a la derecha con `tabular-nums`, los títulos
   son cortos y las explicaciones largas van en texto secundario o dentro de un `<details>`.
3. **Nada decorativo que no informe.** No se usan:
   - emojis;
   - degradados, brillos o sombras de colores;
   - `backdrop-filter`;
   - botones que «saltan» con `translateY` al pasar el mouse;
   - mayúsculas forzadas en títulos o insignias;
   - tarjetas enormes con un ícono gigante.
4. **Jerarquía con tipografía, no con color.** Se usan pesos 400, 500 y 600 y una escala de tamaños corta (12, 13, 14, 16, 18, 24 y 28 px).
   Los títulos van en tipo oración («Crear usuario», no «Crear Usuario»).
5. **Un botón primario por vista.** Las demás acciones son secundarias (`.boton`) o sutiles (`.boton--sutil`). Una acción
   destructiva en una fila de tabla usa `.boton--peligro-suave`, y la confirmación final usa `.boton--peligro`.
6. **Accesible siempre.**
   - Contraste ≥ 4.5:1, ya medido en los tokens.
   - Foco visible.
   - Los estados no dependen solo del color: la insignia lleva texto.
   - Funciona con `forced-colors` y `prefers-reduced-motion`.
   - Se mantienen los `aria-*`, `role` y regiones vivas que ya existen.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `src/styles/tokens.css` | Colores (claro y oscuro), tipografía, espacios, radios y sombras. **Única fuente de colores.** |
| `src/styles/base.css` | Reinicio, tipografía base, controles nativos (`input`, `select`, `textarea`), foco y `.sr-only`. |
| `src/styles/componentes.css` | Piezas compartidas (abajo). |
| `src/components/Icono.jsx` | Íconos de línea en SVG: `<Icono nombre="usuarios" />`. |
| `src/components/Navbar.jsx` | Menú lateral por secciones. En el celular es una barra superior con el botón «Menú». |
| `src/components/<Pantalla>.css` | Solo el layout propio de esa pantalla. **Sin colores hex**, solo `var(--…)`. |

## Piezas compartidas (`componentes.css`)

**Página**
- `.pagina` es el contenedor de cada pantalla. Para formularios se agrega `.pagina--angosta`.
- `.encabezado-pagina` agrupa `__textos`, `__titulo` (h1), `__descripcion` y `__acciones`.
- `.miga` es la ruta de vuelta (por ejemplo, «Preguntas / Editar»).
- `.seccion` agrupa `__encabezado`, `__titulo` (h2), `__descripcion`.

**Botones**
- `.boton` es la acción secundaria. Variantes: `--primario`, `--peligro`, `--peligro-suave`, `--sutil`, `--chico`, `--icono` y `--bloque`.
- `.grupo-botones` los agrupa; con `--fin` se alinean a la derecha.

**Formularios**
- `.formulario` es el contenedor y `.rejilla-campos` reparte los campos en una rejilla.
- `.campo` lleva `__etiqueta`, `__opcional`, `__ayuda`, `__error` y `__contador`. Con `--ancho` ocupa toda la fila.
- `.casilla` es una casilla o radio con su texto. `.conjunto` es un `fieldset` con borde.

**Contenedores**
- `.tarjeta` lleva `__encabezado`, `__titulo`, `__cuerpo` y `__pie`.
- `.metricas` es una rejilla de números clave. Cada `.metrica` es una tarjeta con `__cabecera` (etiqueta y chip), `__etiqueta`, `__valor`, `__detalle` y `__enlace`.
- `.chip-icono` es un cuadro suave con un ícono del mismo tono: azul por defecto, y las variantes `--verde`, `--ambar`, `--violeta` y `--chico` (tokens `--chip-*`).
- `.avatar` es un círculo con iniciales (`iniciales()` y `tonoAvatar()` de `services/etiquetas.js`). Tiene las variantes `--chico` y `--tono-1…3`.
- `.barra-apilada` con sus `__parte` (`--2`, `--3`, `--4`, `--peligro`) muestra las partes de un total. Va siempre con una `.leyenda` en texto, porque el color solo no basta.
- `.filas` con `.fila-item` (`__textos`, `__titulo`, `__detalle`, `__lado`) es una lista de filas dentro de una tarjeta.
- `.esqueleto` es el bloque de carga: un fondo plano que late y se queda quieto con `prefers-reduced-motion`.

**Tablas**
- `.tabla-contenedor` envuelve la tabla, que es `.tabla` (`--compacta` para la versión densa).
- `th.num` y `td.num` alinean números a la derecha. `.celda-acciones` contiene las acciones de la fila.

**Estados y avisos**
- `.insignia` tiene las variantes `--exito`, `--aviso`, `--peligro`, `--info` y `--punto` (punto de color + texto).
- `.aviso` es el mensaje en la página, con `__icono`, `__contenido` y `__titulo`. Variantes: `--info`, `--exito`, `--aviso` y `--peligro`.
- `.nota` es texto de ayuda discreto; `.nota--chica` es más pequeño.
- `.desplegable` es un `<details>` con `__cuerpo`, para explicaciones largas que no hace falta leer siempre.

**Navegación**
- `.filtros` es la barra de filtros. `.campo--busqueda` hace más ancho el campo de búsqueda.
- `.paginacion` va bajo las tablas.

**Vacío y carga**
- `.vacio` lleva `__titulo`.
- `.cargando` es el indicador de carga; `--bloque` lo centra en la página.

**Diálogos**
- `.dialogo-fondo` es el fondo, por medio de `<FondoModal className="dialogo-fondo">`.
- `.dialogo` lleva `__encabezado`, `__titulo`, `__cuerpo` y `__pie`; con `--ancho` es más ancho.

**Otros**
- `.medidor` con `__relleno` es la barra de `role="meter"`. Variantes: `--aviso` y `--peligro`.
- `.datos` es una lista `dl` de clave y valor.
- Utilidades: `.pila`, `.fila`, `.texto-2`, `.texto-3`, `.texto-chico`, `.texto-mini`, `.num`, `.mono`, `.truncar`.

## Reglas al escribir una pantalla

- Toda pantalla empieza así:
  ```jsx
  <div className="pagina">
    <header className="encabezado-pagina">…</header>
    …
  </div>
  ```
- Hay que reutilizar las piezas. El `.css` de la pantalla solo agrega layout propio, y sus clases llevan un prefijo de la
  pantalla (`.cobertura-…`, `.informes-…`) para no chocar con las de otras pantallas. Todos los `.css` son globales.
- Los textos de estado van en insignias con palabras: «Aprobada», «Pendiente», «Rechazada», «Activo», «Inactivo», «Admin», «Usuario».
- **Montos en pesos chilenos.** El backend guarda los costos de IA en dólares (así cobra el proveedor), y el panel los muestra en pesos con `formatearPesos`, por ejemplo «$4.038». Para eso usa un tipo de cambio referencial: `VITE_DOLAR_CLP`, que por defecto es 950. Los dólares exactos quedan solo en el CSV.
- Las fechas y montos usan las utilidades existentes (`services/etiquetas.js`, `services/topeGeneracion.js`). No se cambia cómo se calculan.
- Los gráficos (recharts) usan `usePaletaGrafico()` y van con `accessibilityLayer={false}` cuando están dentro de un `role="img"` o un `aria-hidden`. Toman sus colores de `--grafico-1…4` y `--grafico-rejilla`, que se leen con `getComputedStyle`.
