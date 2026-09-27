import { DEMO_USERS } from '@tectonic/shared';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/context.ts';
import { Avatar } from './Avatar.tsx';

export function UserMenu() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="user-menu">
        <Avatar name={session.user.name} color={session.user.color} size={30} />
        <span className="user-name">{session.user.name}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-heading muted small">
            {session.user.email ?? session.user.id}
            <br />
            {session.mode === 'dev-bypass' ? 'Local dev bypass (no login)' : 'Signed in with Clerk'}
          </div>
          {session.switchUser && (
            <>
              <div className="menu-label muted small">Switch identity</div>
              {DEMO_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="menuitem"
                  className={`menu-item${u.id === session.user.id ? ' menu-item--active' : ''}`}
                  onClick={() => {
                    session.switchUser?.(u.id);
                    setOpen(false);
                  }}
                  data-testid={`switch-${u.handle}`}
                >
                  <Avatar name={u.name} color={u.color} size={22} />
                  {u.name}
                </button>
              ))}
            </>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={session.signOut} data-testid="sign-out">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
