import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBatchExportSuccessMessage,
  getExportSuccessMessage,
  getExportSlices,
  prefixExportFileNames
} from './export-flow.js';

test('getExportSlices 在无图片时返回空数组', () => {
  assert.deepEqual(getExportSlices({ loadedImage: null, finalCuts: [], getSlices: () => [1] }), []);
});

test('getExportSlices 使用图片高度和切点生成切片', () => {
  const slices = getExportSlices({
    loadedImage: { height: 4000 },
    finalCuts: [1200, 2500],
    getSlices: (height, cuts) => [{ height, cuts }]
  });
  assert.deepEqual(slices, [{ height: 4000, cuts: [1200, 2500] }]);
});

test('prefixExportFileNames 会按源文件名前缀重命名', () => {
  const files = prefixExportFileNames(
    [{ name: 'slice-1.png', blob: {} }, { name: 'slice-2.png', blob: {} }],
    'demo.long.png',
    (name) => name.replace(/\.[^.]+$/, '')
  );

  assert.deepEqual(
    files.map((item) => item.name),
    ['demo.long-slice-1.png', 'demo.long-slice-2.png']
  );
});

test('getExportSuccessMessage 区分图片下载和 ZIP 打包文案', () => {
  const files = [{}, {}, {}];

  assert.equal(getExportSuccessMessage(files, 'images'), '已保存 3 张图片');
  assert.equal(getExportSuccessMessage(files, 'zip'), '已打包 3 张图片');
});

test('getBatchExportSuccessMessage 返回批量双导出提示文案', () => {
  const tasks = [{ id: 'a' }, { id: 'b' }];
  const files = [{}, {}, {}, {}];

  assert.equal(getBatchExportSuccessMessage(tasks, files, 'images'), '已下载 2 个任务，共 4 张图片');
  assert.equal(getBatchExportSuccessMessage(tasks, files, 'zip'), '已打包 2 个任务，共 4 张图片');
});
