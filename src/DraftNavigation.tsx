import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '@onebrief/atlas-ui';

import { DraftContext, type DraftSource } from './draft-context.ts';
import { Modal } from './forms.tsx';

interface Transition {
  action: () => void;
  exceptSourceId?: string;
}

export function DraftNavigationProvider({ children }: { children: ReactNode }) {
  const sources = useRef(new Map<string, DraftSource>());
  const [unsaved, setUnsaved] = useState(false);
  const [pending, setPending] = useState<Transition | null>(null);
  const [blocked, setBlocked] = useState(false);
  const register = useCallback((id: string, source: DraftSource | null) => {
    if (source) sources.current.set(id, source);
    else sources.current.delete(id);
    setUnsaved([...sources.current.values()].some((item) => item.dirty || item.busy));
  }, []);
  const cancelTransition = useCallback(() => {
    setPending(null);
    setBlocked(false);
  }, []);
  const confirmTransition = useCallback((action: () => void, exceptSourceId?: string) => {
    const relevant = [...sources.current].filter(([id]) => id !== exceptSourceId);
    if (relevant.some(([, source]) => source.busy)) {
      setBlocked(true);
      return;
    }
    if (relevant.some(([, source]) => source.dirty)) setPending({ action, exceptSourceId });
    else action();
  }, []);
  const hasPendingChanges = useCallback(
    () => [...sources.current.values()].some((source) => source.dirty || source.busy),
    []
  );
  const navigation = useMemo(
    () => ({ register, confirmTransition, cancelTransition, hasPendingChanges }),
    [register, confirmTransition, cancelTransition, hasPendingChanges]
  );
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  return (
    <DraftContext value={navigation}>
      {children}
      {pending && (
        <Modal title="Discard unpublished changes?" onClose={cancelTransition}>
          <div className="fd-form">
            <p>
              These edits have not been saved. Stay to keep editing, or discard them and continue.
            </p>
            <div className="fd-actions">
              <Button onClick={cancelTransition}>Stay</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const relevant = [...sources.current].filter(
                    ([id]) => id !== pending.exceptSourceId
                  );
                  if (relevant.some(([, source]) => source.busy)) {
                    setPending(null);
                    setBlocked(true);
                    return;
                  }
                  for (const [, source] of relevant) {
                    if (source.dirty) source.discard();
                  }
                  setPending(null);
                  pending.action();
                }}
              >
                Discard and leave
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {blocked && (
        <Modal title="Save in progress" onClose={cancelTransition}>
          <div className="fd-form">
            <p>Wait for the current operation to finish before leaving this configuration.</p>
            <Button onClick={cancelTransition}>Stay</Button>
          </div>
        </Modal>
      )}
    </DraftContext>
  );
}
