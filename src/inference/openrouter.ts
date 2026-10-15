import { BoxCoords, Detection, PipelineEvent, ProductMatch, ScanInput } from '@/types/contracts';
import { cropRegion, makeThumbUrl } from './imageUtils';

declare const __DEFAULT_OPENROUTER_KEY__: string;

export function getOpenRouterApiKey(): string {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('openrouter_api_key') : null;
  if (stored && stored.trim().length > 0) return stored.trim();

  if (typeof __DEFAULT_OPENROUTER_KEY__ !== 'undefined' && __DEFAULT_OPENROUTER_KEY__) {
    return __DEFAULT_OPENROUTER_KEY__;
  }

  // Vite env
  const viteKey = import.meta.env?.VITE_OPENROUTER_API_KEY;
  if (viteKey) return viteKey;

  return '';
}

export function setOpenRouterApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem('openrouter_api_key', key.trim());
    } else {
      localStorage.removeItem('openrouter_api_key');
    }
  }
}

export function getSelectedModel(): string {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('openrouter_model') : null;
  return stored || 'openai/gpt-6-luna';
}

export function setSelectedModel(model: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('openrouter_model', model);
  }
}

interface OpenRouterItemResponse {
  displayName?: string;
  name?: string;
  brand?: string | null;
  variant?: string | null;
  category?: string | null;
  ingredient?: string | null;
  count?: number;
  confidence?: number;
  box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  box_2d?: [number, number, number, number];
}

/**
 * Executes cloud visual grocery recognition using OpenRouter multimodal vision models.
 */
