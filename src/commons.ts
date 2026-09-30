const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const UA = "milc-deck-agent/0.1 (https://github.com/parse-nip/milc-deck-agent; deck builder)";

const ALLOWED_LICENSE = /CC[- ]?BY|CC0|Public domain|PD-/i;

export type CommonsHit = {
  title: string;
  thumbUrl?: string;
  url?: string;
  mime?: string;
  license?: string;
  artist?: string;
  description?: string;
};

export async function searchCommons(query: string, limit = 8): Promise<CommonsHit[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(50, Math.max(1, limit))),
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata|size",
    iiurlwidth: "640",
    iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription|Credit",
  });
  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Commons search failed: ${res.status}`);
  const data = (await res.json()) as {
    query?: { pages?: Record<string, {
      title: string;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        mime?: string;
        width?: number;
        height?: number;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    }> };
  };
  const pages = Object.values(data.query?.pages ?? {});
  const hits: CommonsHit[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.mime?.startsWith("image/")) continue;
    const license = stripHtml(info.extmetadata?.LicenseShortName?.value ?? "");
    if (license && !ALLOWED_LICENSE.test(license)) continue;
    hits.push({
      title: page.title,
      url: cleanUrl(info.url),
      thumbUrl: cleanUrl(info.thumburl),
      mime: info.mime,
      license: license || undefined,
      artist: stripHtml(info.extmetadata?.Artist?.value ?? "") || undefined,
      description: stripHtml(info.extmetadata?.ImageDescription?.value ?? "") || undefined,
    });
  }
  return hits;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    u.search = "";
    return u.toString();
  } catch {
    return value;
  }
}
