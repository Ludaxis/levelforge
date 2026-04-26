import type { ReactNode } from 'react';

export interface HelpTopic {
  id: string;
  title: string;
  parentId?: string;
  order?: number;
  summary?: string;
  body: ReactNode;
}

export interface HelpContextValue {
  open: (topicId: string) => void;
  close: () => void;
  isOpen: boolean;
  activeTopicId: string | null;
  topics: Map<string, HelpTopic>;
}
