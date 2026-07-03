import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportErrorMessage, buildImportResultMessage, createTaskFromFile, importTasksFromFiles } from './import-flow.js';

test('createTaskFromFile 在识别失败时会释放已加载资源', async () => {
  const revoked = [];
  const original = globalThis.URL;
  globalThis.URL = {
    ...original,
    revokeObjectURL(url) {
      revoked.push(url);
    }
  };

  await assert.rejects(
    createTaskFromFile(
      { name: 'bad.png', type: 'image/png' },
      {
        loadImageFromFile: async (file) => ({
          file,
          image: { src: 'blob:test' },
          url: 'blob:test',
          dataUrl: 'data:image/png;base64,abc',
          width: 1080,
          height: 4000
        }),
        computeCuts: async () => {
          throw new Error('识别失败');
        },
        buildFinalCuts: () => [],
        defaultRatio: { value: '3:4', width: 3, height: 4 },
        createTaskId: () => 'task-1'
      }
    ),
    /识别失败/
  );

  assert.deepEqual(revoked, ['blob:test']);
  globalThis.URL = original;
});

test('importTasksFromFiles 会保留成功任务并收集失败项', async () => {
  const files = [{ name: 'ok.png' }, { name: 'bad.png' }, { name: 'ok-2.png' }];
  const result = await importTasksFromFiles(files, async (file) => {
    if (file.name === 'bad.png') {
      throw new Error('图片加载失败');
    }
    return { id: file.name };
  });

  assert.deepEqual(result.importedTasks, [{ id: 'ok.png' }, { id: 'ok-2.png' }]);
  assert.deepEqual(result.errors, [{ fileName: 'bad.png', message: '图片加载失败' }]);
});

test('buildImportResultMessage 返回导入结果提示', () => {
  assert.equal(buildImportResultMessage([{ id: 1 }], []), '已导入 1 张长图');
  assert.equal(buildImportResultMessage([{ id: 1 }], [{ fileName: 'bad.png', message: '失败' }]), '已导入 1 张，另有 1 张失败');
  assert.equal(buildImportResultMessage([], [{ fileName: 'bad.png', message: '失败' }]), '');
});

test('buildImportErrorMessage 返回用户可见的失败提示', () => {
  assert.equal(buildImportErrorMessage([]), '');
  assert.equal(buildImportErrorMessage([{ fileName: 'bad.png', message: '图片加载失败' }]), 'bad.png：图片加载失败');
  assert.equal(
    buildImportErrorMessage([
      { fileName: 'bad.png', message: '图片加载失败' },
      { fileName: 'bad-2.png', message: '识别失败' }
    ]),
    'bad.png：图片加载失败；另有 1 张失败'
  );
});
