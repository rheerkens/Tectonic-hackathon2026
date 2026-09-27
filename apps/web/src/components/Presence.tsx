import { useSession } from '../auth/context.ts';
import { useRealtime } from '../realtime/RealtimeProvider.tsx';
import { Avatar } from './Avatar.tsx';

export function Presence({ projectId }: { projectId: string }) {
  const { presence } = useRealtime();
  const session = useSession();
  const users = presence[projectId] ?? [];
  if (users.length === 0) return null;
  const others = users.filter((u) => u.userId !== session.user.id);
  return (
    <div className="presence" title={`Viewing now: ${users.map((u) => u.name).join(', ')}`} data-testid="presence">
      <div className="presence-avatars">
        {users.map((u) => (
          <Avatar key={u.userId} name={u.name} color={u.color} size={26} title={`${u.name}${u.userId === session.user.id ? ' (you)' : ''}`} />
        ))}
      </div>
      <span className="muted small presence-label">
        {others.length === 0 ? 'Only you here' : others.length === 1 ? `${others[0]!.name} is here` : `${others.length} others here`}
      </span>
    </div>
  );
}
