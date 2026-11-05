import { useCallback, useEffect, useRef, useState } from 'react';

import { useDraftNavigation } from './draft-context.ts';
import {
  emptyLocation,
  locationSearch,
  readLocation,
  type FlightdeckLocation,
  type LocationResult,
} from './navigation.ts';

export function useFlightdeckLocation({
  embedded,
  initialLocation,
  onNavigate,
}: {
  embedded: boolean;
  initialLocation?: LocationResult;
  onNavigate?: (location: FlightdeckLocation) => void;
}) {
  const { confirmTransition, hasPendingChanges, cancelTransition } = useDraftNavigation();
  const [route, setRoute] = useState<LocationResult>(() =>
    embedded
      ? (initialLocation ?? { location: emptyLocation, error: '' })
      : readLocation(window.location.search)
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const position = useRef(0);
  const furthest = useRef(0);
  const restoring = useRef<(() => void) | null>(null);
  const approvedPop = useRef(false);

  const commit = useCallback(
    (next: FlightdeckLocation, replace = false, local = false) => {
      if (embedded && onNavigate && !local) {
        onNavigate(next);
        return;
      }
      if (!embedded) {
        if (!replace) {
          window.history.replaceState(
            { flightdeckPosition: position.current, flightdeckFurthest: position.current + 1 },
            '',
            window.location.href
          );
          position.current++;
          furthest.current = position.current;
        }
        window.history[replace ? 'replaceState' : 'pushState'](
          { flightdeckPosition: position.current, flightdeckFurthest: furthest.current },
          '',
          `${window.location.pathname}${locationSearch(next)}`
        );
      }
      const result = { location: next, error: '' };
      routeRef.current = result;
      setRoute(result);
    },
    [embedded, onNavigate]
  );
  const navigate = useCallback(
    (next: FlightdeckLocation) => {
      if (
        routeRef.current.location &&
        locationSearch(next) === locationSearch(routeRef.current.location)
      )
        return;
      confirmTransition(() => commit(next));
    },
    [confirmTransition, commit]
  );
  const initializeProject = useCallback(
    (projectId: string) => {
      if (routeRef.current.location && !routeRef.current.location.projectId)
        commit({ ...routeRef.current.location, projectId }, true, true);
    },
    [commit]
  );
  const reset = useCallback(() => {
    cancelTransition();
    commit(emptyLocation, true, true);
  }, [cancelTransition, commit]);

  useEffect(() => {
    if (embedded) return;
    const savedPosition: unknown = window.history.state?.flightdeckPosition;
    position.current =
      typeof savedPosition === 'number' && Number.isSafeInteger(savedPosition) ? savedPosition : 0;
    const savedFurthest: unknown = window.history.state?.flightdeckFurthest;
    furthest.current =
      typeof savedFurthest === 'number' && Number.isSafeInteger(savedFurthest)
        ? Math.max(position.current, savedFurthest)
        : position.current;
    window.history.replaceState(
      { flightdeckPosition: position.current, flightdeckFurthest: furthest.current },
      '',
      window.location.href
    );
    const pop = () => {
      if (restoring.current) {
        const afterRestore = restoring.current;
        restoring.current = null;
        afterRestore();
        return;
      }
      const targetPosition: unknown = window.history.state?.flightdeckPosition;
      if (typeof targetPosition !== 'number' || !Number.isSafeInteger(targetPosition)) {
        window.location.reload();
        return;
      }
      const next = readLocation(window.location.search);
      const accept = () => {
        position.current = targetPosition;
        const nextFurthest: unknown = window.history.state?.flightdeckFurthest;
        if (typeof nextFurthest === 'number' && Number.isSafeInteger(nextFurthest))
          furthest.current = Math.max(furthest.current, nextFurthest);
        routeRef.current = next;
        setRoute(next);
      };
      if (approvedPop.current || !hasPendingChanges()) {
        approvedPop.current = false;
        accept();
        return;
      }
      const delta = position.current - targetPosition;
      if (!delta) return;
      restoring.current = () =>
        confirmTransition(() => {
          approvedPop.current = true;
          window.history.go(-delta);
        });
      window.history.go(delta);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [embedded, confirmTransition, hasPendingChanges]);

  return {
    location: route.location ?? emptyLocation,
    locationError: route.error,
    navigate,
    commit,
    initializeProject,
    reset,
    canGoBack: position.current > 0,
    canGoForward: position.current < furthest.current,
  };
}
