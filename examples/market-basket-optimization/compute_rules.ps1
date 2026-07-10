# Deriva reglas de asociacion (confidence/lift/conviction/leverage/coverage) a partir
# de los itemsets frecuentes de tamano 1 y 2 exportados por FP-Growth via
# item_sets_to_data. Necesario porque Create Association Rules no serializa su
# salida en modo batch en Altair AI Studio 2026.1.1 -- ver el README de este
# ejemplo y el README principal del proyecto ("Cómo se conecta").
#
# Uso: ejecutar desde esta carpeta (o pasar -ItemsetsPath/-OutputPath explicitos).
param(
    [string]$ItemsetsPath = (Join-Path $PSScriptRoot "mbo_frequent_itemsets.csv"),
    [string]$OutputPath   = (Join-Path $PSScriptRoot "mbo_association_rules.csv"),
    [double]$MinConfidence = 0.2
)

$ic = [System.Globalization.CultureInfo]::InvariantCulture
function Fmt([double]$n) { $n.ToString("G17", $ic) }

$itemsets = Import-Csv $ItemsetsPath

$singleSupport = @{}
foreach ($row in $itemsets) {
    if ($row.Size -eq "1") {
        $singleSupport[$row.Items.Trim()] = [double]::Parse($row.Support, $ic)
    }
}

$rules = @()
foreach ($row in $itemsets) {
    if ($row.Size -ne "2") { continue }
    $parts = $row.Items -split ",\s*"
    if ($parts.Count -ne 2) { continue }
    $a = $parts[0].Trim()
    $b = $parts[1].Trim()
    $supAB = [double]::Parse($row.Support, $ic)
    if (-not $singleSupport.ContainsKey($a) -or -not $singleSupport.ContainsKey($b)) { continue }
    $supA = $singleSupport[$a]
    $supB = $singleSupport[$b]
    $lift = $supAB / ($supA * $supB)

    $leverage = $supAB - ($supA * $supB)

    # Rule A -> B
    $confAB = $supAB / $supA
    $convAB = if ($confAB -ge 0.999999) { [double]::PositiveInfinity } else { (1 - $supB) / (1 - $confAB) }
    $rules += [PSCustomObject]@{
        Antecedent   = $a
        Consequent   = $b
        Support      = Fmt $supAB
        Confidence   = Fmt $confAB
        Lift         = Fmt $lift
        Conviction   = if ([double]::IsPositiveInfinity($convAB)) { "Infinity" } else { Fmt $convAB }
        Leverage     = Fmt $leverage
        Coverage     = Fmt $supA
        ConfidenceNum = $confAB
        LiftNum       = $lift
    }

    # Rule B -> A
    $confBA = $supAB / $supB
    $convBA = if ($confBA -ge 0.999999) { [double]::PositiveInfinity } else { (1 - $supA) / (1 - $confBA) }
    $rules += [PSCustomObject]@{
        Antecedent   = $b
        Consequent   = $a
        Support      = Fmt $supAB
        Confidence   = Fmt $confBA
        Lift         = Fmt $lift
        Conviction   = if ([double]::IsPositiveInfinity($convBA)) { "Infinity" } else { Fmt $convBA }
        Leverage     = Fmt $leverage
        Coverage     = Fmt $supB
        ConfidenceNum = $confBA
        LiftNum       = $lift
    }
}

$filtered = $rules | Where-Object { $_.ConfidenceNum -ge $MinConfidence }
Write-Output "Total candidate rules (both directions): $($rules.Count)"
Write-Output "Rules with confidence >= $MinConfidence : $($filtered.Count)"

$filtered | Sort-Object LiftNum -Descending | Select-Object Antecedent, Consequent, Support, Confidence, Lift, Conviction, Leverage, Coverage | Export-Csv $OutputPath -NoTypeInformation
Write-Output "Written to $OutputPath"
