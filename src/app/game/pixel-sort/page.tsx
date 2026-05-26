'use client';

import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Brush,
  Copy,
  Crop,
  Download,
  Eraser,
  ImagePlus,
  Layers,
  MousePointer2,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shuffle,
  SlidersHorizontal,
  Upload,
  WandSparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const EMPTY_CELL = -1;
const MIN_DIMENSION = 4;
const MAX_DIMENSION = 256;
const MIN_TRAY_CAPACITY = 6;
const MAX_TRAY_CAPACITY = 36;
const MAX_PALETTE_SIZE = 18;
const COLLECTION_KEY = 'levelforge.pixel-sort.collection.v1';
const DENSITY_PRESETS = [16, 32, 64, 128, 256];

const DEFAULT_PALETTE = [
  '#111827',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#38bdf8',
  '#2563eb',
  '#a855f7',
  '#ef4444',
  '#f8fafc',
  '#78716c',
];

const DEFAULT_ART_IMPORT_SETTINGS: ArtImportSettings = {
  fitMode: 'contain',
  sampleMode: 'smart',
  paletteMode: 'quantized',
  cropX: 0,
  cropY: 0,
  cropWidth: 100,
  cropHeight: 100,
  alphaCutoff: 24,
  coverageCutoff: 8,
  discardTransparent: true,
  autoCropTransparent: true,
  edgeBoost: 65,
  brightness: 0,
  contrast: 12,
  saturation: 10,
};

type PaintTool = 'brush' | 'erase';
type ArtFitMode = 'contain' | 'cover' | 'stretch';
type ArtSampleMode = 'nearest' | 'average' | 'smart';
type ArtPaletteMode = 'quantized' | 'source' | 'active';

type ImportedArtAsset = {
  name: string;
  width: number;
  height: number;
  dataUrl: string;
};

type ArtImportSettings = {
  fitMode: ArtFitMode;
  sampleMode: ArtSampleMode;
  paletteMode: ArtPaletteMode;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  alphaCutoff: number;
  coverageCutoff: number;
  discardTransparent: boolean;
  autoCropTransparent: boolean;
  edgeBoost: number;
  brightness: number;
  contrast: number;
  saturation: number;
};

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type SampledPixel = RgbColor & {
  column: number;
  row: number;
  coveragePercent: number;
};

type SampledColor = RgbColor & {
  coveragePercent: number;
};

type PixelSortPaletteEntry = {
  id: string;
  colorR: number;
  colorG: number;
  colorB: number;
  colorA: number;
  hex: string;
};

type PixelSortCell = {
  cellId: number;
  q: number;
  r: number;
  offsetColumn: number;
  offsetRow: number;
  paletteIndex: number;
};

type PixelSortMetrics = {
  cellCount: number;
  transparentCellCount: number;
  paletteCount: number;
  componentCount: number;
  largestComponent: number;
  largestPaletteCount: number;
  startingCorrect: number;
  startingCorrectPercent: number;
  trayPressurePercent: number;
  fragmentationPercent: number;
  difficultyScore: number;
  difficultyTier: 'Easy' | 'Medium' | 'Hard' | 'Expert';
};

type PixelSortLevel = {
  format: 'hextory-pixel-sort-level';
  schemaVersion: 1;
  id: string;
  levelNumber: number;
  displayName: string;
  subject: string;
  columns: number;
  rows: number;
  trayCapacity: number;
  paletteLimit: number;
  shuffleSeed: number;
  palette: PixelSortPaletteEntry[];
  cells: PixelSortCell[];
  startingTileIdsByCell: number[];
  startingTrayTileIds: number[];
  metrics: PixelSortMetrics;
};

type RuntimeMaps = {
  cellById: Map<number, PixelSortCell>;
  cellIdByCoord: Map<string, number>;
  paletteByTileId: Map<number, number>;
};

type BoardState = {
  tileByCellId: Record<number, number | null>;
  trayTileIds: number[];
  selectedTileIds: number[];
  moves: number;
  selections: number;
  trayMoves: number;
  placements: number;
  lastMessage: string;
};

function coordKey(column: number, row: number) {
  return `${column}:${row}`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function readInt(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function normalizeHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#111827';
}

function componentToHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
}

