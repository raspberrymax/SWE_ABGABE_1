# Postman-Collection für SWE_ABGABE_1

Diese Sammlung enthält alle Endpunkte für die Pflanzen-API.

## Voraussetzungen

- Postman (aktuellste Version empfohlen)
- SWE_ABGABE_1 Server muss lokal oder auf einem Server laufen

## Installation und Einrichtung

1. Importieren Sie die Postman-Collection `SWE_ABGABE_1.postman_collection.json` in Postman.
2. Importieren Sie die Environment-Datei `local_environment.postman_environment.json`.
3. Wählen Sie die Umgebung "Local Development" aus.

## Verwendung

### Authentifizierung

1. Führen Sie zuerst die "Authenticate" Anfrage aus, um einen gültigen Token zu erhalten.
2. Die Token-Informationen werden automatisch in den Umgebungsvariablen gespeichert.
3. Alle geschützten Endpunkte verwenden automatisch diesen Token.

### Endpunkte

#### Authentifizierung
- **Authenticate**: Erhalten Sie einen Zugriffstoken mit Benutzername und Passwort.
- **Refresh Token**: Erhalten Sie einen neuen Zugriffstoken mit einem Refresh Token.

#### Pflanzen
- **Alle Pflanzen laden**: Ruft alle Pflanzen ab.
- **Pflanzen mit Suchkriterien**: Sucht nach Pflanzen mit bestimmten Kriterien.
- **Pflanze nach ID**: Ruft eine bestimmte Pflanze anhand ihrer ID ab.
- **Pflanze anlegen**: Erstellt eine neue Pflanze (erfordert Authentifizierung).
- **Pflanze aktualisieren**: Aktualisiert eine bestehende Pflanze (erfordert Authentifizierung).
- **Bild hochladen**: Lädt ein Bild für eine Pflanze hoch (erfordert Authentifizierung).
- **Pflanze löschen**: Löscht eine Pflanze (erfordert Admin-Rolle).

## Umgebungsvariablen

- **host**: Der Hostname des Servers (Standard: localhost)
- **port**: Der Port des Servers (Standard: 3000)
- **username**: Benutzername für die Authentifizierung
- **password**: Passwort für die Authentifizierung
- **access_token**: Der aktuelle Zugriffstoken
- **refresh_token**: Der aktuelle Refresh-Token

## Anpassung

Sie können die Umgebungsvariablen anpassen, um sich mit verschiedenen Servern zu verbinden:

1. Duplizieren Sie die "Local Development" Umgebung.
2. Ändern Sie die Host- und Port-Werte entsprechend.
3. Aktualisieren Sie die Anmeldeinformationen nach Bedarf.
