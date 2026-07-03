import test from 'node:test';
import assert from 'node:assert/strict';
import { getExportSlices, prefixExportFileNames } from './export-flow.js';
import { buildHistorySummary, getSessionUiState, resolveTaskId } from './session-utils.js';
import { buildRetriedTask, getTaskRemovalState } from './task-flow.js';

function makeTask(overrides = {}) {
  return {
    id: 'task-a',
    loadedImage: {
      file: { name: 'chat.png' },
      width: 1080,
      height: 4200,
      dataUrl: 'data:image/png;base64,abc'
    },
    ratio: { value: '3:4', width: 3, height: 4 },
    candidateCuts: [{ y: 1300, score: 8 }],
    finalCuts: [1400, 2800],
    history: [[1400, 2800]],
    historyIndex: 0,
    selectedSliceIndex: 1,
    analysisPending: false,
    errorMessage: '',
    exportProgress: null,
    zoom: 1.25,
    ...overrides
  };
}

test('历史恢复后可生成新任务 ID、恢复界面设置并参与导出命名', () => {
  const task = makeTask();
  const historyRecord = buildHistorySummary(
    {
      fileName: task.loadedImage.file.name,
      imageWidth: task.loadedImage.width,
      imageHeight: task.loadedImage.height,
      ratioValue: task.ratio.value,
      autoSnap: false,
      watermark: true,
      selectedSliceIndex: task.selectedSliceIndex,
      candidateCuts: task.candidateCuts,
      finalCuts: task.finalCuts,
      history: task.history,
      historyIndex: task.historyIndex,
      zoom: task.zoom,
      imageDataUrl: task.loadedImage.dataUrl,
      previewDataUrl: 'data:image/png;base64,preview'
    },
    { savedAt: '2026-06-28T00:00:00.000Z' }
  );

  const restoredUi = getSessionUiState(historyRecord, { autoSnap: true, watermark: false });
  const restoredTaskId = resolveTaskId(historyRecord, {
    preserveExistingId: false,
    createTaskId: () => 'task-restored'
  });
  const namedFiles = prefixExportFileNames(
    [{ name: 'slice-1.png', blob: {} }],
    historyRecord.fileName,
    (name) => name.replace(/\.[^.]+$/, '')
  );

  assert.deepEqual(restoredUi, { autoSnap: false, watermark: true });
  assert.equal(restoredTaskId, 'task-restored');
  assert.equal(namedFiles[0].name, 'chat-slice-1.png');
});

test('重试识别后可直接生成新的切片集合用于导出', () => {
  const task = makeTask({
    candidateCuts: [],
    finalCuts: [1200],
    history: [[1200]],
    errorMessage: '需要重试',
    analysisPending: true
  });

  const retriedTask = buildRetriedTask(
    task,
    [{ y: 1380, score: 10 }, { y: 2790, score: 9 }],
    ({ candidateCuts }) => candidateCuts.map((item) => item.y)
  );

  const slices = getExportSlices({
    loadedImage: retriedTask.loadedImage,
    finalCuts: retriedTask.finalCuts,
    getSlices: (height, cuts) => cuts.map((cut, index) => ({ index, cut, height }))
  });

  assert.deepEqual(retriedTask.finalCuts, [1380, 2790]);
  assert.deepEqual(retriedTask.history, [[1380, 2790]]);
  assert.equal(retriedTask.errorMessage, '');
  assert.equal(retriedTask.analysisPending, false);
  assert.deepEqual(slices, [
    { index: 0, cut: 1380, height: 4200 },
    { index: 1, cut: 2790, height: 4200 }
  ]);
});

test('删除当前任务后会回退到剩余任务，并保留批量导出所需文件名语义', () => {
  const tasks = [
    makeTask({ id: 'task-a', loadedImage: { file: { name: 'a.png' }, width: 1080, height: 3200, dataUrl: 'a' } }),
    makeTask({ id: 'task-b', loadedImage: { file: { name: 'b.png' }, width: 1080, height: 4200, dataUrl: 'b' } }),
    makeTask({ id: 'task-c', loadedImage: { file: { name: 'c.png' }, width: 1080, height: 5200, dataUrl: 'c' } })
  ];

  const removal = getTaskRemovalState({
    tasks,
    activeTaskId: 'task-b',
    taskId: 'task-b'
  });

  const fallbackTask = removal.nextTasks.find((task) => task.id === removal.nextActiveTaskId);
  const namedFiles = prefixExportFileNames(
    [{ name: 'slice-1.png', blob: {} }],
    fallbackTask.loadedImage.file.name,
    (name) => name.replace(/\.[^.]+$/, '')
  );

  assert.equal(removal.shouldClearAll, false);
  assert.equal(removal.nextActiveTaskId, 'task-c');
  assert.equal(fallbackTask.loadedImage.file.name, 'c.png');
  assert.equal(namedFiles[0].name, 'c-slice-1.png');
});
