export function buildSchemePayload(state) {
  if (!state.loadedImage) {
    throw new Error('当前没有可导出的切图方案');
  }

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    fileName: state.loadedImage.file.name,
    imageWidth: state.loadedImage.width,
    imageHeight: state.loadedImage.height,
    ratioValue: state.ratio.value,
    autoSnap: state.autoSnap,
    watermark: state.watermark,
    candidateCuts: state.candidateCuts.slice(0, 200),
    finalCuts: state.finalCuts.slice()
  };
}

export async function exportSchemeFile(state) {
  const payload = buildSchemePayload(state);
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json;charset=utf-8'
  });
  downloadBlob(blob, buildSchemeFileName(state.loadedImage.file.name));
}

export async function importSchemeFile(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  validateSchemePayload(payload);
  return payload;
}

function validateSchemePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('切图方案文件无效');
  }
  if (!Array.isArray(payload.finalCuts) || typeof payload.ratioValue !== 'string') {
    throw new Error('切图方案缺少必要字段');
  }
}

function buildSchemeFileName(fileName) {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return `${baseName}-cuts.json`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
