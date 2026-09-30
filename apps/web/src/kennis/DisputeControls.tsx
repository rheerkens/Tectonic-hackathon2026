import type { Source } from '@tectonic/shared';
import { useToasts } from '../components/Toasts.tsx';
import { useDisputeSource } from '../lib/queries.ts';
import './dispute.css';

/** Betwist-banner voor iedereen; betwisten voor editors, oplossen voor de eigenaar. */
export function DisputeControls({ source, canDispute, canResolve, disputerName }: { source: Source; canDispute: boolean; canResolve: boolean; disputerName?: string }) {
  const dispute = useDisputeSource();
  const toasts = useToasts();
  const set = (disputed: boolean) =>
    dispute.mutate({ sourceId: source.id, disputed }, { onError: (e) => toasts.push({ kind: 'error', title: 'Niet toegestaan', message: e.message }) });
  return (
    <>
      {source.disputed && (
        <p className="kn-disputed" role="status" data-testid="kn-disputed">
          Betwist{disputerName ? ` door ${disputerName}` : ''}: twijfel aan deze bron, wacht op de eigenaar.
        </p>
      )}
      {source.disputed && canResolve && (
        <button type="button" className="kn-btn kn-btn--full" disabled={dispute.isPending} onClick={() => set(false)}>
          Betwisting oplossen
        </button>
      )}
      {!source.disputed && canDispute && (
        <button type="button" className="kn-btn kn-btn--outline kn-btn--full" disabled={dispute.isPending} onClick={() => set(true)}>
          Betwist deze bron
        </button>
      )}
    </>
  );
}
