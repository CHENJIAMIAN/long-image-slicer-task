import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseLoadedImages, revokeLoadedImage } from './image-loader.js';

test('revokeLoadedImage 会撤销 URL 并断开图片资源', () => {
  const revoked = [];
  const original = globalThis.URL;
  globalThis.URL = {
    ...original,
    revokeObjectURL(url) {
      revoked.push(url);
    }
  };

  const loaded = {
    url: 'blob:test-image',
    image: { src: 'blob:test-image' }
  };

  revokeLoadedImage(loaded);

  assert.deepEqual(revoked, ['blob:test-image']);
  assert.equal(loaded.image.src, '');
  globalThis.URL = original;
});

test('releaseLoadedImages 会按 url 去重，避免重复释放同一资源', () => {
  const revoked = [];
  const original = globalThis.URL;
  globalThis.URL = {
    ...original,
    revokeObjectURL(url) {
      revoked.push(url);
    }
  };

  const shared = { url: 'blob:shared', image: { src: 'blob:shared' } };
  releaseLoadedImages([shared, shared, { url: 'blob:other', image: { src: 'blob:other' } }]);

  assert.deepEqual(revoked, ['blob:shared', 'blob:other']);
  globalThis.URL = original;
});
