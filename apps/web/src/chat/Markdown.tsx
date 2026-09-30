import type { ReactNode } from 'react';

/**
 * A deliberately tiny renderer for the assistant's light markdown: paragraphs, **bold**, "- " / "1. " lists and
 * [S1] citation chips. It builds React elements (never HTML strings), so model output cannot inject markup.
 */

export interface CitationLookup {
  /** Which codes can be opened (known sources); other codes render as plain, inert text. */
  has(code: string): boolean;
  title(code: string): string;
  isOpen(code: string): boolean;
  toggle(code: string): void;
  /** The id of the open source card, for aria-controls. */
  panelId(code: string): string;
}

const CODE = '[A-Za-z]{1,3}\\d{1,4}';
const INLINE = new RegExp(`(\\*\\*[^*\\n]+?\\*\\*|\\[${CODE}(?:\\s*[,;]\\s*${CODE})*\\])`);

export function CitationChip({ code, cite }: { code: string; cite: CitationLookup }) {
  const key = code.toUpperCase();
  if (!cite.has(key)) {
    return (
      <span className="ch-cite ch-cite--unknown" title="Bron niet beschikbaar">
        {key}
      </span>
    );
  }
  const open = cite.isOpen(key);
  return (
    <button
      type="button"
      className={`ch-cite${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-controls={open ? cite.panelId(key) : undefined}
      aria-label={`Bron ${key}: ${cite.title(key)}`}
      title={cite.title(key)}
      onClick={() => cite.toggle(key)}
    >
      {key}
    </button>
  );
}

function renderInline(text: string, cite: CitationLookup, keyBase: string): ReactNode[] {
  return text.split(INLINE).flatMap((part, i): ReactNode[] => {
    const key = `${keyBase}.${i}`;
    if (i % 2 === 0) return part ? [part] : [];
    if (part.startsWith('**')) return [<strong key={key}>{renderInline(part.slice(2, -2), cite, key)}</strong>];
    const codes = part.slice(1, -1).split(/\s*[,;]\s*/);
    return [
      <span className="ch-cites" key={key}>
        {codes.map((code) => (
          <CitationChip key={code} code={code} cite={cite} />
        ))}
      </span>,
    ];
  });
}

type Block = { type: 'p'; lines: string[] } | { type: 'ul' | 'ol'; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)![1]!;
      if (current && current.type === type) current.items.push(item);
      else {
        flush();
        current = { type, items: [item] };
      }
    } else if (heading) {
      flush();
      blocks.push({ type: 'p', lines: [`**${heading[1]!.replace(/\*\*/g, '')}**`] });
    } else if (current?.type === 'p') {
      current.lines.push(line.trim());
    } else if (current) {
      // A wrapped continuation line of a list item.
      current.items[current.items.length - 1] += ` ${line.trim()}`;
    } else {
      current = { type: 'p', lines: [line.trim()] };
    }
  }
  flush();
  return blocks;
}

export function Markdown({ text, cite }: { text: string; cite: CitationLookup }) {
  return (
    <>
      {parseBlocks(text).map((block, i) => {
        const key = `b${i}`;
        if (block.type === 'p') {
          return (
            <p key={key}>
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {renderInline(line, cite, `${key}.${j}`)}
                </span>
              ))}
            </p>
          );
        }
        const Tag = block.type;
        return (
          <Tag key={key}>
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item, cite, `${key}.${j}`)}</li>
            ))}
          </Tag>
        );
      })}
    </>
  );
}
