import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRetriedTask,
  findTaskById,
  getHistoryRecord,
  getSwitchTargetTask,
  getTaskRemovalState
} from './task-flow.js';

test('findTaskById 返回匹配任务或 null', () => {
  const tasks = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(findTaskById(tasks, 'b'), { id: 'b' });
  assert.equal(findTaskById(tasks, 'x'), null);
});

test('getHistoryRecord 返回匹配历史记录或 null', () => {
  const items = [{ id: 'h1' }, { id: 'h2' }];
  assert.deepEqual(getHistoryRecord(items, 'h2'), { id: 'h2' });
  assert.equal(getHistoryRecord(items, 'h3'), null);
});

test('getSwitchTargetTask 会忽略无效切换并返回目标任务', () => {
  const tasks = [{ id: 'a' }, { id: 'b' }];
  assert.equal(getSwitchTargetTask({ tasks, activeTaskId: 'a', taskId: 'a' }), null);
  assert.equal(getSwitchTargetTask({ tasks, activeTaskId: 'a', taskId: '' }), null);
  assert.deepEqual(getSwitchTargetTask({ tasks, activeTaskId: 'a', taskId: 'b' }), { id: 'b' });
});

test('buildRetriedTask 会重置重试后的任务状态', () => {
  const task = {
    id: 'task-1',
    loadedImage: { width: 1080, height: 4200 },
    ratio: { value: '3:4', width: 3, height: 4 },
    candidateCuts: [],
    finalCuts: [1400],
    history: [[1400]],
    historyIndex: 0,
    selectedSliceIndex: 1,
    errorMessage: '失败',
    analysisPending: true
  };

  const next = buildRetriedTask(
    task,
    [{ y: 1390, score: 10 }],
    ({ candidateCuts }) => candidateCuts.map((item) => item.y)
  );

  assert.deepEqual(next.candidateCuts, [{ y: 1390, score: 10 }]);
  assert.deepEqual(next.finalCuts, [1390]);
  assert.deepEqual(next.history, [[1390]]);
  assert.equal(next.historyIndex, 0);
  assert.equal(next.selectedSliceIndex, 0);
  assert.equal(next.errorMessage, '');
  assert.equal(next.analysisPending, false);
});

test('getTaskRemovalState 会返回移除后的任务列表和回退目标', () => {
  const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  const removedActive = getTaskRemovalState({ tasks, activeTaskId: 'b', taskId: 'b' });
  assert.deepEqual(
    removedActive,
    {
      removedTask: { id: 'b' },
      nextTasks: [{ id: 'a' }, { id: 'c' }],
      shouldClearAll: false,
      nextActiveTaskId: 'c'
    }
  );

  const removedLast = getTaskRemovalState({ tasks: [{ id: 'a' }], activeTaskId: 'a', taskId: 'a' });
  assert.equal(removedLast.shouldClearAll, true);
  assert.equal(removedLast.nextActiveTaskId, null);
});
