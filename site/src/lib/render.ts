import { marked } from 'marked';

marked.setOptions({
  breaks: false,
  gfm: true,
});

const URL_RE = /(https?:\/\/[^\s)<>\]]+)/g;

/**
 * Render recipe markdown to HTML. Auto-links bare URLs and lets marked
 * handle the rest. We keep things minimal so that the typography styling
 * in `paper.css` stays in control.
 */
export function renderMarkdown(input: string): string {
  if (!input) return '';
  const linked = input.replace(URL_RE, (m) => {
    const safe = m.replace(/[)]+$/, '');
    const trail = m.slice(safe.length);
    return `[${truncateUrl(safe)}](${safe})${trail}`;
  });
  return marked.parse(linked, { async: false }) as string;
}

function truncateUrl(url: string, max = 56): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + '…';
}
