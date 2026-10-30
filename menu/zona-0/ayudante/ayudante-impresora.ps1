# Ayudante de impresión de Zona 0.
# Vigila la carpeta Descargas. Cada vez que el panel descarga un ticket (ticket-*.png),
# lo imprime con Paint en la impresora de tickets y borra el archivo. Es el mismo camino
# que ya imprime bien a mano, sin abrir nada.
$impresora = 'MJ809 Series ESC/POS Printer'
$carpeta = Join-Path $env:USERPROFILE 'Downloads'

while ($true) {
  Get-ChildItem -Path $carpeta -Filter 'ticket-*.png' -ErrorAction SilentlyContinue | ForEach-Object {
    $archivo = $_.FullName
    Start-Sleep -Milliseconds 400
    try {
      Start-Process -FilePath 'mspaint.exe' -ArgumentList '/pt', ('"' + $archivo + '"'), ('"' + $impresora + '"') -Wait -WindowStyle Hidden
    } catch {}
    Remove-Item -LiteralPath $archivo -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}
