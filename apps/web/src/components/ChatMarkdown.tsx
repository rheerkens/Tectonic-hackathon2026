import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatMarkdown({ text }: { text: string }) {
  return <div className="chat-markdown"><ReactMarkdown
    remarkPlugins={[remarkGfm]}
    skipHtml
    components={{
      // Project data must never cause an automatic request to a model-supplied URL.
      img: ({ alt }) => <span>{alt ? `[Image: ${alt}]` : '[Image]'}</span>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    }}
  >{text}</ReactMarkdown></div>;
}
