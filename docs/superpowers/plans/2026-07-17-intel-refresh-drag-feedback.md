# Intel Refresh And Drag Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visible refresh progress to the Intel page and make all existing `SectionTabs` plus Intel overview cards reorder with stable before/after drop indicators.

**Architecture:** Keep the current native HTML drag-and-drop approach, but move the position math and reorder logic into a small shared helper so Intel cards and `SectionTabs` use the same rules. Layer a local refresh-state machine onto `Intel.tsx` without changing API contracts or localStorage keys.

**Tech Stack:** React, TypeScript, Vite, Tailwind utility classes, localStorage persistence, native Drag and Drop API, Vitest-compatible frontend test patterns already used in the repo

## Global Constraints

- Do not introduce a new drag-and-drop dependency library.
- Do not change existing sort persistence keys or storage format in `localStorage`.
- Do not change Intel data APIs, AI digest behavior, or module content shape.
- Limit code changes to the frontend interaction layer for this feature.

---

## File Structure

- Create: `frontend/src/lib/drag-sort.ts`
  - Shared drag-position math and array reorder helpers used by Intel cards and `SectionTabs`.
- Modify: `frontend/src/components/ui/SectionTabs.tsx`
  - Replace coarse `dragOverKey` state with a before/after drop-indicator model for horizontal and vertical tabs.
- Modify: `frontend/src/pages/Intel.tsx`
  - Add refresh button state, refresh success flash timing, and card-level before/after drop indicators for the overview stack.

### Task 1: Build Shared Drag Sort Helpers

**Files:**
- Create: `frontend/src/lib/drag-sort.ts`
- Test: No dedicated test file in this task; verification is covered through TypeScript compile and behavior checks in Tasks 2-3.

**Interfaces:**
- Consumes: DOMRect data and pointer coordinates from drag events.
- Produces:
  - `export type DropPosition = "before" | "after";`
  - `export type DropIndicator = { targetKey: string; position: DropPosition } | null;`
  - `export function getDropPosition(options: { axis: "x" | "y"; clientX: number; clientY: number; rect: DOMRect; }): DropPosition`
  - `export function reorderWithDropPosition<T extends string>(items: T[], draggedKey: T, targetKey: T, position: DropPosition): T[]`

- [ ] **Step 1: Create the shared helper file with exported types**

```ts
export type DropPosition = "before" | "after";

export type DropIndicator = {
  targetKey: string;
  position: DropPosition;
} | null;
```

- [ ] **Step 2: Implement midpoint-based drop-position detection**

```ts
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
```

- [ ] **Step 3: Implement shared reorder logic that removes first, then inserts**

```ts
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
  const insertIndex = position === "before" ? baseIndex : baseIndex + 1;
  next.splice(insertIndex, 0, moved);
  return next;
}
```

- [ ] **Step 4: Run TypeScript build after adding the new helper**

Run: `npm run build`