function parseHexColor(hex: string): RgbColor {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function hexToPaletteEntry(hex: string, index: number): PixelSortPaletteEntry {
  const normalized = normalizeHex(hex);
  return {
    id: `color_${index + 1}`,
    colorR: Number.parseInt(normalized.slice(1, 3), 16),
    colorG: Number.parseInt(normalized.slice(3, 5), 16),
    colorB: Number.parseInt(normalized.slice(5, 7), 16),
    colorA: 255,
    hex: normalized,
  };
}

function colorDistanceSquared(a: RgbColor, b: RgbColor) {
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return red * red + green * green + blue * blue;
}

function nearestPaletteIndex(color: RgbColor, paletteHexes: string[]) {
  const paletteColors = paletteHexes.map(parseHexColor);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  paletteColors.forEach((candidate, index) => {
    const distance = colorDistanceSquared(color, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function adjustColor(color: RgbColor, settings: ArtImportSettings): RgbColor {
  const brightness = settings.brightness;
  const contrastFactor = (259 * (settings.contrast + 255)) / (255 * (259 - settings.contrast));
  const saturationFactor = 1 + settings.saturation / 100;
  const luminance = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;

  const adjustChannel = (channel: number) => {
    const saturated = luminance + (channel - luminance) * saturationFactor;
    const contrasted = contrastFactor * (saturated - 128) + 128;
    return clamp(Math.round(contrasted + brightness), 0, 255);
  };

  return {
    r: adjustChannel(color.r),
    g: adjustChannel(color.g),
    b: adjustChannel(color.b),
  };
}

function extractFrequentPalette(colors: RgbColor[], maxColors: number) {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  colors.forEach((color) => {
    const key = `${color.r >> 3}:${color.g >> 3}:${color.b >> 3}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += color.r;
    bucket.g += color.g;
    bucket.b += color.b;
    bucket.count += 1;
    buckets.set(key, bucket);
  });

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((bucket) => rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count));
}

function quantizePalette(colors: RgbColor[], maxColors: number) {
  if (colors.length === 0) return DEFAULT_PALETTE.slice(0, Math.max(2, maxColors));

  const seeds = extractFrequentPalette(colors, maxColors).map(parseHexColor);
  const centers = seeds.length > 0 ? seeds : [colors[0]];

  while (centers.length < maxColors && centers.length < colors.length) {
    const next = colors[(centers.length * 997) % colors.length];
    if (centers.every((center) => colorDistanceSquared(center, next) > 256)) centers.push(next);
    else break;
  }

  for (let iteration = 0; iteration < 6; iteration++) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    colors.forEach((color) => {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const distance = colorDistanceSquared(color, center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      sums[bestIndex].r += color.r;
      sums[bestIndex].g += color.g;
      sums[bestIndex].b += color.b;
      sums[bestIndex].count += 1;
    });

    sums.forEach((sum, index) => {
      if (sum.count === 0) return;
      centers[index] = {
        r: Math.round(sum.r / sum.count),
        g: Math.round(sum.g / sum.count),
        b: Math.round(sum.b / sum.count),
      };
    });
  }

  return centers.slice(0, maxColors).map((center) => rgbToHex(center.r, center.g, center.b));
}

function ensureMinimumPalette(paletteHexes: string[]) {
  const normalized = paletteHexes.map(normalizeHex).filter((hex, index, all) => all.indexOf(hex) === index);
  for (const fallback of DEFAULT_PALETTE) {
    if (normalized.length >= 2) break;
    if (!normalized.includes(fallback)) normalized.push(fallback);
  }
  return normalized.slice(0, MAX_PALETTE_SIZE);
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image asset'));
    image.src = dataUrl;
  });
}

function readImportedArtFile(file: File) {
  return new Promise<ImportedArtAsset>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const image = new Image();
      image.onload = () =>
        resolve({
          name: file.name,
          width: image.naturalWidth,
          height: image.naturalHeight,
          dataUrl,
        });
      image.onerror = () => reject(new Error('Unsupported image asset'));
      image.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Unable to read image asset'));
    reader.readAsDataURL(file);
  });
}

function getAlphaBounds(sourceData: Uint8ClampedArray, width: number, height: number, alphaCutoff: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const threshold = clamp(alphaCutoff, 0, 255);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = sourceData[getPixelIndex(width, x, y) + 3];
      if (alpha <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };

  const pad = 2;
  minX = clamp(minX - pad, 0, width - 1);
  minY = clamp(minY - pad, 0, height - 1);
  maxX = clamp(maxX + pad, 0, width - 1);
  maxY = clamp(maxY + pad, 0, height - 1);
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function getImageDrawPlan(
  image: HTMLImageElement,
  settings: ArtImportSettings,
  columns: number,
  rows: number,
  sourceData?: Uint8ClampedArray
) {
  const base = settings.autoCropTransparent && sourceData
    ? getAlphaBounds(sourceData, image.naturalWidth, image.naturalHeight, settings.alphaCutoff)
    : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };

  let sx = base.x + (clamp(settings.cropX, 0, 99) / 100) * base.width;
  let sy = base.y + (clamp(settings.cropY, 0, 99) / 100) * base.height;
  let sw = (clamp(settings.cropWidth, 1, 100) / 100) * base.width;
  let sh = (clamp(settings.cropHeight, 1, 100) / 100) * base.height;
  sw = Math.min(sw, base.x + base.width - sx);
  sh = Math.min(sh, base.y + base.height - sy);

  let dx = 0;
  let dy = 0;
  let dw = columns;
  let dh = rows;
  const sourceAspect = sw / sh;
  const targetAspect = columns / rows;

  if (settings.fitMode === 'cover') {
    if (sourceAspect > targetAspect) {
      const nextWidth = sh * targetAspect;
      sx += (sw - nextWidth) / 2;
      sw = nextWidth;
    } else if (sourceAspect < targetAspect) {
      const nextHeight = sw / targetAspect;
      sy += (sh - nextHeight) / 2;
      sh = nextHeight;
    }
  }

  if (settings.fitMode === 'contain') {
    if (sourceAspect > targetAspect) {
      dh = columns / sourceAspect;
      dy = (rows - dh) / 2;
    } else if (sourceAspect < targetAspect) {
      dw = rows * sourceAspect;
      dx = (columns - dw) / 2;
    }
  }

  return { sx, sy, sw, sh, dx, dy, dw, dh };
}

function getPixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function shouldDiscardAlpha(alpha: number, coveragePercent: number, settings: ArtImportSettings) {
  return (
    settings.discardTransparent &&
    (alpha <= settings.alphaCutoff || coveragePercent < settings.coverageCutoff)
  );
}

function sampleNearestSourceColor(params: {
  sourceData: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  settings: ArtImportSettings;
}): SampledColor | null {
  const x = clamp(Math.floor((params.x0 + params.x1) * 0.5), 0, params.sourceWidth - 1);
  const y = clamp(Math.floor((params.y0 + params.y1) * 0.5), 0, params.sourceHeight - 1);
  const index = getPixelIndex(params.sourceWidth, x, y);
  const alpha = params.sourceData[index + 3];
  const coveragePercent = Math.round((alpha / 255) * 100);

  if (shouldDiscardAlpha(alpha, coveragePercent, params.settings)) return null;

  return {
    ...adjustColor(
      {
        r: params.sourceData[index],
        g: params.sourceData[index + 1],
        b: params.sourceData[index + 2],
      },
      params.settings
    ),
    coveragePercent,
  };
}

function sampleAverageSourceColor(params: {
  sourceData: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  settings: ArtImportSettings;
}): SampledColor | null {
  const startX = clamp(Math.floor(params.x0), 0, params.sourceWidth - 1);
  const endX = clamp(Math.ceil(params.x1), startX + 1, params.sourceWidth);
  const startY = clamp(Math.floor(params.y0), 0, params.sourceHeight - 1);
  const endY = clamp(Math.ceil(params.y1), startY + 1, params.sourceHeight);

  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  let alphaTotal = 0;
  let sampleCount = 0;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = getPixelIndex(params.sourceWidth, x, y);
      const alpha = params.sourceData[index + 3];
      const alphaWeight = alpha / 255;
      alphaTotal += alphaWeight;
      sampleCount++;

      if (params.settings.discardTransparent && alpha <= params.settings.alphaCutoff) continue;

      const sampleWeight = params.settings.discardTransparent ? alphaWeight : 1;
      red += params.sourceData[index] * sampleWeight;
      green += params.sourceData[index + 1] * sampleWeight;
      blue += params.sourceData[index + 2] * sampleWeight;
      weight += sampleWeight;
    }
  }

  const coveragePercent = sampleCount === 0 ? 0 : Math.round((alphaTotal / sampleCount) * 100);
  if (shouldDiscardAlpha(weight <= 0 ? 0 : Math.round((weight / sampleCount) * 255), coveragePercent, params.settings)) {
    return null;
  }
  if (weight <= 0) return null;

  return {
    ...adjustColor(
      {
        r: red / weight,
        g: green / weight,
        b: blue / weight,
      },
      params.settings
    ),
    coveragePercent,
  };
}

function blendColor(a: RgbColor, b: RgbColor, amount: number): RgbColor {
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function sampleSmartSourceColor(params: {
  sourceData: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  settings: ArtImportSettings;
}): SampledColor | null {
  const average = sampleAverageSourceColor(params);
  const nearest = sampleNearestSourceColor(params);
  if (!average) return nearest;
  if (!nearest) return average;

  const edgeSignal = Math.sqrt(colorDistanceSquared(average, nearest)) / 255;
  const edgeAmount = clamp((params.settings.edgeBoost / 100) * edgeSignal, 0, 0.72);
  return {
    ...blendColor(average, nearest, edgeAmount),
    coveragePercent: Math.max(average.coveragePercent, nearest.coveragePercent),
  };
}

function sampleSourceColor(params: {
  sourceData: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  settings: ArtImportSettings;
}) {
  if (params.settings.sampleMode === 'smart') return sampleSmartSourceColor(params);
  if (params.settings.sampleMode === 'nearest') return sampleNearestSourceColor(params);
  return sampleAverageSourceColor(params);
}

function getSampledPixelMap(pixels: SampledPixel[]) {
  const map = new Map<string, SampledPixel>();
  pixels.forEach((pixel) => map.set(coordKey(pixel.column, pixel.row), pixel));
  return map;
}

function getPixelEdgeScore(pixel: SampledPixel, pixelMap: Map<string, SampledPixel>) {
  const neighbors = [
    pixelMap.get(coordKey(pixel.column + 1, pixel.row)),
    pixelMap.get(coordKey(pixel.column - 1, pixel.row)),
    pixelMap.get(coordKey(pixel.column, pixel.row + 1)),
    pixelMap.get(coordKey(pixel.column, pixel.row - 1)),
  ];

  let score = 0;
  neighbors.forEach((neighbor) => {
    if (!neighbor) {
      score = Math.max(score, 0.55);
      return;
    }
    const colorScore = Math.sqrt(colorDistanceSquared(pixel, neighbor)) / 255;
    const coverageScore = Math.abs(pixel.coveragePercent - neighbor.coveragePercent) / 100;
    score = Math.max(score, colorScore, coverageScore);
  });
  return clamp(score, 0, 1);
}

function buildPaletteSamples(pixels: SampledPixel[], settings: ArtImportSettings) {
  if (pixels.length === 0 || settings.edgeBoost <= 0) return pixels;

  const pixelMap = getSampledPixelMap(pixels);
  const weighted: RgbColor[] = [];
  pixels.forEach((pixel) => {
    weighted.push(pixel);
    const edgeScore = getPixelEdgeScore(pixel, pixelMap);
    const extraCopies = Math.round(edgeScore * (settings.edgeBoost / 18));
    for (let i = 0; i < extraCopies; i++) weighted.push(pixel);
  });
  return weighted;
}

async function convertImportedArtToGrid(params: {
  asset: ImportedArtAsset;
  settings: ArtImportSettings;
  columns: number;
  rows: number;
  paletteHexes: string[];
  paletteLimit: number;
}) {
  const image = await loadImage(params.asset.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not available');

  context.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
  context.drawImage(image, 0, 0);
  const sourceData = context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;

  const drawPlan = getImageDrawPlan(image, params.settings, params.columns, params.rows, sourceData);
  const pixels: SampledPixel[] = [];

  for (let row = 0; row < params.rows; row++) {
    for (let column = 0; column < params.columns; column++) {
      const u0 = (column - drawPlan.dx) / drawPlan.dw;
      const u1 = (column + 1 - drawPlan.dx) / drawPlan.dw;
      const v0 = (row - drawPlan.dy) / drawPlan.dh;
      const v1 = (row + 1 - drawPlan.dy) / drawPlan.dh;
      const clampedU0 = clamp(u0, 0, 1);
      const clampedU1 = clamp(u1, 0, 1);
      const clampedV0 = clamp(v0, 0, 1);
      const clampedV1 = clamp(v1, 0, 1);
      if (clampedU1 <= clampedU0 || clampedV1 <= clampedV0) continue;

      const sampled = sampleSourceColor({
        sourceData,
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
        x0: drawPlan.sx + clampedU0 * drawPlan.sw,
        y0: drawPlan.sy + clampedV0 * drawPlan.sh,
        x1: drawPlan.sx + clampedU1 * drawPlan.sw,
        y1: drawPlan.sy + clampedV1 * drawPlan.sh,
        settings: params.settings,
      });
      if (!sampled) continue;
      pixels.push({ column, row, r: sampled.r, g: sampled.g, b: sampled.b, coveragePercent: sampled.coveragePercent });
    }
  }

  const maxColors = clamp(params.paletteLimit, 2, MAX_PALETTE_SIZE);
  const paletteSamples = buildPaletteSamples(pixels, params.settings);
  let nextPalette =
    params.settings.paletteMode === 'active'
      ? params.paletteHexes.slice(0, maxColors)
      : params.settings.paletteMode === 'source'
        ? extractFrequentPalette(paletteSamples, maxColors)
        : quantizePalette(paletteSamples, maxColors);
  nextPalette = ensureMinimumPalette(nextPalette);

  const grid = createEmptyGrid(params.columns, params.rows);
  pixels.forEach((pixel) => {
    grid[pixel.row][pixel.column] = nearestPaletteIndex(pixel, nextPalette);
  });

  return { grid, palette: nextPalette, activeCellCount: pixels.length };
}

async function getVisibleArtAspect(asset: ImportedArtAsset, alphaCutoff: number) {
  const image = await loadImage(asset.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return asset.width / Math.max(1, asset.height);

  context.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
  const bounds = getAlphaBounds(data, image.naturalWidth, image.naturalHeight, alphaCutoff);
  return bounds.width / Math.max(1, bounds.height);
}

function createEmptyGrid(columns: number, rows: number) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => EMPTY_CELL));
}

function createSampleGrid(columns: number, rows: number) {
  const grid = createEmptyGrid(columns, rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const nx = (column + 0.5) / columns;
      const ny = (row + 0.5) / rows;
      const inset = nx > 0.06 && nx < 0.94 && ny > 0.05 && ny < 0.95;
      if (!inset) continue;

      let paletteIndex = ny < 0.54 ? 4 : 3;
      const sunDistance = Math.hypot(nx - 0.72, ny - 0.24);
      if (sunDistance < 0.13) paletteIndex = sunDistance < 0.08 ? 2 : 1;

      const leftPeak = 0.78 - Math.abs(nx - 0.34) * 1.95;
      const rightPeak = 0.72 - Math.abs(nx - 0.62) * 1.55;
      if (ny > leftPeak && ny > 0.42 && ny < 0.82) paletteIndex = nx < 0.34 ? 5 : 6;
      if (ny > rightPeak && ny > 0.46 && ny < 0.82) paletteIndex = nx < 0.62 ? 6 : 0;
      if (ny > 0.78 && ((column + row) % 5 === 0 || ny > 0.88)) paletteIndex = 9;

      grid[row][column] = paletteIndex;
    }
  }
  return grid;
}

function resizeGrid(grid: number[][], columns: number, rows: number) {
  const next = createEmptyGrid(columns, rows);
  for (let row = 0; row < Math.min(rows, grid.length); row++) {
    for (let column = 0; column < Math.min(columns, grid[row]?.length ?? 0); column++) {
      next[row][column] = grid[row][column];
    }
  }
  return next;
}

function setGridCell(grid: number[][], column: number, row: number, value: number) {
  if (!grid[row] || column < 0 || column >= grid[row].length) return grid;
  return grid.map((line, rowIndex) =>
    rowIndex === row ? line.map((cell, columnIndex) => (columnIndex === column ? value : cell)) : line
  );
}

function remapGridAfterPaletteDelete(grid: number[][], deletedIndex: number) {
  return grid.map((row) =>
    row.map((cell) => {
      if (cell === deletedIndex) return EMPTY_CELL;
      if (cell > deletedIndex) return cell - 1;
      return cell;
    })
  );
}

function buildColorComponents(cells: PixelSortCell[]) {
  const cellByCoord = new Map<string, PixelSortCell>();
  cells.forEach((cell) => cellByCoord.set(coordKey(cell.q, cell.r), cell));

  const visited = new Set<number>();
  const components: number[][] = [];
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];

  cells.forEach((root) => {
    if (visited.has(root.cellId)) return;
    visited.add(root.cellId);

    const component: number[] = [];
    const frontier = [root];
    for (let cursor = 0; cursor < frontier.length; cursor++) {
      const cell = frontier[cursor];
      component.push(cell.cellId);

      directions.forEach(([dx, dy]) => {
        const neighbor = cellByCoord.get(coordKey(cell.q + dx, cell.r + dy));
        if (!neighbor || neighbor.paletteIndex !== root.paletteIndex || visited.has(neighbor.cellId)) return;
        visited.add(neighbor.cellId);
        frontier.push(neighbor);
      });
    }

    components.push(component);
  });

  return components;
}

class HexelSortRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed === 0 ? 0x9e3779b9 : seed >>> 0;
  }

  next(exclusiveMax: number) {
    if (exclusiveMax <= 1) return 0;
    this.state ^= this.state << 13;
    this.state >>>= 0;
    this.state ^= this.state >>> 17;
    this.state >>>= 0;
    this.state ^= this.state << 5;
    this.state >>>= 0;
    return this.state % exclusiveMax;
  }
}

function startsSolved(cells: PixelSortCell[], order: number[]) {
  return cells.every((cell, index) => order[index] === cell.cellId);
}

function avoidStartingPaletteMatches(cells: PixelSortCell[], order: number[]) {
  const paletteByTileId = new Map(cells.map((cell) => [cell.cellId, cell.paletteIndex]));

  for (let index = 0; index < order.length; index++) {
    const targetPalette = cells[index]?.paletteIndex;
    const tilePalette = paletteByTileId.get(order[index]);
    if (tilePalette !== targetPalette) continue;

    for (let swapIndex = index + 1; swapIndex < order.length; swapIndex++) {
      const otherTilePalette = paletteByTileId.get(order[swapIndex]);
      const otherTargetPalette = cells[swapIndex]?.paletteIndex;
      if (otherTilePalette === targetPalette) continue;
      if (tilePalette === otherTargetPalette) continue;

      const previous = order[index];
      order[index] = order[swapIndex];
      order[swapIndex] = previous;
      break;
    }
  }
}

function buildClusteredStartingOrder(cells: PixelSortCell[], shuffleSeed: number) {
  const components = buildColorComponents(cells);
  const random = new HexelSortRandom(shuffleSeed);

  for (let index = components.length - 1; index > 0; index--) {
    const swap = random.next(index + 1);
    const previous = components[index];
    components[index] = components[swap];
    components[swap] = previous;
  }

  const order = components.flat().slice(0, cells.length);
  while (order.length < cells.length) order.push(cells[order.length].cellId);

  if (startsSolved(cells, order) && order.length > 1) {
    order.push(order.shift() as number);
  }

  avoidStartingPaletteMatches(cells, order);
  return order;
}

function buildRuntime(level: PixelSortLevel): RuntimeMaps {
  const cellById = new Map<number, PixelSortCell>();
  const cellIdByCoord = new Map<string, number>();
  const paletteByTileId = new Map<number, number>();

  level.cells.forEach((cell) => {
    cellById.set(cell.cellId, cell);
    cellIdByCoord.set(coordKey(cell.q, cell.r), cell.cellId);
    paletteByTileId.set(cell.cellId, cell.paletteIndex);
  });

  return { cellById, cellIdByCoord, paletteByTileId };
}

function analyzeLevel(
  columns: number,
  rows: number,
  trayCapacity: number,
  paletteCount: number,
  cells: PixelSortCell[],
  startingTileIdsByCell: number[]
): PixelSortMetrics {
  const components = buildColorComponents(cells);
  const countsByPalette = new Map<number, number>();
  cells.forEach((cell) => countsByPalette.set(cell.paletteIndex, (countsByPalette.get(cell.paletteIndex) ?? 0) + 1));

  const paletteByTileId = new Map(cells.map((cell) => [cell.cellId, cell.paletteIndex]));
  const startingCorrect = startingTileIdsByCell.reduce((count, tileId, index) => {
    return paletteByTileId.get(tileId) === cells[index]?.paletteIndex ? count + 1 : count;
  }, 0);

  const cellCount = cells.length;
  const largestPaletteCount = Math.max(0, ...countsByPalette.values());
  const largestComponent = Math.max(0, ...components.map((component) => component.length));
  const transparentCellCount = columns * rows - cellCount;
  const startingCorrectPercent = cellCount === 0 ? 0 : Math.round((startingCorrect / cellCount) * 100);
  const trayPressurePercent = Math.min(100, Math.round((largestPaletteCount / Math.max(1, trayCapacity)) * 100));
  const fragmentationPercent = cellCount === 0 ? 0 : Math.min(100, Math.round((components.length / cellCount) * 140));
  const scramblePercent = 100 - startingCorrectPercent;
  const palettePressure = Math.round((paletteCount / MAX_PALETTE_SIZE) * 100);
  const difficultyScore = clamp(
    Math.round(scramblePercent * 0.34 + trayPressurePercent * 0.24 + fragmentationPercent * 0.24 + palettePressure * 0.18),
    1,
    100
  );

  let difficultyTier: PixelSortMetrics['difficultyTier'] = 'Easy';
  if (difficultyScore >= 76) difficultyTier = 'Expert';
  else if (difficultyScore >= 56) difficultyTier = 'Hard';
  else if (difficultyScore >= 34) difficultyTier = 'Medium';

  return {
    cellCount,
    transparentCellCount,
    paletteCount,
    componentCount: components.length,
    largestComponent,
    largestPaletteCount,
    startingCorrect,
    startingCorrectPercent,
    trayPressurePercent,
    fragmentationPercent,
    difficultyScore,
    difficultyTier,
  };
}

function buildLevel(params: {
  id: string;
  levelNumber: number;
  displayName: string;
  subject: string;
  columns: number;
  rows: number;
  trayCapacity: number;
  paletteLimit: number;
  shuffleSeed: number;
  paletteHexes: string[];
  grid: number[][];
}): PixelSortLevel {
  const limitedPalette = params.paletteHexes.slice(0, params.paletteLimit);
  const palette = limitedPalette.map(hexToPaletteEntry);
  const cells: PixelSortCell[] = [];

  for (let row = 0; row < params.rows; row++) {
    for (let column = 0; column < params.columns; column++) {
      const paletteIndex = params.grid[row]?.[column] ?? EMPTY_CELL;
      if (paletteIndex < 0 || paletteIndex >= palette.length) continue;

      cells.push({
        cellId: cells.length,
        q: column,
        r: row,
        offsetColumn: column,
        offsetRow: row,
        paletteIndex,
      });
    }
  }

  const startingTileIdsByCell = buildClusteredStartingOrder(cells, params.shuffleSeed);
  const metrics = analyzeLevel(
    params.columns,
    params.rows,
    params.trayCapacity,
    palette.length,
    cells,
    startingTileIdsByCell
  );

  return {
    format: 'hextory-pixel-sort-level',
    schemaVersion: 1,
    id: params.id,
    levelNumber: params.levelNumber,
    displayName: params.displayName.trim() || `Pixel Sort ${params.levelNumber}`,
    subject: params.subject.trim() || 'pixel-art',
    columns: params.columns,
    rows: params.rows,
    trayCapacity: params.trayCapacity,
    paletteLimit: params.paletteLimit,
    shuffleSeed: params.shuffleSeed,
    palette,
    cells,
    startingTileIdsByCell,
    startingTrayTileIds: [],
    metrics,
  };
}

function createBoard(level: PixelSortLevel): BoardState {
  const tileByCellId: Record<number, number | null> = {};
  level.cells.forEach((cell, index) => {
    tileByCellId[cell.cellId] = level.startingTileIdsByCell[index] ?? cell.cellId;
  });

  return {
    tileByCellId,
    trayTileIds: [],
    selectedTileIds: [],
    moves: 0,
    selections: 0,
    trayMoves: 0,
    placements: 0,
    lastMessage: 'Ready',
  };
}

function buildTileLocationMap(board: BoardState) {
  const cellIdByTileId = new Map<number, number>();
  Object.entries(board.tileByCellId).forEach(([cellId, tileId]) => {
    if (tileId === null || tileId === undefined) return;
    cellIdByTileId.set(tileId, Number(cellId));
  });
  return cellIdByTileId;
}

function isCellCorrect(board: BoardState, runtime: RuntimeMaps, cellId: number) {
  const tileId = board.tileByCellId[cellId];
  if (tileId === null || tileId === undefined) return false;
  const tilePalette = runtime.paletteByTileId.get(tileId);
  const targetPalette = runtime.cellById.get(cellId)?.paletteIndex;
  return tilePalette === targetPalette;
}

function getCompletion(level: PixelSortLevel, board: BoardState, runtime: RuntimeMaps) {
  const correct = level.cells.reduce((count, cell) => (isCellCorrect(board, runtime, cell.cellId) ? count + 1 : count), 0);
  const progress = level.cells.length === 0 ? 0 : Math.round((correct / level.cells.length) * 100);
  return {
    correct,
    progress,
    complete: correct === level.cells.length && board.trayTileIds.length === 0 && level.cells.length > 0,
  };
}

function selectCluster(level: PixelSortLevel, runtime: RuntimeMaps, board: BoardState, cellId: number): BoardState {
  const rootTileId = board.tileByCellId[cellId];
  if (rootTileId === null || rootTileId === undefined) {
    return { ...board, selectedTileIds: [], lastMessage: 'Empty cell' };
  }

  const rootPalette = runtime.paletteByTileId.get(rootTileId);
  if (rootPalette === undefined) return { ...board, selectedTileIds: [], lastMessage: 'Missing tile' };
  if (isCellCorrect(board, runtime, cellId)) {
    return { ...board, selectedTileIds: [], lastMessage: 'Correct cells are locked' };
  }

  const selectedTileIds: number[] = [];
  const frontier = [cellId];
  const visited = new Set<number>([cellId]);
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];

  for (let cursor = 0; cursor < frontier.length; cursor++) {
    const currentCellId = frontier[cursor];
    const tileId = board.tileByCellId[currentCellId];
    if (tileId === null || tileId === undefined) continue;
    if (runtime.paletteByTileId.get(tileId) !== rootPalette) continue;
    if (isCellCorrect(board, runtime, currentCellId)) continue;

    selectedTileIds.push(tileId);
    const currentCell = runtime.cellById.get(currentCellId);
    if (!currentCell) continue;

    directions.forEach(([dx, dy]) => {
      const neighborId = runtime.cellIdByCoord.get(coordKey(currentCell.q + dx, currentCell.r + dy));
      if (neighborId === undefined || visited.has(neighborId)) return;
      const neighborTileId = board.tileByCellId[neighborId];
      if (neighborTileId === null || neighborTileId === undefined) return;
      visited.add(neighborId);
      if (runtime.paletteByTileId.get(neighborTileId) === rootPalette) frontier.push(neighborId);
    });
  }

  return {
    ...board,
    selectedTileIds,
    selections: board.selections + (selectedTileIds.length > 0 ? 1 : 0),
    lastMessage: selectedTileIds.length > 0 ? `Selected ${selectedTileIds.length}` : 'Nothing selectable',
  };
}

function moveSelectionToTray(level: PixelSortLevel, board: BoardState): BoardState {
  if (board.selectedTileIds.length === 0) return { ...board, lastMessage: 'Nothing selected' };

  const availableSlots = level.trayCapacity - board.trayTileIds.length;
  if (availableSlots <= 0) return { ...board, lastMessage: 'Tray full' };

  const movedTileIds = board.selectedTileIds.slice(0, availableSlots);
  const movedSet = new Set(movedTileIds);
  const tileByCellId = { ...board.tileByCellId };

  Object.entries(tileByCellId).forEach(([cellId, tileId]) => {
    if (tileId !== null && movedSet.has(tileId)) tileByCellId[Number(cellId)] = null;
  });

  return {
    ...board,
    tileByCellId,
    trayTileIds: [...board.trayTileIds, ...movedTileIds],
    selectedTileIds: board.selectedTileIds.slice(movedTileIds.length),
    moves: board.moves + 1,
    trayMoves: board.trayMoves + 1,
    lastMessage: `Moved ${movedTileIds.length} to tray`,
  };
}

function emptyTargetComponent(level: PixelSortLevel, runtime: RuntimeMaps, board: BoardState, targetCellId: number, paletteIndex: number) {
  const root = runtime.cellById.get(targetCellId);
  if (!root) return [];
  if (board.tileByCellId[targetCellId] !== null && board.tileByCellId[targetCellId] !== undefined) return [];
  if (root.paletteIndex !== paletteIndex) return [];

  const frontier = [targetCellId];
  const visited = new Set<number>([targetCellId]);
  const targets: number[] = [];
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];

  for (let cursor = 0; cursor < frontier.length; cursor++) {
    const cellId = frontier[cursor];
    const cell = runtime.cellById.get(cellId);
    if (!cell || cell.paletteIndex !== paletteIndex) continue;
    if (board.tileByCellId[cellId] !== null && board.tileByCellId[cellId] !== undefined) continue;
    targets.push(cellId);

    directions.forEach(([dx, dy]) => {
      const neighborId = runtime.cellIdByCoord.get(coordKey(cell.q + dx, cell.r + dy));
      if (neighborId === undefined || visited.has(neighborId)) return;
      const neighbor = runtime.cellById.get(neighborId);
      if (!neighbor || neighbor.paletteIndex !== paletteIndex) return;
      if (board.tileByCellId[neighborId] !== null && board.tileByCellId[neighborId] !== undefined) return;
      visited.add(neighborId);
      frontier.push(neighborId);
    });
  }

  return targets;
}

function placeSelectionAtCell(level: PixelSortLevel, runtime: RuntimeMaps, board: BoardState, targetCellId: number): BoardState {
  if (board.selectedTileIds.length === 0) return { ...board, lastMessage: 'Nothing selected' };

  const paletteIndex = runtime.paletteByTileId.get(board.selectedTileIds[0]);
  if (paletteIndex === undefined) return { ...board, lastMessage: 'Missing selected color' };

  const targets = emptyTargetComponent(level, runtime, board, targetCellId, paletteIndex);
  if (targets.length === 0) return { ...board, lastMessage: 'No empty matching target' };

  const placedTileIds = board.selectedTileIds.slice(0, targets.length);
  const placedSet = new Set(placedTileIds);
  const tileByCellId = { ...board.tileByCellId };
  const cellIdByTileId = buildTileLocationMap(board);

  placedTileIds.forEach((tileId, index) => {
    const oldCellId = cellIdByTileId.get(tileId);
    if (oldCellId !== undefined) tileByCellId[oldCellId] = null;
    tileByCellId[targets[index]] = tileId;
  });

  return {
    ...board,
    tileByCellId,
    selectedTileIds: board.selectedTileIds.filter((tileId) => !placedSet.has(tileId)),
    moves: board.moves + 1,
    placements: board.placements + 1,
    lastMessage: `Placed ${placedTileIds.length}`,
  };
}

function placeTrayColor(level: PixelSortLevel, runtime: RuntimeMaps, board: BoardState, paletteIndex: number): BoardState {
  const matchingTrayTileIds = board.trayTileIds.filter((tileId) => runtime.paletteByTileId.get(tileId) === paletteIndex);
  if (matchingTrayTileIds.length === 0) return { ...board, lastMessage: 'No tray tiles for color' };

  const emptyTargets = level.cells
    .filter((cell) => cell.paletteIndex === paletteIndex)
    .filter((cell) => board.tileByCellId[cell.cellId] === null || board.tileByCellId[cell.cellId] === undefined)
    .map((cell) => cell.cellId);

  if (emptyTargets.length === 0) return { ...board, lastMessage: 'No empty matching targets' };

  const placedTileIds = matchingTrayTileIds.slice(0, emptyTargets.length);
  const placedSet = new Set(placedTileIds);
  const tileByCellId = { ...board.tileByCellId };

  placedTileIds.forEach((tileId, index) => {
    tileByCellId[emptyTargets[index]] = tileId;
  });

  return {
    ...board,
    tileByCellId,
    trayTileIds: board.trayTileIds.filter((tileId) => !placedSet.has(tileId)),
    moves: board.moves + 1,
    placements: board.placements + 1,
    lastMessage: `Placed ${placedTileIds.length} from tray`,
  };
}

function shuffleTray(board: BoardState, seed: number) {
  const trayTileIds = [...board.trayTileIds];
  const random = new HexelSortRandom(seed);
  for (let index = trayTileIds.length - 1; index > 0; index--) {
    const swap = random.next(index + 1);
    const previous = trayTileIds[index];
    trayTileIds[index] = trayTileIds[swap];
    trayTileIds[swap] = previous;
  }
  return { ...board, trayTileIds, lastMessage: trayTileIds.length > 1 ? 'Tray shuffled' : 'Tray unchanged' };
}

function stringifyJson(data: unknown) {
  return JSON.stringify(data, null, 2);
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([stringifyJson(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

async function copyJson(data: unknown) {
  const text = stringifyJson(data);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  textArea.remove();
}

function createLevelExport(level: PixelSortLevel) {
  return {
    ...level,
    sourceTool: 'levelforge-pixel-sort-studio',
    exportSchemaVersion: 1,
    exportedAtUtc: new Date().toISOString(),
  };
}

function createLevelCollectionExport(collection: PixelSortLevel[]) {
  return collection.map(createLevelExport);
}

function createLevelId(levelNumber: number) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `pixel-sort-${levelNumber}-${Date.now()}`;
}

function metricTone(score: number) {
  if (score >= 76) return 'text-red-600 dark:text-red-400';
  if (score >= 56) return 'text-orange-600 dark:text-orange-400';
  if (score >= 34) return 'text-sky-600 dark:text-sky-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function preparePixelCanvas(canvas: HTMLCanvasElement, columns: number, rows: number) {
  if (canvas.width !== columns) canvas.width = columns;
  if (canvas.height !== rows) canvas.height = rows;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, columns, rows);
  return context;
}

function drawDesignCanvas(canvas: HTMLCanvasElement, grid: number[][], paletteHexes: string[], columns: number, rows: number) {
  const context = preparePixelCanvas(canvas, columns, rows);
  if (!context) return;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const paletteIndex = grid[row]?.[column] ?? EMPTY_CELL;
      if (paletteIndex < 0) continue;
      context.fillStyle = paletteHexes[paletteIndex] ?? '#94a3b8';
      context.fillRect(column, row, 1, 1);
    }
  }
}

function drawPlayCanvas(params: {
  canvas: HTMLCanvasElement;
  grid: number[][];
  paletteHexes: string[];
  columns: number;
  rows: number;
  level: PixelSortLevel;
  board: BoardState;
  runtime: RuntimeMaps;
}) {
  const context = preparePixelCanvas(params.canvas, params.columns, params.rows);
  if (!context) return;

  const selected = new Set(params.board.selectedTileIds);
  params.level.cells.forEach((cell) => {
    const targetColor = params.paletteHexes[cell.paletteIndex] ?? '#94a3b8';
    context.globalAlpha = 0.24;
    context.fillStyle = targetColor;
    context.fillRect(cell.q, cell.r, 1, 1);

    const tileId = params.board.tileByCellId[cell.cellId];
    if (tileId !== null && tileId !== undefined) {
      const tilePalette = params.runtime.paletteByTileId.get(tileId);
      context.globalAlpha = 1;
      context.fillStyle = tilePalette === undefined ? '#94a3b8' : params.paletteHexes[tilePalette] ?? '#94a3b8';
      context.fillRect(cell.q, cell.r, 1, 1);

      if (isCellCorrect(params.board, params.runtime, cell.cellId)) {
        context.globalAlpha = 0.18;
        context.fillStyle = '#22c55e';
        context.fillRect(cell.q, cell.r, 1, 1);
      }

      if (selected.has(tileId)) {
        context.globalAlpha = 0.52;
        context.fillStyle = '#ffffff';
        context.fillRect(cell.q, cell.r, 1, 1);
      }
    }
  });
  context.globalAlpha = 1;
}

export default function PixelSortPage() {
  const [activeTab, setActiveTab] = useState('design');
  const [levelNumber, setLevelNumber] = useState(1);
  const [displayName, setDisplayName] = useState('Museum Pixel Study');
  const [subject, setSubject] = useState('pixel-art');
  const [columns, setColumns] = useState(18);
  const [rows, setRows] = useState(18);
  const [trayCapacity, setTrayCapacity] = useState(16);
  const [paletteLimit, setPaletteLimit] = useState(10);
  const [shuffleSeed, setShuffleSeed] = useState(74001);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [activeColor, setActiveColor] = useState(2);
  const [paintTool, setPaintTool] = useState<PaintTool>('brush');
  const [grid, setGrid] = useState(() => createSampleGrid(18, 18));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collection, setCollection] = useState<PixelSortLevel[]>([]);
  const [collectionLoaded, setCollectionLoaded] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [sourceArt, setSourceArt] = useState<ImportedArtAsset | null>(null);
  const [artSettings, setArtSettings] = useState<ArtImportSettings>(DEFAULT_ART_IMPORT_SETTINGS);
  const [artImporting, setArtImporting] = useState(false);
  const [artMessage, setArtMessage] = useState('');

  const level = useMemo(
    () =>
      buildLevel({
        id: editingId ?? `draft-${levelNumber}`,
        levelNumber,
        displayName,
        subject,
        columns,
        rows,
        trayCapacity,
        paletteLimit,
        shuffleSeed,
        paletteHexes: palette,
        grid,
      }),
    [columns, displayName, editingId, grid, levelNumber, palette, paletteLimit, rows, shuffleSeed, subject, trayCapacity]
  );

  const runtime = useMemo(() => buildRuntime(level), [level]);
  const [board, setBoard] = useState(() => createBoard(level));
  const completion = useMemo(() => getCompletion(level, board, runtime), [board, level, runtime]);
  const selectedPalette = board.selectedTileIds.length > 0 ? runtime.paletteByTileId.get(board.selectedTileIds[0]) : undefined;
  const designCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);

  useEffect(() => {
    if (!designCanvasRef.current) return;
    drawDesignCanvas(designCanvasRef.current, grid, palette, columns, rows);
  }, [columns, grid, palette, rows]);

  useEffect(() => {
    if (!playCanvasRef.current) return;
    drawPlayCanvas({
      canvas: playCanvasRef.current,
      grid,
      paletteHexes: palette,
      columns,
      rows,
      level,
      board,
      runtime,
    });
  }, [board, columns, grid, level, palette, rows, runtime]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLECTION_KEY);
      if (raw) setCollection(JSON.parse(raw) as PixelSortLevel[]);
    } catch {
      setCollection([]);
    } finally {
      setCollectionLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!collectionLoaded) return;
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  }, [collection, collectionLoaded]);

  useEffect(() => {
    setBoard(createBoard(level));
  }, [level]);

  const paintCell = (column: number, row: number) => {
    const value = paintTool === 'erase' ? EMPTY_CELL : activeColor;
    setGrid((current) => setGridCell(current, column, row, value));
  };

  const getCanvasCell = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const column = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * columns), 0, columns - 1);
    const row = clamp(Math.floor(((event.clientY - rect.top) / rect.height) * rows), 0, rows - 1);
    return { column, row };
  };

  const handleDesignCanvasDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    isPaintingRef.current = true;
    const cell = getCanvasCell(event);
    paintCell(cell.column, cell.row);
  };

  const handleDesignCanvasMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isPaintingRef.current || event.buttons !== 1) return;
    const cell = getCanvasCell(event);
    paintCell(cell.column, cell.row);
  };

  const handleDesignCanvasUp = (event: PointerEvent<HTMLCanvasElement>) => {
    isPaintingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePlayCanvasClick = (event: PointerEvent<HTMLCanvasElement>) => {
    const cell = getCanvasCell(event);
    const cellId = runtime.cellIdByCoord.get(coordKey(cell.column, cell.row));
    if (cellId === undefined) return;
    handlePlayCell(cellId);
  };

  const handleColumnChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = readInt(event.target.value, columns, MIN_DIMENSION, MAX_DIMENSION);
    setColumns(next);
    setGrid((current) => resizeGrid(current, next, rows));
  };

  const handleRowChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = readInt(event.target.value, rows, MIN_DIMENSION, MAX_DIMENSION);
    setRows(next);
    setGrid((current) => resizeGrid(current, columns, next));
  };

  const applyPixelDensity = (density: number) => {
    const clampedDensity = clamp(density, MIN_DIMENSION, MAX_DIMENSION);
    const aspect = sourceArt
      ? sourceArt.width / Math.max(1, sourceArt.height)
      : columns / Math.max(1, rows);
    let nextColumns = clampedDensity;
    let nextRows = clampedDensity;

    if (Number.isFinite(aspect) && aspect > 1) {
      nextRows = clamp(Math.round(clampedDensity / aspect), MIN_DIMENSION, MAX_DIMENSION);
    } else if (Number.isFinite(aspect) && aspect > 0) {
      nextColumns = clamp(Math.round(clampedDensity * aspect), MIN_DIMENSION, MAX_DIMENSION);
    }

    setColumns(nextColumns);
    setRows(nextRows);
    setGrid((current) => resizeGrid(current, nextColumns, nextRows));
    if (sourceArt) setArtMessage(`Density ${nextColumns}x${nextRows}. Generate to resample art.`);
  };

  const handleDensityChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyPixelDensity(readInt(event.target.value, Math.max(columns, rows), MIN_DIMENSION, MAX_DIMENSION));
  };

  const updateArtSetting = <Key extends keyof ArtImportSettings>(key: Key, value: ArtImportSettings[Key]) => {
    setArtSettings((current) => ({ ...current, [key]: value }));
  };

  const handleArtAssetChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const asset = await readImportedArtFile(file);
      setSourceArt(asset);
      setArtMessage(`${asset.name} · ${asset.width}x${asset.height}`);
      if (displayName === 'Museum Pixel Study') {
        setDisplayName(asset.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      }
    } catch {
      setArtMessage('Image import failed');
    } finally {
      event.target.value = '';
    }
  };

  const fitGridToSourceArt = () => {
    if (!sourceArt) return;

    const maxSide = Math.max(columns, rows, 18);
    let nextColumns = columns;
    let nextRows = rows;
    if (sourceArt.width >= sourceArt.height) {
      nextColumns = clamp(maxSide, MIN_DIMENSION, MAX_DIMENSION);
      nextRows = clamp(Math.round((maxSide * sourceArt.height) / sourceArt.width), MIN_DIMENSION, MAX_DIMENSION);
    } else {
      nextRows = clamp(maxSide, MIN_DIMENSION, MAX_DIMENSION);
      nextColumns = clamp(Math.round((maxSide * sourceArt.width) / sourceArt.height), MIN_DIMENSION, MAX_DIMENSION);
    }

    setColumns(nextColumns);
    setRows(nextRows);
    setGrid((current) => resizeGrid(current, nextColumns, nextRows));
  };

  const applySourceArtToGrid = async () => {
    if (!sourceArt) {
      setArtMessage('Import an image first');
      return;
    }

    setArtImporting(true);
    setArtMessage('Generating pixels...');
    try {
      const result = await convertImportedArtToGrid({
        asset: sourceArt,
        settings: artSettings,
        columns,
        rows,
        paletteHexes: palette,
        paletteLimit,
      });
      setGrid(result.grid);
      if (artSettings.paletteMode !== 'active') {
        setPalette(result.palette);
        setPaletteLimit(Math.min(MAX_PALETTE_SIZE, Math.max(2, result.palette.length)));
        setActiveColor(0);
      }
      setSubject(sourceArt.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      setEditingId(null);
      setArtMessage(`Generated ${result.activeCellCount} pixels from ${sourceArt.name}`);
    } catch {
      setArtMessage('Pixel generation failed');
    } finally {
      setArtImporting(false);
    }
  };

  const applyCrispIconPreset = async () => {
    if (!sourceArt) {
      setArtMessage('Import an image first');
      return;
    }

    const presetSettings: ArtImportSettings = {
      ...DEFAULT_ART_IMPORT_SETTINGS,
      fitMode: 'contain',
      sampleMode: 'smart',
      paletteMode: 'quantized',
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
      alphaCutoff: 12,
      coverageCutoff: 5,
      discardTransparent: true,
      autoCropTransparent: true,
      edgeBoost: 88,
      brightness: 0,
      contrast: 18,
      saturation: 16,
    };

    setArtImporting(true);
    setArtMessage('Building crisp icon pixels...');
    try {
      const aspect = await getVisibleArtAspect(sourceArt, presetSettings.alphaCutoff);
      const longSide = 64;
      const nextColumns = aspect >= 1
        ? longSide
        : clamp(Math.round(longSide * aspect), MIN_DIMENSION, MAX_DIMENSION);
      const nextRows = aspect >= 1
        ? clamp(Math.round(longSide / aspect), MIN_DIMENSION, MAX_DIMENSION)
        : longSide;

      const result = await convertImportedArtToGrid({
        asset: sourceArt,
        settings: presetSettings,
        columns: nextColumns,
        rows: nextRows,
        paletteHexes: palette,
        paletteLimit: MAX_PALETTE_SIZE,
      });

      setArtSettings(presetSettings);
      setColumns(nextColumns);
      setRows(nextRows);
      setPaletteLimit(Math.min(MAX_PALETTE_SIZE, Math.max(2, result.palette.length)));
      setPalette(result.palette);
      setActiveColor(0);
      setGrid(result.grid);
      setSubject(sourceArt.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      setEditingId(null);
      setArtMessage(`Crisp icon generated: ${nextColumns}x${nextRows}, ${result.activeCellCount} pixels, ${result.palette.length} colors`);
    } catch {
      setArtMessage('Crisp icon generation failed');
    } finally {
      setArtImporting(false);
    }
  };

  const addPaletteColor = () => {
    if (palette.length >= MAX_PALETTE_SIZE) return;
    setPalette((current) => [...current, '#14b8a6']);
    setPaletteLimit((current) => Math.min(MAX_PALETTE_SIZE, Math.max(current, palette.length + 1)));
    setActiveColor(palette.length);
  };

  const deleteActivePaletteColor = () => {
    if (palette.length <= 2) return;
    const deletedIndex = activeColor;
    setPalette((current) => current.filter((_, index) => index !== deletedIndex));
    setGrid((current) => remapGridAfterPaletteDelete(current, deletedIndex));
    setActiveColor((current) => Math.max(0, Math.min(current - 1, palette.length - 2)));
    setPaletteLimit((current) => Math.max(2, Math.min(current - 1, MAX_PALETTE_SIZE)));
  };

  const saveToCollection = () => {
    const id = editingId ?? createLevelId(levelNumber);
    const saved = { ...level, id };
    setEditingId(id);
    setCollection((current) => {
      const existingIndex = current.findIndex((item) => item.id === id);
      if (existingIndex === -1) return [...current, saved].sort((a, b) => a.levelNumber - b.levelNumber);
      return current.map((item, index) => (index === existingIndex ? saved : item)).sort((a, b) => a.levelNumber - b.levelNumber);
    });
    setImportMessage('Saved');
  };

  const loadLevel = (loaded: PixelSortLevel) => {
    const loadedPalette = loaded.palette.length > 0
      ? loaded.palette.map((entry) => entry.hex ?? rgbToHex(entry.colorR, entry.colorG, entry.colorB))
      : DEFAULT_PALETTE;
    const nextColumns =
      loaded.columns ?? Math.max(MIN_DIMENSION, ...loaded.cells.map((cell) => cell.offsetColumn + 1), MIN_DIMENSION);
    const nextRows = loaded.rows ?? Math.max(MIN_DIMENSION, ...loaded.cells.map((cell) => cell.offsetRow + 1), MIN_DIMENSION);
    const nextGrid = createEmptyGrid(clamp(nextColumns, MIN_DIMENSION, MAX_DIMENSION), clamp(nextRows, MIN_DIMENSION, MAX_DIMENSION));

    loaded.cells.forEach((cell) => {
      const column = cell.offsetColumn ?? cell.q;
      const row = cell.offsetRow ?? cell.r;
      if (!nextGrid[row] || column < 0 || column >= nextGrid[row].length) return;
      nextGrid[row][column] = cell.paletteIndex;
    });

    setEditingId(loaded.id ?? createLevelId(loaded.levelNumber ?? 1));
    setLevelNumber(loaded.levelNumber ?? 1);
    setDisplayName(loaded.displayName ?? `Pixel Sort ${loaded.levelNumber ?? 1}`);
    setSubject(loaded.subject ?? 'pixel-art');
    setColumns(nextGrid[0]?.length ?? MIN_DIMENSION);
    setRows(nextGrid.length);
    setTrayCapacity(clamp(loaded.trayCapacity ?? 16, MIN_TRAY_CAPACITY, MAX_TRAY_CAPACITY));
    setPaletteLimit(clamp(loaded.paletteLimit ?? loadedPalette.length, 2, MAX_PALETTE_SIZE));
    setShuffleSeed(loaded.shuffleSeed ?? 74001);
    setPalette(loadedPalette.slice(0, MAX_PALETTE_SIZE).map(normalizeHex));
    setActiveColor(0);
    setGrid(nextGrid);
    setActiveTab('design');
    setImportMessage('Loaded');
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as PixelSortLevel | PixelSortLevel[];
      const loaded = Array.isArray(payload) ? payload[0] : payload;
      if (!loaded || !Array.isArray(loaded.cells) || !Array.isArray(loaded.palette)) {
        setImportMessage('Import rejected');
        return;
      }
      loadLevel(loaded);
    } catch {
      setImportMessage('Import failed');
    } finally {
      event.target.value = '';
    }
  };

  const exportLevelJson = (target: PixelSortLevel) => {
    const filename = `pixel-sort-level-${target.levelNumber}.json`;
    downloadJson(filename, createLevelExport(target));
    setExportMessage(`Download requested: ${filename}. If the browser blocks it, use Copy JSON.`);
  };

  const exportCollectionJson = () => {
    const filename = 'pixel-sort-collection.json';
    downloadJson(filename, createLevelCollectionExport(collection));
    setExportMessage(`Download requested: ${filename}.`);
  };

  const copyLevelJson = async (target: PixelSortLevel) => {
    try {
      await copyJson(createLevelExport(target));
      setExportMessage('Level JSON copied.');
    } catch {
      setExportMessage('Copy failed. Try Export JSON again or use a normal browser download.');
    }
  };

  const handlePlayCell = (cellId: number) => {
    const selected = board.selectedTileIds.length > 0;
    const clickedEmpty = board.tileByCellId[cellId] === null || board.tileByCellId[cellId] === undefined;
    if (selected && clickedEmpty) {
      setBoard((current) => placeSelectionAtCell(level, runtime, current, cellId));
      return;
    }
    setBoard((current) => selectCluster(level, runtime, current, cellId));
  };

  const colorCountsInTray = useMemo(() => {
    const counts = new Map<number, number>();
    board.trayTileIds.forEach((tileId) => {
      const paletteIndex = runtime.paletteByTileId.get(tileId);
      if (paletteIndex === undefined) return;
      counts.set(paletteIndex, (counts.get(paletteIndex) ?? 0) + 1);
    });
    return counts;
  }, [board.trayTileIds, runtime]);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/game">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            All Games
          </Button>
        </Link>
        <Badge variant="outline">LevelForge</Badge>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Pixel Sort Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground lg:text-base">
            Square pixel-art level builder for portable sort levels.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportLevelJson(level)}>
            <Download className="h-4 w-4" />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copyLevelJson(level)}>
            <Copy className="h-4 w-4" />
            Copy JSON
          </Button>
          <Button size="sm" onClick={saveToCollection}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
      {exportMessage && <p className="text-sm text-muted-foreground">{exportMessage}</p>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="design" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Design</span>
          </TabsTrigger>
          <TabsTrigger value="play" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">Play</span>
          </TabsTrigger>
          <TabsTrigger value="collection" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Collection</span>
          </TabsTrigger>
          <TabsTrigger value="analyze" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analyze</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="design" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Level</CardTitle>
                <CardDescription>Portable level fields</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm font-medium">
                    Number
                    <Input
                      type="number"
                      min={1}
                      value={levelNumber}
                      onChange={(event) => setLevelNumber(readInt(event.target.value, levelNumber, 1, 10000))}
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    Seed
                    <Input
                      type="number"
                      value={shuffleSeed}
                      onChange={(event) => setShuffleSeed(readInt(event.target.value, shuffleSeed, 1, 999999))}
                    />
                  </label>
                </div>
                <label className="space-y-1 text-sm font-medium">
                  Name
                  <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Subject
                  <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm font-medium">
                    Columns
                    <Input type="number" min={MIN_DIMENSION} max={MAX_DIMENSION} value={columns} onChange={handleColumnChange} />
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    Rows
                    <Input type="number" min={MIN_DIMENSION} max={MAX_DIMENSION} value={rows} onChange={handleRowChange} />
                  </label>
                </div>
                <label className="space-y-2 text-sm font-medium">
                  <div className="flex items-center justify-between gap-3">
                    <span>Pixel Density</span>
                    <span className="text-xs text-muted-foreground">{columns}x{rows}</span>
                  </div>
                  <input
                    type="range"
                    min={MIN_DIMENSION}
                    max={MAX_DIMENSION}
                    value={Math.max(columns, rows)}
                    onChange={handleDensityChange}
                    className="h-2 w-full cursor-pointer accent-primary"
                  />
                  <div className="grid grid-cols-5 gap-1.5">
                    {DENSITY_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant={Math.max(columns, rows) === preset ? 'default' : 'outline'}
                        size="sm"
                        className="px-1 text-xs"
                        onClick={() => applyPixelDensity(preset)}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm font-medium">
                    Tray
                    <Input
                      type="number"
                      min={MIN_TRAY_CAPACITY}
                      max={MAX_TRAY_CAPACITY}
                      value={trayCapacity}
                      onChange={(event) =>
                        setTrayCapacity(readInt(event.target.value, trayCapacity, MIN_TRAY_CAPACITY, MAX_TRAY_CAPACITY))
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium">
                    Palette
                    <Input
                      type="number"
                      min={2}
                      max={palette.length}
                      value={paletteLimit}
                      onChange={(event) => setPaletteLimit(readInt(event.target.value, paletteLimit, 2, palette.length))}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={paintTool === 'brush' ? 'default' : 'outline'} size="sm" onClick={() => setPaintTool('brush')}>
                    <Brush className="h-4 w-4" />
                    Brush
                  </Button>
                  <Button variant={paintTool === 'erase' ? 'default' : 'outline'} size="sm" onClick={() => setPaintTool('erase')}>
                    <Eraser className="h-4 w-4" />
                    Erase
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGrid(createSampleGrid(columns, rows));
                      setEditingId(null);
                    }}
                  >
                    <Shuffle className="h-4 w-4" />
                    Sample
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setGrid(createEmptyGrid(columns, rows))}>
                    <RotateCcw className="h-4 w-4" />
                    Clear
                  </Button>
                </div>

                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Art Asset</p>
                      <p className="text-xs text-muted-foreground">{sourceArt ? `${sourceArt.width}x${sourceArt.height}` : 'No image loaded'}</p>
                    </div>
                    <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-all hover:bg-accent hover:text-accent-foreground">
                      <ImagePlus className="h-4 w-4" />
                      Import
                      <input type="file" accept="image/*" className="hidden" onChange={handleArtAssetChange} />
                    </label>
                  </div>

                  {sourceArt && (
                    <div
                      className="h-28 rounded-md border bg-muted/30 bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${sourceArt.dataUrl})` }}
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm font-medium">
                      Fit
                      <select
                        value={artSettings.fitMode}
                        onChange={(event) => updateArtSetting('fitMode', event.target.value as ArtFitMode)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      >
                        <option value="contain">Contain</option>
                        <option value="cover">Cover</option>
                        <option value="stretch">Stretch</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      Sample
                      <select
                        value={artSettings.sampleMode}
                        onChange={(event) => updateArtSetting('sampleMode', event.target.value as ArtSampleMode)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      >
                        <option value="smart">Smart Icon</option>
                        <option value="average">Average</option>
                        <option value="nearest">Nearest</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 text-sm font-medium">
                    Palette Mode
                    <select
                      value={artSettings.paletteMode}
                      onChange={(event) => updateArtSetting('paletteMode', event.target.value as ArtPaletteMode)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value="quantized">Quantized</option>
                      <option value="source">Frequent Source Colors</option>
                      <option value="active">Use Active Palette</option>
                    </select>
                  </label>

                  <div className="grid grid-cols-4 gap-2">
                    <label className="space-y-1 text-xs font-medium">
                      X%
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        value={artSettings.cropX}
                        onChange={(event) => updateArtSetting('cropX', readInt(event.target.value, artSettings.cropX, 0, 99))}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Y%
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        value={artSettings.cropY}
                        onChange={(event) => updateArtSetting('cropY', readInt(event.target.value, artSettings.cropY, 0, 99))}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      W%
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={artSettings.cropWidth}
                        onChange={(event) => updateArtSetting('cropWidth', readInt(event.target.value, artSettings.cropWidth, 1, 100))}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      H%
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={artSettings.cropHeight}
                        onChange={(event) => updateArtSetting('cropHeight', readInt(event.target.value, artSettings.cropHeight, 1, 100))}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={artSettings.autoCropTransparent}
                        onChange={(event) => updateArtSetting('autoCropTransparent', event.target.checked)}
                      />
                      Smart Crop
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={artSettings.discardTransparent}
                        onChange={(event) => updateArtSetting('discardTransparent', event.target.checked)}
                      />
                      Trim Alpha
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <label className="space-y-1 text-sm font-medium">
                      Alpha
                      <Input
                        type="number"
                        min={0}
                        max={255}
                        value={artSettings.alphaCutoff}
                        onChange={(event) => updateArtSetting('alphaCutoff', readInt(event.target.value, artSettings.alphaCutoff, 0, 255))}
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      Coverage
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={artSettings.coverageCutoff}
                        onChange={(event) => updateArtSetting('coverageCutoff', readInt(event.target.value, artSettings.coverageCutoff, 0, 100))}
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      Edge
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={artSettings.edgeBoost}
                        onChange={(event) => updateArtSetting('edgeBoost', readInt(event.target.value, artSettings.edgeBoost, 0, 100))}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1 text-xs font-medium">
                      Bright
                      <Input
                        type="number"
                        min={-100}
                        max={100}
                        value={artSettings.brightness}
                        onChange={(event) => updateArtSetting('brightness', readInt(event.target.value, artSettings.brightness, -100, 100))}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Contrast
                      <Input
                        type="number"
                        min={-100}
                        max={100}
                        value={artSettings.contrast}
                        onChange={(event) => updateArtSetting('contrast', readInt(event.target.value, artSettings.contrast, -100, 100))}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      Saturate
                      <Input
                        type="number"
                        min={-100}
                        max={100}
                        value={artSettings.saturation}
                        onChange={(event) => updateArtSetting('saturation', readInt(event.target.value, artSettings.saturation, -100, 100))}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" onClick={fitGridToSourceArt} disabled={!sourceArt}>
                      <Crop className="h-4 w-4" />
                      Aspect
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void applyCrispIconPreset()} disabled={!sourceArt || artImporting}>
                      <WandSparkles className="h-4 w-4" />
                      Crisp Icon
                    </Button>
                    <Button size="sm" onClick={applySourceArtToGrid} disabled={!sourceArt || artImporting}>
                      <WandSparkles className="h-4 w-4" />
                      Generate
                    </Button>
                  </div>

                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Import State
                    </div>
                    {artMessage || 'Waiting for image asset'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Pixel Art</CardTitle>
                    <CardDescription>{level.cells.length} active square cells</CardDescription>
                  </div>
                  <Badge variant={level.cells.length > 0 ? 'secondary' : 'destructive'}>{level.cells.length > 0 ? 'Ready' : 'Empty'}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mx-auto w-full max-w-[760px]">
                  <canvas
                    ref={designCanvasRef}
                    width={columns}
                    height={rows}
                    className="block max-h-[70vh] w-full cursor-crosshair rounded-md border bg-[linear-gradient(45deg,rgba(148,163,184,0.18)_25%,transparent_25%),linear-gradient(-45deg,rgba(148,163,184,0.18)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(148,163,184,0.18)_75%),linear-gradient(-45deg,transparent_75%,rgba(148,163,184,0.18)_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] shadow-sm [image-rendering:pixelated]"
                    style={{ aspectRatio: `${columns} / ${rows}` }}
                    aria-label="Pixel art paint canvas"
                    onPointerDown={handleDesignCanvasDown}
                    onPointerMove={handleDesignCanvasMove}
                    onPointerUp={handleDesignCanvasUp}
                    onPointerCancel={handleDesignCanvasUp}
                    onPointerLeave={() => {
                      isPaintingRef.current = false;
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{columns * rows} total cells</span>
                    <span>{columns >= 128 || rows >= 128 ? 'Canvas mode' : 'Editable grid'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>Colors</CardTitle>
                <CardDescription>{palette.slice(0, paletteLimit).length} exported swatches</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-5 gap-2">
                  {palette.map((hex, index) => (
                    <button
                      key={`${hex}-${index}`}
                      type="button"
                      className={cn(
                        'aspect-square rounded-md border shadow-sm ring-offset-background transition-all',
                        activeColor === index && 'ring-2 ring-ring ring-offset-2',
                        index >= paletteLimit && 'opacity-40'
                      )}
                      style={{ backgroundColor: hex }}
                      aria-label={`Select color ${index + 1}`}
                      onClick={() => {
                        setActiveColor(index);
                        setPaintTool('brush');
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={palette[activeColor] ?? '#111827'}
                    className="h-10 w-14 p-1"
                    onChange={(event) => {
                      const next = normalizeHex(event.target.value);
                      setPalette((current) => current.map((hex, index) => (index === activeColor ? next : hex)));
                    }}
                  />
                  <Input
                    value={palette[activeColor] ?? '#111827'}
                    onChange={(event) => {
                      const next = normalizeHex(event.target.value);
                      setPalette((current) => current.map((hex, index) => (index === activeColor ? next : hex)));
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={addPaletteColor} disabled={palette.length >= MAX_PALETTE_SIZE}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                  <Button variant="outline" size="sm" onClick={deleteActivePaletteColor} disabled={palette.length <= 2}>
                    <Eraser className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
                <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Difficulty</span>
                    <span className={cn('font-semibold', metricTone(level.metrics.difficultyScore))}>
                      {level.metrics.difficultyTier} {level.metrics.difficultyScore}
                    </span>
                  </div>
                  <Progress value={level.metrics.difficultyScore} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Components {level.metrics.componentCount}</span>
                    <span>Tray pressure {level.metrics.trayPressurePercent}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="play" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="rounded-lg">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Simulator</CardTitle>
                    <CardDescription>{completion.correct} of {level.cells.length} cells correct</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setBoard(createBoard(level))}>
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShuffleSeed((current) => current + 1)}>
                      <Shuffle className="h-4 w-4" />
                      Seed
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{board.lastMessage}</span>
                    <span className={completion.complete ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-medium'}>
                      {completion.progress}%
                    </span>
                  </div>
                  <Progress value={completion.progress} />
                </div>

                <div className="mx-auto w-full max-w-[800px]">
                  <canvas
                    ref={playCanvasRef}
                    width={columns}
                    height={rows}
                    className="block max-h-[72vh] w-full cursor-pointer rounded-md border bg-muted/30 shadow-sm [image-rendering:pixelated]"
                    style={{ aspectRatio: `${columns} / ${rows}` }}
                    aria-label="Pixel sort simulator canvas"
                    onPointerDown={handlePlayCanvasClick}
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{level.cells.length} playable cells</span>
                    <span>{board.selectedTileIds.length} selected</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                  <CardDescription>
                    Moves {board.moves} · Selections {board.selections} · Placements {board.placements}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full" disabled={board.selectedTileIds.length === 0} onClick={() => setBoard((current) => moveSelectionToTray(level, current))}>
                    <MousePointer2 className="h-4 w-4" />
                    Move Selection To Tray
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" disabled={board.selectedTileIds.length === 0} onClick={() => setBoard((current) => ({ ...current, selectedTileIds: [], lastMessage: 'Selection cleared' }))}>
                      Clear
                    </Button>
                    <Button variant="outline" size="sm" disabled={board.trayTileIds.length <= 1} onClick={() => setBoard((current) => shuffleTray(current, shuffleSeed + board.moves + 17))}>
                      <Shuffle className="h-4 w-4" />
                      Tray
                    </Button>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="mb-2 flex justify-between">
                      <span className="text-muted-foreground">Selected</span>
                      <span className="font-medium">{board.selectedTileIds.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-5 w-5 rounded-sm border"
                        style={{ backgroundColor: selectedPalette === undefined ? 'transparent' : palette[selectedPalette] }}
                      />
                      <span>{selectedPalette === undefined ? 'None' : `Color ${selectedPalette + 1}`}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>Tray</CardTitle>
                  <CardDescription>{board.trayTileIds.length} of {level.trayCapacity} slots filled</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-6 gap-1">
                    {Array.from({ length: level.trayCapacity }).map((_, index) => {
                      const tileId = board.trayTileIds[index];
                      const tilePaletteIndex = tileId === undefined ? undefined : runtime.paletteByTileId.get(tileId);
                      return (
                        <div
                          key={index}
                          className="aspect-square rounded-sm border bg-muted/50"
                          style={{ backgroundColor: tilePaletteIndex === undefined ? undefined : palette[tilePaletteIndex] ?? '#94a3b8' }}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {level.palette.map((entry, index) => (
                      <Button
                        key={entry.id}
                        variant="outline"
                        size="sm"
                        disabled={(colorCountsInTray.get(index) ?? 0) === 0}
                        onClick={() => setBoard((current) => placeTrayColor(level, runtime, current, index))}
                        className="justify-start"
                      >
                        <span className="h-4 w-4 rounded-sm border" style={{ backgroundColor: entry.hex }} />
                        {colorCountsInTray.get(index) ?? 0}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="collection" className="space-y-4">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Pixel Sort Levels</CardTitle>
                  <CardDescription>{collection.length} local levels</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={exportCollectionJson} disabled={collection.length === 0}>
                    <Download className="h-4 w-4" />
                    Export All
                  </Button>
                  <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-all hover:bg-accent hover:text-accent-foreground">
                    <Upload className="h-4 w-4" />
                    Import
                    <input type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {importMessage && <p className="text-sm text-muted-foreground">{importMessage}</p>}
              {collection.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No Pixel Sort levels saved yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {collection.map((item) => (
                    <div key={item.id} className="rounded-md border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">L{item.levelNumber} · {item.displayName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.metrics.cellCount} cells · {item.palette.length} colors · {item.metrics.difficultyTier}
                          </p>
                        </div>
                        <Badge variant="outline">{item.metrics.difficultyScore}</Badge>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => loadLevel(item)}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportLevelJson(item)}>
                          JSON
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void copyLevelJson(item)}>
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCollection((current) => current.filter((levelItem) => levelItem.id !== item.id))}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analyze" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Cells', level.metrics.cellCount, `${level.metrics.transparentCellCount} transparent`],
              ['Components', level.metrics.componentCount, `largest ${level.metrics.largestComponent}`],
              ['Start Correct', `${level.metrics.startingCorrectPercent}%`, `${level.metrics.startingCorrect} locked`],
              ['Tray Pressure', `${level.metrics.trayPressurePercent}%`, `${level.metrics.largestPaletteCount} max color count`],
            ].map(([label, value, detail]) => (
              <Card key={label} className="rounded-lg">
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-2xl">{value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Difficulty Estimate</CardTitle>
                  <CardDescription>Derived from scramble, palette pressure, tray pressure, and fragmentation</CardDescription>
                </div>
                <Badge variant="secondary" className={metricTone(level.metrics.difficultyScore)}>
                  {level.metrics.difficultyTier}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>Score</span>
                  <span className={cn('font-semibold', metricTone(level.metrics.difficultyScore))}>{level.metrics.difficultyScore}/100</span>
                </div>
                <Progress value={level.metrics.difficultyScore} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Export Shape</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    format, sourceTool, palette, cells, trayCapacity, shuffleSeed
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Grid Rule</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    four-neighbor square pixels with correct cells locked
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Tray Rule</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    color batches place into empty matching target cells
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
