const allowedTags = new Set(["div", "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a"]);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeHtmlText(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
    nbsp: " ",
  };
  return value.replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, (entity, name: string) => entities[name.toLowerCase()] ?? entity);
}

export function sanitizeAnnouncementHtml(value: string): string {
  const tokens = value.match(/<[^>]*>|[^<]+|</g) ?? [];

  return tokens.map((token) => {
    if (!token.startsWith("<") || token === "<") return escapeHtmlText(token);
    const match = token.match(/^<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/i);
    if (!match) return "";
    const closing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (closing) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag !== "a") return `<${tag}>`;
    const href = match[3].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const url = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim();
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return "<a>";
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">`;
  }).join("").trim();
}

export function announcementPlainText(value: string): string {
  const sanitized = sanitizeAnnouncementHtml(value);
  const tokens = sanitized.match(/<[^>]*>|[^<]+|</g) ?? [];
  return tokens
    .map((token) => {
      if (!token.startsWith("<") || token === "<") return decodeHtmlText(token);
      return /^<\s*\/?\s*(?:div|p|br|li)\b/i.test(token) ? " " : "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function announcementDisplayHtml(value: string): string {
  const sanitized = sanitizeAnnouncementHtml(value);
  if (/<\/?(?:div|p|br|strong|b|em|i|u|ul|ol|li|a)\b/i.test(sanitized)) return sanitized;
  return `<p>${escapeHtml(announcementPlainText(value))}</p>`;
}
