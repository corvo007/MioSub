/**
 * Lightweight markdown-to-HTML converter for changelog content.
 *
 * Handles only the limited subset used in release notes:
 * - ### Headings → <h3>
 * - **bold** → <strong>
 * - - List items → <li> (with nested bold support)
 * - Paragraphs
 *
 * Safe to use with dangerouslySetInnerHTML since content
 * comes exclusively from our own GitHub releases.
 */
export function changelogToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line — close list if open
    if (!trimmed) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Headings: ### → h3, ## → h2
    if (trimmed.startsWith('### ')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push(`<h3 class="changelog-h3">${applyInline(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push(`<h2 class="changelog-h2">${applyInline(trimmed.slice(3))}</h2>`);
      continue;
    }

    // List items: - text
    if (trimmed.startsWith('- ')) {
      if (!inList) {
        html.push('<ul class="changelog-list">');
        inList = true;
      }
      html.push(`<li>${applyInline(trimmed.slice(2))}</li>`);
      continue;
    }

    // Paragraph text
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    html.push(`<p class="changelog-p">${applyInline(trimmed)}</p>`);
  }

  if (inList) html.push('</ul>');
  return html.join('\n');
}

/** Escape HTML entities to prevent XSS */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Apply inline formatting: **bold**, `code` (on already-escaped text) */
function applyInline(text: string): string {
  const safe = escapeHtml(text);
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="changelog-code">$1</code>');
}
