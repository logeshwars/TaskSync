/**
 * Redux store.
 *
 * Composes all feature slices and exports typed hooks so components
 * never import from `react-redux` directly (avoids forgetting the
 * generic parameter on `useSelector`).
 */
import { configureStore } from '@reduxjs/toolkit';
import {
  useDispatch as useReduxDispatch,
  useSelector as useReduxSelector,
  type TypedUseSelectorHook,
} from 'react-redux';

import authReducer from './auth.slice';
import boardsReducer from './boards.slice';
import presenceReducer from './presence.slice';
import workspacesReducer from './workspaces.slice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    workspaces: workspacesReducer,
    boards: boardsReducer,
    presence: presenceReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useReduxDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useReduxSelector;
