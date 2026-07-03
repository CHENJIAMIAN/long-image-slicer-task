export async function loadImageFromFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('请选择 JPG、PNG、WebP 或 BMP 图片');
  }

  const dataUrl = await readAsDataUrl(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await decodeImage(objectUrl);
    return {
      file,
      image,
      url: objectUrl,
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function revokeLoadedImage(loaded) {
  if (loaded?.url) {
    URL.revokeObjectURL(loaded.url);
  }
  if (loaded?.image?.src) {
    loaded.image.src = '';
  }
}

export function releaseLoadedImages(loadedItems) {
  const seenUrls = new Set();
  for (const loaded of loadedItems) {
    if (!loaded) {
      continue;
    }
    if (loaded.url && seenUrls.has(loaded.url)) {
      if (loaded?.image?.src) {
        loaded.image.src = '';
      }
      continue;
    }
    if (loaded.url) {
      seenUrls.add(loaded.url);
    }
    revokeLoadedImage(loaded);
  }
}

function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请重试'));
    image.decoding = 'async';
    image.src = src;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片读取失败，请重试'));
    reader.readAsDataURL(file);
  });
}
