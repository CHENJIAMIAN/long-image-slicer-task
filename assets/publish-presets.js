(function () {
  const PRESET_STORAGE_KEY = 'long-image-slicer:publish-preset';
  const PRESETS = [
    {
      id: 'xiaohongshu',
      title: '小红书图文',
      ratio: '3:4',
      ratioLabel: '3:4',
      badge: '推荐',
      summary: '来自 ppt-master 的小红书画布规范：主标题上方留白更大，底部预留品牌区。',
      hint: '适合知识卡、教程拆解、种草清单。当前切片器会优先按 3:4 导出。',
      safeZones: [
        '顶部建议留白 12% 到 15%，避免标题和头像区域太挤。',
        '底部建议留白 8% 到 10%，给平台文案和交互元素留呼吸空间。'
      ],
      overlay: { top: 0.12, right: 0.06, bottom: 0.1, left: 0.06 },
      exportSuffix: 'xiaohongshu'
    },
    {
      id: 'moments',
      title: '微信朋友圈',
      ratio: '1:1',
      ratioLabel: '1:1',
      badge: '方图',
      summary: '参考 ppt-master 的朋友圈画布：中心区域更重要，四周适当留白更稳。',
      hint: '适合品牌海报、活动预告、单张重点信息图。当前切片器会自动切到 1:1。',
      safeZones: [
        '核心内容尽量放在中央约 78% 区域内，避免边缘显得拥挤。',
        '底部额外预留约 10%，给朋友圈文案截断和设备裁切留余量。'
      ],
      overlay: { top: 0.11, right: 0.11, bottom: 0.14, left: 0.11 },
      exportSuffix: 'moments'
    },
    {
      id: 'story',
      title: '微信/短视频竖屏封面',
      ratio: '9:16',
      ratioLabel: '9:16',
      badge: '竖屏',
      summary: '沿用 ppt-master 的 Story 安全区思路：顶部和底部都有固定遮挡风险。',
      hint: '适合视频封面、状态封面、故事流卡面。当前切片器会按 9:16 导出。',
      safeZones: [
        '顶部建议至少预留 120px 级别的安全区，避免状态栏与平台标题挡住内容。',
        '底部建议留约 180px 级别的安全区，防止按钮、输入栏、操作区遮挡。'
      ],
      overlay: { top: 0.09, right: 0.07, bottom: 0.16, left: 0.07 },
      exportSuffix: 'story'
    }
  ];

  let currentPresetId = readStoredPreset();
  let mo = null;

  bootstrap();

  function bootstrap() {
    attachDomObserver();
    patchDownloadNaming();
    applyPresetToPage();
    injectOverlay();
  }

  function attachDomObserver() {
    if (mo) {
      mo.disconnect();
    }

    const appRoot = document.querySelector('#app');
    if (!appRoot) {
      window.addEventListener('load', attachDomObserver, { once: true });
      window.addEventListener('resize', injectOverlay);
      return;
    }

    mo = new MutationObserver(() => {
      applyPresetToPage();
      injectOverlay();
    });

    mo.observe(appRoot, { childList: true });
    window.addEventListener('resize', injectOverlay);
  }

  function applyPresetToPage() {
    const workspace = document.querySelector('.workspace');
    const toolbar = document.querySelector('.toolbar');
    const ratioSelect = document.querySelector('#ratio-select');

    if (!workspace || !toolbar || !ratioSelect) {
      return;
    }

    mountPublishPanel(workspace);
    highlightPresetChoice();

    const preset = getCurrentPreset();
    if (ratioSelect.value !== preset.ratio) {
      ratioSelect.value = preset.ratio;
      ratioSelect.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const exportHint = document.querySelector('#publish-export-hint');
    if (exportHint) {
      exportHint.textContent = `导出文件会自动附带 “${preset.exportSuffix}” 后缀，方便直接发到对应平台。`;
    }
  }

  function mountPublishPanel(workspace) {
    let panel = document.querySelector('#publish-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'publish-panel';
      panel.id = 'publish-panel';
      workspace.insertAdjacentElement('afterend', panel);
    }

    const preset = getCurrentPreset();
    panel.hidden = false;
    panel.innerHTML = `
      <div class="publish-header">
        <div>
          <h3 class="publish-title">发布预设</h3>
          <p class="publish-subtitle">参考 <code>ppt-master</code> 里的小红书、朋友圈、Story 画布规范，给当前切片提供发布安全区建议。</p>
        </div>
        <span class="publish-badge">当前：${escapeHtml(preset.title)}</span>
      </div>
      <div class="publish-options">
        ${PRESETS.map((item) => `
          <button class="publish-option ${item.id === preset.id ? 'is-active' : ''}" type="button" data-publish-preset="${item.id}">
            <div class="publish-option-top">
              <span class="publish-option-title">${escapeHtml(item.title)}</span>
              <span class="publish-option-ratio">${escapeHtml(item.ratioLabel)}</span>
            </div>
            <div class="publish-option-body">${escapeHtml(item.summary)}</div>
            <div class="publish-option-body">${escapeHtml(item.hint)}</div>
          </button>
        `).join('')}
      </div>
      <div class="publish-hint-row">
        <div class="publish-hint-card">
          <span class="publish-hint-label">安全区建议</span>
          <ul class="publish-safezones">
            ${preset.safeZones.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
        <div class="publish-hint-card">
          <span class="publish-hint-label">导出提示</span>
          <div class="publish-hint">${escapeHtml(preset.summary)}</div>
          <div class="publish-export-hint" id="publish-export-hint"></div>
        </div>
      </div>
    `;

    panel.querySelectorAll('[data-publish-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextPresetId = button.getAttribute('data-publish-preset');
        if (!nextPresetId || nextPresetId === currentPresetId) {
          return;
        }

        currentPresetId = nextPresetId;
        localStorage.setItem(PRESET_STORAGE_KEY, currentPresetId);
        applyPresetToPage();
        injectOverlay();
        toast(`已切换到 ${getCurrentPreset().title} 预设`);
      });
    });
  }

  function highlightPresetChoice() {
    const ratioSelect = document.querySelector('#ratio-select');
    const preset = getCurrentPreset();
    if (!ratioSelect || ratioSelect.value !== preset.ratio) {
      return;
    }

    document.querySelectorAll('[data-publish-preset]').forEach((button) => {
      button.classList.toggle(
        'is-active',
        button.getAttribute('data-publish-preset') === preset.id
      );
    });

    const badge = document.querySelector('.publish-badge');
    if (badge) {
      badge.textContent = `当前：${preset.title}`;
    }
  }

  function injectOverlay() {
    const stage = document.querySelector('.preview-stage');
    if (!stage) {
      removeOverlay();
      return;
    }

    const preset = getCurrentPreset();
    const { top, right, bottom, left } = preset.overlay;
    const width = stage.clientWidth;
    const height = stage.clientHeight;

    if (!width || !height) {
      removeOverlay();
      return;
    }

    let overlay = document.querySelector('#publish-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'publish-overlay';
      overlay.id = 'publish-overlay';
      overlay.innerHTML = '<div class="publish-overlay-label"></div>';
      stage.appendChild(overlay);
    } else if (overlay.parentElement !== stage) {
      stage.appendChild(overlay);
    }

    overlay.style.left = `${Math.round(left * width)}px`;
    overlay.style.top = `${Math.round(top * height)}px`;
    overlay.style.width = `${Math.max(0, Math.round(width * (1 - left - right)))}px`;
    overlay.style.height = `${Math.max(0, Math.round(height * (1 - top - bottom)))}px`;
    overlay.querySelector('.publish-overlay-label').textContent = `${preset.title} 安全区`;
  }

  function removeOverlay() {
    document.querySelector('#publish-overlay')?.remove();
  }

  function patchDownloadNaming() {
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);

    URL.createObjectURL = function patchedCreateObjectURL(object) {
      const url = originalCreateObjectURL(object);
      queueMicrotask(() => renamePendingDownloads());
      return url;
    };

    document.addEventListener(
      'click',
      () => {
        queueMicrotask(() => renamePendingDownloads());
      },
      true
    );
  }

  function renamePendingDownloads() {
    const preset = getCurrentPreset();
    document.querySelectorAll('a[download]').forEach((anchor) => {
      if (!anchor.download || anchor.dataset.publishPresetPatched === preset.id) {
        return;
      }

      anchor.download = appendSuffix(anchor.download, preset.exportSuffix);
      anchor.dataset.publishPresetPatched = preset.id;
    });
  }

  function appendSuffix(fileName, suffix) {
    if (!fileName || fileName.includes(`-${suffix}.`) || fileName.endsWith(`-${suffix}`)) {
      return fileName;
    }

    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) {
      return `${fileName}-${suffix}`;
    }

    return `${fileName.slice(0, dotIndex)}-${suffix}${fileName.slice(dotIndex)}`;
  }

  function toast(message) {
    const toastElement = document.querySelector('#toast');
    if (!toastElement) {
      return;
    }

    toastElement.textContent = message;
    toastElement.classList.add('is-visible');
    window.clearTimeout(toastElement._publishToastTimer);
    toastElement._publishToastTimer = window.setTimeout(() => {
      toastElement.classList.remove('is-visible');
    }, 2200);
  }

  function getCurrentPreset() {
    return PRESETS.find((preset) => preset.id === currentPresetId) || PRESETS[0];
  }

  function readStoredPreset() {
    try {
      return localStorage.getItem(PRESET_STORAGE_KEY) || PRESETS[0].id;
    } catch {
      return PRESETS[0].id;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();
