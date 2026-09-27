import { TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, type ProjectMember, type Task, type TaskStatus } from '@tectonic/shared';
import { Avatar } from './Avatar.tsx';

export interface TaskCardProps {
  task: Task;
  members: ProjectMember[];
  canEdit: boolean;
  changed: boolean;
  onOpen: () => void;
  onMove: (status: TaskStatus) => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

export function TaskCard({ task, members, canEdit, changed, onOpen, onMove, onDragStart, onDragEnd, onDragOver, onDrop }: TaskCardProps) {
  const assignee = members.find((m) => m.userId === task.assigneeId)?.user ?? null;
  return (
    <article
      className={`task-card priority-${task.priority}${changed ? ' task-card--changed' : ''}`}
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid="task-card"
      data-task-id={task.id}
      data-status={task.status}
    >
      <button type="button" className="task-open" onClick={onOpen} aria-label={`Open task ${task.title}`}>
        <span className="task-title">{task.title}</span>
        {task.description && <span className="task-desc muted small">{task.description}</span>}
      </button>
      <footer className="task-footer">
        <span className={`chip chip--priority-${task.priority}`}>{TASK_PRIORITY_LABELS[task.priority]}</span>
        {canEdit && (
          <label className="task-move" title="Move to column">
            <span className="sr-only">Move to</span>
            <select value={task.status} onChange={(e) => onMove(e.target.value as TaskStatus)} data-testid="task-move" aria-label={`Move ${task.title} to`}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        {assignee ? <Avatar name={assignee.name} color={assignee.color} size={24} title={`Assigned to ${assignee.name}`} /> : <span className="avatar avatar--empty" title="Unassigned" aria-label="Unassigned" />}
      </footer>
    </article>
  );
}
