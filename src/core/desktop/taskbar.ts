export type TaskbarAlignment = 'left' | 'center';
export type TaskbarSearchMode = 'icon' | 'box';

export type TaskbarSettings = {
  searchMode: TaskbarSearchMode;
  taskView: boolean;
  widgets: boolean;
  resume: boolean;
  alignment: TaskbarAlignment;
  autoHide: boolean;
  badges: boolean;
};

export const DEFAULT_TASKBAR_SETTINGS: TaskbarSettings = {
  searchMode: 'box',
  taskView: true,
  widgets: false,
  resume: true,
  alignment: 'center',
  autoHide: false,
  badges: true,
};

export function normalizeTaskbarSettings(value: Partial<TaskbarSettings> | null | undefined): TaskbarSettings {
  return { ...DEFAULT_TASKBAR_SETTINGS, ...(value || {}) };
}
