/**
 * Presence avatars.
 *
 * Shows a row of avatar circles for users currently viewing the board.
 * Fed from the `presence` Redux slice, which is updated by the
 * `useRealtimeBoard` hook.
 */
import { useAppSelector } from '@/store';

/** Derive a stable colour from a string (email or userId). */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
}

export function PresenceAvatars() {
  const viewers = useAppSelector((s) => s.presence.viewers);

  if (viewers.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1.5">
        {viewers.slice(0, 5).map((v) => (
          <div
            key={v.userId}
            className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold text-background"
            style={{ backgroundColor: stringToColor(v.email) }}
            title={v.email}
          >
            {v.email[0]?.toUpperCase()}
          </div>
        ))}
        {viewers.length > 5 && (
          <div className="w-7 h-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
            +{viewers.length - 5}
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {viewers.length} online
      </span>
    </div>
  );
}
