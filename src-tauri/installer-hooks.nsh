!macro DeleteKeyringEntry Target
  System::Call 'advapi32::CredDeleteW(w "${Target}", i 1, i 0) i .r0'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    !insertmacro DeleteKeyringEntry "session.open-grind"
    !insertmacro DeleteKeyringEntry "device-info.open-grind"
    !insertmacro DeleteKeyringEntry "device-signing-key.open-grind"
    !insertmacro DeleteKeyringEntry "startup-probe.open-grind"
  ${EndIf}
!macroend
