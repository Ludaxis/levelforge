'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHelp } from './HelpProvider';
import { getAncestors, getChildTopics, getHelpTopic, getSiblings } from './registry';
import type { HelpTopic } from './types';

export function HelpDialog() {
  const { isOpen, activeTopicId, close, open } = useHelp();
  const contentRef = useRef<HTMLDivElement>(null);

  const topic = activeTopicId ? getHelpTopic(activeTopicId) : null;

  const ancestors = useMemo(() => (activeTopicId ? getAncestors(activeTopicId) : []), [activeTopicId]);

  const root = useMemo<HelpTopic | null>(() => {
    if (!topic) return null;
    if (ancestors.length === 0) return topic;
    return ancestors[0];
  }, [topic, ancestors]);

  const tree = useMemo(() => (root ? buildTree(root) : []), [root]);

  const siblings = useMemo(() => (activeTopicId ? getSiblings(activeTopicId) : []), [activeTopicId]);
  const siblingIndex = activeTopicId ? siblings.findIndex((t) => t.id === activeTopicId) : -1;
  const prevSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
  const nextSibling = siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1] : null;

  // Scroll content to top when topic changes
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTopicId]);

  if (!topic) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0 max-h-[85vh] grid grid-cols-[220px_1fr] overflow-hidden">
        {/* TOC sidebar */}
        <aside className="border-r bg-muted/30 overflow-y-auto py-3">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {root?.title ?? 'Guide'}
          </div>
          <nav className="px-1">
            {tree.map((node) => (
              <TocNode key={node.topic.id} node={node} activeId={activeTopicId} onSelect={open} depth={0} />
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex flex-col min-w-0">
          <header className="px-6 py-4 border-b">
            {ancestors.length > 0 && (
              <div className="text-[11px] font-mono text-muted-foreground mb-1 flex items-center gap-1 flex-wrap">
                {ancestors.map((a, i) => (
                  <React.Fragment key={a.id}>
                    <button onClick={() => open(a.id)} className="hover:text-primary hover:underline">
                      {a.title}
                    </button>
                    {i < ancestors.length - 1 && <span>/</span>}
                  </React.Fragment>
                ))}
                <span>/</span>
              </div>
            )}
            <DialogTitle className="text-lg">{topic.title}</DialogTitle>
            {topic.summary && (
              <p className="text-sm text-muted-foreground mt-1">{topic.summary}</p>
            )}
          </header>

          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-4 prose-help">
            {topic.body}
          </div>

          {(prevSibling || nextSibling) && (
            <footer className="px-6 py-3 border-t flex items-center justify-between bg-muted/20">
              <div>
                {prevSibling && (
                  <Button variant="ghost" size="sm" onClick={() => open(prevSibling.id)} className="gap-1.5">
                    <ChevronLeft className="h-4 w-4" />
                    <span className="text-xs">{prevSibling.title}</span>
                  </Button>
                )}
              </div>
              <div>
                {nextSibling && (
                  <Button variant="ghost" size="sm" onClick={() => open(nextSibling.id)} className="gap-1.5">
                    <span className="text-xs">{nextSibling.title}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </footer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TreeNode {
  topic: HelpTopic;
  children: TreeNode[];
}

function buildTree(root: HelpTopic): TreeNode[] {
  function build(parentId: string | undefined): TreeNode[] {
    return getChildTopics(parentId).map((t) => ({ topic: t, children: build(t.id) }));
  }
  return [{ topic: root, children: build(root.id) }];
}

function TocNode({
  node,
  activeId,
  onSelect,
  depth,
}: {
  node: TreeNode;
  activeId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const hasChildren = node.children.length > 0;
  const isActive = node.topic.id === activeId;
  const containsActive = activeId ? containsTopic(node, activeId) : false;
  const [expanded, setExpanded] = React.useState(containsActive || depth === 0);

  useEffect(() => {
    if (containsActive) setExpanded(true);
  }, [containsActive]);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 text-xs cursor-pointer hover:bg-accent group',
          isActive && 'bg-primary/15 text-primary font-medium',
          !isActive && 'text-foreground/80'
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="opacity-60 hover:opacity-100 -ml-1"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3 inline-block" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.topic.id)}
          className="flex-1 text-left truncate"
          title={node.topic.title}
        >
          {node.topic.title}
        </button>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((c) => (
            <TocNode key={c.topic.id} node={c} activeId={activeId} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function containsTopic(node: TreeNode, id: string): boolean {
  if (node.topic.id === id) return true;
  return node.children.some((c) => containsTopic(c, id));
}
