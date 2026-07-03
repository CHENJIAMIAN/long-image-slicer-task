import './style.css';
import { DEFAULT_EXPORT_WIDTH, LARGE_IMAGE_HEIGHT_THRESHOLD, RATIOS } from './modules/constants.js';
import { createHistoryPreviewDataUrl, drawThumbnail, exportSlices } from './modules/canvas-render.js';
import { saveImageFiles, saveZipArchive } from './modules/export.js';
import {
  getBatchExportSuccessMessage,
  getExportSuccessMessage,
  getExportSlices,
  prefixExportFileNames
} from './modules/export-flow.js';
import { loadImageFromFile, releaseLoadedImages, revokeLoadedImage } from './modules/image-loader.js';
import {
  buildImportErrorMessage,
  buildImportResultMessage,
  createTaskFromFile as createImportedTaskFromFile,
  importTasksFromFiles
} from './modules/import-flow.js';
import {
  buildPersistedTask,
  clampHistoryIndex,
  getSessionUiState,
  resolveTaskId,
  sanitizeHistory
} from './modules/session-utils.js';
import { buildFinalCuts, computeCuts, computeTargetHeight, getSlices, snapCut } from './modules/slice-engine.js';
import { exportSchemeFile, importSchemeFile } from './modules/scheme.js';
import {
  buildRetriedTask,
  findTaskById,
  getHistoryRecord,
  getSwitchTargetTask,
  getTaskRemovalState
} from './modules/task-flow.js';
import {
  canBatchExport as canBatchExportTasks,
  canExportTask,
  getTaskStatusClass,
  getTaskStatusText
} from './modules/task-utils.js';
import {
  clearCurrentSessionStorage,
  deleteHistoryItem,
  loadCurrentSession,
  loadSessionHistory,
  saveCurrentSession,
  saveSessionToHistory
} from './modules/storage.js';

const state = {
  tasks: [],
  activeTaskId: null,
  loadedImage: null,
  ratio: RATIOS[0],
  candidateCuts: [],
  finalCuts: [],
  history: [],
  historyIndex: -1,
  selectedSliceIndex: 0,
  autoSnap: true,
  watermark: false,
  exportProgress: null,
  analysisPending: false,
  bulkImportPending: false,
  errorMessage: '',
  toastMessage: '',
  zoom: 1,
  pinch: null,
  drag: null,
  historyItems: []
};

const root = document.querySelector('#app');
let toastTimer;
let persistTimer;

renderApp();
registerServiceWorker();
bindGlobalPaste();
restoreSession();

