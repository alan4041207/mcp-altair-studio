# mcp-altair-studio

Servidor MCP (Model Context Protocol) que permite a Claude controlar **Altair AI
Studio** (el producto de minería de datos/ML de Altair, basado en RapidMiner)
instalado en tu PC con Windows: importar/limpiar/transformar datos, entrenar y
evaluar modelos de ML, clusterizar, minar reglas de asociación y ejecutar
procesos guardados — todo desde una conversación con Claude.

Repositorio: https://github.com/alan4041207/mcp-altair-studio

El target de este proyecto es **Altair AI Studio 2026.1.1**, instalado en:

```
C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1
```

Todo este proyecto se construyó y validó contra esa instalación real (ver
"Qué se verificó realmente" más abajo) en lugar de basarse solo en
documentación.

## Cómo se conecta (no existe una "API de Altair Studio" pública)

Altair AI Studio es una aplicación de escritorio sin una API REST propia para
su GUI. Este proyecto usa los dos puntos de integración reales que el producto
sí ofrece:

1. **Ejecución headless por batch** (principal, siempre disponible): el
   servidor MCP genera al vuelo un archivo de proceso `.rmp` (XML de
   RapidMiner) y lo ejecuta con el lanzador de línea de comandos incluido,
   `scripts\ai-studio-batch.bat -f <archivo>`. Está verificado de punta a
   punta (ver abajo) y no requiere instalar nada adicional.
2. **Bridge HTTP opcional** (`altair-http-bridge/`): una pequeña extensión
   Java que se compila e instala en la carpeta de extensiones de Studio.
   Levanta un servidor HTTP en `localhost` **dentro** de la sesión de Studio
   que ya está corriendo, para que Claude pueda explorar el repositorio y
   leer/reemplazar el proceso que esté abierto en la GUI en ese momento. Es
   opcional — todo lo demás funciona sin él. Ver `altair-http-bridge/README.md`.

   **Estado: construido, instalado y verificado funcionando** — `altair_check_connection`
   reporta el bridge como alcanzable en `http://127.0.0.1:8266`. Dos detalles
   no documentados oficialmente que costó descubrir (y que ya están corregidos
   en el código/README de la extensión, para que un rebuild futuro no los
   repita):
   - La carpeta que Altair AI Studio 2026.x realmente escanea en el arranque
     es `%USERPROFILE%\.AltairRapidMiner\AI Studio\shared\extensions`, **no**
     `%USERPROFILE%\.RapidMiner\extensions` (confirmado desmontando
     `Plugin.class` del jar núcleo de Studio).
   - El método de entrada `initPlugin()` debe ser **estático** — Studio lo
     invoca por reflexión con `Method.invoke(null, ...)`, y si es un método de
     instancia falla con un `NullPointerException` silencioso que la GUI
     muestra como "Incompatible extensions".

## Qué se verificó realmente

En lugar de adivinar nombres de operadores de RapidMiner de memoria (es fácil
equivocarse: por ejemplo "PCA" en realidad se llama
`principal_component_analysis`, y los operadores más nuevos viven detrás de
prefijos de namespace como `concurrency:`), la construcción de este proyecto:

- Inspeccionó los jars reales instalados (`lib\*.jar`, `lib\plugins\*.jar`)
  para confirmar las claves de operador y sus prefijos de namespace
  (`concurrency:`, `blending:`) vía el registro `OperatorsXxx.xml` de cada
  extensión y su `MANIFEST.MF`.
