export function canExportTask(task) {
  return Boolean(task?.loadedImage) && !task?.analysisPending && !task?.exportProgress;
}

export function getTaskStatusText(task) {
  if (task.exportProgress) {
    return `导出中 ${task.exportProgress.current}/${task.exportProgress.total}`;
  }
  if (task.analysisPending) {
    return '识别切点中';
  }
  if (task.errorMessage) {
    return task.errorMessage;
  }
  return '就绪';
}

export function getTaskStatusClass(task) {
  if (task.errorMessage) {
    return 'is-error';
  }
  if (task.exportProgress || task.analysisPending) {
    return 'is-busy';
  }
  return '';
}

export function canBatchExport({ tasks, exportProgress, bulkImportPending }) {
  const exportableTasks = tasks.filter(canExportTask);
  return exportableTasks.length > 1 && !exportProgress && !bulkImportPending;
}

export function getBatchExportButtonText({ exportProgress }) {
  if (exportProgress) {
    return '任务导出中';
  }
  return '导出全部任务';
}
