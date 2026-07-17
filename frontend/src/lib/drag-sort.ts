export type DropPosition = "before" | "after";

export type DropIndicator<T extends string = string> = {
  targetKey: T;
  position: DropPosition;
} | null;

export function getDropPosition({
  axis,
  clientX,
  clientY,
  rect,
}: {
  axis: "x" | "y";
  clientX: number;
  clientY: number;
  rect: DOMRect;
}): DropPosition {
  if (axis === "x") {
    return clientX - rect.left <= rect.width / 2 ? "before" : "after";
  }
  return clientY - rect.top <= rect.height / 2 ? "before" : "after";
}

export function reorderWithDropPosition<T extends string>(
  items: T[],
  draggedKey: T,
  targetKey: T,
  position: DropPosition,
): T[] {
  if (draggedKey === targetKey) return items;

  const next = [...items];
  const fromIndex = next.indexOf(draggedKey);
  const targetIndex = next.indexOf(targetKey);
  if (fromIndex < 0 || targetIndex < 0) return items;

  const [moved] = next.splice(fromIndex, 1);
  const baseIndex = next.indexOf(targetKey);
  if (baseIndex < 0) return items;

  next.splice(position === "before" ? baseIndex : baseIndex + 1, 0, moved);
  return next;
}
