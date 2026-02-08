/**
 * UnitCard Component
 * Displays a single atomic unit in card format
 */

import type { AtomicUnit, SearchResult } from '../types';
import { useUIStore } from '../stores/uiStore';
import { SourceIcon } from './SourceIcon';

interface UnitCardProps {
  unit: AtomicUnit;
  score?: number;
  highlights?: string[];
  onClick?: () => void;
}

export function UnitCard({ unit, score, highlights, onClick }: UnitCardProps) {
  const { openModal } = useUIStore();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      openModal(unit.id);
    }
  };

  const typeClass = `type-${unit.type}`;

  // Truncate content for display
  const truncatedContent =
    unit.content.length > 200
      ? unit.content.slice(0, 200) + '...'
      : unit.content;

  // Format timestamp
  const formattedDate = new Date(unit.timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <article
      className="card p-4 cursor-pointer hover:shadow-lg transition-shadow duration-200"
      onClick={handleClick}
    >
      {/* Header */}
      <header className="flex justify-between items-start gap-3 mb-3">
        <div className="flex items-start gap-2">
           <div className="mt-1 text-[var(--ink-muted)] shrink-0">
             <SourceIcon source={unit.source} format={unit.format} type={unit.type} />
           </div>
           <h3 className="font-semibold text-[var(--accent-3)] line-clamp-2">
             {unit.title}
           </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {score !== undefined && (
            <span className="text-xs text-[var(--ink-muted)]">
              {(score * 100).toFixed(0)}%
            </span>
          )}
          <span className={`type-badge ${typeClass}`}>{unit.type}</span>
        </div>
      </header>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-muted)] mb-3">
        {unit.source && (
          <span className="flex items-center gap-1 uppercase tracking-wider font-bold">
            {unit.source}
          </span>
        )}
        {unit.format && (
          <span className="uppercase font-medium text-[var(--accent-2)]">
            {unit.format}
          </span>
        )}
        <span>
          {formattedDate}
        </span>
      </div>

      {/* Content preview */}
      <div className="mb-3">
        {highlights && highlights.length > 0 ? (
          <p
            className="text-sm"
            dangerouslySetInnerHTML={{
              __html: highlights[0],
            }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{truncatedContent}</p>
        )}
      </div>

      {/* Tags */}
      {unit.tags && unit.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unit.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
          {unit.tags.length > 5 && (
            <span className="text-xs text-[var(--ink-muted)]">
              +{unit.tags.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Keywords (if no tags) */}
      {(!unit.tags || unit.tags.length === 0) &&
        unit.keywords &&
        unit.keywords.length > 0 && (
          <div className="text-xs text-[var(--ink-muted)]">
            <strong>Keywords:</strong> {unit.keywords.slice(0, 5).join(', ')}
          </div>
        )}
    </article>
  );
}

// Result card variant with search result data
export function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <UnitCard
      unit={result.unit}
      score={result.score}
      highlights={result.highlights}
    />
  );
}
