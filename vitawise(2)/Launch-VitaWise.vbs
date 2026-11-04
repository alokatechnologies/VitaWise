' ==============================================================================
' VitaWise Silent Background Launcher
' Starts the Node.js backend silently in the background (no black terminal window)
' and opens VitaWise in your default browser.
' ==============================================================================
Option Explicit

Dim WshShell, fso, scriptDir, launcherScript

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the folder containing this VBS script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcherScript = scriptDir & "\start-vitawise.mjs"

' Run node start-vitawise.mjs silently (WindowStyle 0 = Hidden, bWaitOnReturn = False)
WshShell.Run "node """ & launcherScript & """ --silent", 0, False

Set WshShell = Nothing
Set fso = Nothing
