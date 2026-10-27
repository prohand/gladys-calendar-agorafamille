# Agora Famille Kalender

Diese Integration bringt in den **Gladys-Kalender**, was das
**Familienportal Agora Famille** (von Agora Plus) deiner französischen
Gemeinde über deine Kinder weiß:

- **ein Kalender pro Kind**: die gebuchten Tage (Schulkantine, Vor- und
  Nachmittagsbetreuung, Ferienfreizeit…), zu den Uhrzeiten des Portals;
- **ein Rechnungskalender**: jede offene Rechnung an ihrem Fälligkeitstag,
  mit dem offenen Betrag (nie gerundet).

Sie **liest** das Portal nur: Sie bucht und storniert nie etwas. Buchungen
und Abwesenheiten werden im Portal erledigt; der Kalender folgt beim nächsten
Lesen.

Sie ergänzt die Integration
[Agora Famille](https://github.com/prohand/gladys-agorafamille) (Geräte,
Szenen-Auslöser, Widget); beide können zusammen laufen.

## Bevor du beginnst

- Es wird **Gladys 5.3 oder neuer** benötigt.
- Du brauchst ein **aktives** Konto beim Agora-Famille-Portal deiner
  Gemeinde: die E-Mail-Adresse und das Passwort, mit denen du dich anmeldest.
- Die Integration ist eine **Cloud**-Integration: Sie braucht Internet, um
  das Portal zu erreichen.

## Die Integration aktivieren (jeder Benutzer)

Ein Kalender sind persönliche Daten: **Jeder Gladys-Benutzer aktiviert die
Integration für sich selbst**, mit seinem eigenen Konto.

In Gladys: **Integrationen → Agora Famille Calendrier → Konfiguration**,
Bereich **„Meine Kalender“**:

| Feld                      | Was einzutragen ist                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Portaladresse**         | Die Adresse deines Portals, wie dein Browser sie anzeigt, z. B. `https://portalssl.agoraplus.fr/meinestadt/pck_home.home_view#/`. Nur der Name der Gemeinde (`meinestadt`) genügt auch. |
| **Benutzername (E-Mail)** | Die E-Mail deines Familienkontos.                                                                                                                                                       |
| **Passwort**              | Das Passwort des Portals. Gladys speichert es als Geheimnis, es erscheint nie in den Protokollen.                                                                                       |

Klicke dann auf **Aktivieren**. Deine Kalender erscheinen nach dem ersten
Lesen des Portals in der **Kalender**-Ansicht von Gladys.

Zwei Eltern können die Integration jeweils für sich aktivieren, mit demselben
Portalkonto oder mit zwei verschiedenen: Jeder bekommt eigene Kalender.

### Privat oder geteilt

Ein von der Integration angelegter Kalender ist zunächst **privat**: Nur du
siehst ihn. Damit er den **Szenen** (Auslöser „Ein Kalendertermin steht
bevor“) und dem restlichen Haushalt dient, **teile ihn** in den
Kalendereinstellungen. Du kannst auch die **Synchronisierung** eines
Kalenders **ausschalten**: Die Integration lässt ihn dann in Ruhe.

## Einstellungen der Integration (Administrator)

| Feld                               | Was es tut                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Aktualisierungsintervall (min)** | Wie oft das Portal gelesen wird (standardmäßig 60 min, mindestens 15 min).                                           |
| **Tage im Voraus**                 | Wie viele Tage im Voraus in die Kalender kommen (standardmäßig 30, höchstens 90).                                    |
| **Aktualisierte vergangene Tage**  | Wie viele vergangene Tage noch aktualisiert werden (standardmäßig 7). Ältere Tage bleiben im Kalender, wie sie sind. |
| **Ganztägige Termine**             | Zeigt jede Buchung ganztägig statt zu den Uhrzeiten des Portals (standardmäßig aus).                                 |
| **Rechnungskalender**              | Fügt den Kalender der offenen Rechnungen hinzu (standardmäßig an). Ausschalten entfernt diesen Kalender.             |
| **Ausführliche Protokolle**        | Protokolliert jede Anfrage an das Portal, zur Fehlersuche. Nie das Passwort.                                         |

