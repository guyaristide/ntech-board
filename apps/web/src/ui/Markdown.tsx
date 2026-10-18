import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

/**
 * Texte en markdown (titres, listes, gras, liens, tableaux, cases à cocher). Le HTML brut n'est pas
 * interprété ; les liens s'ouvrent dans un nouvel onglet.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`${styles.md} ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}>
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
