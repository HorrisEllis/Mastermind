; ═══════════════════════════════════════════════════════════════════
; MASTERMIND — installer hooks
; build/installer.nsh
;
; Removes the previous version before installing the new one.
;
; ─────────────────────────────────────────────────────────────────
; WHY THIS EXISTS
;
; NSIS upgrades in place by default. Files that existed in the old
; version and no longer exist in the new one are LEFT BEHIND — a
; deleted module, a renamed script, a stale foundation/ file. In an app
; whose renderer loads scripts by explicit path, a leftover file is not
; inert: it can still be loaded, and it will be the wrong version.
;
; That is a §1.2 violation waiting to happen — a stale file failing
; silently against new code, with no error naming the cause.
;
; ─────────────────────────────────────────────────────────────────
; WHAT IT MUST NEVER DO   (§0.3 — information must never be lost)
;
; It must never touch the vault, the audit ledger, or the snapshots.
; Those live in the data folder the person chose, which is deliberately
; NOT inside the install directory or AppData — but the guarantee
; cannot rest on that being true. So:
;
;   • deleteAppDataOnUninstall stays false, permanently
;   • the uninstall is run with /S (silent) but scoped to the install
;     directory only
;   • nothing here enumerates or deletes anything under Documents,
;     the data folder, or any path the user configured
;
; An installer that removes someone's thinking is not an installer.
; ═══════════════════════════════════════════════════════════════════

!macro customInit
  ; Look for a previous install recorded by NSIS under this app's key.
  ; electron-builder writes UNINSTALL_APP_KEY from the appId, so this
  ; finds our own previous version and nothing else.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"

  ${If} $R0 == ""
    ; Not found per-user — check per-machine in case an older build was
    ; installed with elevation.
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
    ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
  ${EndIf}

  ${If} $R0 != ""
    DetailPrint "Found MASTERMIND $R1 — removing it before installing ${VERSION}."
    DetailPrint "Your vault, audit ledger and snapshots are in your data folder and are not touched."

    ; Strip surrounding quotes so ExecWait gets a clean path.
    StrCpy $R2 $R0 1
    ${If} $R2 == '"'
      StrLen $R3 $R0
      IntOp $R3 $R3 - 2
      StrCpy $R0 $R0 $R3 1
    ${EndIf}

    ; _?= keeps the uninstaller from copying itself to temp, so ExecWait
    ; actually WAITS. Without it the uninstall runs concurrently with the
    ; install and the two race over the same directory — which is how an
    ; "upgrade" ends up half old and half new.
    ExecWait '"$R0" /S _?=$INSTDIR' $R4
    DetailPrint "Previous version removed (exit $R4)."

    ; The uninstaller cannot delete its own executable while running.
    Delete "$INSTDIR\Uninstall MASTERMIND.exe"
    Delete "$INSTDIR\Uninstall.exe"
  ${Else}
    DetailPrint "No previous MASTERMIND install found — clean install."
  ${EndIf}
!macroend

!macro customUnInstall
  ; Explicitly does NOT remove user data. Stated here so that the next
  ; person to edit this file sees the decision rather than the absence.
  ;
  ; The vault, the hash-chained audit ledger and the snapshots live in
  ; the data folder the person chose. Uninstalling the application is
  ; not a request to destroy the thinking it held.
  DetailPrint "MASTERMIND removed. Your vault and data folder were left untouched."
!macroend
