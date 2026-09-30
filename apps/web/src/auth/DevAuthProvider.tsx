import { DEMO_USERS, DEV_USER_HEADER, findDemoUser } from '@tectonic/shared';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Avatar } from '../components/Avatar.tsx';
import { Brand } from '../components/Brand.tsx';
import { AuthContext } from './context.ts';
import type { AuthSession } from './types.ts';

const STORAGE_KEY = 'tectonic.devUser';

/** `?as=grace` (or a full demo id) selects an identity for this tab: handy for tests, demos and videos. */
function identityFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('as');
  if (!requested) return null;
  const user = findDemoUser(requested);
  if (user) {
    params.delete('as');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
  return user?.id ?? null;
}

function loadIdentity(): string | null {
  const fromUrl = identityFromUrl();
  if (fromUrl) {
    sessionStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  // sessionStorage is per tab, so two tabs can act as two different people.
  return findDemoUser(sessionStorage.getItem(STORAGE_KEY))?.id ?? null;
}

/**
 * Local development identity picker. No credentials, no network: the chosen
 * demo id is sent as the `x-dev-user` header and the server only honours it
 * when its own configuration allows the bypass (never in production).
 */
export function DevAuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(loadIdentity);

  const choose = useCallback((id: string | null) => {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
    const update = () => flushSync(() => setUserId(id));
    const focus = () => (document.getElementById('user-menu-trigger') ?? document.querySelector<HTMLElement>('.identity-card h1'))?.focus();
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      update();
      focus();
      return;
    }
    document.documentElement.dataset.userSwitch = '';
    const transition = document.startViewTransition(update);
    void transition.finished.finally(() => {
      delete document.documentElement.dataset.userSwitch;
      focus();
    }).catch(() => {}); // A skipped animation does not cancel the identity change.
  }, []);

  const session = useMemo<AuthSession | null>(() => {
    const user = findDemoUser(userId);
    if (!user) return null;
    return {
      mode: 'dev-bypass',
      user: { id: user.id, name: user.name, email: user.email, color: user.color },
      getAuthHeaders: async () => ({ [DEV_USER_HEADER]: user.id }),
      getWsAuth: async () => ({ devUser: user.id }),
      signOut: () => choose(null),
      switchUser: choose,
    };
  }, [userId, choose]);

  if (!session) return <IdentityPicker onChoose={choose} />;
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

function IdentityPicker({ onChoose }: { onChoose: (id: string) => void }) {
  return (
    <main className="identity-screen" data-testid="identity-picker">
      <div className="identity-card">
        <Brand />
        <h1 tabIndex={-1}>Jouw kennis. Jouw perspectief.</h1>
        <p className="muted">
          Kies een profiel en ontdek welke kennis je kunt vertrouwen. Je werkt hier met fictieve gegevens in een gedeelde demowerkruimte.
        </p>
        <ul className="identity-list">
          {DEMO_USERS.map((user) => (
            <li key={user.id}>
              <button type="button" className="identity-option" onClick={() => onChoose(user.id)} data-testid={`identity-${user.handle}`}>
                <Avatar name={user.name} color="var(--accent-soft)" size={44} />
                <span className="identity-meta">
                  <span className="identity-name">{user.name}</span>
                  <span className="muted small">Open werkruimte</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Vanuit je profielmenu kun je op elk moment van perspectief wisselen.
        </p>
      </div>
    </main>
  );
}
