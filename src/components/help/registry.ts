import type { HelpTopic } from './types';

const registry = new Map<string, HelpTopic>();
const listeners = new Set<() => void>();

export function registerHelpTopics(topics: HelpTopic[]) {
  for (const t of topics) registry.set(t.id, t);
  listeners.forEach((l) => l());
}

export function unregisterHelpTopics(ids: string[]) {
  for (const id of ids) registry.delete(id);
  listeners.forEach((l) => l());
}

export function getHelpTopic(id: string): HelpTopic | undefined {
  return registry.get(id);
}

export function getAllHelpTopics(): Map<string, HelpTopic> {
  return new Map(registry);
}

export function subscribeHelpRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChildTopics(parentId: string | undefined): HelpTopic[] {
  const out: HelpTopic[] = [];
  for (const t of registry.values()) {
    if (t.parentId === parentId) out.push(t);
  }
  return out.sort((a, b) => {
    const ao = a.order ?? 1000;
    const bo = b.order ?? 1000;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title);
  });
}

export function getAncestors(topicId: string): HelpTopic[] {
  const chain: HelpTopic[] = [];
  let current = registry.get(topicId);
  while (current && current.parentId) {
    const parent = registry.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

export function getSiblings(topicId: string): HelpTopic[] {
  const t = registry.get(topicId);
  if (!t) return [];
  return getChildTopics(t.parentId);
}
