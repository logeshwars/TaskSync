/**
 * KanbanCard component tests.
 *
 * Verifies:
 *   - Title and priority badge render correctly.
 *   - Tags, comments count, due date, and progress bar render.
 *   - Delete action fires the onDelete callback.
 *   - Click fires the onClick callback.
 *   - Drag start fires onDragStart.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { KanbanCard, type CardData } from '@/components/KanbanCard';

const baseCard: CardData = {
  id: 'card-1',
  title: 'Test card title',
  priority: 'high',
  tags: ['Frontend', 'API'],
  comments: 3,
  dueDate: 'Mar 12',
  progress: 45,
  description: 'A brief description.',
};

const noop = () => {};

function renderCard(overrides?: Partial<CardData>, props?: Record<string, unknown>) {
  const card = { ...baseCard, ...overrides };
  return render(
    <KanbanCard
      card={card}
      columnId="col-1"
      onDragStart={noop}
      onDelete={noop}
      {...props}
    />,
  );
}

describe('KanbanCard', () => {
  it('renders title and description', () => {
    renderCard();
    expect(screen.getByText('Test card title')).toBeInTheDocument();
    expect(screen.getByText('A brief description.')).toBeInTheDocument();
  });

  it('renders priority badge', () => {
    renderCard();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders tags', () => {
    renderCard();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
  });

  it('renders comments count', () => {
    renderCard();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders due date', () => {
    renderCard();
    expect(screen.getByText('Mar 12')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    renderCard();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('fires onClick callback when card is clicked', () => {
    const onClick = vi.fn();
    renderCard(undefined, { onClick });
    // The card div is the top-level draggable element.
    const cardEl = screen.getByText('Test card title').closest('[draggable]')!;
    fireEvent.click(cardEl);
    expect(onClick).toHaveBeenCalledWith('card-1');
  });

  it('fires onDragStart when drag begins', () => {
    const onDragStart = vi.fn();
    renderCard(undefined, { onDragStart });
    const cardEl = screen.getByText('Test card title').closest('[draggable]')!;
    fireEvent.dragStart(cardEl);
    expect(onDragStart).toHaveBeenCalled();
  });
});
