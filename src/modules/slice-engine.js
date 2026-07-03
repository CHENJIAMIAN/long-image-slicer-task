import {
  LARGE_IMAGE_ANALYSIS_HEIGHT,
  LARGE_IMAGE_HEIGHT_THRESHOLD,
  MAX_SLICE_COUNT,
  MIN_SLICE_COUNT,
  SNAP_THRESHOLD
} from './constants.js';

let worker;
let requestId = 0;

export function computeTargetHeight(imageWidth, ratio) {
  return Math.round(imageWidth * (ratio.height / ratio.width));
}

export async function computeCuts(image) {
  const bitmap = await createImageBitmap(image);
  const currentId = ++requestId;
  const engine = getWorker();
  const scale = image.naturalHeight > LARGE_IMAGE_HEIGHT_THRESHOLD
    ? LARGE_IMAGE_ANALYSIS_HEIGHT / image.naturalHeight
    : 1;

  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const { id, error, result } = event.data || {};
      if (id !== currentId) {
        return;
      }
      engine.removeEventListener('message', onMessage);
      engine.removeEventListener('error', onError);
      bitmap.close();
      if (error) {
        reject(new Error(error));
      } else {
        resolve({
          ...result,
          candidateCuts: remapCandidates(result.candidateCuts || [], scale),
          analysisScale: scale
        });
      }
    };

    const onError = (error) => {
      engine.removeEventListener('message', onMessage);
      engine.removeEventListener('error', onError);
      bitmap.close();
      reject(error);
    };

    engine.addEventListener('message', onMessage);
    engine.addEventListener('error', onError);
    engine.postMessage(
      {
        id: currentId,
        bitmap,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        analysisScale: scale
      },
      [bitmap]
    );
  });
}

export function buildFinalCuts({ imageHeight, imageWidth, ratio, candidateCuts, manualCuts = [] }) {
  const targetHeight = computeTargetHeight(imageWidth, ratio);
  if (imageHeight <= targetHeight) {
    return [];
  }

  const sliceCount = clamp(Math.round(imageHeight / targetHeight), MIN_SLICE_COUNT, MAX_SLICE_COUNT);
  const idealCuts = buildOptimalCuts({ imageHeight, targetHeight, sliceCount, candidateCuts });
  const cuts = [];
  const manualMap = new Map(manualCuts.map((value, index) => [index, value]));

  for (let index = 1; index < sliceCount; index += 1) {
    const ideal = idealCuts[index - 1] ?? Math.round((imageHeight * index) / sliceCount);
    const manual = manualMap.get(index - 1);
    if (typeof manual === 'number') {
      cuts.push(manual);
      continue;
    }

    const snapped = findNearestCandidate(ideal, candidateCuts);
    cuts.push(snapped ?? ideal);
  }

  return normalizeCuts(cuts, imageHeight, targetHeight);
}

export function findNearestCandidate(target, candidates = []) {
  let best;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate.y - target);
    if (distance < bestDistance) {
      best = candidate.y;
      bestDistance = distance;
    }
  }

  if (bestDistance <= 120) {
    return best;
  }

  return undefined;
}

export function snapCut(y, candidates = [], useSnap = true) {
  if (!useSnap) {
    return y;
  }

  let result = y;
  for (const candidate of candidates) {
    if (Math.abs(candidate.y - y) <= SNAP_THRESHOLD) {
      result = candidate.y;
      break;
    }
  }
  return result;
}

export function getSlices(imageHeight, cuts = []) {
  const edges = [0, ...cuts, imageHeight];
  return edges.slice(0, -1).map((start, index) => ({
    index,
    start,
    end: edges[index + 1],
    height: edges[index + 1] - start
  }));
}

