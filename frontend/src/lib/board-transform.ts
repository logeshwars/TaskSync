/**
 * Transforms a hydrated board (from the API) into the ColumnData[]
 * shape that the existing KanbanColumn / view components expect.
 *
 * This adapter lets us wire real data without rewriting every presentational
 * component. Phase 11 can refactor to native types if desired.
 */
import type { CardData, Priority } from '@/components/KanbanCard';
import type { ColumnColor, ColumnData } from '@/components/KanbanColumn';
import type { CardItem, HydratedBoard, ListItem } from '@/store/boards.slice';

/**
 * Map backend priority to the frontend's priority type.
 * Backend uses "urgent"; frontend uses "critical".
 */
function mapPriority(p: string): Priority {
  if (p === 'urgent') return 'critical';
  return p as Priority;
}

/**
 * Assign a column color based on list index.
 * We cycle through the available palette so newly created lists
 * still get a visual identity without needing a color field.
 */
const COLOR_CYCLE: ColumnColor[] = ['backlog', 'todo', 'progress', 'done', 'blocked'];

function cardToUi(card: CardItem): CardData {
  return {
    id: card.id,
    title: card.title,
    description: card.description || undefined,
    priority: mapPriority(card.priority),
    tags: card.tags,
    comments: card.commentsCount || undefined,
    dueDate: card.dueDate
      ? new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : undefined,
    progress: card.progress || undefined,
    // assignee is populated by the user resolver in Phase 10.
  };
}

export function hydratedBoardToColumns(board: HydratedBoard): ColumnData[] {
  // Sort lists by the board's listOrder to respect manual ordering.
  const orderMap = new Map(board.listOrder.map((id, idx) => [id, idx]));
  const sortedLists = [...board.lists].sort(
    (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999),
  );

  return sortedLists
    .filter((l) => !l.archived)
    .map((list: ListItem, idx: number) => {
      const listCards = board.cards
        .filter((c) => c.listId === list.id && !c.archived)
        .sort((a, b) => a.position.localeCompare(b.position));

      return {
        id: list.id,
        title: list.title,
        color: COLOR_CYCLE[idx % COLOR_CYCLE.length],
        limit: list.wipLimit ?? undefined,
        cards: listCards.map(cardToUi),
      };
    });
}
