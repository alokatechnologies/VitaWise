# ==============================================================================
# Create VitaWise Desktop Shortcut
# ==============================================================================
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "VitaWise.lnk"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetVbs = Join-Path $ScriptDir "Launch-VitaWise.vbs"
$IconPath = Join-Path $ScriptDir "favicon.ico"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$TargetVbs`""
$Shortcut.WorkingDirectory = $ScriptDir
if (Test-Path $IconPath) {
    $Shortcut.IconLocation = "$IconPath,0"
}
$Shortcut.Description = "Launch VitaWise Health Intelligence"
$Shortcut.Save()

Write-Host "Created VitaWise desktop shortcut at: $ShortcutPath"
