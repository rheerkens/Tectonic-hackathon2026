import { TASK_STATUSES, TASK_STATUS_LABELS, sortTasks, type ProjectDetail, type Task, type TaskStatus } from '@tectonic/shared';
import { useCallback, useMemo, useState } from 'react';
import { useUpdateTask } from '../lib/queries.ts';
import { useRealtime } from '../realtime/RealtimeProvider.tsx';
import { EmptyState } from './States.tsx';
import { TaskCard } from './TaskCard.tsx';
import { TaskDialog } from './TaskDialog.tsx';
import { useToasts } from './Toasts.tsx';

interface DragState {
  taskId: string;
  from: TaskStatus;
}

interface DialogState {
  task?: Task;
  status?: TaskStatus;
}

/** Position halfway between neighbours so a move is a single-row update. */
function positionBetween(before: Task | undefined, after: Task | undefined): number {
  if (!before && !after) return 1000;
  if (!before) return after!.position - 1000;
  if (!after) return before.position + 1000;
  return (before.position + after.position) / 2;
}

export function Board({ project }: { project: ProjectDetail }) {
  const canEdit = project.role !== 'viewer';
  const update = useUpdateTask(project.id);
  const toasts = useToasts();
  const { recentlyChanged } = useRealtime();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
    for (const task of sortTasks(project.tasks)) groups[task.status].push(task);
    return groups;
  }, [project.tasks]);

  const move = useCallback(
    async (task: Task, status: TaskStatus, position?: number) => {
      if (task.status === status && position === undefined) return;
      try {
        await update.mutateAsync({ taskId: task.id, input: { status, ...(position !== undefined ? { position } : {}) } });
        if (task.status !== status) toasts.push({ kind: 'success', title: `Moved to ${TASK_STATUS_LABELS[status]}`, message: task.title });
      } catch (error) {
        toasts.push({ kind: 'error', title: 'Could not move task', message: error instanceof Error ? error.message : undefined });
      }
    },
    [update, toasts],
  );

  const dropOn = (status: TaskStatus, beforeTask?: Task) => (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOver(null);
    const taskId = drag?.taskId ?? event.dataTransfer.getData('text/task-id');
    setDrag(null);
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task || !canEdit) return;
    const column = byStatus[status].filter((t) => t.id !== task.id);
    let position: number | undefined;
    if (beforeTask && beforeTask.id !== task.id) {
      const index = column.findIndex((t) => t.id === beforeTask.id);
      position = positionBetween(column[index - 1], column[index]);
    } else if (!beforeTask) {
      position = positionBetween(column[column.length - 1], undefined);
    }
    void move(task, status, position);
  };

  const allowDrop = (status: TaskStatus) => (event: React.DragEvent) => {
    if (!canEdit) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (over !== status) setOver(status);
  };

  return (
    <>
      {project.tasks.length === 0 && (
        <div className="board-empty">
          <EmptyState
            title="This board is empty"
            message={canEdit ? 'Add the first task to get things moving.' : 'Nothing here yet. You have view-only access.'}
            action={
              canEdit ? (
                <button type="button" className="btn btn--primary" onClick={() => setDialog({ status: 'backlog' })} data-testid="add-first-task">
                  Add a task
                </button>
              ) : undefined
            }
          />
        </div>
      )}
      <div className="board" data-testid="board">
        {TASK_STATUSES.map((status) => {
          const tasks = byStatus[status];
          return (
            <section
              key={status}
              className={`column column--${status}${over === status ? ' column--over' : ''}`}
              onDragOver={allowDrop(status)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null);
              }}
              onDrop={dropOn(status)}
              data-testid={`column-${status}`}
              aria-label={`${TASK_STATUS_LABELS[status]} column`}
            >
              <header className="column-header">
                <span className="column-dot" aria-hidden="true" />
                <h2>{TASK_STATUS_LABELS[status]}</h2>
                <span className="column-count" data-testid={`count-${status}`}>
                  {tasks.length}
                </span>
                {canEdit && (
                  <button type="button" className="btn btn--ghost btn--icon" onClick={() => setDialog({ status })} aria-label={`Add task to ${TASK_STATUS_LABELS[status]}`} data-testid={`add-${status}`}>
                    +
                  </button>
                )}
              </header>
              <div className="column-body">
                {tasks.length === 0 ? (
                  <div className="column-empty muted small">{canEdit ? 'Drop tasks here' : 'No tasks'}</div>
                ) : (
                  tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      members={project.members}
                      canEdit={canEdit}
                      changed={Boolean(recentlyChanged[task.id])}
                      onOpen={() => setDialog({ task })}
                      onMove={(next) => void move(task, next)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/task-id', task.id);
                        setDrag({ taskId: task.id, from: task.status });
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      onDragOver={allowDrop(status)}
                      onDrop={dropOn(status, task)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      {dialog && <TaskDialog project={project} task={dialog.task} initialStatus={dialog.status} canEdit={canEdit} onClose={() => setDialog(null)} />}
    </>
  );
}
