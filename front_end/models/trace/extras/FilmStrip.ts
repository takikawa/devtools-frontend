// Copyright 2023 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
import type * as Types from '../types/types.js';
import type * as Handlers from '../handlers/handlers.js';
import * as Platform from '../../../core/platform/platform.js';

export interface FilmStripData {
  zeroTime: Types.Timing.MicroSeconds;
  spanTime: Types.Timing.MicroSeconds;
  frames: readonly FilmStripFrame[];
}

export interface FilmStripFrame {
  screenshotEvent: Types.TraceEvents.TraceEventSnapshot;
  screenshotAsString: string;
  index: number;
}

export type HandlersWithFilmStrip = Handlers.Types.HandlersWithMeta<{
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Screenshots: typeof Handlers.ModelHandlers.Screenshots,
}>;

export type HandlerDataWithScreenshots = Handlers.Types.EnabledHandlerDataWithMeta<{
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Screenshots: typeof Handlers.ModelHandlers.Screenshots,
}>;

// Cache film strips based on:
// 1. The trace parsed data object
// 2. The start time.
const filmStripCache = new Map<HandlerDataWithScreenshots, Map<Types.Timing.MicroSeconds, FilmStripData>>();

export function filmStripFromTraceEngine(
    traceData: HandlerDataWithScreenshots, customZeroTime?: Types.Timing.MicroSeconds): FilmStripData {
  const frames: FilmStripFrame[] = [];

  const zeroTime = typeof customZeroTime !== 'undefined' ? customZeroTime : traceData.Meta.traceBounds.min;
  const spanTime = traceData.Meta.traceBounds.range;
  const fromCache = filmStripCache.get(traceData)?.get(zeroTime);
  if (fromCache) {
    return fromCache;
  }

  for (const screenshot of traceData.Screenshots) {
    if (screenshot.ts < zeroTime) {
      continue;
    }
    const frame: FilmStripFrame = {
      index: frames.length,
      screenshotEvent: screenshot,
      screenshotAsString: screenshot.args.snapshot,
    };
    frames.push(frame);
  }

  const result: FilmStripData = {
    zeroTime,
    spanTime,
    frames: Array.from(frames),
  };

  const cachedForData = Platform.MapUtilities.getWithDefault(
      filmStripCache, traceData, () => new Map<Types.Timing.MicroSeconds, FilmStripData>());
  cachedForData.set(zeroTime, result);

  return result;
}

export function frameClosestToTimestamp(
    filmStrip: FilmStripData, searchTimestamp: Types.Timing.MicroSeconds): FilmStripFrame|null {
  const closestFrameIndexBeforeTimestamp = Platform.ArrayUtilities.nearestIndexFromEnd(
      filmStrip.frames, frame => frame.screenshotEvent.ts < searchTimestamp);
  if (closestFrameIndexBeforeTimestamp === null) {
    return null;
  }
  return filmStrip.frames[closestFrameIndexBeforeTimestamp];
}