Expected: build reaches existing app compile stage without a new `drag-sort.ts` export/type error.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/drag-sort.ts
git commit -m "feat: add shared drag sort helpers"
```

### Task 2: Upgrade SectionTabs To Before/After Indicators

**Files:**
- Modify: `frontend/src/components/ui/SectionTabs.tsx`
- Uses: `frontend/src/lib/drag-sort.ts`
- Test: `npm run build`

**Interfaces:**
- Consumes:
  - `DropIndicator`
  - `getDropPosition(...)`
  - `reorderWithDropPosition(...)`
- Produces:
  - unchanged `SectionTabs(...)` component API
  - internal `dropIndicator: DropIndicator` state replacing `dragOverKey`

- [ ] **Step 1: Replace coarse drag-over state with drop-indicator state**

```ts
const [draggingKey, setDraggingKey] = useState("");
const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null);
```

- [ ] **Step 2: Update drag handlers to compute before/after from pointer location**

```ts
onDragOver={(event) => {
  if (!draggableStorageKey) return;
  event.preventDefault();
  const position = getDropPosition({
    axis: orientation === "horizontal" ? "x" : "y",
    clientX: event.clientX,
    clientY: event.clientY,
    rect: event.currentTarget.getBoundingClientRect(),
  });
  setDropIndicator({ targetKey: tab.key, position });
}}
```

- [ ] **Step 3: Update drop handling to use the shared reorder helper**

```ts
const handleDrop = (targetKey: string) => {
  if (!draggableStorageKey || !draggingKey || !dropIndicator || draggingKey === targetKey) {
    setDraggingKey("");
    setDropIndicator(null);
    return;
  }
  const next = reorderWithDropPosition(
    orderedTabs.map((tab) => tab.key),
    draggingKey,
    targetKey,
    dropIndicator.position,
  );
  setStoredOrder(next);
  saveStoredOrder(draggableStorageKey, next);
  setDraggingKey("");
  setDropIndicator(null);
};
```

- [ ] **Step 4: Add explicit before/after indicator styling for both orientations**

```ts
const isDropBefore = dropIndicator?.targetKey === tab.key && dropIndicator.position === "before" && draggingKey !== tab.key;
const isDropAfter = dropIndicator?.targetKey === tab.key && dropIndicator.position === "after" && draggingKey !== tab.key;
```

```tsx
className={cn(
  "relative flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
  isDropBefore && "before:absolute before:bottom-1 before:left-1 before:top-1 before:w-0.5 before:rounded-full before:bg-primary",
  isDropAfter && "after:absolute after:bottom-1 after:right-1 after:top-1 after:w-0.5 after:rounded-full after:bg-primary",
)}
```

For vertical tabs, use top/bottom bars instead:

```tsx
isDropBefore && "before:absolute before:left-3 before:right-3 before:top-1 before:h-0.5 before:rounded-full before:bg-primary"
isDropAfter && "after:absolute after:bottom-1 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-primary"
```

- [ ] **Step 5: Keep cleanup paths symmetric**

```ts
onDragLeave={() => {
  if (!draggableStorageKey) return;
  if (dropIndicator?.targetKey === tab.key) setDropIndicator(null);
}}

onDragEnd={() => {
  if (!draggableStorageKey) return;
  setDraggingKey("");
  setDropIndicator(null);
}}
```

- [ ] **Step 6: Run frontend build to catch JSX/classname/type regressions**

Run: `npm run build`

Expected: PASS with no new TypeScript errors in `SectionTabs.tsx`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/SectionTabs.tsx frontend/src/lib/drag-sort.ts
git commit -m "feat: improve section tab drop indicators"
```

### Task 3: Add Intel Refresh Feedback And Card Drop Indicators

**Files:**
- Modify: `frontend/src/pages/Intel.tsx`
- Uses: `frontend/src/lib/drag-sort.ts`
- Test: `npm run build`

**Interfaces:**
- Consumes:
  - `DropIndicator`
  - `getDropPosition(...)`
  - `reorderWithDropPosition(...)`
- Produces:
  - local refresh state: `"" | "loading" | "success"`
  - local drop-indicator state for Intel overview cards

- [ ] **Step 1: Add refresh-status and drop-indicator state**

```ts
const [refreshState, setRefreshState] = useState<"" | "loading" | "success">("");
const [moduleDropIndicator, setModuleDropIndicator] = useState<DropIndicator>(null);
```

- [ ] **Step 2: Refactor load into a refresh-aware function with success flash timeout**

```ts
const load = async (options?: { silent?: boolean }) => {
  const silent = options?.silent ?? false;
  if (!silent) setRefreshState("loading");
  try {
    // existing Promise.all load body
    if (!silent) {
      setRefreshState("success");
      window.setTimeout(() => setRefreshState((current) => current === "success" ? "" : current), 1500);
    }
  } catch (error) {
    if (!silent) setRefreshState("");
    toast.error(error instanceof ApiError ? error.message : "投研资讯加载失败");
  } finally {
    if (!silent) {
      setRefreshState((current) => current === "loading" ? "" : current);
    }
  }
};
```

Then keep first render quiet:

```ts
useEffect(() => {
  void load({ silent: true });
}, []);
```

- [ ] **Step 3: Replace card reorder logic with shared before/after insertion**

```ts
const moveModule = (target: IntelKind, position: DropPosition) => {
  if (!draggingModule || draggingModule === target) return;
  setModuleOrder((current) => reorderWithDropPosition(current, draggingModule, target, position));
};
```

- [ ] **Step 4: Compute a card-level drop indicator during drag-over**

```ts
onDragOver={(event: DragEvent<HTMLDivElement>) => {
  if (!compact) return;
  event.preventDefault();
  const position = getDropPosition({
    axis: "y",
    clientX: event.clientX,
    clientY: event.clientY,
    rect: event.currentTarget.getBoundingClientRect(),
  });
  setModuleDropIndicator({ targetKey: kind, position });
}}
```

