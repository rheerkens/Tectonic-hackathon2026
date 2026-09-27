import { useEffect, useState } from 'react';
import { useSession } from '../auth/context.ts';
import { useMe, useProject, useProjects } from '../lib/queries.ts';
import { useProjectSubscription } from '../realtime/RealtimeProvider.tsx';
import { navigateToProject, useRoute } from '../router.ts';
import { Avatar } from './Avatar.tsx';
import { Board } from './Board.tsx';
import { ConnectionStatus } from './ConnectionStatus.tsx';
import { Presence } from './Presence.tsx';
import { NewProjectDialog, ProjectSettingsDialog } from './ProjectDialog.tsx';
import { ProjectList } from './ProjectList.tsx';
import { BoardSkeleton, EmptyState, ErrorState, SidebarSkeleton } from './States.tsx';
import { UserMenu } from './UserMenu.tsx';

export function AppShell() {
  const session = useSession();
  const route = useRoute();
  const me = useMe();
  const projects = useProjects();
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState(false);

  // Land on the first project when nothing is selected.
  useEffect(() => {
    if (!route.projectId && projects.data && projects.data.length > 0) navigateToProject(projects.data[0]!.id);
  }, [route.projectId, projects.data]);

  const projectId = route.projectId;
  const project = useProject(projectId);
  useProjectSubscription(project.data ? projectId : null);

  if (me.isError) {
    return (
      <main className="screen-center">
        <ErrorState
          title="The server rejected your identity"
          message={`${me.error.message} (signed in as ${session.user.name} via ${session.mode}).`}
          onRetry={() => void me.refetch()}
        />
        <button type="button" className="btn btn--ghost" onClick={session.signOut}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Tectonic Board</span>
        </div>
        <div className="topbar-project">
          {projects.data && projects.data.length > 0 && (
            <select
              className="project-switcher"
              value={projectId ?? ''}
              onChange={(e) => navigateToProject(e.target.value || null)}
              aria-label="Switch project"
              data-testid="project-switcher"
            >
              {projects.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="topbar-actions">
          {project.data && <Presence projectId={project.data.id} />}
          <ConnectionStatus />
          <UserMenu />
        </div>
      </header>

      <aside className="sidebar">
        {projects.isPending ? (
          <SidebarSkeleton />
        ) : projects.isError ? (
          <ErrorState title="Couldn't load projects" message={projects.error.message} onRetry={() => void projects.refetch()} />
        ) : (
          <ProjectList projects={projects.data} activeId={projectId} onCreate={() => setCreating(true)} />
        )}
        <div className="sidebar-footer muted small">
          <Avatar name={session.user.name} color={session.user.color} size={22} />
          <span>
            {session.user.name} · {session.mode === 'dev-bypass' ? 'dev bypass' : 'Clerk'}
          </span>
        </div>
      </aside>

      <main className="content">
        {projects.data && projects.data.length === 0 ? (
          <EmptyState
            title="No projects yet"
            message="Create a project to start planning. You'll be its owner and can invite the others."
            action={
              <button type="button" className="btn btn--primary" onClick={() => setCreating(true)} data-testid="create-first-project">
                Create a project
              </button>
            }
          />
        ) : !projectId ? (
          projects.isPending ? <BoardSkeleton /> : <EmptyState title="Pick a project" message="Choose a project from the sidebar." />
        ) : project.isPending ? (
          <BoardSkeleton />
        ) : project.isError ? (
          <ErrorState
            title={project.error.message.includes('member') ? 'No access to this project' : "Couldn't load this project"}
            message={project.error.message}
            onRetry={() => void project.refetch()}
          />
        ) : (
          <>
            <div className="project-header">
              <span className="project-swatch project-swatch--lg" style={{ background: project.data.color }} aria-hidden="true" />
              <div className="project-header-text">
                <h1 data-testid="project-title">{project.data.name}</h1>
                {project.data.description && <p className="muted">{project.data.description}</p>}
              </div>
              <span className="spacer" />
              <span className="muted small project-meta">
                {project.data.members.length} member{project.data.members.length === 1 ? '' : 's'} · you are {project.data.role}
              </span>
              <button type="button" className="btn btn--ghost" onClick={() => setSettings(true)} data-testid="project-settings-button">
                Settings
              </button>
            </div>
            <Board project={project.data} />
            {settings && <ProjectSettingsDialog project={project.data} onClose={() => setSettings(false)} />}
          </>
        )}
      </main>

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
