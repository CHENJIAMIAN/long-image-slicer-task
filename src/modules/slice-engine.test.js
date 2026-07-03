import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalCuts, computeTargetHeight, getSlices, snapCut } from './slice-engine.js';

const ratio34 = { width: 3, height: 4 };

test('computeTargetHeight 返回 3:4 对应高度', () => {
  assert.equal(computeTargetHeight(1080, ratio34), 1440);
});

test('buildFinalCuts 在短图时不切片', () => {
  const cuts = buildFinalCuts({
    imageHeight: 1200,
    imageWidth: 1080,
    ratio: ratio34,
    candidateCuts: [],
    manualCuts: []
  });
  assert.deepEqual(cuts, []);
});

test('buildFinalCuts 会保留手动切点并保持递增', () => {
  const cuts = buildFinalCuts({
    imageHeight: 5200,
    imageWidth: 1080,
    ratio: ratio34,
    candidateCuts: [
      { y: 1710, score: 120, blankSpan: 20, complexity: 4, edgeStrength: 2 },
      { y: 3450, score: 118, blankSpan: 18, complexity: 5, edgeStrength: 2 }
    ],
    manualCuts: [1600]
  });
  assert.equal(cuts.length, 3);
  assert.ok(cuts[0] < cuts[1]);
  assert.ok(cuts[1] < cuts[2]);
  assert.equal(cuts[0], 1600);
});

test('snapCut 在阈值内吸附，阈值外保持原值', () => {
  assert.equal(snapCut(100, [{ y: 105 }], true), 105);
  assert.equal(snapCut(100, [{ y: 120 }], true), 100);
  assert.equal(snapCut(100, [{ y: 105 }], false), 100);
});

test('getSlices 根据切点生成切片区间', () => {
  const slices = getSlices(1000, [300, 680]);
  assert.deepEqual(
    slices.map((item) => ({ start: item.start, end: item.end, height: item.height })),
    [
      { start: 0, end: 300, height: 300 },
      { start: 300, end: 680, height: 380 },
      { start: 680, end: 1000, height: 320 }
    ]
  );
});