export async function runOpenRouterPipeline(
  input: ScanInput,
  emit: (event: PipelineEvent) => void,
  options?: { apiKey?: string; model?: string }
): Promise<void> {
  const startTime = Date.now();
  const apiKey = options?.apiKey || getOpenRouterApiKey();
  const model = options?.model || getSelectedModel();

  if (!apiKey) {
    emit({
      type: 'error',
      stage: 'loading-model',
      message: 'OpenRouter API key is missing. Please enter your OpenRouter key in Settings.',
      recoverable: true,
    });
    return;
  }

  try {
    emit({
      type: 'stage',
      stage: 'loading-model',
      message: `Connecting to OpenRouter (${model})...`,
    });

    // 1. Prepare base64 image (scale to max 1280 to preserve quality while keeping payload reasonable)
    const sw = input.fullResCanvas.width;
    const sh = input.fullResCanvas.height;
    const maxSide = 1280;
    const scale = Math.min(1.0, maxSide / Math.max(sw, sh));
    const targetW = Math.round(sw * scale);
    const targetH = Math.round(sh * scale);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetW;
    tempCanvas.height = targetH;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context');
    ctx.drawImage(input.fullResCanvas, 0, 0, sw, sh, 0, 0, targetW, targetH);
    const base64Data = tempCanvas.toDataURL('image/jpeg', 0.85);

    emit({
      type: 'stage',
      stage: 'detecting',
      message: `Analyzing grocery image with ${model}...`,
    });

    const promptText = `Examine this grocery photo carefully. Identify every visible grocery product, packaged food, produce item, and beverage.
Return a JSON object with key "items", containing a list of objects with:
- "displayName": exact full product title (e.g. "Campbell's Condensed Chicken Noodle Soup", "Fresh Bananas", "Great Value 2% Milk")
- "brand": brand name if visible, or null for produce/generic
- "variant": specific variety, flavor, or fat percentage (e.g. "Chicken Noodle", "2% Reduced Fat", "Gala"), or null
- "category": one of ["produce", "dairy", "bakery", "canned", "pantry", "beverages", "snacks", "frozen", "meat", "other"]
- "ingredient": key ingredient profile or ingredients summary (e.g. "Chicken, noodles, broth", "100% gala apple", "Grade A pasteurized milk")
- "count": integer count of visible items of this type (at least 1)
- "confidence": integer score 0-100
- "box": bounding box as [ymin, xmin, ymax, xmax] normalized integers from 0 to 1000

Format as strictly valid JSON only.`;

    const requestBody = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert grocery scanner AI that outputs strictly valid JSON only.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: base64Data } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    };

    const detectStartTime = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Anirudh-Sohaney/MedProject',
        'X-Title': 'Grocery Scanner',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedMsg = `OpenRouter API error ${response.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) {
          parsedMsg = errJson.error.message;
        }
      } catch {
        // ignore
      }
      throw new Error(parsedMsg);
    }

    const jsonResp = await response.json();
    const contentStr = jsonResp.choices?.[0]?.message?.content || '{}';
    let parsedData: { items?: OpenRouterItemResponse[] };
    try {
      parsedData = JSON.parse(contentStr);
    } catch {
      throw new Error('Failed to parse AI response into JSON');
    }

    const rawItems: OpenRouterItemResponse[] = parsedData.items || [];
    const detectElapsed = Date.now() - detectStartTime;

    emit({
      type: 'stage',
      stage: 'matching',
      message: `Parsed ${rawItems.length} items from AI response...`,
    });

    const detections: Detection[] = [];
    const matches: ProductMatch[] = [];

    rawItems.forEach((item, index) => {
      const name = item.displayName || item.name || 'Grocery item';
      const boxCoords: [number, number, number, number] =
        item.box || item.box_2d || [100, 100, 900, 900];

      const ymin = Math.max(0, Math.min(1000, boxCoords[0])) / 1000;
      const xmin = Math.max(0, Math.min(1000, boxCoords[1])) / 1000;
      const ymax = Math.max(0, Math.min(1000, boxCoords[2])) / 1000;
      const xmax = Math.max(0, Math.min(1000, boxCoords[3])) / 1000;

      const normBox: BoxCoords = {
        x1: Math.min(xmin, xmax),
        y1: Math.min(ymin, ymax),
        x2: Math.max(xmin, xmax),
        y2: Math.max(ymin, ymax),
      };

      const fullBox: BoxCoords = {
        x1: Math.round(normBox.x1 * input.width),
        y1: Math.round(normBox.y1 * input.height),
        x2: Math.round(normBox.x2 * input.width),
        y2: Math.round(normBox.y2 * input.height),
      };

      const detId = `or_det_${index}_${Date.now()}`;
      const isProduce = (item.category || '').toLowerCase() === 'produce';

      const det: Detection = {
        id: detId,
        box: normBox,
        boxFull: fullBox,
        classId: index,
        className: name,
        score: (item.confidence || 90) / 100,
        isProduce,
      };
      detections.push(det);

      // Extract crop thumbnail
      const crop = cropRegion(input.fullResCanvas, normBox);
      const cropThumbUrl = makeThumbUrl(crop);

      const match: ProductMatch = {
        detectionId: detId,
        displayName: name,
        productId: null,
        brand: item.brand || null,
        variant: item.variant || null,
        category: item.category || 'pantry',
        ingredient: item.ingredient || null,
        confidence: Math.round(item.confidence || 92),
        detectorScore: det.score,
        ocrMatch: 1.0,
        candidateMargin: 0.9,
        cropThumbUrl,
        status: 'identified',
        count: item.count || 1,
        box: normBox,
      };

      matches.push(match);
      emit({
        type: 'identified',
        match,
      });
    });

    emit({
      type: 'detected',
      detections,
      omitted: 0,
      elapsedMs: detectElapsed,
    });

    const totalMs = Date.now() - startTime;
    emit({
      type: 'done',
      matches,
      timings: {
        modelLoadMs: 50,
        detectMs: detectElapsed,
        ocrMs: 0,
        matchMs: 10,
        totalMs,
        cold: false,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({
      type: 'error',
      stage: 'detecting',
      message: msg,
      recoverable: true,
    });
  }
}
