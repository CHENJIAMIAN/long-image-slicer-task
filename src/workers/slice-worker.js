self.onmessage = async (event) => {
  const { id, bitmap, imageWidth, imageHeight, analysisScale = 1 } = event.data || {};

  try {
    const sampledWidth = Math.max(1, Math.round(imageWidth * analysisScale));
    const sampledHeight = Math.max(1, Math.round(imageHeight * analysisScale));
    const canvas = new OffscreenCanvas(sampledWidth, sampledHeight);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, sampledWidth, sampledHeight);
    const { data } = context.getImageData(0, 0, sampledWidth, sampledHeight);
    const complexity = new Float32Array(sampledHeight);
    const brightness = new Float32Array(sampledHeight);
    const edgeStrength = new Float32Array(sampledHeight);
    const sampleStep = Math.max(1, Math.floor(sampledWidth / 96));

    for (let y = 0; y < sampledHeight; y += 1) {
      let sum = 0;
      let sumSquares = 0;
      let edgeSum = 0;
      let previousValue = -1;
      for (let x = 0; x < sampledWidth; x += sampleStep) {
        const index = (y * sampledWidth + x) * 4;
        const value = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        sum += value;
        sumSquares += value * value;
        if (previousValue >= 0) {
          edgeSum += Math.abs(value - previousValue);
        }
        previousValue = value;
      }
      const count = Math.ceil(imageWidth / sampleStep);
      const mean = sum / count;
      brightness[y] = mean;
      complexity[y] = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
      edgeStrength[y] = edgeSum / Math.max(1, count - 1);
    }

    const candidates = [];
    for (let y = 12; y < sampledHeight - 12; y += 1) {
      const current = complexity[y];
      if (current > 34) {
        continue;
      }
      const localMin = Math.min(complexity[y - 1], complexity[y + 1], complexity[y - 2], complexity[y + 2]);
      if (current <= localMin + 2) {
        const blankSpan = measureBlankSpan(complexity, y, 28);
        const brightnessDrift = Math.abs(brightness[y - 1] - brightness[y + 1]);
        const splitContrast =
          Math.abs(brightness[y] - brightness[y - 6]) + Math.abs(brightness[y] - brightness[y + 6]);
        const localEdge = edgeStrength[y];
        const score =
          140 -
          current * 2.1 -
          localEdge * 1.4 -
          brightnessDrift * 0.8 +
          Math.min(blankSpan, 22) * 4.5 +
          Math.min(splitContrast, 30) * 0.6;

        candidates.push({
          y,
          score: Number(score.toFixed(2)),
          blankSpan,
          complexity: Number(current.toFixed(2)),
          edgeStrength: Number(localEdge.toFixed(2))
        });
      }
    }

    const filtered = dedupeCandidates(candidates);
    filtered.sort((a, b) => b.score - a.score);

    self.postMessage({
      id,
      result: {
        candidateCuts: filtered.slice(0, 400),
        complexity: Array.from(complexity),
        brightness: Array.from(brightness),
        edgeStrength: Array.from(edgeStrength)
      }
    });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : '切点分析失败'
    });
  } finally {
    bitmap.close?.();
  }
};

function measureBlankSpan(complexity, centerY, maxDistance) {
  const threshold = Math.max(18, complexity[centerY] + 10);
  let span = 1;

  for (let delta = 1; delta <= maxDistance; delta += 1) {
    const up = complexity[centerY - delta];
    const down = complexity[centerY + delta];
    if (up <= threshold) {
      span += 1;
    }
    if (down <= threshold) {
      span += 1;
    }
    if (up > threshold && down > threshold) {
      break;
    }
  }

  return span;
}

function dedupeCandidates(candidates) {
  const sorted = [...candidates].sort((a, b) => a.y - b.y);
  const result = [];

  for (const candidate of sorted) {
    const previous = result[result.length - 1];
    if (previous && Math.abs(previous.y - candidate.y) <= 18) {
      if (candidate.score > previous.score) {
        result[result.length - 1] = candidate;
      }
      continue;
    }
    result.push(candidate);
  }

  return result;
}
