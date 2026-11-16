!macro DeleteKeyringEntry Target
  System::Call 'advapi32::CredDeleteW(w "${Target}", i 1, i 0) i .r0'
!macroend

!macro DeleteToastActivator
  ReadRegStr $0 HKCU "Software\Classes\AppUserModelId\${BUNDLEID}" "CustomActivator"
  ${If} $0 != ""
    DeleteRegKey HKCU "Software\Classes\CLSID\$0"
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\${BUNDLEID}"
!macroend

!macro DeleteDisguisedShortcuts
  StrCpy $1 0
  ${Do}
    EnumRegValue $2 HKCU "Software\${BUNDLEID}\Disguise" $1
    ${If} $2 == ""
      ${Break}
    ${EndIf}
    ReadRegStr $3 HKCU "Software\${BUNDLEID}\Disguise" $2
    Delete $3
    IntOp $1 $1 + 1
  ${Loop}
  DeleteRegKey HKCU "Software\${BUNDLEID}\Disguise"
  DeleteRegKey /ifempty HKCU "Software\${BUNDLEID}"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    !insertmacro DeleteToastActivator
    !insertmacro DeleteDisguisedShortcuts
  ${EndIf}
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    !insertmacro DeleteKeyringEntry "session.open-grind"
    !insertmacro DeleteKeyringEntry "device-info.open-grind"
    !insertmacro DeleteKeyringEntry "device-signing-key.open-grind"
    !insertmacro DeleteKeyringEntry "startup-probe.open-grind"
  ${EndIf}
!macroend