function renderApp() {
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-badge">切</div>
          <div>
            <h1 class="brand-title">长图切片器</h1>
            <p class="brand-subtitle">智能吸附安全切点，导出适合小红书发布的多图切片</p>
          </div>
        </div>
        <div class="toolbar">
          <div class="pill">
            <label for="ratio-select">比例</label>
            <select id="ratio-select">
              ${RATIOS.map(
                (ratio) =>
                  `<option value="${ratio.value}" ${ratio.value === state.ratio.value ? 'selected' : ''}>${ratio.label}</option>`
              ).join('')}
            </select>
          </div>
          <label class="pill"><input id="snap-toggle" type="checkbox" ${state.autoSnap ? 'checked' : ''}/> 自动吸附</label>
          <label class="pill"><input id="watermark-toggle" type="checkbox" ${state.watermark ? 'checked' : ''}/> 序号水印</label>
          <button class="secondary-button" id="export-scheme-button" ${!state.loadedImage ? 'disabled' : ''}>导出方案</button>
          <button class="secondary-button" id="import-scheme-button" ${!state.loadedImage ? 'disabled' : ''}>导入方案</button>
          <button class="secondary-button" id="clear-session-button" ${!state.loadedImage ? 'disabled' : ''}>清空当前方案</button>
          <div class="pill">单张导出 ${getExportSizeLabel()}</div>
        </div>
      </header>

      <section class="hero-panel">
        <div class="hero-copy">
          <h2>三步完成长截图分页</h2>
          <p>选图后自动分析安全切点，可手动拖动红色分割线微调，最后批量导出 PNG 切片。所有处理都在本地完成，不上传服务器。</p>
        </div>
        <div class="hero-actions">
          <button class="primary-button" id="pick-image-button">选择长截图</button>
          <button class="secondary-button" id="retry-analyze-button" ${!state.loadedImage ? 'disabled' : ''}>重新识别切点</button>
          <button class="secondary-button" id="undo-button" ${!canUndo() ? 'disabled' : ''}>撤消</button>
          <button class="secondary-button" id="redo-button" ${!canRedo() ? 'disabled' : ''}>重做</button>
          <button class="secondary-button" id="zoom-button" ${!state.loadedImage ? 'disabled' : ''}>缩放 ${Math.round(state.zoom * 100)}%</button>
          <input id="image-input" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" multiple />
          <input id="scheme-input" class="sr-only" type="file" accept="application/json,.json" />
        </div>
      </section>

      <section class="workspace">
        <div class="status-bar">
          <div class="status-main">
            <span class="stat-chip">${getStatusText()}</span>
            <span class="stat-chip">${getSliceSummaryText()}</span>
            <span class="stat-chip">${getDimensionText()}</span>
          </div>
          <div class="stat-chip">${state.errorMessage || getHintText()}</div>
        </div>
        <div class="canvas-shell" id="canvas-shell">
          ${state.loadedImage ? getPreviewMarkup() : getEmptyMarkup()}
        </div>
      </section>

      <section class="task-panel">
        <div class="thumbs-header">
          <strong>批量任务</strong>
          <span class="thumb-desc">${state.tasks.length} 个任务${state.bulkImportPending ? ' · 导入中...' : ''}</span>
        </div>
        <div class="task-list">
          ${getTaskMarkup()}
        </div>
      </section>

      <section class="thumbs-panel">
        <div class="thumbs-header">
          <strong>切片预览</strong>
          <span class="thumb-desc">${getSlices(state.loadedImage?.height ?? 0, state.finalCuts).length || 0} 张</span>
        </div>
        <div class="thumbs-track" id="thumbs-track">
          ${getThumbMarkup()}
        </div>
      </section>

      <section class="history-panel">
        <div class="thumbs-header">
          <strong>历史方案</strong>
          <span class="thumb-desc">${state.historyItems.length} 条</span>
        </div>
        <div class="history-list">
          ${getHistoryMarkup()}
        </div>
      </section>

      <div class="footer-bar">
        <div class="footer-inner">
          <div class="footer-copy">
            <span class="footer-title">${getFooterTitle()}</span>
            <span class="footer-subtitle">移动端优先调用系统分享，桌面端自动打包 ZIP。</span>
          </div>
          <div class="hero-actions">
            <button class="secondary-button" id="export-all-images-button" ${!canBatchExport() ? 'disabled' : ''}>下载全部图片</button>
            <button class="secondary-button" id="export-all-zip-button" ${!canBatchExport() ? 'disabled' : ''}>打包全部 ZIP</button>
            <button class="secondary-button" id="export-images-button" ${!canExport() ? 'disabled' : ''}>下载图片</button>
            <button class="primary-button export-button" id="export-zip-button" ${!canExport() ? 'disabled' : ''}>下载 ZIP</button>
          </div>
        </div>
      </div>
    </div>
    <div class="toast ${state.toastMessage ? 'is-visible' : ''}" id="toast">${state.toastMessage}</div>
  `;

  bindUi();
  renderThumbnails();
}

function bindUi() {
  document.querySelector('#pick-image-button')?.addEventListener('click', () => {
    document.querySelector('#image-input')?.click();
  });

  document.querySelector('#image-input')?.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) {
      await handleFiles(files);
      event.target.value = '';
    }
  });

  document.querySelector('#ratio-select')?.addEventListener('change', async (event) => {
    const nextRatio = RATIOS.find((ratio) => ratio.value === event.target.value) ?? RATIOS[0];
    state.ratio = nextRatio;
    recomputeFinalCuts();
    resetHistory(state.finalCuts);
    schedulePersistSession();
    renderApp();
  });

  document.querySelector('#snap-toggle')?.addEventListener('change', (event) => {
    state.autoSnap = event.target.checked;
    schedulePersistSession();
  });

  document.querySelector('#watermark-toggle')?.addEventListener('change', (event) => {
    state.watermark = event.target.checked;
    schedulePersistSession();
  });

  document.querySelector('#clear-session-button')?.addEventListener('click', clearCurrentSession);

  document.querySelector('#export-scheme-button')?.addEventListener('click', handleExportScheme);

  document.querySelector('#import-scheme-button')?.addEventListener('click', () => {
    document.querySelector('#scheme-input')?.click();
  });

  document.querySelector('#scheme-input')?.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];
    if (file) {
      await handleImportScheme(file);
      event.target.value = '';
    }
  });

  document.querySelector('#retry-analyze-button')?.addEventListener('click', async () => {
    if (state.loadedImage) {
      await analyzeCurrentImage();
    }
  });

  document.querySelector('#undo-button')?.addEventListener('click', () => {
    applyHistory(-1);
  });

  document.querySelector('#redo-button')?.addEventListener('click', () => {
    applyHistory(1);
  });

  document.querySelector('#zoom-button')?.addEventListener('click', () => {
    const options = [1, 1.25, 1.5, 2];
    const current = options.indexOf(state.zoom);
    state.zoom = options[(current + 1) % options.length];
    syncPreviewZoom();
  });

  document.querySelector('#export-images-button')?.addEventListener('click', () => handleExport('images'));
  document.querySelector('#export-zip-button')?.addEventListener('click', () => handleExport('zip'));
  document.querySelector('#export-all-images-button')?.addEventListener('click', () => handleBatchExport('images'));
  document.querySelector('#export-all-zip-button')?.addEventListener('click', () => handleBatchExport('zip'));

  document.querySelectorAll('[data-task-switch]').forEach((button) => {
    button.addEventListener('click', () => {
      switchActiveTask(button.dataset.taskSwitch);
    });
  });

  document.querySelectorAll('[data-task-retry]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await retryTask(button.dataset.taskRetry);
    });
  });

  document.querySelectorAll('[data-task-remove]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      removeTask(button.dataset.taskRemove);
    });
  });

  document.querySelectorAll('[data-history-restore]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.historyRestore;
      handleRestoreHistory(id);
    });
  });

  document.querySelectorAll('[data-history-delete]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.historyDelete;
      handleDeleteHistory(id);
    });
  });

  document.querySelectorAll('.thumb-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSliceIndex = Number(button.dataset.index);
      renderApp();
      scrollToSelectedSlice();
    });
  });

  document.querySelectorAll('.cut-line').forEach((line) => {
    line.addEventListener('pointerdown', startDragCut);
    line.addEventListener('mousedown', startMouseDragCut);
  });

  const shell = document.querySelector('#canvas-shell');
  shell?.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  shell?.addEventListener('drop', async (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) {
      await handleFiles(files);
    }
  });

  const previewScroll = document.querySelector('#preview-scroll');
  previewScroll?.addEventListener('pointerdown', onPreviewPointerDown);
  previewScroll?.addEventListener('pointermove', onPreviewPointerMove);
  previewScroll?.addEventListener('pointerup', onPreviewPointerUp);
  previewScroll?.addEventListener('pointercancel', onPreviewPointerUp);
  previewScroll?.addEventListener('wheel', onPreviewWheel, { passive: false });
}

async function handleFiles(files) {
  try {
    saveActiveTaskState();
    state.errorMessage = '';
    state.bulkImportPending = true;
    renderApp();
    const { importedTasks, errors } = await importTasksFromFiles(files, createTaskFromFile);
    state.errorMessage = buildImportErrorMessage(errors);
    if (!importedTasks.length) {
      renderApp();
      return;
    }
    state.tasks.push(...importedTasks);
    if (!state.activeTaskId && importedTasks[0]) {
      applyTaskState(importedTasks[0]);
    } else if (importedTasks[0]) {
      switchActiveTask(importedTasks[0].id);
    }
    schedulePersistSession();
    showToast(buildImportResultMessage(importedTasks, errors));
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : '图片处理失败';
    renderApp();
  } finally {
    state.bulkImportPending = false;
    renderApp();
  }
}

async function analyzeCurrentImage() {
  if (!state.loadedImage) {
    return;
  }

  try {
    state.analysisPending = true;
    state.errorMessage = '';
    renderApp();
    const result = await computeCuts(state.loadedImage.image);
    state.candidateCuts = result.candidateCuts;
    recomputeFinalCuts();
    resetHistory(state.finalCuts);
    schedulePersistSession();
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : '切点识别失败';
  } finally {
    state.analysisPending = false;
    renderApp();
  }
}

function recomputeFinalCuts() {
  if (!state.loadedImage) {
    state.finalCuts = [];
    return;
  }

  state.finalCuts = buildFinalCuts({
    imageHeight: state.loadedImage.height,
    imageWidth: state.loadedImage.width,
    ratio: state.ratio,
    candidateCuts: state.candidateCuts,
    manualCuts: state.finalCuts
  });
}

function getPreviewMarkup() {
  const slices = getSlices(state.loadedImage.height, state.finalCuts);
  const selected = slices[state.selectedSliceIndex] || slices[0];
  const width = Math.min(820, state.loadedImage.width);
  const scaledHeight = Math.round((state.loadedImage.height / state.loadedImage.width) * width);

  return `
    <div class="preview-scroll" id="preview-scroll">
      <div class="preview-stage" style="width:${width}px;height:${scaledHeight}px;transform:scale(${state.zoom})">
        <img class="preview-image" src="${state.loadedImage.url}" alt="长截图预览" />
        ${
          selected
            ? `<div class="slice-overlay" style="top:${(selected.start / state.loadedImage.height) * scaledHeight}px;height:${(selected.height / state.loadedImage.height) * scaledHeight}px"></div>`
            : ''
        }
        ${state.finalCuts
          .map((cut, index) => {
            const top = (cut / state.loadedImage.height) * scaledHeight;
            return `
              <div class="cut-line ${index === state.selectedSliceIndex ? 'is-active' : ''}" style="top:${top}px" data-cut-index="${index}">
                <button type="button" aria-label="调整第 ${index + 1} 条切割线"></button>
              </div>
            `;
          })
          .join('')}
      </div>
      <div class="preview-hud">缩放 ${Math.round(state.zoom * 100)}%</div>
    </div>
  `;
}

function getThumbMarkup() {
  if (!state.loadedImage) {
    return `<div class="thumb-desc">导入长图后会在这里看到所有切片缩略图。</div>`;
  }

  const slices = getSlices(state.loadedImage.height, state.finalCuts);
  return slices
    .map(
      (slice, index) => `
      <article class="thumb-card ${index === state.selectedSliceIndex ? 'is-selected' : ''}">
        <button class="thumb-button" data-index="${index}">
          <canvas class="thumb-canvas" data-thumb-index="${index}"></canvas>
          <div class="thumb-meta">
            <div class="thumb-title">第 ${index + 1} 张</div>
            <div class="thumb-desc">${Math.round(slice.height)} px 高</div>
          </div>
        </button>
      </article>
    `
    )
    .join('');
}

function getTaskMarkup() {
  if (!state.tasks.length) {
    return `<div class="thumb-desc">一次选择多张长截图后，可以在这里切换当前任务。</div>`;
  }

  return state.tasks
    .map((task) => {
      const sliceCount = getSlices(task.loadedImage?.height ?? 0, task.finalCuts || []).length || 0;
      return `
        <article class="task-card ${task.id === state.activeTaskId ? 'is-active' : ''}">
          <button class="task-button" type="button" data-task-switch="${escapeAttribute(task.id)}">
            <div class="task-title">${escapeHtml(task.loadedImage?.file?.name || '未命名任务')}</div>
            <div class="task-desc">${task.loadedImage?.width || 0}×${task.loadedImage?.height || 0} · ${sliceCount} 张切片</div>
            <div class="task-status ${getTaskStatusClass(task)}">${getTaskStatusText(task)}</div>
          </button>
          <div class="task-actions">
            <button class="secondary-button task-action-button" type="button" data-task-retry="${escapeAttribute(task.id)}">重试识别</button>
            <button class="secondary-button task-action-button" type="button" data-task-remove="${escapeAttribute(task.id)}">移除</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function getHistoryMarkup() {
  if (!state.historyItems.length) {
    return `<div class="thumb-desc">导入并调整过长图后，这里会保留最近的切图方案。</div>`;
  }

  return state.historyItems
    .map(
      (item) => `
        <article class="history-item">
          <div class="history-thumb">
            ${
              item.previewDataUrl
                ? `<img src="${item.previewDataUrl}" alt="${escapeAttribute(item.fileName)} 历史预览" />`
                : ''
            }
          </div>
          <div class="history-meta">
            <div class="history-title">${escapeHtml(item.fileName)}</div>
            <div class="history-desc">${item.imageWidth}×${item.imageHeight} · ${item.ratioValue} · ${new Date(item.savedAt).toLocaleString('zh-CN')}</div>
          </div>
          <div class="history-actions">
            <button class="secondary-button" type="button" data-history-restore="${escapeAttribute(item.id)}">恢复</button>
            <button class="secondary-button" type="button" data-history-delete="${escapeAttribute(item.id)}">删除</button>
          </div>
        </article>
      `
    )
    .join('');
}

function getEmptyMarkup() {
  return `
    <div class="empty-state">
      <div class="empty-card">
        <div class="empty-illustration">✂️</div>
        <h3 class="empty-title">选择一张长截图开始</h3>
        <p class="empty-body">支持相册选择、桌面端拖拽，或直接粘贴剪贴板中的截图。</p>
      </div>
    </div>
  `;
}

function renderThumbnails() {
  if (!state.loadedImage) {
    return;
  }

  const slices = getSlices(state.loadedImage.height, state.finalCuts);
  document.querySelectorAll('.thumb-canvas').forEach((canvas) => {
    const index = Number(canvas.dataset.thumbIndex);
    const slice = slices[index];
    if (slice) {
      drawThumbnail(canvas, state.loadedImage.image, slice);
    }
  });
}

function startDragCut(event) {
  event.preventDefault();
  if (!state.loadedImage) {
    return;
  }

  const cutIndex = Number(event.currentTarget.dataset.cutIndex);
  const previewStage = document.querySelector('.preview-stage');
  const previewScroll = document.querySelector('#preview-scroll');
  if (!previewStage || !previewScroll) {
    return;
  }

  const rect = previewStage.getBoundingClientRect();
  state.drag = {
    cutIndex,
    rect,
    scaledHeight: rect.height,
    pointerId: event.pointerId,
    target: event.currentTarget,
    startCuts: state.finalCuts.slice()
  };

  try {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  } catch {
    // Pointer capture is an enhancement; dragging still works through window listeners.
  }
  window.addEventListener('pointermove', onDragCut);
  window.addEventListener('pointerup', finishDragCut);
  window.addEventListener('pointercancel', finishDragCut);
}

function startMouseDragCut(event) {
  if (event.button !== 0 || !state.loadedImage) {
    return;
  }

  event.preventDefault();
  const cutIndex = Number(event.currentTarget.dataset.cutIndex);
  const previewStage = document.querySelector('.preview-stage');
  if (!previewStage) {
    return;
  }

  state.drag = {
    cutIndex,
    rect: previewStage.getBoundingClientRect(),
    scaledHeight: previewStage.getBoundingClientRect().height,
    target: event.currentTarget,
    startCuts: state.finalCuts.slice()
  };

  window.addEventListener('mousemove', onDragCut);
  window.addEventListener('mouseup', finishMouseDragCut);
}

function onDragCut(event) {
  if (!state.drag || !state.loadedImage) {
    return;
  }

  const y = event.clientY - state.drag.rect.top;
  const ratio = y / state.drag.scaledHeight;
  const imageY = Math.round(state.loadedImage.height * ratio);
  const prev = state.drag.cutIndex === 0 ? 0 : state.finalCuts[state.drag.cutIndex - 1];
  const next =
    state.drag.cutIndex === state.finalCuts.length - 1
      ? state.loadedImage.height
      : state.finalCuts[state.drag.cutIndex + 1];

  const min = prev + 120;
  const max = next - 120;
  const cut = Math.min(Math.max(imageY, min), max);
  state.finalCuts[state.drag.cutIndex] = snapCut(cut, state.candidateCuts, state.autoSnap);
  state.selectedSliceIndex = state.drag.cutIndex;
  renderApp();
}

function finishDragCut(event) {
  finishCutAdjustment();
  schedulePersistSession();
  try {
    state.drag?.target?.releasePointerCapture?.(event.pointerId);
  } catch {
    // Ignore release failures from synthetic or already-released pointers.
  }
  state.drag = null;
  window.removeEventListener('pointermove', onDragCut);
  window.removeEventListener('pointerup', finishDragCut);
  window.removeEventListener('pointercancel', finishDragCut);
  renderApp();
  showToast('切点已更新');
}

function finishMouseDragCut() {
  finishCutAdjustment();
  schedulePersistSession();
  state.drag = null;
  window.removeEventListener('mousemove', onDragCut);
  window.removeEventListener('mouseup', finishMouseDragCut);
  renderApp();
  showToast('切点已更新');
}

function finishCutAdjustment() {
  if (!state.drag) {
    return;
  }

  const startCuts = state.drag.startCuts || [];
  const changed =
    startCuts.length !== state.finalCuts.length || startCuts.some((cut, index) => cut !== state.finalCuts[index]);
  if (changed) {
    pushHistory(state.finalCuts);
  }
}

async function handleExport(mode = 'zip') {
  if (!state.loadedImage || !canExport()) {
    return;
  }

  try {
    const slices = getExportSlices({
      loadedImage: state.loadedImage,
      finalCuts: state.finalCuts,
      getSlices
    });
    state.exportProgress = { current: 0, total: slices.length };
    syncActiveTask();
    renderApp();

    const files = await exportSlices({
      image: state.loadedImage.image,
      slices,
      ratio: state.ratio,
      addWatermark: state.watermark,
      onProgress: (current, total) => {
        state.exportProgress = { current, total };
        syncActiveTask();
        renderApp();
      }
    });
    if (mode === 'zip') {
      await saveZipArchive(files, 'long-image-slices.zip');
    } else {
      await saveImageFiles(files);
    }
    clearTaskError(state.activeTaskId);
    showToast(getExportSuccessMessage(files, mode));
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : '导出失败';
    setTaskError(state.activeTaskId, state.errorMessage);
  } finally {
    state.exportProgress = null;
    syncActiveTask();
    renderApp();
  }
}

async function handleBatchExport(mode = 'zip') {
  if (!canBatchExport()) {
    return;
  }

  const activeTaskId = state.activeTaskId;
  const exportableTasks = state.tasks.filter(canExportTask);
  try {
    saveActiveTaskState();
    const batchFiles = [];
    for (const task of exportableTasks) {
      applyTaskState(task);
      const slices = getExportSlices({
        loadedImage: state.loadedImage,
        finalCuts: state.finalCuts,
        getSlices
      });
      state.exportProgress = { current: 0, total: slices.length };
      syncActiveTask();
      renderApp();

      const files = await exportSlices({
        image: state.loadedImage.image,
        slices,
        ratio: state.ratio,
        addWatermark: state.watermark,
        onProgress: (current, total) => {
          state.exportProgress = { current, total };
          syncActiveTask();
          renderApp();
        }
      });

      const namedFiles = prefixExportFileNames(files, state.loadedImage.file.name, stripExtension);
      if (mode === 'zip') {
        batchFiles.push(...namedFiles);
      } else {
        batchFiles.push(...namedFiles);
        await saveImageFiles(namedFiles);
      }
      clearTaskError(task.id);
      state.exportProgress = null;
      syncActiveTask();
    }

    if (mode === 'zip' && batchFiles.length) {
      await saveZipArchive(batchFiles, 'long-image-slices-batch.zip');
    }

    if (activeTaskId) {
      const activeTask = state.tasks.find((task) => task.id === activeTaskId);
      if (activeTask) {
        applyTaskState(activeTask);
      }
    }
    renderApp();
    showToast(getBatchExportSuccessMessage(exportableTasks, batchFiles, mode));
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : '批量导出失败';
    setTaskError(state.activeTaskId, state.errorMessage);
    renderApp();
  } finally {
    state.exportProgress = null;
    syncActiveTask();
    renderApp();
  }
}

async function handleExportScheme() {
  if (!state.loadedImage) {
    return;
  }

  try {
    await exportSchemeFile(state);
    showToast('切图方案已导出');
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : '方案导出失败';
    renderApp();
  }
}

async function handleImportScheme(file) {
  if (!state.loadedImage) {
    showToast('请先导入对应长图，再导入方案');
    return;
  }

  try {
    const payload = await importSchemeFile(file);
    if (
      payload.imageWidth !== state.loadedImage.width ||
      payload.imageHeight !== state.loadedImage.height
    ) {
      throw new Error('方案尺寸和当前图片不一致');
    }
    state.ratio = RATIOS.find((ratio) => ratio.value === payload.ratioValue) ?? state.ratio;
    state.autoSnap = payload.autoSnap ?? state.autoSnap;
    state.watermark = payload.watermark ?? state.watermark;
    state.candidateCuts = Array.isArray(payload.candidateCuts) ? payload.candidateCuts : state.candidateCuts;
    state.finalCuts = Array.isArray(payload.finalCuts) ? payload.finalCuts.slice() : state.finalCuts;
    state.selectedSliceIndex = 0;
    resetHistory(state.finalCuts);
    syncActiveTask();
    schedulePersistSession();
    renderApp();
    showToast('切图方案已导入');
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : '方案导入失败';
    renderApp();
  }
}

function handleRestoreHistory(id) {
  const record = getHistoryRecord(state.historyItems, id);
  if (!record) {
    return;
  }

  saveActiveTaskState();
  createTaskFromSession(record, { preserveExistingId: false })
    .then((task) => {
      const restoredUi = getSessionUiState(record, {
        autoSnap: state.autoSnap,
        watermark: state.watermark
      });
      state.autoSnap = restoredUi.autoSnap;
      state.watermark = restoredUi.watermark;
      state.errorMessage = '';
      state.tasks.push(task);
      applyTaskState(task);
      schedulePersistSession();
      renderApp();
      showToast('历史方案已恢复');
    })
    .catch(() => {
      state.errorMessage = '历史方案恢复失败';
      renderApp();
    });
}

function handleDeleteHistory(id) {
  deleteHistoryItem(id);
  state.historyItems = loadSessionHistory();
  renderApp();
  showToast('历史方案已删除');
}

async function retryTask(taskId) {
  const task = findTaskById(state.tasks, taskId);
  if (!task) {
    return;
  }

  saveActiveTaskState();
  task.analysisPending = true;
  task.errorMessage = '';
  if (state.activeTaskId === taskId) {
    applyTaskState(task);
  }
  renderApp();

  try {
    const result = await computeCuts(task.loadedImage.image);
    Object.assign(task, buildRetriedTask(task, result.candidateCuts, buildFinalCuts));
    if (state.activeTaskId === taskId) {
      applyTaskState(task);
    }
    schedulePersistSession();
    renderApp();
    showToast('任务已重新识别切点');
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务重试失败';
    task.errorMessage = message;
    if (state.activeTaskId === taskId) {
      state.errorMessage = message;
      applyTaskState(task);
    }
    renderApp();
  } finally {
    task.analysisPending = false;
    if (state.activeTaskId === taskId) {
      applyTaskState(task);
    }
    schedulePersistSession();
    renderApp();
  }
}

function removeTask(taskId) {
  const removal = getTaskRemovalState({
    tasks: state.tasks,
    activeTaskId: state.activeTaskId,
    taskId
  });
  if (!removal) {
    return;
  }

  state.tasks = removal.nextTasks;
  revokeLoadedImage(removal.removedTask.loadedImage);

  if (removal.shouldClearAll) {
    clearCurrentSession();
    return;
  }

  if (removal.nextActiveTaskId && state.activeTaskId === taskId) {
    const fallback = findTaskById(state.tasks, removal.nextActiveTaskId);
    if (fallback) {
      applyTaskState(fallback);
    }
  }

  schedulePersistSession();
  renderApp();
  showToast('任务已移除');
}

function bindGlobalPaste() {
  window.addEventListener('paste', async (event) => {
    const items = event.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          await handleFiles([file]);
          break;
        }
      }
    }
  });
}