- [ ] **Step 5: Render clear before/after indicator styles for overview cards**

```ts
const isDropBefore = moduleDropIndicator?.targetKey === kind && moduleDropIndicator.position === "before" && draggingModule !== kind;
const isDropAfter = moduleDropIndicator?.targetKey === kind && moduleDropIndicator.position === "after" && draggingModule !== kind;
```

```tsx
className={cn(
  "relative transition-[opacity,transform] duration-150",
  draggingModule === kind && "scale-[0.985] opacity-60",
  isDropBefore && "before:absolute before:-top-2 before:left-4 before:right-4 before:h-1 before:rounded-full before:bg-primary before:shadow-glow",
  isDropAfter && "after:absolute after:-bottom-2 after:left-4 after:right-4 after:h-1 after:rounded-full after:bg-primary after:shadow-glow",
)}
```

- [ ] **Step 6: Update the refresh button copy and icon behavior**

```tsx
<button
  onClick={() => void load()}
  disabled={refreshState === "loading"}
  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
>
  <RefreshCw className={cn("h-4 w-4", refreshState === "loading" && "animate-spin", refreshState === "success" && "text-primary")} />
  {refreshState === "loading" ? "刷新中..." : refreshState === "success" ? "刚刚更新" : "刷新"}
</button>
```

- [ ] **Step 7: Clear drag state on drop/end/leave so indicators never stick**

```ts
onDrop={(event) => {
  if (!compact || !moduleDropIndicator) return;
  event.preventDefault();
  moveModule(kind, moduleDropIndicator.position);
  setModuleDropIndicator(null);
}}

onDragLeave={() => {
  if (moduleDropIndicator?.targetKey === kind) setModuleDropIndicator(null);
}}

onDragEnd={() => {
  setDraggingModule("");
  setModuleDropIndicator(null);
}}
```

- [ ] **Step 8: Run frontend build**

Run: `npm run build`

Expected: PASS with no new errors in `Intel.tsx`.

- [ ] **Step 9: Manually verify the Intel page**

Run: `npm run dev`

Check:
- Intel page refresh button spins and changes copy while loading.
- Success copy flashes briefly after a successful refresh.
- Overview card drag shows a top line when dropping before and a bottom line when dropping after.
- Refreshing the page preserves Intel module order.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/Intel.tsx frontend/src/lib/drag-sort.ts
git commit -m "feat: add intel refresh and drag feedback"
```

### Task 4: Final Regression Pass

**Files:**
- Modify: none expected unless regressions are found
- Test: `frontend/src/components/ui/SectionTabs.tsx`, `frontend/src/pages/Intel.tsx`

**Interfaces:**
- Consumes: completed UI behavior from Tasks 2-3
- Produces: validated feature-ready branch state

- [ ] **Step 1: Run a full frontend build on the final combined state**

Run: `npm run build`

Expected: PASS

- [ ] **Step 2: Spot-check pages that reuse SectionTabs**

Run: `npm run dev`

Check:
- `投研资讯` tabs show before/after insertion markers.
- Another page using horizontal `SectionTabs` such as `数据库` still reorders and persists correctly.
- Another page using vertical `SectionTabs` if present still reorders and persists correctly.

- [ ] **Step 3: Review the final diff for accidental churn**

Run: `git diff -- frontend/src/lib/drag-sort.ts frontend/src/components/ui/SectionTabs.tsx frontend/src/pages/Intel.tsx`

Expected: only the shared helper, `SectionTabs`, and Intel UI interaction changes appear.

- [ ] **Step 4: Commit any final regression fix if needed**

```bash
git add frontend/src/lib/drag-sort.ts frontend/src/components/ui/SectionTabs.tsx frontend/src/pages/Intel.tsx
git commit -m "chore: polish drag feedback regression fixes"
```

## Self-Review

- Spec coverage:
  - Refresh button dynamic states are covered in Task 3.
  - Intel overview card before/after indicators are covered in Task 3.
  - Shared `SectionTabs` drag behavior is covered in Task 2.
  - No new dependency and unchanged persistence are enforced in Global Constraints and the file choices.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to above” placeholders remain.
- Type consistency:
  - Shared names are consistent across tasks: `DropPosition`, `DropIndicator`, `getDropPosition`, `reorderWithDropPosition`.
