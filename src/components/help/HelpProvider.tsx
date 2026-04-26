'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HelpDialog } from './HelpDialog';
import { getAllHelpTopics, subscribeHelpRegistry } from './registry';
import type { HelpContextValue } from './types';
import './registerAll';

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);

  useEffect(() => subscribeHelpRegistry(() => setRegistryVersion((v) => v + 1)), []);

  const open = useCallback((topicId: string) => setActiveTopicId(topicId), []);
  const close = useCallback(() => setActiveTopicId(null), []);

  const topics = useMemo(() => getAllHelpTopics(), [registryVersion]);

  const value = useMemo<HelpContextValue>(
    () => ({ open, close, isOpen: activeTopicId !== null, activeTopicId, topics }),
    [open, close, activeTopicId, topics]
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpDialog />
    </HelpContext.Provider>
  );
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    return {
      open: () => console.warn('[help] HelpProvider not mounted'),
      close: () => {},
      isOpen: false,
      activeTopicId: null,
      topics: new Map(),
    };
  }
  return ctx;
}
