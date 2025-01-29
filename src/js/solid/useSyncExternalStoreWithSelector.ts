/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSignal, createEffect, onCleanup } from 'solid-js';

/**
 * Inlined Object.is polyfill to avoid requiring consumers ship their own
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
 */
function isPolyfill(x: any, y: any) {
  return (
    (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y) // eslint-disable-line no-self-compare
  );
}

const is: (x: any, y: any) => boolean =
  typeof Object.is === 'function' ? Object.is : isPolyfill;

type SnapshotRef<Selection> = {
  hasValue: boolean;
  value: Selection | null;
};

// Similar to React's `useSyncExternalStore` but using SolidJS primitives
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: undefined | null | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean
) {
  // Local state to store the selection
  const [selectedState, setSelectedState] = createSignal<Selection | any>();
  const inst: SnapshotRef<Selection> = { hasValue: false, value: null };

  // Memoized selector logic
  let hasMemo = false;
  let memoizedSnapshot: Snapshot;
  let memoizedSelection: Selection;

  const memoizedSelector = (nextSnapshot: Snapshot) => {
    if (!hasMemo) {
      hasMemo = true;
      memoizedSnapshot = nextSnapshot;
      const nextSelection = selector(nextSnapshot);
      if (isEqual && inst.hasValue) {
        const currentSelection = inst.value!;
        if (isEqual(currentSelection, nextSelection)) {
          memoizedSelection = currentSelection;
          return currentSelection;
        }
      }
      memoizedSelection = nextSelection;
      return nextSelection;
    }

    const prevSnapshot: Snapshot = memoizedSnapshot;
    const prevSelection: Selection = memoizedSelection;

    if (is(prevSnapshot, nextSnapshot)) {
      return prevSelection;
    }

    const nextSelection = selector(nextSnapshot);

    if (isEqual && isEqual(prevSelection, nextSelection)) {
      return prevSelection;
    }

    memoizedSnapshot = nextSnapshot;
    memoizedSelection = nextSelection;
    return nextSelection;
  };

  const getSnapshotWithSelector = () => memoizedSelector(getSnapshot());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getServerSnapshotWithSelector =
    getServerSnapshot === undefined
      ? undefined
      : () => memoizedSelector(getServerSnapshot());

  // Update the state whenever the store changes
  createEffect(() => {
    const unsubscribe = subscribe(() => {
      const newValue = getSnapshotWithSelector();
      setSelectedState(() => newValue);
      inst.hasValue = true;
      inst.value = newValue;
    });

    // Cleanup on disposal
    onCleanup(unsubscribe);
  });

  // Initialize the state with the current snapshot
  setSelectedState(() => getSnapshotWithSelector());

  return selectedState;
}
