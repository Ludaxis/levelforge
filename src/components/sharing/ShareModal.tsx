'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  createShareLink,
  getShareInfo,
  revokeShareLink,
  getShareUrl,
} from '@/lib/sharing/sharingService';
import { DbSharedCollection } from '@/lib/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Copy,
  Check,
  Loader2,
  Link2,
  Eye,
  Trash2,
  ExternalLink,
  LogIn,
} from 'lucide-react';

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string | null;
  gameType: string;
  levelCount: number;
  onSignInClick?: () => void;
}

export function ShareModal({
  open,
  onOpenChange,
  collectionId,
  gameType,
  levelCount,
  onSignInClick,
}: ShareModalProps) {
  const { isAuthenticated, isSupabaseAvailable } = useAuth();
  const [shareInfo, setShareInfo] = useState<DbSharedCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Load existing share info when modal opens
  useEffect(() => {
    if (open && collectionId && isAuthenticated) {
      setIsLoading(true);
      setError(null);
      getShareInfo(collectionId).then((info) => {
        setShareInfo(info);
        if (info) {
          setTitle(info.title || '');
          setDescription(info.description || '');
        }
        setIsLoading(false);
      });
    }
  }, [open, collectionId, isAuthenticated]);

  const handleShare = async () => {
    if (!collectionId) return;

    setIsLoading(true);
    setError(null);

    const result = await createShareLink(collectionId, title || undefined, description || undefined);

    if ('error' in result && !('shareCode' in result)) {
      setError(result.error);
    } else if ('shareCode' in result) {
      setShareInfo({
        id: '',
        collection_id: collectionId,
        share_code: result.shareCode,
        title: title || null,
        description: description || null,
        is_public: true,
        view_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    setIsLoading(false);
  };

  const handleCopy = async () => {
    if (!shareInfo) return;

    const url = getShareUrl(shareInfo.share_code);
    await navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!collectionId) return;

    setIsLoading(true);
    const result = await revokeShareLink(collectionId);
    if (result.success) {
      setShareInfo(null);
      setTitle('');
      setDescription('');
    } else {
      setError(result.error || 'Failed to revoke share');
    }
    setIsLoading(false);
  };

  const handleOpenInNewTab = () => {
    if (!shareInfo) return;
    const url = getShareUrl(shareInfo.share_code);
    window.open(url, '_blank');
  };

  if (!isSupabaseAvailable) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Collection</DialogTitle>
            <DialogDescription>
              Sharing is not available in offline mode.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center text-muted-foreground">
            <p>Cloud sync must be configured to share collections.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!isAuthenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Collection</DialogTitle>
            <DialogDescription>
              Sign in to share your level collections with others.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <div className="text-muted-foreground">
              <p>Create a shareable link that anyone can access.</p>
              <p className="text-sm mt-2">Your {levelCount} levels will be viewable and importable.</p>
            </div>
            <Button onClick={onSignInClick} className="gap-2">
              <LogIn className="h-4 w-4" />
              Sign In to Share
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Share Collection
          </DialogTitle>
          <DialogDescription>
            Create a public link to share your {gameType} collection ({levelCount} levels).
          </DialogDescription>
        </DialogHeader>

        {isLoading && !shareInfo ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shareInfo ? (
          <div className="space-y-4">
            {/* Share URL */}
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={getShareUrl(shareInfo.share_code)}
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {isCopied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" onClick={handleOpenInNewTab}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {shareInfo.view_count} views
              </span>
              <span>
                Created {new Date(shareInfo.created_at).toLocaleDateString()}
              </span>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="share-title">Title (optional)</Label>
              <Input
                id="share-title"
                placeholder="My Awesome Levels"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="share-desc">Description (optional)</Label>
              <Input
                id="share-desc"
                placeholder="A collection of challenging puzzle levels"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="destructive"
                onClick={handleRevoke}
                disabled={isLoading}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Stop Sharing
              </Button>
              <Button onClick={handleShare} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Update Share
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="new-share-title">Title (optional)</Label>
              <Input
                id="new-share-title"
                placeholder="My Awesome Levels"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="new-share-desc">Description (optional)</Label>
              <Input
                id="new-share-desc"
                placeholder="A collection of challenging puzzle levels"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="p-4 bg-muted/30 rounded-lg text-sm text-muted-foreground">
              <p>When you share this collection:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Anyone with the link can view your levels</li>
                <li>They can import levels into their own collection</li>
                <li>Your changes will be visible immediately</li>
                <li>You can stop sharing at any time</li>
              </ul>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button onClick={handleShare} disabled={isLoading} className="gap-2">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Create Share Link
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
