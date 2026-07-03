import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canBatchExport,
  canExportTask,
  getBatchExportButtonText,
  getTaskStatusClass,
  getTaskStatusText
} from './task-utils.js';

test('getTaskStatusText 优先显示导出进度', () => {
  const text = getTaskStatusText({
    exportProgress: { current: 2, total: 5 },
    analysisPending: true,
    errorMessage: '失败'
  });
  assert.equal(text, '导出中 2/5');
});

test('getTaskStatusText 在无异常时返回就绪', () => {
  assert.equal(getTaskStatusText({}), '就绪');
});

test('getTaskStatusClass 对错误和忙碌状态返回对应样式', () => {
  assert.equal(getTaskStatusClass({ errorMessage: '失败' }), 'is-error');
  assert.equal(getTaskStatusClass({ analysisPending: true }), 'is-busy');
  assert.equal(getTaskStatusClass({}), '');
});

test('canExportTask 只允许已加载且未忙碌的任务', () => {
  assert.equal(canExportTask({ loadedImage: {}, analysisPending: false, exportProgress: null }), true);
  assert.equal(canExportTask({ loadedImage: null, analysisPending: false, exportProgress: null }), false);
  assert.equal(canExportTask({ loadedImage: {}, analysisPending: true, exportProgress: null }), false);
  assert.equal(canExportTask({ loadedImage: {}, analysisPending: false, exportProgress: { current: 1, total: 2 } }), false);
});

test('canBatchExport 仅在多任务且未忙碌时允许', () => {
  assert.equal(
    canBatchExport({ tasks: [{ loadedImage: {} }, { loadedImage: {} }], exportProgress: null, bulkImportPending: false }),
    true
  );
  assert.equal(canBatchExport({ tasks: [{ loadedImage: {} }], exportProgress: null, bulkImportPending: false }), false);
  assert.equal(
    canBatchExport({
      tasks: [{ loadedImage: {} }, { loadedImage: {} }],
      exportProgress: { current: 1, total: 3 },
      bulkImportPending: false
    }),
    false
  );
  assert.equal(
    canBatchExport({ tasks: [{ loadedImage: {} }, { loadedImage: {} }], exportProgress: null, bulkImportPending: true }),
    false
  );
  assert.equal(
    canBatchExport({
      tasks: [{ loadedImage: {} }, { loadedImage: {}, analysisPending: true }],
      exportProgress: null,
      bulkImportPending: false
    }),
    false
  );
});

test('getBatchExportButtonText 根据导出状态切换文案', () => {
  assert.equal(getBatchExportButtonText({ exportProgress: null }), '导出全部任务');
  assert.equal(getBatchExportButtonText({ exportProgress: { current: 1, total: 3 } }), '任务导出中');
});