function normalizeCuts(cuts, imageHeight, targetHeight) {
  const sorted = [...cuts].sort((a, b) => a - b);
  const minGap = Math.max(120, Math.floor(targetHeight * 0.35));
  const normalized = [];

  for (const cut of sorted) {
    const min = normalized.length ? normalized[normalized.length - 1] + minGap : minGap;
    const max = imageHeight - minGap;
    const value = clamp(Math.round(cut), min, max);
    normalized.push(value);
  }

  return normalized;
}

function buildOptimalCuts({ imageHeight, targetHeight, sliceCount, candidateCuts }) {
  const ideals = Array.from({ length: sliceCount - 1 }, (_, index) =>
    Math.round((imageHeight * (index + 1)) / sliceCount)
  );
  const windows = ideals.map((ideal, index) => {
    const prev = index === 0 ? 0 : ideals[index - 1];
    const next = index === ideals.length - 1 ? imageHeight : ideals[index + 1];
    const min = Math.max(prev + 120, ideal - Math.max(160, Math.round(targetHeight * 0.18)));
    const max = Math.min(next - 120, ideal + Math.max(160, Math.round(targetHeight * 0.18)));
    const candidates = candidateCuts.filter((candidate) => candidate.y >= min && candidate.y <= max);
    return candidates.length ? candidates : [{ y: ideal, score: 0 }];
  });

  const states = windows.map((options, index) =>
    options.map((option) => ({
      y: option.y,
      totalScore: scoreOption(option, ideals[index], targetHeight),
      previous: -1
    }))
  );

  for (let index = 1; index < states.length; index += 1) {
    const prevStates = states[index - 1];
    for (const current of states[index]) {
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestPrevious = -1;
      for (let prevIndex = 0; prevIndex < prevStates.length; prevIndex += 1) {
        const previous = prevStates[prevIndex];
        const gap = current.y - previous.y;
        if (gap < Math.max(120, Math.floor(targetHeight * 0.35))) {
          continue;
        }
        const balancePenalty = Math.abs(gap - targetHeight) * 0.02;
        const score = previous.totalScore + scoreOption(current, ideals[index], targetHeight) - balancePenalty;
        if (score > bestScore) {
          bestScore = score;
          bestPrevious = prevIndex;
        }
      }
      if (bestPrevious >= 0) {
        current.totalScore = bestScore;
        current.previous = bestPrevious;
      }
    }
  }

  if (!states.length) {
    return [];
  }

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const lastStates = states[states.length - 1];
  for (let index = 0; index < lastStates.length; index += 1) {
    if (lastStates[index].totalScore > bestScore) {
      bestScore = lastStates[index].totalScore;
      bestIndex = index;
    }
  }

  const cuts = [];
  let cursor = bestIndex;
  for (let layer = states.length - 1; layer >= 0; layer -= 1) {
    const entry = states[layer][cursor];
    cuts.unshift(entry?.y ?? ideals[layer]);
    cursor = entry?.previous ?? -1;
    if (cursor < 0 && layer > 0) {
      for (let fallback = layer - 1; fallback >= 0; fallback -= 1) {
        cuts.unshift(ideals[fallback]);
      }
      break;
    }
  }

  return cuts;
}

function scoreOption(option, ideal, targetHeight) {
  const distancePenalty = Math.abs(option.y - ideal) * 0.08;
  const blankBonus = (option.blankSpan ?? 0) * 1.4;
  const complexityPenalty = (option.complexity ?? 0) * 0.5;
  const edgePenalty = (option.edgeStrength ?? 0) * 0.35;
  const targetBias = Math.min(28, targetHeight * 0.02);
  return (option.score ?? 0) + blankBonus - distancePenalty - complexityPenalty - edgePenalty + targetBias;
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/slice-worker.js', import.meta.url), {
      type: 'module'
    });
  }
  return worker;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function remapCandidates(candidates, scale) {
  if (!scale || scale === 1) {
    return candidates;
  }

  return candidates.map((candidate) => ({
    ...candidate,
    y: Math.round(candidate.y / scale)
  }));
}
