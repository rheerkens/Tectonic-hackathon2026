import { useEffect, useState } from 'react';

/** Hash routing works identically on the web, in Capacitor and in Tauri (file:// origins). */
export interface Route {
  projectId: string | null;
}

function parse(): Route {
  const match = /^#\/projects\/([^/?]+)/.exec(window.location.hash);
  return { projectId: match?.[1] ? decodeURIComponent(match[1]) : null };
}

export function navigateToProject(projectId: string | null) {
  window.location.hash = projectId ? `#/projects/${encodeURIComponent(projectId)}` : '#/';
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
