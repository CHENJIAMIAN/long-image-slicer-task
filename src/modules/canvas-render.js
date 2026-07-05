import { DEFAULT_EXPORT_WIDTH } from './constants.js';

export function drawThumbnail(canvas, image, slice) {
  const context = canvas.getContext('2d');
  const displayWidth = 220;
  const aspectRatio = 4 / 3;
  const displayHeight = Math.round(displayWidth * aspectRatio);
  canvas.width = displayWidth;
  canvas.height = displayHeight;

  context.clearRect(0, 0, displayWidth, displayHeight);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, displayWidth, displayHeight);

  const sourceHeight = slice.end - slice.start;
  const destinationWidth = displayWidth;
  const destinationHeight = displayHeight;

  context.drawImage(
    image,
    0,
    slice.start,
    image.naturalWidth,
    sourceHeight,
    0,
    0,
    destinationWidth,
    destinationHeight
  );
}

export function createHistoryPreviewDataUrl(image, cuts = []) {
  const canvas = document.createElement('canvas');
  const width = 128;
  const height = 170;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  const sourceHeight = image.naturalHeight;
  context.drawImage(image, 0, 0, image.naturalWidth, sourceHeight, 0, 0, width, height);

  context.fillStyle = 'rgba(58, 117, 255, 0.22)';
  context.strokeStyle = 'rgba(255, 77, 79, 0.9)';
  context.lineWidth = 1.5;

  for (const cut of cuts) {
    const y = (cut / image.naturalHeight) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const url = canvas.toDataURL('image/webp', 0.82);
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

export function createSlicePreviewDataUrl(image, slice) {
  const canvas = document.createElement('canvas');
  const width = 420;
  const aspectRatio = 4 / 3;
  const height = Math.round(width * aspectRatio);
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(
    image,
    0,
    slice.start,
    image.naturalWidth,
    slice.height,
    0,
    0,
    width,
    height
  );

  const url = canvas.toDataURL('image/webp', 0.88);
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

export async function exportSlices({ image, slices, ratio, addWatermark, onProgress }) {
  const files = [];

  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index];
    onProgress?.(index + 1, slices.length);
    const blob = await renderSliceBlob({ image, slice, ratio, addWatermark, index, total: slices.length });
    files.push({
      name: `slice-${String(index + 1).padStart(2, '0')}.png`,
      blob
    });
  }

  return files;
}

async function renderSliceBlob({ image, slice, ratio, addWatermark, index, total }) {
  const canvas = document.createElement('canvas');
  const width = DEFAULT_EXPORT_WIDTH;
  const height = Math.round(width * (ratio.height / ratio.width));
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(
    image,
    0,
    slice.start,
    image.naturalWidth,
    slice.height,
    0,
    0,
    width,
    height
  );

  if (addWatermark) {
    context.fillStyle = 'rgba(42, 31, 26, 0.72)';
    context.font = '600 28px "Segoe UI", sans-serif';
    context.textAlign = 'right';
    context.fillText(`${index + 1}/${total}`, width - 28, height - 26);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('导出失败，请重试'));
        return;
      }
      resolve(blob);
      context.clearRect(0, 0, width, height);
      canvas.width = 0;
      canvas.height = 0;
    }, 'image/png');
  });
}
