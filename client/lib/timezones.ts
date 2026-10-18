/**
 * The current IANA name for a zone the browser may still call by its old one.
 *
 * Chrome (V8's ICU) lists and reports pre-rename names — Asia/Calcutta,
 * Europe/Kiev — while the API stores the current ones. The API maps these
 * too (NormalizesTimezone); doing it here as well means the list shows the
 * names people know and the dialog's default matches what gets saved.
 */
export const TIMEZONE_ALIASES: Record<string, string> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
}

export function canonicalZone(zone: string): string {
  return TIMEZONE_ALIASES[zone] ?? zone
}

/** The zone this browser is in, by its current name. */
export function browserZone(): string {
  return canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
}

/** Every zone the browser knows, by current names, sorted, no duplicates. */
export function supportedZones(): string[] {
  let zones: string[]
  try {
    zones = Intl.supportedValuesOf("timeZone")
  } catch {
    return [browserZone()]
  }
  return [...new Set(zones.map(canonicalZone))].sort()
}