function getStatusText() {
  if (state.analysisPending) {
    return '正在识别安全切点...';
  }
  if (!state.loadedImage) {
    return '等待导入长截图';
  }
  if (state.loadedImage.height > LARGE_IMAGE_HEIGHT_THRESHOLD) {
    return `超长图已启用性能保护 (${state.loadedImage.height}px)`;
  }
  return `已识别 ${state.candidateCuts.length} 个候选切点`;
}

function getSliceSummaryText() {
  if (!state.loadedImage) {
    return '默认比例 3:4 竖版';
  }
  const targetHeight = computeTargetHeight(state.loadedImage.width, state.ratio);
  if (state.loadedImage.height <= targetHeight) {
    return '图片高度不足当前比例，将按单张导出';
  }
  return `目标切片高 ${targetHeight}px`;
}

function getDimensionText() {
  if (!state.loadedImage) {
    return `导出尺寸 ${getExportSizeLabel()}`;
  }
  return `原图 ${state.loadedImage.width}×${state.loadedImage.height}px`;
}

function getHintText() {
  if (state.loadedImage) {
    return '拖动红线可微调，切片缩略图会实时更新';
  }
  return '首次加载后可离线使用';
}

function getFooterTitle() {
  if (state.exportProgress) {
    return `保存中 ${state.exportProgress.current}/${state.exportProgress.total}`;
  }
  if (!state.loadedImage) {
    return '导入后即可一键导出';
  }
  return `准备导出 ${getSlices(state.loadedImage.height, state.finalCuts).length} 张切片`;
}

