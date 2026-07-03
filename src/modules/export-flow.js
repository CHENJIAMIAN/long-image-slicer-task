export function getExportSlices({ loadedImage, finalCuts, getSlices }) {
  if (!loadedImage) {
    return [];
  }

  return getSlices(loadedImage.height, finalCuts);
}

export function prefixExportFileNames(files, fileName, stripExtension) {
  const prefix = stripExtension(fileName);
  return files.map((file) => ({
    ...file,
    name: `${prefix}-${file.name}`
  }));
}

export function getExportSuccessMessage(files, mode) {
  return mode === 'zip' ? `已打包 ${files.length} 张图片` : `已保存 ${files.length} 张图片`;
}

export function getBatchExportSuccessMessage(exportableTasks, files, mode) {
  return mode === 'zip'
    ? `已打包 ${exportableTasks.length} 个任务，共 ${files.length} 张图片`
    : `已下载 ${exportableTasks.length} 个任务，共 ${files.length} 张图片`;
}
