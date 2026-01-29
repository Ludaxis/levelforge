'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const error = searchParams.get('error');
  const next = searchParams.get('next') ?? '/';

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push(next);
      } else {
        setShowModal(true);
      }
    }
  }, [isAuthenticated, isLoading, router, next]);

  const handleModalClose = (open: boolean) => {
    setShowModal(open);
    if (!open) {
      router.push('/');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Redirecting...</span>
      </div>
    );
  }

  return (
    <div className="flex h-[60vh] items-center justify-center">
      {error && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Authentication Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please try signing in again.
            </p>
          </CardContent>
        </Card>
      )}
      <AuthModal open={showModal} onOpenChange={handleModalClose} />
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}
