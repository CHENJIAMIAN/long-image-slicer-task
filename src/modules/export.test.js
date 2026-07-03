import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from './export.js';

function readZipLocalEntries(bytes) {
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }

    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 22, true);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + size;

    entries.push({
      name: decoder.decode(bytes.slice(nameStart, nameEnd)),
      size
    });

    offset = dataEnd;
  }

  return entries;
}

test('buildZip 会生成包含本地文件头和结束记录的 zip', async () => {
  const zip = await buildZip([
    {
      name: 'slice-1.png',
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
    }
  ]);

  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);

  assert.equal(zip.type, 'application/zip');
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.ok(bytes.length > 22);
});

test('buildZip 会把多个文件名写入 zip 内容', async () => {
  const zip = await buildZip([
    {
      name: 'chat-slice-1.png',
      blob: new Blob([new Uint8Array([1, 2])], { type: 'image/png' })
    },
    {
      name: 'chat-slice-2.png',
      blob: new Blob([new Uint8Array([3, 4, 5])], { type: 'image/png' })
    }
  ]);

  const text = new TextDecoder().decode(await zip.arrayBuffer());

  assert.match(text, /chat-slice-1\.png/);
  assert.match(text, /chat-slice-2\.png/);
});

test('buildZip 会按输入顺序写入文件条目和大小', async () => {
  const zip = await buildZip([
    {
      name: '001-cover.png',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    },
    {
      name: '002-body.png',
      blob: new Blob([new Uint8Array([4, 5, 6, 7, 8])], { type: 'image/png' })
    }
  ]);

  const bytes = new Uint8Array(await zip.arrayBuffer());
  const entries = readZipLocalEntries(bytes);

  assert.deepEqual(entries, [
    { name: '001-cover.png', size: 3 },
    { name: '002-body.png', size: 5 }
  ]);
});
