!include "LogicLib.nsh"

!macro customInstall
  DetailPrint "EEDTOY: Eingebettete Python-Laufzeit wird mitinstalliert."

  IfFileExists "$INSTDIR\resources\python-runtime\python.exe" runtime_present runtime_missing

  runtime_missing:
    MessageBox MB_ICONSTOP|MB_OK "Die eingebettete EEDTOY Python-Laufzeit fehlt im Installationspaket. Die Installation wird abgebrochen."
    Abort

  runtime_present:
    CreateDirectory "$APPDATA\eedtoy"
    ${If} $LANGUAGE == 1031
      FileOpen $0 "$APPDATA\eedtoy\language.txt" w
      FileWrite $0 "de"
    ${Else}
      FileOpen $0 "$APPDATA\eedtoy\language.txt" w
      FileWrite $0 "en"
    ${EndIf}
    FileClose $0
!macroend
