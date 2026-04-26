'use client';

import React from 'react';
import { HelpCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHelp } from './HelpProvider';
import { getHelpTopic } from './registry';

type HelpButtonVariant = 'icon' | 'inline' | 'full';

interface HelpButtonProps {
  topic: string;
  variant?: HelpButtonVariant;
  label?: string;
  className?: string;
  iconOnly?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export function HelpButton({
  topic,
  variant = 'icon',
  label,
  className,
  size = 'sm',
}: HelpButtonProps) {
  const { open } = useHelp();
  const t = getHelpTopic(topic);
  const title = label ?? t?.title ?? 'Help';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    open(topic);
  };

  if (variant === 'icon') {
    const sizeMap = { xs: 'h-3 w-3', sm: 'h-3.5 w-3.5', md: 'h-4 w-4' };
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Help: ${title}`}
        aria-label={`Help: ${title}`}
        className={cn(
          'inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors p-0.5',
          className
        )}
      >
        <HelpCircle className={sizeMap[size]} />
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline',
          className
        )}
      >
        <HelpCircle className="h-3 w-3" />
        {label ?? 'Help'}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      className={cn('h-7 gap-1.5', className)}
    >
      <BookOpen className="h-3.5 w-3.5" />
      {label ?? 'Guide'}
    </Button>
  );
}
