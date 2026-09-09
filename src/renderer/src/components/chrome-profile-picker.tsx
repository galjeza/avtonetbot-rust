import { Check, Loader2 } from 'lucide-react';
import { cn } from 'cn';

import { Badge } from '@/components/ui/badge';
import { useBrowser } from '@/lib/browser';

/**
 * Lets the user say which of their Chrome profiles the avto.net login should
 * be copied from.
 *
 * The choice is theirs rather than ours because the files cannot settle it:
 * cookie values are encrypted, so we can see that a profile has *been* on
 * avto.net — which is what the badge marks, and what orders the list — but not
 * whether it is still signed in. Picking one starts the copy straight away, so
 * this does not belong behind a Save button.
 */
export function ChromeProfilePicker({ className }: { className?: string }): JSX.Element {
  const { profiles, status, checking, selecting, selectProfile } = useBrowser();
  const current = status?.profileDir ?? null;

  if (profiles.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Chromovih profilov ni bilo mogoče najti. Namestite Chrome, se prijavite v avto.net in
        osvežite.
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {profiles.map((profile) => {
        const chosen = profile.dir === current;
        return (
          <button
            key={profile.dir}
            type="button"
            disabled={checking}
            onClick={() => selectProfile(profile.dir)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm',
              'disabled:opacity-60',
              chosen ? 'border-primary bg-primary/5' : 'hover:bg-muted border-transparent',
            )}
          >
            {selecting === profile.dir ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <Check className={cn('size-4 shrink-0', chosen ? 'text-primary' : 'opacity-0')} />
            )}

            <span className="min-w-0 flex-1 truncate">
              {profile.name}
              {profile.accountEmail && (
                <span className="text-muted-foreground"> · {profile.accountEmail}</span>
              )}
            </span>

            {profile.hasAvtonetCookies && (
              <Badge variant="secondary" className="shrink-0">
                avto.net
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
