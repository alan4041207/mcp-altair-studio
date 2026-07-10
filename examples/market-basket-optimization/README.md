# Market Basket Optimization — reglas de asociación

Caso real completo de minería de reglas de asociación sobre
[`Market_Basket_Optimisation.csv`](Market_Basket_Optimisation.csv) (7 501
transacciones de supermercado), construido y ejecutado contra una instalación
real de Altair AI Studio 2026.1.1 a través de `mcp-altair-studio`. Este
ejemplo fue el que originó los tres hallazgos/correcciones documentados en el
README principal del proyecto (`use_header_row`, `concurrency:fp_growth`, la
limitación de resultados no tabulares en modo batch).

## Archivos

| Archivo | Contenido |
|---|---|
| `Market_Basket_Optimisation.csv` | Dataset fuente: 7 501 filas, cada una una transacción, sin encabezado, items en columnas separadas (1 a 20 por fila). |
| `mbo_frequent_itemsets.csv` | 959 itemsets frecuentes (tamaños 1 a 4) minados con FP-Growth, `min_support=0.004`. Columnas: `Items, Size, Frequency, Support, Score`. |
| `mbo_association_rules.csv` | 249 reglas de asociación (`min_confidence=0.2`) derivadas de los itemsets de tamaño 1 y 2, con `Support, Confidence, Lift, Conviction, Leverage, Coverage`. |
| `compute_rules.ps1` | Script PowerShell que deriva `mbo_association_rules.csv` a partir de `mbo_frequent_itemsets.csv` con las fórmulas estándar de reglas de asociación. |
| `report.html` | Reporte ejecutivo autocontenido (abrir directo en el navegador) — objetivo, preparación de datos, flujo, parámetros, resultados con gráficos, interpretación de indicadores, hallazgos y recomendaciones de negocio. |

## Cómo se generó

1. **Lectura**: `read_csv` con `use_header_row=false` (el parámetro real de
   `CSVTableSource` en esta versión — no `first_row_as_names`, que es un
   no-op; ver README principal).
2. **Minería de itemsets**: `concurrency:fp_growth` con
   `input_format="items in separate columns"` consume el formato ancho
   (`att1…att20`) directamente, sin necesidad de convertirlo primero a una
   matriz binominal one-hot.
3. **Exportación**: `item_sets_to_data` + `write_csv` →
   `mbo_frequent_itemsets.csv`.
4. **Reglas**: el operador nativo `create_association_rules` no sirve en modo
   batch en esta versión de Altair AI Studio (su salida no es una tabla y el
   lanzador headless nunca la imprime — ver la sección "Cómo se conecta" del
   README principal). En su lugar, `compute_rules.ps1` deriva las 249 reglas
   directamente de los soportes reales que sí exporta Studio, con las
   fórmulas estándar:

   ```
   confidence(A→B) = support(A∩B) / support(A)
   lift(A→B)       = confidence(A→B) / support(B)
   conviction(A→B) = (1 − support(B)) / (1 − confidence(A→B))
   leverage(A→B)   = support(A∩B) − support(A)·support(B)
   coverage(A→B)   = support(A)
   ```

## Reproducir

```powershell
# 1. Minar itemsets (requiere el MCP server / Altair AI Studio real).
#    Ver src/altair/recipes.ts::associationRulesRecipe o construir el
#    equivalente con altair_run_operator_chain: read_csv -> concurrency:fp_growth
#    (input_format="items in separate columns") -> item_sets_to_data -> write_csv.

# 2. Derivar las reglas desde los itemsets ya exportados:
cd examples/market-basket-optimization
./compute_rules.ps1
# Parámetros opcionales: -ItemsetsPath, -OutputPath, -MinConfidence
```

## Resultado destacado

La regla de mayor Lift, **`light cream → chicken` (Lift 4.84)**, coincide con
el resultado canónico públicamente conocido de este dataset — confirmación
independiente de que todo el pipeline (lectura, minería, cálculo de reglas)
es correcto.

Ver `report.html` para el análisis completo.