Die Taste **Jetzt synchronisieren** liest das Portal für alle Benutzer neu
und nennt für jeden, wie viele Kinder, Termine und Kalender aktualisiert
wurden, oder was fehlgeschlagen ist.

## Was in die Kalender kommt

### Ein Kalender pro Kind („Léa – Agora Famille“)

- Ein Termin pro **gebuchter** Aktivität, benannt wie im Portal
  („Restauration scolaire“, „Garderie soir“…).
- Ein **angefragter**, von der Gemeinde noch nicht bestätigter Tag trägt den
  Zusatz „(offen)“.
- Die Uhrzeiten sind die des Portals; ohne Uhrzeiten ist der Termin
  ganztägig.
- Die Beschreibung nennt Ort und Zeitraum aus dem Portal und den Status
  („Gebucht“, „Anfrage offen“). Ein Link öffnet das Portal.

Ein im Portal stornierter Tag verschwindet beim nächsten Lesen aus dem
Kalender.

### Der Rechnungskalender („Agora Famille Rechnungen“)

- Ein ganztägiger Termin am **Zahlungsziel** jeder unbezahlten Rechnung:
  „Rechnung zu zahlen: 64,80 €“.
- Die Beschreibung nennt den Titel der Rechnung und, wenn sie teilweise
  bezahlt ist, den Gesamtbetrag und den offenen Betrag.
- Eine bezahlte Rechnung verschwindet beim nächsten Lesen aus dem Kalender.
- Diesen Kalender gibt es nicht, wenn die Gemeinde kein Rechnungsmodul hat.

## Szenen-Beispiele

Sobald der Kalender eines Kindes **geteilt** ist:

- **Ein Kalendertermin steht bevor**, Kalender „Léa – Agora Famille“, 1 Stunde
  vorher → Benachrichtigung „Léa geht bald in die Ferienfreizeit“.
- **Ein Kalendertermin steht bevor**, Kalender „Agora Famille Rechnungen“,
  3 Tage vorher → Benachrichtigung „Eine Agora-Famille-Rechnung wird bald
  fällig“.

## Fehlerbehebung

Der Status jedes Benutzers steht oben im Konfigurationsbildschirm.

- **„Gib die Portaladresse… unter „Meine Kalender“ ein“**: Das Konto dieses
  Benutzers ist unvollständig.
- **„Das Portal hat Benutzername oder Passwort abgelehnt“**: Prüfe sie, indem
  du dich im Browser beim Portal anmeldest. Ein Konto, das noch auf die
  Freigabe durch das Rathaus wartet, kann sich noch nicht anmelden.
- **„Das Portal antwortet nicht“**: Das Portal wird vielleicht gewartet; die
  Integration versucht es in jedem Intervall erneut. Bis dahin wird nichts
  aus den Kalendern entfernt.
- **„Das Portal hat etwas Unerwartetes geantwortet“**: Aktiviere
  **Ausführliche Protokolle**, klicke auf **Jetzt synchronisieren** und lies
  die Protokolle der Integration.

### Wichtig: keine offizielle API

Agora Plus veröffentlicht keine API für sein Familienportal. Die Integration
stellt dieselben Anfragen wie die Seiten des Portals; sie sind in einer
einzigen Datei gesammelt,
[`src/agora/endpoints.js`](../src/agora/endpoints.js). Ein Update des Portals
kann Anpassungen erfordern: Eröffne dann ein
[Issue](https://github.com/prohand/gladys-calendar-agorafamille/issues) mit
dem fehlgeschlagenen Schritt und dem HTTP-Status (nie dein Passwort).

## Datenschutz

- Die Zugangsdaten jedes Benutzers dienen nur zur Anmeldung beim Portal
  seiner Gemeinde, über HTTPS.
- Das Passwort und die Sitzung werden nie in die Protokolle geschrieben.
- Planung und Rechnungen gehen nur in die Gladys-Kalender des Benutzers, der
  die Integration aktiviert hat. Nichts wird auf die Festplatte geschrieben,
  nichts wird anderswohin gesendet.
