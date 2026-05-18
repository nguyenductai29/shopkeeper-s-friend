!macro customInstall
  IfFileExists "$INSTDIR\resources\assets\imo_kome_authentic_logo.ico" 0 done

  IfFileExists "$newStartMenuLink" 0 desktopShortcut
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\assets\imo_kome_authentic_logo.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

  desktopShortcut:
  IfFileExists "$newDesktopLink" 0 done
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\assets\imo_kome_authentic_logo.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'

  done:
!macroend
