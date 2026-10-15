import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '@/inference/pipeline';
import * as detectorModule from '@/inference/detector';
import * as ocrModule from '@/inference/ocr';
import { Detection, PipelineEvent, ScanInput } from '@/types/contracts';

describe('Pipeline Event Orchestration (Integration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const dummyCanvas = document.createElement('canvas');
  dummyCanvas.width = 416;
  dummyCanvas.height = 416;

  const mockInput: ScanInput = {
    detectorCanvas: dummyCanvas,
    fullResCanvas: dummyCanvas,
    objectUrl: 'blob:test',
    width: 416,
    height: 416,
  };

  it('emits the expected lifecycle events in order: loading -> detecting -> detected -> reading-label -> identified -> done', async () => {
    const mockDetections: Detection[] = [
      {
        id: 'det_1',
        box: { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 },
        boxFull: { x1: 10, y1: 10, x2: 50, y2: 50 },
        classId: 0,
        className: 'apple',
        score: 0.9,
        isProduce: true,
      },
      {
        id: 'det_2',
        box: { x1: 0.5, y1: 0.1, x2: 0.9, y2: 0.8 },
        boxFull: { x1: 50, y1: 10, x2: 90, y2: 80 },
        classId: 16,
        className: 'milk jug',
        score: 0.85,
        isProduce: false,
      },
    ];

    vi.spyOn(detectorModule, 'loadDetector').mockResolvedValue({
      predict: async () => ({ detections: mockDetections, omitted: 0 }),
      metadata: {
        modelName: 'groceries.onnx',
        inputSize: 416,
        classes: ['apple', 'milk jug'],
        produceClasses: ['apple'],
        labelMapIndex: {},
        exportMode: 'detection',
      },
      isWarm: false,
    });

    async function* mockReadLabels() {
      yield {
        type: 'ocr-start' as const,
        detectionId: 'det_2',
        index: 1,
        total: 1,
      };
      yield {
        type: 'ocr-end' as const,
        detectionId: 'det_2',
        result: {
          detectionId: 'det_2',
          text: 'Great Value Whole Milk',
          tokens: ['great', 'value', 'whole', 'milk'],
          heightPx: 100,
          attempts: 1,
          durationMs: 50,
        },
      };
    }

    vi.spyOn(ocrModule, 'readLabels').mockImplementation(mockReadLabels as unknown as typeof ocrModule.readLabels);

    const emitted: PipelineEvent[] = [];
    await runPipeline(mockInput, (e) => emitted.push(e));

    const eventTypes = emitted.map((e) => e.type);
    expect(eventTypes).toContain('stage');
    expect(eventTypes).toContain('detected');
    expect(eventTypes).toContain('ocr-start');
    expect(eventTypes).toContain('ocr-end');
    expect(eventTypes).toContain('identified');
    expect(eventTypes).toContain('done');

    const doneEvent = emitted.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    if (doneEvent && doneEvent.type === 'done') {
      expect(doneEvent.matches.length).toBeGreaterThanOrEqual(1);
      expect(doneEvent.timings.totalMs).toBeGreaterThanOrEqual(0);
      expect(doneEvent.timings.cold).toBe(true);
    }
  });

  it('handles detector runtime exceptions by emitting a non-recoverable error event', async () => {
    vi.spyOn(detectorModule, 'loadDetector').mockResolvedValue({
      predict: async () => {
        throw new Error('WASM out of memory');
      },
      metadata: {
        modelName: 'groceries.onnx',
        inputSize: 416,
        classes: [],
        produceClasses: [],
        labelMapIndex: {},
        exportMode: 'detection',
      },
      isWarm: true,
    });

    const emitted: PipelineEvent[] = [];
    await runPipeline(mockInput, (e) => emitted.push(e));

    const errorEvent = emitted.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent && errorEvent.type === 'error') {
      expect(errorEvent.message).toContain('WASM out of memory');
      expect(errorEvent.stage).toBe('detecting');
      expect(errorEvent.recoverable).toBe(false);
    }
  });
});
