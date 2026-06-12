// This module is a thin aggregator kept ONLY for the `ConfigStoreType` type alias,
// which is consumed pervasively by draw-context.ts and the viz draw classes that
// receive a merged config snapshot via `DrawContext.config`.
//
// All state now lives in four cohesive stores (vizStore, filtersStore,
// appSettingsStore, uiStateStore). Import those stores directly. Only import
// `ConfigStoreType` from here when you need the merged snapshot type.
import type { VizStoreType, SpeakerSortOrder } from './vizStore';
import type { FiltersStoreType } from './filtersStore';
import type { AppSettingsStoreType } from './appSettingsStore';
import type { UIStateStoreType } from './uiStateStore';

export type ConfigStoreType = VizStoreType & FiltersStoreType & AppSettingsStoreType & UIStateStoreType;

export type { SpeakerSortOrder };
