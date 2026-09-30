import { DEMO_USERS } from '@tectonic/shared';
import { useSession } from '../auth/context.ts';
import { Avatar } from './Avatar.tsx';

export function UserMenu() {
  const session = useSession();
  const close = () => document.getElementById('user-menu')?.hidePopover();

  return (
    <>
      <button id="user-menu-trigger" type="button" className="kn-profile-trigger" popoverTarget="user-menu" aria-haspopup="dialog" aria-label={`Profiel van ${session.user.name}`}>
        <Avatar name={session.user.name} color="var(--accent-soft)" size={38} />
        <span className="kn-profile-copy"><strong>{session.user.name}</strong></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div id="user-menu" popover="auto" role="dialog" className="kn-user-menu" aria-labelledby="user-menu-title">
        <div className="kn-menu-heading">
          <h2 id="user-menu-title">{session.switchUser ? 'Wissel van werkruimte' : 'Jouw profiel'}</h2>
          <p>{session.switchUser ? 'Kijk mee vanuit een ander perspectief.' : session.user.name}</p>
        </div>
        {session.switchUser && (
          <div className="kn-menu-users">
            {DEMO_USERS.map((user) => (
              <button key={user.id} type="button" className="kn-menu-person" disabled={user.id === session.user.id} onClick={() => { close(); session.switchUser?.(user.id); }}>
                <Avatar name={user.name} color="var(--accent-soft)" size={40} />
                <span><strong>{user.name}</strong><small>{user.id === session.user.id ? 'Huidige werkruimte' : 'Open werkruimte'}</small></span>
                {user.id === session.user.id && <span className="kn-menu-current">Actief</span>}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="kn-menu-signout" onClick={() => { close(); session.signOut(); }}>
          {session.switchUser ? 'Terug naar aanmelden' : 'Afmelden'}
        </button>
      </div>
    </>
  );
}
