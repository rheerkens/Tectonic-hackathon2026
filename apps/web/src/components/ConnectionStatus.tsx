import { useRealtime } from '../realtime/RealtimeProvider.tsx';

const LABELS = {
  connecting: 'Connecting',
  online: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
} as const;

export function ConnectionStatus() {
  const { status } = useRealtime();
  return (
    <span className={`conn conn--${status}`} title={`Realtime connection: ${LABELS[status]}`} data-testid="connection-status" data-status={status}>
      <span className="conn-dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
