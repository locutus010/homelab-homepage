/* =============================================================================
 *  HOMELAB START PAGE — CONFIGURATION
 *  Edit this file to add your own links and widgets. No build step required.
 *  After saving, just refresh the page.
 * ========================================================================== */

window.CONFIG = {
  /* ---------------------------------------------------------------------------
   *  General settings
   * ------------------------------------------------------------------------ */
  settings: {
    title: "HOMELAB",            // Brand shown top-left
    subtitle: "Mission Control", // Small label under the brand
    owner: "Sven",               // Used for the time-of-day greeting
    accent: "#f4b740",           // Primary accent color (any CSS color)
    // Language packs (lang.js). The start page and the settings drawer are set
    // separately. "auto" follows the browser and falls back to English; use a
    // pack code like "en" or "de" to pin one.
    lang: {
      ui: "auto",
      settings: "auto",
    },
    clock24h: true,              // 24-hour clock

    // Live reachability check for links flagged with `ping: true`.
    // Best-effort only (no-cors): a green LED means the host responded,
    // red means it did not answer within the timeout.
    statusCheck: true,
    statusTimeoutMs: 4000,
    statusIntervalMs: 60000,     // Re-check every 60s

    // The number strip under the search bar: how many services are watched,
    // how many groups there are, and how many of the watched ones are
    // currently up / down. It reads out the status checks above, so it stays
    // hidden whenever `statusCheck` is off.
    stats: {
      enabled: true,
    },

    // Web search bar. Type and press Enter. Use a bang prefix to switch
    // engine on the fly, e.g. "!g cats" -> Google, "!d cats" -> DuckDuckGo.
    search: {
      enabled: true,
      defaultEngine: "duckduckgo",
      engines: {
        duckduckgo: { bang: "d", label: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
        google:     { bang: "g", label: "Google",     url: "https://www.google.com/search?q=%s" },
        github:     { bang: "gh", label: "GitHub",    url: "https://github.com/search?q=%s" },
        wikipedia:  { bang: "w", label: "Wikipedia",  url: "https://de.wikipedia.org/w/index.php?search=%s" },
      },
    },

    // Weather widget via open-meteo.com (no API key needed).
    // Set enabled:false to hide it. Coordinates default to Munich.
    weather: {
      enabled: true,
      label: "München",
      latitude: 48.1374,
      longitude: 11.5755,
      unit: "celsius",           // "celsius" | "fahrenheit"
    },

    // Public IP of the internet connection, shown as a pill under the weather
    // widget. Fetched client-side from a public lookup (api.ipify.org).
    publicIp: {
      enabled: true,
    },
  },

  /* ---------------------------------------------------------------------------
   *  Bookmark groups
   *
   *  Each link supports:
   *    name        (required)  Display name
   *    url         (required)  Where it points
   *    description (optional)  One-line subtitle
   *    icon        (optional)  An emoji ("🧊"), an image URL ("/icons/x.png"),
   *                            or omit it to auto-generate a monogram.
   *    ping        (optional)  true -> show a live status LED
   * ------------------------------------------------------------------------ */
  groups: [
    {
      name: "Infrastructure",
      links: [
        { name: "Proxmox",   url: "https://proxmox.local:8006", description: "Hypervisor",        icon: "🧊", ping: true },
        { name: "OPNsense",  url: "https://router.local",       description: "Firewall / Router", icon: "🛡️", ping: true },
        { name: "TrueNAS",   url: "https://nas.local",          description: "Storage",           icon: "🗄️", ping: true },
        { name: "Portainer", url: "https://docker.local:9443",  description: "Container manager", icon: "🐳", ping: true },
      ],
    },
    {
      name: "Media",
      links: [
        { name: "Jellyfin",  url: "https://media.local",    description: "Movies & TV", icon: "🎬", ping: true },
        { name: "Navidrome", url: "https://music.local",    description: "Music",       icon: "🎧" },
        { name: "Immich",    url: "https://photos.local",   description: "Photos",      icon: "📸", ping: true },
      ],
    },
    {
      name: "Tools",
      links: [
        { name: "Vaultwarden",  url: "https://vault.local",  description: "Passwords",     icon: "🔐", ping: true },
        { name: "Paperless",    url: "https://docs.local",   description: "Documents",     icon: "📄" },
        { name: "Home Assistant", url: "https://ha.local",   description: "Smart home",    icon: "🏠", ping: true },
        { name: "Grafana",      url: "https://stats.local",  description: "Dashboards",    icon: "📊" },
      ],
    },
    {
      name: "External",
      links: [
        { name: "GitHub",   url: "https://github.com",   description: "Repositories", icon: "🐙" },
        { name: "Cloud",    url: "https://cloud.example.com", description: "Backups", icon: "☁️" },
      ],
    },
  ],
};