function getExportSizeLabel() {
  return `${DEFAULT_EXPORT_WIDTH}×${Math.round(DEFAULT_EXPORT_WIDTH * (state.ratio.height / state.ratio.width))} px`;
}

function canExport() {
  return Boolean(state.loadedImage) && !state.analysisPending && !state.exportProgress && !state.bulkImportPending;
}

function canBatchExport() {
  return canBatchExportTasks({
    tasks: state.tasks,
    exportProgress: state.exportProgress,
    bulkImportPending: state.bulkImportPending
  });
}

function canUndo() {
  return state.historyIndex > 0;
}

function canRedo() {
  return state.historyIndex >= 0 && state.historyIndex < state.history.length - 1;
}

function resetHistory(cuts) {
  state.history = [cuts.slice()];
  state.historyIndex = 0;
}

function pushHistory(cuts) {
  const snapshot = cuts.slice();
  const current = state.history[state.historyIndex] || [];
  if (JSON.stringify(snapshot) === JSON.stringify(current)) {
    return;
  }
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshot);
  state.historyIndex = state.history.length - 1;
}

function applyHistory(direction) {
  const nextIndex = state.historyIndex + direction;
  if (nextIndex < 0 || nextIndex >= state.history.length) {
    return;
  }
  state.historyIndex = nextIndex;
  state.finalCuts = state.history[nextIndex].slice();
  schedulePersistSession();
  renderApp();
}

