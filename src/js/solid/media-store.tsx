import { createSignal } from 'solid-js';

import {
  AvailabilityStates,
  MediaUIEvents,
  MediaUIProps,
  StreamTypes,
  VolumeLevels,
} from '../constants.js';
import {
  createMediaStoreForSolid,
  type MediaState,
  type MediaStore,
} from '../media-store/media-store.js';
import type {
  FullScreenElementStateOwner,
  MediaStateOwner,
} from '../media-store/state-mediator.js';
import {
  createContext,
  useContext,
  createEffect,
  onCleanup,
  createMemo,
} from 'solid-js';

export { MediaState };
export { AvailabilityStates, StreamTypes, VolumeLevels };

const { ...StateChangeRequests } = MediaUIEvents;

export const MediaActionTypes = {
  ...StateChangeRequests,
  MEDIA_ELEMENT_CHANGE_REQUEST: 'mediaelementchangerequest',
  FULLSCREEN_ELEMENT_CHANGE_REQUEST: 'fullscreenelementchangerequest',
} as const;

export const MediaStateNames = { ...MediaUIProps } as const;

const identity = <T,>(x?: T) => x;

const MediaContext = createContext<MediaStore | null>(null);

export const MediaProvider = (props: {
  children: any;
  mediaStore?: MediaStore;
}) => {
  // Create or use the media store
  const mediaStore = createMemo(
    () =>
      props.mediaStore ??
      createMediaStoreForSolid({ documentElement: globalThis.document })
  );

  // Effect for managing media store cleanup and setup
  createEffect(() => {
    const currentStore = mediaStore();
    currentStore?.dispatch?.({
      type: 'documentelementchangerequest',
      detail: globalThis.document,
    });

    onCleanup(() => {
      currentStore?.dispatch?.({
        type: 'documentelementchangerequest',
        detail: undefined,
      });
    });
  });

  // Return the context provider
  return (
    <MediaContext.Provider value={mediaStore()}>
      {props.children}
    </MediaContext.Provider>
  );
};

export const useMediaStore = () => {
  return useContext(MediaContext);
};

export const useMediaDispatch = () => {
  const store = useContext(MediaContext);
  const dispatch = store?.dispatch ?? identity;
  return ((value: any) => dispatch(value)) as MediaStore['dispatch'];
};

export const useMediaRef = () => {
  const dispatch = useMediaDispatch();
  return (mediaEl: MediaStateOwner | null | undefined) => {
    dispatch({
      type: MediaActionTypes.MEDIA_ELEMENT_CHANGE_REQUEST,
      detail: mediaEl,
    });
  };
};

export const useMediaFullscreenRef = () => {
  const dispatch = useMediaDispatch();
  return (fullscreenEl: FullScreenElementStateOwner | null | undefined) => {
    dispatch({
      type: MediaActionTypes.FULLSCREEN_ELEMENT_CHANGE_REQUEST,
      detail: fullscreenEl,
    });
  };
};

const refEquality = <T,>(a: T, b: T) => a === b;

export const useMediaSelector = <S = any,>(
  selector: (state: Partial<MediaState>) => S,
  equalityFn = refEquality
): S => {
  const store = useContext(MediaContext) as MediaStore;

  // Initialize signal with an immediate value from the selector
  const initialState = selector(store?.getState?.() ?? {});
  const [selectedState, setSelectedState] = createSignal<any>(initialState);

  createEffect(() => {
    const unsubscribe = store?.subscribe?.(() => {
      const newState = store?.getState?.();
      const newSelectedState: any = selector(newState ?? {});
      // Only update if the state has changed based on the equality check
      if (!equalityFn(newSelectedState, selectedState())) {
        setSelectedState(newSelectedState);
      }
    });

    onCleanup(unsubscribe);
  });

  return selectedState() as S; // Return the state value
};
