import type { ProjectSummary } from '@tectonic/shared';
import { navigateToProject } from '../router.ts';

export function ProjectList({ projects, activeId, onCreate }: { projects: ProjectSummary[]; activeId: string | null; onCreate: () => void }) {
  return (
    <nav className="sidebar-nav" aria-label="Projects">
      <div className="sidebar-heading">
        <span>Projects</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCreate} data-testid="new-project">
          + New
        </button>
      </div>
      {projects.length === 0 ? (
        <p className="muted small sidebar-empty">No projects yet.</p>
      ) : (
        <ul className="project-list" data-testid="project-list">
          {projects.map((project) => {
            const progress = project.taskCount === 0 ? 0 : Math.round((project.doneCount / project.taskCount) * 100);
            return (
              <li key={project.id}>
                <a
                  href={`#/projects/${project.id}`}
                  className={`project-item${project.id === activeId ? ' project-item--active' : ''}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateToProject(project.id);
                  }}
                  aria-current={project.id === activeId ? 'page' : undefined}
                  data-testid="project-link"
                >
                  <span className="project-swatch" style={{ background: project.color }} aria-hidden="true" />
                  <span className="project-item-text">
                    <span className="project-item-name">{project.name}</span>
                    <span className="muted small">
                      {project.doneCount}/{project.taskCount} done · {project.role}
                    </span>
                  </span>
                  <span className="project-progress" aria-label={`${progress}% done`}>
                    <span style={{ width: `${progress}%`, background: project.color }} />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
