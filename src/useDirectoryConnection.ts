import { useEffect, useState } from 'react';

import { directoryStatusSchema, type DirectoryStatus } from '../shared/directory.ts';
import { errorMessage, get, type Request } from './api.ts';

export function useDirectoryConnection(request: Request, scope: string) {
  const [status, setStatus] = useState<DirectoryStatus | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setStatus(null);
    setError('');
    get(request, `${scope}/directory`, directoryStatusSchema)
      .then((value) => {
        if (current) setStatus(value);
      })
      .catch((cause: unknown) => {
        if (current) setError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [request, scope, version]);
  return { status, error, reload: () => setVersion((value) => value + 1) };
}