- Ejecutó el CLI real `ai-studio-batch.bat` contra procesos de prueba
  construidos a mano, iterando sobre los mensajes de error reales hasta que
  pasaron, confirmando:
  - La sintaxis del CLI es `ai-studio-batch.bat -f <ruta-al-rmp>` (no la
    sintaxis clásica posicional `rapidminer-batch.sh '//repo/ruta'` que
    describen algunos manuales antiguos).
  - Un pipeline completo `Retrieve -> Write CSV` corre y produce el resultado
    correcto.
  - Un pipeline completo `Set Role -> Cross Validation(Naive Bayes / Apply
    Model / Performance)` corre de punta a punta, lo cual corrigió dos
    suposiciones erróneas de nombres de puerto en el camino (el puerto de
    entrada exterior de Cross Validation es `example set`, no `training`; el
    puerto reenviado de su subproceso Training es `training set`).
  - Un Performance Vector no puede alimentar directamente a `Write CSV`
    (incompatibilidad de tipos) — debe enrutarse al puerto de resultado
    exterior del proceso, donde el runner de batch lo imprime en stdout.

Las recetas de limpiar/normalizar/dividir/PCA/reglas de asociación/k-Means
reutilizan las mismas convenciones clásicas de puertos de ExampleSet
confirmadas arriba, pero no se volvieron a ejecutar individualmente en esta
sesión — si alguna reporta un operador/puerto desconocido, ver "Si algo falla"
más abajo.

**No verificado**: Gradient Boosted Trees (la extensión `H2O` está instalada
en esta máquina, pero su clave de operador no se confirmó).

**También se descubrió**: esta instalación no tiene alcance a un servidor de
licencias de Altair activo, así que Studio recae en licenciamiento
community/RapidMiner. La ejecución batch de los operadores principales
funcionó bien en ese estado; algunos operadores de nivel Professional pueden
requerir licencia según tu cuenta de Altair.

## Instalación

### 1. Clonar e instalar dependencias

```powershell
git clone https://github.com/alan4041207/mcp-altair-studio.git
cd mcp-altair-studio
npm install
npm run build
```

### 2. (Opcional) Compilar e instalar el bridge HTTP

Requiere JDK 17+ y Gradle — ver `altair-http-bridge/README.md` para el paso a
paso completo (incluye cómo obtener ambos sin permisos de administrador).

```powershell
cd altair-http-bridge
gradle build -PaltairHome="C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1"
gradle installExtension -PaltairHome="C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1"
```

Reinicia Altair AI Studio después de instalar la extensión.

### 3. Configurar Claude Desktop

Agrega (o fusiona, si ya tienes otros servidores MCP configurados) esta
entrada en `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "altair-studio": {
      "command": "node",
      "args": ["C:\\ruta\\a\\mcp-altair-studio\\dist\\index.js"],
      "env": {
        "ALTAIR_HOME": "C:\\Program Files\\Altair\\RapidMiner\\AI Studio 2026.1.1",
        "ALTAIR_DEFAULT_REPOSITORY": "Local Repository",
        "ALTAIR_HTTP_BRIDGE_ENABLED": "true",
        "ALTAIR_HTTP_BRIDGE_PORT": "8266"
      }
    }
  }
}
```

Reinicia Claude Desktop después de modificar este archivo.

### 4. Verificación

En una conversación de Claude Desktop, pide que ejecute
`altair_check_connection`. Debe reportar el script de batch encontrado en
`ALTAIR_HOME`, y si el bridge HTTP opcional está alcanzable (no lo estará
hasta que completes el paso 2 y reinicies Studio).

## Herramientas (tools)