async function restoreSession() {
  state.historyItems = loadSessionHistory();
  const session = loadCurrentSession();
  if (!session) {
    renderApp();
    return;
  }

  try {
    const restoredUi = getSessionUiState(session, {
      autoSnap: state.autoSnap,
      watermark: state.watermark
    });
    state.autoSnap = restoredUi.autoSnap;
    state.watermark = restoredUi.watermark;

    if (Array.isArray(session.tasks) && session.tasks.length) {
      const tasks = [];
      for (const taskSession of session.tasks) {
        tasks.push(await createTaskFromSession(taskSession, { preserveExistingId: true }));
      }
      state.tasks = tasks;
      const activeTask =
        tasks.find((task) => task.id === session.activeTaskId) ??
        tasks.find((task) => task.id === session.tasks[0]?.id) ??
        tasks[0];
      if (activeTask) {
        applyTaskState(activeTask);
      }
    } else if (session.imageDataUrl) {
      const task = await createTaskFromSession(session, { preserveExistingId: true });
      state.tasks = [task];
      applyTaskState(task);
    }
    renderApp();
    showToast('已恢复上次切图方案');
  } catch {
    clearCurrentSessionStorage();
    renderApp();
  }
}

function schedulePersistSession() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistSession();
  }, 180);
}

function persistSession() {
  if (!state.tasks.length || !state.loadedImage?.dataUrl) {
    return;
  }

  syncActiveTask();

  const taskSnapshots = state.tasks.map((task) => serializeTask(task));
  const activeTask = taskSnapshots.find((task) => task.id === state.activeTaskId) ?? taskSnapshots[0];

  saveCurrentSession({
    version: 2,
    activeTaskId: state.activeTaskId,
    autoSnap: state.autoSnap,
    watermark: state.watermark,
    tasks: taskSnapshots,
    ...activeTask
  });
  saveSessionToHistory(activeTask);
  state.historyItems = loadSessionHistory();
}

