import { MEMBER_ROLES, type MemberRole, type ProjectDetail } from '@tectonic/shared';
import { useState, type FormEvent } from 'react';
import { useSession } from '../auth/context.ts';
import { useAddMember, useCreateProject, useDeleteProject, useRemoveMember, useUpdateProject, useUsers } from '../lib/queries.ts';
import { navigateToProject } from '../router.ts';
import { Avatar } from './Avatar.tsx';
import { Dialog } from './Dialog.tsx';
import { useToasts } from './Toasts.tsx';

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateProject();
  const toasts = useToasts();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Give the project a name.');
    try {
      const project = await create.mutateAsync({ name, description });
      toasts.push({ kind: 'success', title: 'Project created', message: `You are the owner of “${project.name}”.` });
      navigateToProject(project.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project.');
    }
  };

  return (
    <Dialog title="New project" onClose={onClose} testId="project-dialog">
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Demo day" autoFocus maxLength={80} data-testid="project-name" />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={create.isPending} data-testid="project-save">
            {create.isPending ? 'Creating…' : 'Create project'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export function ProjectSettingsDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const session = useSession();
  const toasts = useToasts();
  const users = useUsers();
  const update = useUpdateProject(project.id);
  const addMember = useAddMember(project.id);
  const removeMember = useRemoveMember(project.id);
  const deleteProject = useDeleteProject();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [newMember, setNewMember] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const isOwner = project.role === 'owner';
  const canEdit = project.role !== 'viewer';

  const candidates = (users.data ?? []).filter((u) => !project.members.some((m) => m.userId === u.id));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await update.mutateAsync({ name, description });
      toasts.push({ kind: 'success', title: 'Project updated' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the project.');
    }
  };

  const add = async () => {
    if (!newMember) return;
    try {
      await addMember.mutateAsync({ userId: newMember, role: newRole });
      setNewMember('');
      toasts.push({ kind: 'success', title: 'Member added' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the member.');
    }
  };

  const remove = async (userId: string) => {
    try {
      await removeMember.mutateAsync(userId);
      toasts.push({ kind: 'success', title: 'Member removed' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the member.');
    }
  };

  const destroy = async () => {
    if (!window.confirm(`Delete project “${project.name}” and all of its tasks? This cannot be undone.`)) return;
    try {
      await deleteProject.mutateAsync(project.id);
      toasts.push({ kind: 'success', title: 'Project deleted' });
      navigateToProject(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the project.');
    }
  };

  return (
    <Dialog title="Project settings" onClose={onClose} testId="project-settings">
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!canEdit} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={!canEdit} />
        </label>
        <section className="members">
          <h3>Members</h3>
          <ul className="member-list" data-testid="member-list">
            {project.members.map((m) => (
              <li key={m.userId} className="member">
                <Avatar name={m.user.name} color={m.user.color} size={26} />
                <span className="member-name">
                  {m.user.name}
                  {m.userId === session.user.id && <span className="muted small"> (you)</span>}
                </span>
                <span className={`chip chip--role-${m.role}`}>{m.role}</span>
                {isOwner && m.userId !== session.user.id && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(m.userId)} disabled={removeMember.isPending} aria-label={`Remove ${m.user.name}`}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isOwner && (
            <div className="member-add">
              <select value={newMember} onChange={(e) => setNewMember(e.target.value)} aria-label="User to add" data-testid="member-select">
                <option value="">Add a member…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as MemberRole)} aria-label="Role">
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" onClick={add} disabled={!newMember || addMember.isPending} data-testid="member-add">
                Add
              </button>
            </div>
          )}
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="dialog-actions">
          {isOwner && (
            <button type="button" className="btn btn--danger-ghost" onClick={destroy} disabled={deleteProject.isPending} data-testid="project-delete">
              Delete project
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button type="submit" className="btn btn--primary" disabled={update.isPending}>
              Save
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}
