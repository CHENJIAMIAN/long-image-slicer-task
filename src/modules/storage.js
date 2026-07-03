import { buildHistorySummary } from './session-utils.js';

const CURRENT_SESSION_KEY = 'long-image-slicer:current-session';
const HISTORY_KEY = 'long-image-slicer:history';
const MAX_HISTORY_ITEMS = 8;

export function saveCurrentSession(session) {
  writeJson(CURRENT_SESSION_KEY, session);
}

export function loadCurrentSession() {
  return readJson(CURRENT_SESSION_KEY);
}

export function clearCurrentSessionStorage() {
  removeKey(CURRENT_SESSION_KEY);
}

export function saveSessionToHistory(session) {
  const history = loadSessionHistory();
  const summary = buildHistoryEntry(session);
  const deduped = history.filter((item) => item.id !== summary.id);
  deduped.unshift(summary);
  writeJson(HISTORY_KEY, deduped.slice(0, MAX_HISTORY_ITEMS));
}

export function loadSessionHistory() {
  const history = readJson(HISTORY_KEY);
  return Array.isArray(history) ? history : [];
}

export function deleteHistoryItem(id) {
  const history = loadSessionHistory().filter((item) => item.id !== id);
  writeJson(HISTORY_KEY, history);
}

function buildHistoryEntry(session) {
  return buildHistorySummary(session);
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略存储失败，保证主流程继续可用
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 忽略清理失败
  }
}
