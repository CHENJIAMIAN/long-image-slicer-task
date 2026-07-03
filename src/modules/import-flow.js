import { revokeLoadedImage } from './image-loader.js';

export async function createTaskFromFile(file, dependencies) {
  const { loadImageFromFile, computeCuts, buildFinalCuts, defaultRatio, createTaskId } = dependencies;
  const loaded = await loadImageFromFile(file);

  try {
    const result = await computeCuts(loaded.image);
    const ratio = defaultRatio;
    const finalCuts = buildFinalCuts({
      imageHeight: loaded.height,
      imageWidth: loaded.width,
      ratio,
      candidateCuts: result.candidateCuts,
      manualCuts: []
    });

    return {
      id: createTaskId(),
      loadedImage: loaded,
      ratio,
      candidateCuts: result.candidateCuts,
      finalCuts,
      history: [finalCuts.slice()],
      historyIndex: 0,
      selectedSliceIndex: 0,
      analysisPending: false,
      errorMessage: '',
      exportProgress: null,
      zoom: 1
    };
  } catch (error) {
    revokeLoadedImage(loaded);
    throw error;
  }
}

export async function importTasksFromFiles(files, createTaskFromFileFn) {
  const importedTasks = [];
  const errors = [];

  for (const file of files) {
    try {
      importedTasks.push(await createTaskFromFileFn(file));
    } catch (error) {
      errors.push({
        fileName: file?.name || '未命名文件',
        message: error instanceof Error ? error.message : '图片处理失败'
      });
    }
  }

  return { importedTasks, errors };
}

export function buildImportResultMessage(importedTasks, errors) {
  if (importedTasks.length && !errors.length) {
    return `已导入 ${importedTasks.length} 张长图`;
  }

  if (importedTasks.length && errors.length) {
    return `已导入 ${importedTasks.length} 张，另有 ${errors.length} 张失败`;
  }

  return '';
}

export function buildImportErrorMessage(errors) {
  if (!errors.length) {
    return '';
  }

  if (errors.length === 1) {
    return `${errors[0].fileName}：${errors[0].message}`;
  }

  return `${errors[0].fileName}：${errors[0].message}；另有 ${errors.length - 1} 张失败`;
}
