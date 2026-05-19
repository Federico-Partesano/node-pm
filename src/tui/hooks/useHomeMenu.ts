import { useMemo, useState, useCallback } from 'react';
import {
  HOME_MENU_ITEMS,
  HOME_MENU_ORDER_EMPTY,
  HOME_MENU_ORDER_FULL,
  type HomeAction,
  type HomeMenuItem,
} from '../config/homeMenuItems.js';

type Args = {
  hasManifest: boolean;
  totalProjects: number;
};

export function useHomeMenu({ hasManifest, totalProjects }: Args) {
  const items: HomeMenuItem[] = useMemo(() => {
    const order =
      hasManifest && totalProjects > 0
        ? HOME_MENU_ORDER_FULL
        : HOME_MENU_ORDER_EMPTY;
    return order.map((a) => HOME_MENU_ITEMS[a]);
  }, [hasManifest, totalProjects]);

  const [cursor, setCursor] = useState(0);
  const current = items[Math.min(cursor, items.length - 1)] ?? items[0]!;

  const moveUp = useCallback(() => {
    setCursor((c) => (c > 0 ? c - 1 : c));
  }, []);
  const moveDown = useCallback(() => {
    setCursor((c) => (c < items.length - 1 ? c + 1 : c));
  }, [items.length]);

  return { items, cursor, current, moveUp, moveDown };
}

export type { HomeAction };
