import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, type ProjectDetail, type Task, type TaskPriority, type TaskStatus } from '@tectonic/shared';
import { useState, type FormEvent } from 'react';
import { useCreateTask, useDeleteTask, useUpdateTask } from '../lib/queries.ts';
import { Dialog } from './Dialog.tsx';
import { useToasts } from './Toasts.tsx';

export interface TaskDialogProps {
  project: ProjectDetail;
  task?: Task;
  initialStatus?: TaskStatus;
  canEdit: boolean;
  onClose: () => void;
}

export function TaskDialog({ project, task, initialStatus, canEdit, onClose }: TaskDialogProps) {
  const toasts = useToasts();
  const create = useCreateTask(project.id);
  const update = useUpdateTask(project.id);
  const remove = useDeleteTask(project.id);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? initialStatus ?? 'backlog');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError('Give the task a title.');
    setError(null);
    try {
      if (task) {
        await update.mutateAsync({ taskId: task.id, input: { title, description, status, priority, assigneeId: assigneeId || null } });
        toasts.push({ kind: 'success', title: 'Task updated' });
      } else {
        await create.mutateAsync({ title, description, status, priority, assigneeId: assigneeId || null });
        toasts.push({ kind: 'success', title: 'Task created', message: `“${title.trim()}” added to ${TASK_STATUS_LABELS[status]}.` });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the task.');
    }
  };

  const confirmDelete = async () => {
    if (!task || !window.confirm(`Delete “${task.title}”?`)) return;
    try {
      await remove.mutateAsync(task.id);
      toasts.push({ kind: 'success', title: 'Task deleted' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the task.');
    }
  };

  return (
    <Dialog title={task ? (canEdit ? 'Edit task' : 'Task') : 'New task'} onClose={onClose} testId="task-dialog">
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Title</span>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
            maxLength={200}
            disabled={!canEdit}
            data-testid="task-title"
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional details" disabled={!canEdit} data-testid="task-description" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Status</span>
            <select name="status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} disabled={!canEdit} data-testid="task-status">
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select name="priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} disabled={!canEdit} data-testid="task-priority">
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Assignee</span>
            <select name="assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={!canEdit} data-testid="task-assignee">
              <option value="">Unassigned</option>
              {project.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="dialog-actions">
          {task && canEdit && (
            <button type="button" className="btn btn--danger-ghost" onClick={confirmDelete} disabled={busy} data-testid="task-delete">
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button type="submit" className="btn btn--primary" disabled={busy} data-testid="task-save">
              {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}
