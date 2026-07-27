/* =============================================================================
 *  HOMELAB START PAGE — LANGUAGE PACKS
 *
 *  Every language is one block below. To add one, copy the "en" block, keep
 *  every key, and translate the values — no other file needs to change.
 *  Run `node check-i18n.js` afterwards to verify the key set is complete.
 *
 *    name      Shown in both language pickers.
 *    locale    BCP-47 tag for clock, date and the weather city search.
 *    ui        Texts on the start page.
 *    settings  Texts in the settings drawer.
 *
 *  Values may contain markup where the page already uses innerHTML; the
 *  {placeholders} are filled with user data and are escaped by the caller.
 *  English is the fallback: a key missing elsewhere falls back to "en".
 * ========================================================================== */

window.LANGUAGES = {
  en: {
    name: "English",
    locale: "en-US",

    ui: {
      "greeting.night": "Late night",
      "greeting.morning": "Good morning",
      "greeting.afternoon": "Good afternoon",
      "greeting.evening": "Good evening",
      "greeting.plain": "{part}.",
      "greeting.withName": "{part}, <b>{name}</b>.",

      "stats.monitored": "Monitored",
      "stats.groups": "Groups",
      "stats.online": "Online",
      "stats.offline": "Offline",

      "search.placeholder": "Search the web   ·   start with  /  to filter your links",
      "search.aria": "Search",

      "filter.empty": "No links match “{term}”",

      "footer.filter": "filter links",
      "footer.clear": "clear",

      "status.checking": "Checking…",
      "status.online": "Online",
      "status.offline": "Unreachable",

      "pubip.label": "WAN IP",
      "pubip.unavailable": "n/a",
      "pubip.error": "Public IP unavailable (internet/blocker?)",
    },

    settings: {
      "drawer.title": "Settings",
      "drawer.sub": "Changes are saved immediately",
      "drawer.close": "Close",
      "drawer.open": "Open settings",

      "general.heading": "General",
      "general.sub": "Name, color, language and clock",
      "general.title": "Title",
      "general.subtitle": "Subtitle",
      "general.owner": "Your name (for the greeting)",
      "general.accent": "Accent color",
      "general.accentHint": "Tap a color of your own or pick a preset.",
      "general.langUi": "Language of the start page",
      "general.langSettings": "Language of the settings",
      "general.langAuto": "Automatic (browser)",
      "general.clock24h": "24-hour clock",

      "weather.heading": "Weather",
      "weather.sub": "Current temperature in the header",
      "weather.toggle": "Show weather",
      "weather.city": "City",
      "weather.cityHint": "Enter a city and hit “Search” — coordinates are set automatically.",
      "weather.cityPlaceholder": "e.g. Berlin",
      "weather.search": "Search",
      "weather.searching": "Searching…",
      "weather.notFound": "No city found.",
      "weather.searchFailed": "Search failed (offline?).",
      "weather.unit": "Unit",
      "weather.celsius": "Celsius (°C)",
      "weather.fahrenheit": "Fahrenheit (°F)",
      "weather.pubip": "Show public IP below",

      "search.heading": "Search",
      "search.sub": "Web search bar on the start page",
      "search.toggle": "Show search bar",
      "search.default": "Default search engine",

      "status.heading": "Status check",
      "status.sub": "Green/red dots show whether a service is reachable",
      "status.toggle": "Show status dots",
      "status.statsToggle": "Show number strip",
      "status.statsHint": "Monitored / groups / online / offline under the search bar. Always off without status checks.",
      "status.interval": "Check interval (seconds)",
      "status.intervalHint": "How often it re-checks.",

      "bookmarks.heading": "Bookmarks",
      "bookmarks.sub": "Your links — grouped",
      "bookmarks.addGroup": "＋ &nbsp;New group",
      "bookmarks.newGroupName": "New group",
      "bookmarks.groupNamePlaceholder": "Group name",
      "bookmarks.reorder": "Order",
      "bookmarks.moveUp": "Move up",
      "bookmarks.moveDown": "Move down",
      "bookmarks.deleteGroup": "Delete group",
      "bookmarks.deleteGroupConfirm": "Delete group “{name}” with {count} link(s)?",
      "bookmarks.addLink": "＋ Add link",
      "bookmarks.newLinkName": "New link",
      "bookmarks.empty": "No groups yet. Create one below.",
      "bookmarks.iconPlaceholder": "Icon",
      "bookmarks.iconTitle": "Emoji, image URL or “Fetch favicon” — empty = monogram",
      "bookmarks.faviconTitle": "Fetch favicon from the website",
      "bookmarks.namePlaceholder": "Name",
      "bookmarks.urlPlaceholder": "https://service.local",
      "bookmarks.descPlaceholder": "Description (optional)",
      "bookmarks.ping": "Check status",
      "bookmarks.deleteLink": "Delete link",
      "bookmarks.faviconNeedsUrl": "Please enter a full address (http:// or https://) in the link first.",
      "bookmarks.faviconFailed": "The address could not be processed.",

      "backup.heading": "Backup & transfer",
      "backup.sub": "Your changes are saved automatically",
      "backup.noteServer": "All settings are <b>saved centrally and automatically</b> (on the server) and are therefore available on <b>every device on the network</b> — copying a file across by hand is no longer needed. The download below is only an optional backup.",
      "backup.noteLocal": "This page was opened without a server, so the settings are stored <b>in this browser only</b>. For storage across devices start the server with <code>python3 server.py</code> and open the page through its address.",
      "backup.token": "Write token (optional)",
      "backup.tokenPlaceholder": "only needed if the server requires a token",
      "backup.tokenHint": "Must match the server's HOMELAB_TOKEN, otherwise saving fails.",
      "backup.download": "⬇ &nbsp;Download config.js",
      "backup.upload": "⬆ &nbsp;Load from file",
      "backup.reset": "Reset to factory settings",
      "backup.resetConfirm": "Really reset everything to factory settings? Your changes in this browser will be lost.",
      "backup.exportHeader": "/* Homelab — exported on {date} */",
      "backup.exportHint": "/* Drop this file into the project folder to make it the default for everyone. */",
      "backup.importBadFormat": "not a valid format",
      "backup.importOk": "Settings loaded ✓",
      "backup.importFailed": "The file could not be read:\n{error}",
    },
  },

  de: {
    name: "Deutsch",
    locale: "de-DE",

    ui: {
      "greeting.night": "Gute Nacht",
      "greeting.morning": "Guten Morgen",
      "greeting.afternoon": "Guten Tag",
      "greeting.evening": "Guten Abend",
      "greeting.plain": "{part}.",
      "greeting.withName": "{part}, <b>{name}</b>.",

      "stats.monitored": "Überwacht",
      "stats.groups": "Gruppen",
      "stats.online": "Online",
      "stats.offline": "Offline",

      "search.placeholder": "Web durchsuchen   ·   mit  /  beginnen, um Links zu filtern",
      "search.aria": "Suche",

      "filter.empty": "Keine Links passen zu „{term}“",

      "footer.filter": "Links filtern",
      "footer.clear": "leeren",

      "status.checking": "Prüfe…",
      "status.online": "Online",
      "status.offline": "Nicht erreichbar",

      "pubip.label": "WAN-IP",
      "pubip.unavailable": "n/v",
      "pubip.error": "Öffentliche IP nicht abrufbar (Internet/Blocker?)",
    },

    settings: {
      "drawer.title": "Einstellungen",
      "drawer.sub": "Änderungen werden sofort gespeichert",
      "drawer.close": "Schließen",
      "drawer.open": "Einstellungen öffnen",

      "general.heading": "Allgemein",
      "general.sub": "Name, Farbe, Sprache und Uhrzeit",
      "general.title": "Titel",
      "general.subtitle": "Untertitel",
      "general.owner": "Dein Name (für die Begrüßung)",
      "general.accent": "Akzentfarbe",
      "general.accentHint": "Tippe eine eigene Farbe an oder wähle eine Vorgabe.",
      "general.langUi": "Sprache der Startseite",
      "general.langSettings": "Sprache der Einstellungen",
      "general.langAuto": "Automatisch (Browser)",
      "general.clock24h": "24-Stunden-Uhr",

      "weather.heading": "Wetter",
      "weather.sub": "Aktuelle Temperatur im Kopfbereich",
      "weather.toggle": "Wetter anzeigen",
      "weather.city": "Stadt",
      "weather.cityHint": "Stadt eingeben und „Suchen“ — Koordinaten werden automatisch gesetzt.",
      "weather.cityPlaceholder": "z. B. Berlin",
      "weather.search": "Suchen",
      "weather.searching": "Suche…",
      "weather.notFound": "Keine Stadt gefunden.",
      "weather.searchFailed": "Suche fehlgeschlagen (offline?).",
      "weather.unit": "Einheit",
      "weather.celsius": "Celsius (°C)",
      "weather.fahrenheit": "Fahrenheit (°F)",
      "weather.pubip": "Öffentliche IP darunter anzeigen",

      "search.heading": "Suche",
      "search.sub": "Web-Suchleiste auf der Startseite",
      "search.toggle": "Suchleiste anzeigen",
      "search.default": "Standard-Suchmaschine",

      "status.heading": "Statusprüfung",
      "status.sub": "Grüne/rote Punkte zeigen, ob ein Dienst erreichbar ist",
      "status.toggle": "Status-Punkte anzeigen",
      "status.statsToggle": "Zahlenleiste anzeigen",
      "status.statsHint": "Überwacht / Gruppen / Online / Offline unter der Suchleiste. Ohne Statusprüfung immer aus.",
      "status.interval": "Prüfintervall (Sekunden)",
      "status.intervalHint": "Wie oft erneut geprüft wird.",

      "bookmarks.heading": "Lesezeichen",
      "bookmarks.sub": "Deine Links — gruppiert",
      "bookmarks.addGroup": "＋ &nbsp;Neue Gruppe",
      "bookmarks.newGroupName": "Neue Gruppe",
      "bookmarks.groupNamePlaceholder": "Gruppenname",
      "bookmarks.reorder": "Reihenfolge",
      "bookmarks.moveUp": "Nach oben",
      "bookmarks.moveDown": "Nach unten",
      "bookmarks.deleteGroup": "Gruppe löschen",
      "bookmarks.deleteGroupConfirm": "Gruppe „{name}“ mit {count} Link(s) löschen?",
      "bookmarks.addLink": "＋ Link hinzufügen",
      "bookmarks.newLinkName": "Neuer Link",
      "bookmarks.empty": "Noch keine Gruppen. Lege unten eine an.",
      "bookmarks.iconPlaceholder": "Symbol",
      "bookmarks.iconTitle": "Emoji, Bild-URL oder „Favicon holen“ — leer = Kürzel",
      "bookmarks.faviconTitle": "Favicon von der Webseite holen",
      "bookmarks.namePlaceholder": "Name",
      "bookmarks.urlPlaceholder": "https://dienst.local",
      "bookmarks.descPlaceholder": "Beschreibung (optional)",
      "bookmarks.ping": "Status prüfen",
      "bookmarks.deleteLink": "Link löschen",
      "bookmarks.faviconNeedsUrl": "Bitte zuerst eine vollständige Adresse (http:// oder https://) im Link eintragen.",
      "bookmarks.faviconFailed": "Adresse konnte nicht verarbeitet werden.",

      "backup.heading": "Sichern & Übertragen",
      "backup.sub": "Deine Änderungen werden automatisch gespeichert",
      "backup.noteServer": "Alle Einstellungen werden <b>automatisch zentral gespeichert</b> (auf dem Server) und stehen dadurch auf <b>allen Geräten im Netzwerk</b> zur Verfügung — ein manuelles Übertragen per Datei ist nicht mehr nötig. Der Download unten ist nur ein optionales Backup.",
      "backup.noteLocal": "Diese Seite wurde ohne Server geöffnet, daher werden die Einstellungen <b>nur in diesem Browser</b> gespeichert. Für die geräteübergreifende Speicherung starte den Server mit <code>python3 server.py</code> und öffne die Seite über dessen Adresse.",
      "backup.token": "Schreib-Token (optional)",
      "backup.tokenPlaceholder": "nur nötig, wenn der Server ein Token verlangt",
      "backup.tokenHint": "Muss zum HOMELAB_TOKEN des Servers passen, sonst schlägt das Speichern fehl.",
      "backup.download": "⬇ &nbsp;config.js herunterladen",
      "backup.upload": "⬆ &nbsp;Aus Datei laden",
      "backup.reset": "Auf Werkseinstellungen zurücksetzen",
      "backup.resetConfirm": "Wirklich alles auf die Werkseinstellungen zurücksetzen? Deine Änderungen in diesem Browser gehen verloren.",
      "backup.exportHeader": "/* Homelab — exportiert am {date} */",
      "backup.exportHint": "/* Diese Datei in den Projektordner legen, um sie zur Vorgabe für alle zu machen. */",
      "backup.importBadFormat": "kein gültiges Format",
      "backup.importOk": "Einstellungen geladen ✓",
      "backup.importFailed": "Datei konnte nicht gelesen werden:\n{error}",
    },
  },
};
