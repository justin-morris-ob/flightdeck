import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';

export interface DraftSource {
  dirty: boolean;
  busy: boolean;
  discard: () => void;
}
interface DraftNavigation {
  register: (id: string, source: DraftSource | null) => void;
  confirmTransition: (action: () => void, exceptSourceId?: string) => void;
  hasPendingChanges: () => boolean;
  cancelTransition: () => void;
}

export const DraftContext = createContext<DraftNavigation | null>(null);

export function useDraftNavigation() {
  const navigation = useContext(DraftContext);
  if (!navigation) throw new Error('Draft navigation requires DraftNavigationProvider');
  return navigation;
}

export function useDraftSource(dirty: boolean, discard: () => void, busy = false): string {
  const { register } = useDraftNavigation();
  const id = useId();
  const discardRef = useRef(discard);
  discardRef.current = discard;
  useLayoutEffect(() => {
    register(id, { dirty, busy, discard: () => discardRef.current() });
    return () => register(id, null);
  }, [register, id, dirty, busy]);
  return id;
}
