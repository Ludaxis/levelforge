import type { GameAdapter } from './types';
import { juicyBlastAdapter } from './juicyBlast';

export type { GameAdapter, DesignLever, VariantSystem, SignalColumnMapping } from './types';

export const ADAPTERS: GameAdapter[] = [juicyBlastAdapter];

export function getAdapter(id: string): GameAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

export const DEFAULT_ADAPTER_ID = juicyBlastAdapter.id;
