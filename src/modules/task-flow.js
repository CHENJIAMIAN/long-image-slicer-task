export function findTaskById(tasks, taskId) {
  return tasks.find((item) => item.id === taskId) ?? null;
}

export function getHistoryRecord(historyItems, id) {
  return historyItems.find((item) => item.id === id) ?? null;
}

export function getSwitchTargetTask({ tasks, activeTaskId, taskId }) {
  if (!taskId || taskId === activeTaskId) {
    return null;
  }

  return findTaskById(tasks, taskId);
}

export function buildRetriedTask(task, candidateCuts, buildFinalCuts) {
  const finalCuts = buildFinalCuts({
    imageHeight: task.loadedImage.height,
    imageWidth: task.loadedImage.width,
    ratio: task.ratio,
    candidateCuts,
    manualCuts: []
  });

  return {
    ...task,
    candidateCuts,
    finalCuts,
    history: [finalCuts.slice()],
    historyIndex: 0,
    selectedSliceIndex: 0,
    errorMessage: '',
    analysisPending: false
  };
}

export function getTaskRemovalState({ tasks, activeTaskId, taskId }) {
  const index = tasks.findIndex((item) => item.id === taskId);
  if (index < 0) {
    return null;
  }

  const nextTasks = tasks.slice();
  const [removedTask] = nextTasks.splice(index, 1);

  return {
    removedTask,
    nextTasks,
    shouldClearAll: nextTasks.length === 0,
    nextActiveTaskId:
      activeTaskId === taskId ? nextTasks[Math.min(index, nextTasks.length - 1)]?.id ?? null : activeTaskId
  };
}
