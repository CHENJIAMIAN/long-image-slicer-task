export async function saveImageFiles(files) {
  if (!files.length) {
    return;
  }

  const shared = await tryShareFiles(files);
  if (shared) {
    return;
  }

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    downloadBlob(file.blob, file.name);
    await wait(index === 0 ? 320 : 220);
  }
}

export async function saveZipArchive(files, archiveName) {
  if (!files.length) {
    return;
  }

  const zip = await buildZip(files);
  downloadBlob(zip, archiveName);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function buildZip(files) {
  const entries = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const local = makeLocalHeader(nameBytes, crc, data.length);
    const directory = makeDirectoryHeader(nameBytes, crc, data.length, offset);
    entries.push(local, nameBytes, data);
    central.push(directory, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = makeEndRecord(files.length, centralSize, offset);
  return new Blob([...entries, ...central, end], { type: 'application/zip' });
}

const encoder = new TextEncoder();

function makeLocalHeader(nameBytes, crc, size) {
  const buffer = new ArrayBuffer(30);
  const view = new DataView(buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  return new Uint8Array(buffer);
}

function makeDirectoryHeader(nameBytes, crc, size, offset) {
  const buffer = new ArrayBuffer(46);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return new Uint8Array(buffer);
}

function makeEndRecord(count, centralSize, centralOffset) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return new Uint8Array(buffer);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function tryShareFiles(files) {
  if (!navigator.share || typeof File === 'undefined') {
    return false;
  }

  try {
    const shareFiles = files.map(
      (file) =>
        new File([file.blob], file.name, {
          type: file.blob.type || 'image/png'
        })
    );

    if (navigator.canShare && !navigator.canShare({ files: shareFiles })) {
      return false;
    }

    await navigator.share({
      files: shareFiles,
      title: '长图切片',
      text: `共 ${files.length} 张切片`
    });
    return true;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