function clearCurrentSession() {
  window.clearTimeout(persistTimer);
  releaseLoadedImages([
    ...state.tasks.map((task) => task.loadedImage),
    state.loadedImage
  ]);
  state.tasks = [];
  state.activeTaskId = null;
  state.loadedImage = null;
  state.candidateCuts = [];
  state.finalCuts = [];
  state.history = [];
  state.historyIndex = -1;
  state.selectedSliceIndex = 0;
  state.errorMessage = '';
  clearCurrentSessionStorage();
  renderApp();
  showToast('当前方案已清空');
}

function onPreviewPointerDown(event) {
  if (!state.loadedImage || event.target.closest('.cut-line')) {
    return;
  }

  const previewScroll = event.currentTarget;
  previewScroll.setPointerCapture?.(event.pointerId);

  if (!state.pinch) {
    state.pinch = { pointers: new Map(), lastCenter: null, startZoom: state.zoom, startDistance: 0 };
  }

  state.pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (state.pinch.pointers.size === 2) {
    const [first, second] = [...state.pinch.pointers.values()];
    state.pinch.startDistance = getDistance(first, second);
    state.pinch.startZoom = state.zoom;
    state.pinch.lastCenter = getCenter(first, second);
  }
}

function onPreviewPointerMove(event) {
  if (!state.pinch?.pointers?.has(event.pointerId)) {
    return;
  }

  state.pinch.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const previewScroll = event.currentTarget;

  if (state.pinch.pointers.size === 2) {
    event.preventDefault();
    const [first, second] = [...state.pinch.pointers.values()];
    const distance = getDistance(first, second);
    const nextZoom = clampZoom((distance / Math.max(1, state.pinch.startDistance)) * state.pinch.startZoom);
    const center = getCenter(first, second);
    applyZoom(nextZoom, previewScroll, center);
  }
}

