/**
 * Best-effort extraction of latitude/longitude from a pasted Google Maps link,
 * so a staff member only has to paste the share URL and the bot can still send
 * a real WhatsApp location pin.
 *
 * Handles the common desktop/mobile formats:
 *   .../@26.3592,43.9818,15z
 *   ...?q=26.3592,43.9818   /  ...&query=26.3592,43.9818
 *   ...!3d26.3592!4d43.9818
 *   a bare "26.3592, 43.9818" pasted on its own
 *
 * Short links (goo.gl / maps.app.goo.gl) carry no coordinates until resolved,
 * so they return undefined — the caller keeps the URL as a clickable link.
 */
export function parseLatLngFromMapsUrl(url?: string | null): { lat: number; lng: number } | undefined {
  if (!url) return undefined;
  const s = String(url);

  const patterns = [
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,          // /@lat,lng
    /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/i, // ?q=lat,lng
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,          // !3dlat!4dlng
    /^\s*(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)\s*$/,    // bare "lat, lng"
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]!);
      const lng = parseFloat(m[2]!);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return undefined;
}
