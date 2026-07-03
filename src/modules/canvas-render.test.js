import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXPORT_WIDTH } from './constants.js';
import { createHistoryPreviewDataUrl, drawThumbnail, exportSlices } from './canvas-render.js';

function installCanvasMock() {
  const records = [];
  const originalDocument = globalThis.document;

  globalThis.document = {
    createElement(tagName) {
      if (tagName !== 'canvas') {
        throw new Error(`unexpected element: ${tagName}`);
      }

      const record = {
        width: 0,
        height: 0,
        drawImageCalls: [],
        fillTextCalls: [],
        toBlobCalls: []
      };

      const context = {
        fillStyle: '',
        strokeStyle: '',
        font: '',
        textAlign: '',
        lineWidth: 0,
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        drawImage(...args) {
          record.drawImageCalls.push(args);
        },
        fillText(...args) {
          record.fillTextCalls.push(args);
        }
      };

      const canvas = {
        get width() {
          return record.width;
        },
        set width(value) {
          record.width = value;
        },
        get height() {
          return record.height;
        },
        set height(value) {
          record.height = value;
        },
        getContext() {
          return context;
        },
        toBlob(callback, type) {
          record.toBlobCalls.push({ type, width: record.width, height: record.height });
          callback(new Blob([JSON.stringify({ width: record.width, height: record.height })], { type }));
        },
        toDataURL(type) {
          return `data:${type};base64,preview`;
        }
      };

      records.push(record);
      return canvas;
    }
  };

  return {
    records,
    restore() {
      globalThis.document = originalDocument;
    }
  };
}

test('exportSlices 会生成对应数量的 PNG 文件并上报进度', async () => {
  const { records, restore } = installCanvasMock();

  try {
    const progress = [];
    const files = await exportSlices({
      image: { naturalWidth: 1080 },
      slices: [
        { start: 0, end: 1200, height: 1200 },
        { start: 1200, end: 2600, height: 1400 }
      ],
      ratio: { width: 3, height: 4 },
      addWatermark: false,
      onProgress(current, total) {
        progress.push({ current, total });
      }
    });

    assert.deepEqual(
      files.map((file) => file.name),
      ['slice-01.png', 'slice-02.png']
    );
    assert.ok(files.every((file) => file.blob.type === 'image/png'));
    assert.deepEqual(progress, [
      { current: 1, total: 2 },
      { current: 2, total: 2 }
    ]);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0].drawImageCalls[0], [
      { naturalWidth: 1080 },
      0,
      0,
      1080,
      1200,
      0,
      0,
      DEFAULT_EXPORT_WIDTH,
      1440
    ]);
    assert.deepEqual(records[1].drawImageCalls[0], [
      { naturalWidth: 1080 },
      0,
      1200,
      1080,
      1400,
      0,
      0,
      DEFAULT_EXPORT_WIDTH,
      1440
    ]);
    assert.ok(records.every((record) => record.toBlobCalls[0].width === DEFAULT_EXPORT_WIDTH));
    assert.ok(records.every((record) => record.toBlobCalls[0].height === 1440));
  } finally {
    restore();
  }
});

test('exportSlices 在启用水印时写入序号文案', async () => {
  const { records, restore } = installCanvasMock();

  try {
    await exportSlices({
      image: { naturalWidth: 1080 },
      slices: [{ start: 0, end: 1200, height: 1200 }],
      ratio: { width: 3, height: 4 },
      addWatermark: true
    });

    assert.deepEqual(records[0].fillTextCalls, [['1/1', DEFAULT_EXPORT_WIDTH - 28, 1440 - 26]]);
  } finally {
    restore();
  }
});

test('drawThumbnail 会按切片区间映射原图到固定缩略尺寸', () => {
  const drawCalls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        clearRect() {},
        fillRect() {},
        set fillStyle(value) {
          this._fillStyle = value;
        },
        drawImage(...args) {
          drawCalls.push(args);
        }
      };
    }
  };

  drawThumbnail(canvas, { naturalWidth: 1080 }, { start: 300, end: 1500 });

  assert.equal(canvas.width, 220);
  assert.equal(canvas.height, Math.round(220 * (4 / 3)));
  assert.deepEqual(drawCalls[0], [
    { naturalWidth: 1080 },
    0,
    300,
    1080,
    1200,
    0,
    0,
    220,
    Math.round(220 * (4 / 3))
  ]);
});

test('createHistoryPreviewDataUrl 会按整图高度绘制并返回 webp 预览', () => {
  const { records, restore } = installCanvasMock();

  try {
    const url = createHistoryPreviewDataUrl(
      { naturalWidth: 1080, naturalHeight: 4000 },
      [1000, 2600]
    );

    assert.equal(url, 'data:image/webp;base64,preview');
    assert.deepEqual(records[0].drawImageCalls[0], [
      { naturalWidth: 1080, naturalHeight: 4000 },
      0,
      0,
      1080,
      4000,
      0,
      0,
      128,
      170
    ]);
  } finally {
    restore();
  }
});
