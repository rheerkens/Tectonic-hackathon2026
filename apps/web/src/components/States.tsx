import type { ReactNode } from 'react';

export function EmptyState({ title, message, action, icon = '◫' }: { title: string; message?: string; action?: ReactNode; icon?: string }) {
  return (
    <div className="empty-state" data-testid="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert" data-testid="error-state">
      <div className="empty-icon" aria-hidden="true">
        ⚠
      </div>
      <h3>{title}</h3>
      {message && <p className="muted">{message}</p>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="board" aria-busy="true" aria-label="Loading board" data-testid="board-skeleton">
      {[0, 1, 2, 3].map((column) => (
        <section className="column" key={column}>
          <header className="column-header">
            <span className="skeleton skeleton-text" style={{ width: 90 }} />
          </header>
          <div className="column-body">
            {Array.from({ length: 3 - (column % 2) }).map((_, i) => (
              <div className="skeleton skeleton-card" key={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <ul className="project-list" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="project-item">
          <span className="skeleton skeleton-text" style={{ width: `${60 + i * 12}%` }} />
        </li>
      ))}
    </ul>
  );
}
