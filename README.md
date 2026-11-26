# Blue Moth 2.2

Windows (EXE) und Android (APK) mit gemeinsamer Bibliothek. Gebaut mit Tauri 2.

## Was in 2.2 neu ist
- Anmeldedesign aus Version 1.5.0 (Anmelden / Registrieren, Creator-Zugang)
- Registrierung und Anmeldung mit **E-Mail und Passwort** repariert (die alte `app.js` hatte einen Syntaxfehler und wurde komplett neu geschrieben)
- Abmelden repariert, Sitzung bleibt nach App-Neustart erhalten
- **Creator-Zugang** wieder eingebaut (geheime Schlüsseldatei, siehe unten)
- Zentrale Konfiguration in `web/config.js`; Benutzer sehen nirgends Hinweise auf den Backend-Dienst
- Bibliothek wird live zwischen Geräten synchronisiert; Dateien liegen in einem privaten Speicher

## 1) Backend einrichten (einmalig, ca. 10 Minuten)
1. Kostenloses Projekt auf supabase.com anlegen.
2. **SQL Editor** → Inhalt von `SUPABASE_SETUP.sql` einfügen → Run.
3. **Authentication → Providers → Email**: Wenn Benutzer sich ohne E-Mail-Bestätigung registrieren sollen, „Confirm email“ ausschalten. (Mit Bestätigung müssen Benutzer erst den Link in ihrer Mail anklicken.) Mindestlänge des Passworts ist bei Supabase 6 Zeichen.
4. **Project Settings → API**: „Project URL“ und den **anon/publishable Key** kopieren. Den `service_role`-Key niemals verwenden.

## 2) Konfiguration (vor dem Bauen)
Entweder `web/config.js` ausfüllen (`SUPABASE_URL`, `SUPABASE_KEY`, `CREATOR_EMAIL`) **oder** bei GitHub als Secrets setzen (Settings → Secrets and variables → Actions): `SUPABASE_URL`, `SUPABASE_KEY`, `CREATOR_EMAIL`. Secrets haben Vorrang. Der anon-Key ist öffentlich gedacht; die Sicherheit kommt aus den Regeln in `SUPABASE_SETUP.sql`.

## 3) Bauen (GitHub, ohne lokale Installation)
Alle Dateien in ein (privates) GitHub-Repository hochladen, auch `.github`. Dann **Actions**:
- **Build Blue Moth (Windows)** → Run workflow → Artifact `Blue-Moth-2.2-Windows` (Setup-EXE und `blue-moth.exe`)
- **Build Blue Moth (Android)** → Run workflow → Artifact `Blue-Moth-2.2-Android` (Debug-APK, direkt installierbar)

Lokal unter Windows: Rust, Microsoft C++ Build Tools, Node.js + pnpm installieren, dann `Windows-Setup-und-Build.bat`.

## Creator-Zugang
Die Datei `creator-2.2.key` ist dein Schlüssel. In `web/config.js` steht nur ihr Hash. Beim Klick auf „👑 Creator-Zugang“ wählst du die Datei aus; der Schlüssel dient zugleich als Passwort des Creator-Kontos (`CREATOR_EMAIL`, darf auch ein beliebiger Name wie „BLUE MOTH“ sein; daraus wird intern eine technische Kennung gebildet, es wird keine E-Mail verschickt). Ohne Datei ist keine Anmeldung möglich.
**Wichtig:** Den Creator-Zugang einmal selbst benutzen, **bevor** du die App weitergibst. Dabei wird das Konto angelegt (bei aktivierter E-Mail-Bestätigung musst du die Mail an `CREATOR_EMAIL` bestätigen). Die Schlüsseldatei nie ins Repository hochladen und niemandem geben.

## Hinweise
- Dateien: max. 50 MB pro Datei (Gratis-Tarif von Supabase). EXE/APK werden gespeichert und zum Download angeboten, nicht ausgeführt.
- Für Favicons der Web-Apps wird der Domainname an Google (favicons) gesendet.
- Nicht enthalten in 2.2: eingebauter Retro-Emulator, lokales Starten von Programmen, Google-Anmeldung (waren Teil der Electron-Version 1.5).