| Tool | Categoría | Notas |
|---|---|---|
| `altair_check_connection` | diagnóstico | ejecutar primero |
| `altair_import_data` | ingesta | archivo CSV o entrada de repositorio |
| `altair_list_repository` | ingesta | requiere el bridge HTTP |
| `altair_read_repository_entry` | ingesta | requiere el bridge HTTP |
| `altair_store_csv_to_repository` | ingesta | requiere el bridge HTTP |
| `altair_clean_data` | preparación | valores faltantes, duplicados, eliminar columnas |
| `altair_normalize_data` | preparación | Z-score/rango/proporción/IQR |
| `altair_generate_attribute` | preparación | columna derivada vía expresión |
| `altair_split_data` | preparación | partición train/test |
| `altair_descriptive_stats` | exploración | media/mín/máx/desv. estándar/mediana/conteo |
| `altair_train_classifier` | ML | árbol de decisión/random forest/naive bayes/k-NN/SVM/regresión logística/red neuronal/GBT + validación cruzada k-fold |
| `altair_cluster_kmeans` | ML | k-Means |
| `altair_association_rules` | ML | FP-Growth + reglas |
| `altair_reduce_dimensions_pca` | ML | PCA |
| `altair_run_process_file` | automatización | ejecuta cualquier `.rmp` guardado en modo headless |
| `altair_run_operator_chain` | automatización | **vía de escape**: cualquier grafo de operadores que armes (DBSCAN, clustering jerárquico, conexiones a bases de datos, scripting Python/R, operadores de Hugging Face/LLM, Optimize Parameters, Loop Files, ...) |
| `altair_get_current_process` | GUI hand-off | requiere el bridge HTTP |
| `altair_open_process_in_studio` | GUI hand-off | requiere el bridge HTTP |

Este proyecto deliberadamente no expone decenas de tools hechas a mano una por
una. RapidMiner/Altair tiene cientos de operadores; codificar cada uno de
memoria implicaría o bien una superficie enorme de baja confianza, o entregar
tools que silenciosamente invoquen la clave de operador equivocada. En su
lugar: ~17 tools bien probadas cubren los casos comunes de cada categoría, más
`altair_run_operator_chain` como bloque de construcción totalmente genérico —
se le pasa cualquier clave de clase de operador + parámetros + cableado de
puertos, y lo ejecuta. Arma el proceso una vez en la GUI de Studio, usa
Process ▸ Export Process para ver las claves de clase/puerto exactas, y
pásaselas directamente a la tool.

## Si algo falla

1. Ejecuta `altair_check_connection`.
2. Lee el log de error en la respuesta de la tool — los mensajes de error
   propios de Altair AI Studio suelen nombrar exactamente el operador/puerto
   incorrecto (así se corrigieron los nombres de puerto en las recetas de
   este proyecto).
3. Para un operador/puerto del que no estés seguro: arrástralo a un proceso en
   la GUI de Studio, conéctalo, y luego **Process ▸ Export Process** (o la
   vista de XML del proceso) para ver la clave de clase y nombres de puerto
   reales, y usa `altair_run_operator_chain` directamente o corrige la
   función correspondiente en `src/altair/recipes.ts`.
4. Para inspeccionar tú mismo el registro real de operadores del producto
   instalado (misma técnica usada para construir este proyecto):
   ```powershell
   Add-Type -AssemblyName System.IO.Compression.FileSystem
   $zip = [System.IO.Compression.ZipFile]::OpenRead("C:\Program Files\Altair\RapidMiner\AI Studio 2026.1.1\lib\plugins\concurrency-12.1.1-all.jar")
   $zip.Entries | Where-Object { $_.FullName -match "Operators.*\.xml" }
   ```
5. Si el bridge HTTP deja de responder tras un rebuild: revisa
   `%USERPROFILE%\.AltairRapidMiner\AI Studio\<versión>\ai-studio.log` en
   busca de la línea `Register plugin: MCP HTTP Bridge` y cualquier
   `WARNING`/excepción justo después — casi siempre apunta al problema
   exacto (ruta de instalación incorrecta, firma de método incorrecta, etc.).

## Estructura del proyecto

```
src/
  config.ts                 ALTAIR_HOME, puertos, carpeta scratch (todo sobreescribible por env)
  altair/
    rmpXml.ts                constructor genérico de XML .rmp
    recipes.ts                grafos de operadores escritos y probados a mano
    batchRunner.ts             lanza ai-studio-batch.bat
    httpBridgeClient.ts        habla con la extensión Java opcional
    connector.ts               elige bridge vs. batch, lee los CSV de resultado
  tools/                      registro de tools MCP (esquemas zod + handlers)
  index.ts                    punto de entrada del servidor MCP (transporte stdio)
altair-http-bridge/           extensión Java opcional (ver su propio README)
claude-desktop-config.example.json
```
