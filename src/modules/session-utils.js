export function buildPersistedTask(task, options = {}) {
  const finalCuts = Array.isArray(task.finalCuts) ? task.finalCuts.slice() : [];
  const history = sanitizeHistory(task.history, finalCuts);
  const historyIndex = clampHistoryIndex(task.historyIndex, history.length);

  return {
    id: task.id,
    fileName: task.loadedImage.file.name,
    imageWidth: task.loadedImage.width,
    imageHeight: task.loadedImage.height,
    imageDataUrl: task.loadedImage.dataUrl,
    previewDataUrl: options.previewDataUrl || '',
    ratioValue: task.ratio.value,
    autoSnap: options.autoSnap ?? true,
    watermark: options.watermark ?? false,
    selectedSliceIndex: task.selectedSliceIndex ?? 0,
    candidateCuts: Array.isArray(task.candidateCuts) ? task.candidateCuts.slice(0, 200) : [],
    finalCuts,
    history,
    historyIndex,
    zoom: task.zoom ?? 1
  };
}

export function buildHistorySummary(session, options = {}) {
  return {
    id: buildHistoryId(session),
    savedAt: options.savedAt || new Date().toISOString(),
    fileName: session.fileName,
    imageWidth: session.imageWidth,
    imageHeight: session.imageHeight,
    ratioValue: session.ratioValue,
    autoSnap: session.autoSnap,
    watermark: session.watermark,
    selectedSliceIndex: session.selectedSliceIndex ?? 0,
    candidateCuts: Array.isArray(session.candidateCuts) ? session.candidateCuts.slice(0, 120) : [],
    finalCuts: Array.isArray(session.finalCuts) ? session.finalCuts.slice() : [],
    history: sanitizeHistory(session.history, session.finalCuts),
    historyIndex: clampHistoryIndex(session.historyIndex, sanitizeHistory(session.history, session.finalCuts).length),
    zoom: session.zoom ?? 1,
    imageDataUrl: session.imageDataUrl,
    previewDataUrl: session.previewDataUrl || ''
  };
}

export function sanitizeHistory(history, finalCuts = []) {
  if (!Array.isArray(history) || !history.length) {
    return [Array.isArray(finalCuts) ? finalCuts.slice() : []];
  }

  const normalized = history
    .filter((entry) => Array.isArray(entry))
    .map((entry) => entry.slice());

  return normalized.length ? normalized : [Array.isArray(finalCuts) ? finalCuts.slice() : []];
}

export function clampHistoryIndex(historyIndex, historyLength) {
  if (!historyLength) {
    return 0;
  }

  const numericIndex = Number.isInteger(historyIndex) ? historyIndex : historyLength - 1;
  return Math.max(0, Math.min(numericIndex, historyLength - 1));
}

export function getSessionUiState(session, defaults = {}) {
  return {
    autoSnap: session?.autoSnap ?? defaults.autoSnap ?? true,
    watermark: session?.watermark ?? defaults.watermark ?? false
  };
}

export function resolveTaskId(session, options = {}) {
  if (options.preserveExistingId && session?.id) {
    return session.id;
  }

  return options.createTaskId();
}

function buildHistoryId(session) {
  return [
    session.fileName,
    session.imageWidth,
    session.imageHeight,
    session.ratioValue,
    session.finalCuts?.join('-') || 'empty'
  ].join('|');
}