function onPreviewPointerUp(event) {
  if (!state.pinch?.pointers) {
    return;
  }

  state.pinch.pointers.delete(event.pointerId);
  if (state.pinch.pointers.size < 2) {
    state.pinch.startDistance = 0;
    state.pinch.startZoom = state.zoom;
  }
}

function onPreviewWheel(event) {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }
  event.preventDefault();
  const previewScroll = event.currentTarget;
  const delta = event.deltaY < 0 ? 0.12 : -0.12;
  const nextZoom = clampZoom(state.zoom + delta);
  applyZoom(nextZoom, previewScroll, { x: event.clientX, y: event.clientY });
}

function applyZoom(nextZoom, previewScroll, centerPoint) {
  if (Math.abs(nextZoom - state.zoom) < 0.001) {
    return;
  }

  const rect = previewScroll.getBoundingClientRect();
  const anchorX = centerPoint.x - rect.left + previewScroll.scrollLeft;
  const anchorY = centerPoint.y - rect.top + previewScroll.scrollTop;
  const ratio = nextZoom / state.zoom;

  state.zoom = nextZoom;
  syncPreviewZoom();

  const nextScroll = document.querySelector('#preview-scroll');
  if (!nextScroll) {
    return;
  }

  nextScroll.scrollLeft = anchorX * ratio - (centerPoint.x - rect.left);
  nextScroll.scrollTop = anchorY * ratio - (centerPoint.y - rect.top);
}

