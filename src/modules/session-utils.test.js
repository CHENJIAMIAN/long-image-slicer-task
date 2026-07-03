import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHistorySummary,
  buildPersistedTask,
  clampHistoryIndex,
  getSessionUiState,
  resolveTaskId,
  sanitizeHistory
} from './session-utils.js';

test('sanitizeHistory 在缺失历史时回退到 finalCuts', () => {
  assert.deepEqual(sanitizeHistory(null, [120, 280]), [[120, 280]]);
});

test('clampHistoryIndex 会把索引限制在合法范围', () => {
  assert.equal(clampHistoryIndex(5, 2), 1);
  assert.equal(clampHistoryIndex(-1, 2), 0);
  assert.equal(clampHistoryIndex(undefined, 3), 2);
});

test('getSessionUiState 会从会话恢复界面设置', () => {
  assert.deepEqual(getSessionUiState({ autoSnap: false, watermark: true }), {
    autoSnap: false,
    watermark: true
  });
});

test('buildPersistedTask 会保留历史栈和缩放信息', () => {
  const snapshot = buildPersistedTask(
    {
      id: 'task-1',
      loadedImage: {
        file: { name: 'demo.png' },
        width: 1080,
        height: 4000,
        dataUrl: 'data:image/png;base64,abc'
      },
      ratio: { value: '3:4' },
      candidateCuts: [{ y: 1400 }, { y: 2800 }],
      finalCuts: [1380, 2790],
      history: [[1400, 2800], [1380, 2790]],
      historyIndex: 1,
      selectedSliceIndex: 2,
      zoom: 1.5
    },
    {
      autoSnap: false,
      watermark: true,
      previewDataUrl: 'data:image/png;base64,preview'
    }
  );

  assert.deepEqual(snapshot.history, [[1400, 2800], [1380, 2790]]);
  assert.equal(snapshot.historyIndex, 1);
  assert.equal(snapshot.zoom, 1.5);
  assert.equal(snapshot.autoSnap, false);
  assert.equal(snapshot.watermark, true);
});

test('buildHistorySummary 会保留恢复历史所需的状态', () => {
  const summary = buildHistorySummary(
    {
      fileName: 'demo.png',
      imageWidth: 1080,
      imageHeight: 4000,
      ratioValue: '3:4',
      autoSnap: false,
      watermark: true,
      selectedSliceIndex: 1,
      candidateCuts: [{ y: 100 }, { y: 200 }],
      finalCuts: [1500, 2900],
      history: [[1500], [1500, 2900]],
      historyIndex: 1,
      zoom: 2,
      imageDataUrl: 'data:image/png;base64,abc',
      previewDataUrl: 'data:image/png;base64,preview'
    },
    { savedAt: '2026-06-28T00:00:00.000Z' }
  );

  assert.equal(summary.autoSnap, false);
  assert.equal(summary.watermark, true);
  assert.deepEqual(summary.history, [[1500], [1500, 2900]]);
  assert.equal(summary.historyIndex, 1);
  assert.equal(summary.zoom, 2);
  assert.equal(summary.savedAt, '2026-06-28T00:00:00.000Z');
});

test('resolveTaskId 只在明确要求时保留原任务 ID', () => {
  assert.equal(
    resolveTaskId({ id: 'task-old' }, { preserveExistingId: true, createTaskId: () => 'task-new' }),
    'task-old'
  );
  assert.equal(
    resolveTaskId({ id: 'task-old' }, { preserveExistingId: false, createTaskId: () => 'task-new' }),
    'task-new'
  );
});
