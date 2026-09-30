import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMarkdown } from './ChatMarkdown.tsx';

test('chat markdown cannot run raw HTML or request model-supplied images', () => {
  const markup = renderToStaticMarkup(<ChatMarkdown text={'<script>alert(1)</script>\n\n<img src="https://attacker.invalid/raw">\n\n![Project data](https://attacker.invalid/collect)\n\n[Unsafe](javascript:alert(1))\n\n**Safe text**'} />);
  expect(markup).not.toContain('<script');
  expect(markup).not.toContain('<img');
  expect(markup).not.toContain('attacker.invalid');
  expect(markup).not.toContain('javascript:');
  expect(markup).toContain('<strong>Safe text</strong>');
});