function scrollToSelectedSlice() {
  const card = document.querySelectorAll('.thumb-card')[state.selectedSliceIndex];
  card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  state.toastMessage = message;
  const toast = document.querySelector('#toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('is-visible');
  } else {
    renderApp();
  }

  toastTimer = window.setTimeout(() => {
    state.toastMessage = '';
    document.querySelector('#toast')?.classList.remove('is-visible');
  }, 2200);
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

async function dataUrlToFile(dataUrl, fileName) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/png' });
}

function getDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getCenter(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function clampZoom(value) {
  return Math.min(Math.max(value, 1), 3);
}

function syncPreviewZoom() {
  const stage = document.querySelector('.preview-stage');
  const hud = document.querySelector('.preview-hud');
  const zoomButton = document.querySelector('#zoom-button');

  if (stage) {
    stage.style.transform = `scale(${state.zoom})`;
  }
  if (hud) {
    hud.textContent = `缩放 ${Math.round(state.zoom * 100)}%`;
  }
  if (zoomButton) {
    zoomButton.textContent = `缩放 ${Math.round(state.zoom * 100)}%`;
  }
}

async function createTaskFromSession(session, options = {}) {
  const file = await dataUrlToFile(session.imageDataUrl, session.fileName || 'restored-image.png');
  const loaded = await loadImageFromFile(file);
  const finalCuts = Array.isArray(session.finalCuts) ? session.finalCuts : [];
  const history = sanitizeHistory(session.history, finalCuts);
  const historyIndex = clampHistoryIndex(session.historyIndex, history.length);
  return {
    id: resolveTaskId(session, {
      preserveExistingId: options.preserveExistingId ?? false,
      createTaskId
    }),
    loadedImage: loaded,
    ratio: RATIOS.find((ratio) => ratio.value === session.ratioValue) ?? RATIOS[0],
    candidateCuts: Array.isArray(session.candidateCuts) ? session.candidateCuts : [],
    finalCuts,
    history,
    historyIndex,
    selectedSliceIndex: Math.max(0, Math.min(session.selectedSliceIndex ?? 0, getSlices(loaded.height, finalCuts).length - 1)),
    analysisPending: false,
    errorMessage: '',
    exportProgress: null,
    zoom: session.zoom ?? 1
  };
}

async function createTaskFromFile(file) {
  return createImportedTaskFromFile(file, {
    loadImageFromFile,
    computeCuts,
    buildFinalCuts,
    defaultRatio: RATIOS[0],
    createTaskId
  });
}

function switchActiveTask(taskId) {
  const task = getSwitchTargetTask({
    tasks: state.tasks,
    activeTaskId: state.activeTaskId,
    taskId
  });
  if (!task) {
    return;
  }
  saveActiveTaskState();
  applyTaskState(task);
  renderApp();
}

function applyTaskState(task) {
  state.activeTaskId = task.id;
  state.loadedImage = task.loadedImage;
  state.ratio = task.ratio;
  state.candidateCuts = task.candidateCuts;
  state.finalCuts = task.finalCuts;
  state.history = task.history;
  state.historyIndex = task.historyIndex;
  state.selectedSliceIndex = task.selectedSliceIndex;
  state.analysisPending = task.analysisPending;
  state.errorMessage = task.errorMessage || '';
  state.exportProgress = task.exportProgress;
  state.zoom = task.zoom ?? 1;
}

function saveActiveTaskState() {
  const task = state.tasks.find((item) => item.id === state.activeTaskId);
  if (!task) {
    return;
  }
  task.loadedImage = state.loadedImage;
  task.ratio = state.ratio;
  task.candidateCuts = state.candidateCuts;
  task.finalCuts = state.finalCuts;
  task.history = state.history;
  task.historyIndex = state.historyIndex;
  task.selectedSliceIndex = state.selectedSliceIndex;
  task.analysisPending = state.analysisPending;
  task.errorMessage = state.errorMessage;
  task.exportProgress = state.exportProgress;
  task.zoom = state.zoom;
}

function syncActiveTask() {
  saveActiveTaskState();
}

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeTask(task) {
  return buildPersistedTask(task, {
    autoSnap: state.autoSnap,
    watermark: state.watermark,
    previewDataUrl: createHistoryPreviewDataUrl(task.loadedImage.image, task.finalCuts)
  });
}

function setTaskError(taskId, message) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (task) {
    task.errorMessage = message;
  }
}

function clearTaskError(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (task) {
    task.errorMessage = '';
  }
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
