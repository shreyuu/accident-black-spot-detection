# Settings, offline behaviour and accessibility

Phase 11. How preferences persist, what happens to a report written with no
signal, and what was measured rather than assumed about accessibility.

---

## 1. Preferences

Every setting is stored **twice**, and the reason is worth stating because it
looks like duplication.

| Store                            | Role                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| `users/{id}` in Firestore        | The record of truth. Follows the account to a new device.        |
| `preferenceStore` (AsyncStorage) | The copy that works with no signal and before the profile loads. |

The local mirror is not an optimisation. Phase 4 established that Firestore's
own cache is no help offline: `getDocs` resolves from an _empty_ local cache
rather than failing, so without a mirror a user who set their alert radius to
400 m and then lost signal would silently be warned at 1000 m again.

### Write order, and why a failed sync is not reverted

A change is applied in memory, mirrored to disk, then sent to Firestore. If the
Firestore write fails **the local value stays**. The user asked for 400 m; they
still want 400 m; and the app can honour that locally right now. Snapping the
control back because a network request failed would be both confusing and
wrong. What they must not be left believing is that it reached their account, so
Settings says so explicitly:

> Saved on this device, but not to your account yet. It will sync when you are
> back online.

### Precedence

Resolved during render, not synced by effects — the React Compiler lint rule
rejects the latter, correctly, since it is derived state:

1. **a pending change** — what the user just chose, held until the account write
   settles;
2. **the profile** — authoritative, and what followed the user here;
3. **the local mirror** — all there is before the profile loads or offline.

### The theme is a special case

`ThemeProvider` sits _above_ `AuthProvider` — it has to, so the app is themed
before there is a session — so it cannot read preferences through
`usePreferences`. It hydrates the one field it needs directly from the same
local store. Both write it, so the two agree.

### Alert distance

Discrete steps (100, 250, 500, 1000, 1500, 2000 m), not a slider. A slider
offers 1 m of precision against a signal accurate to perhaps 10 m in the open
and far worse among buildings, and it is a genuinely difficult control to
operate with a screen reader or with limited dexterity. Each step states its
consequence — "warns very close to a hazard, little time to react at speed" —
because "500 m" alone does not tell anyone whether they have given themselves
enough warning.

The steps span exactly the validated range, so no step can be rejected by the
repository or the rules. A stored value outside the range is **clamped**, not
reset: it became invalid because the bounds changed, not because the user wanted
the default.

---

## 2. Offline drafts

### Why they exist

The whole point of this app is that someone reports what they saw at the
roadside — which is exactly where the signal is worst. Before Phase 11 a failed
submission handed the user their form back with a "Try again": fine if they were
still looking at it, useless if they had put the phone away, and total loss if
the app was killed. Their observation, which nobody else can reconstruct, was
gone.

### What a draft is not

**A draft is not a report.** It has never reached Firestore, no moderator has
seen it, and it is invisible to everyone but its author. The UI never counts a
draft as submitted — it is rendered with a dashed border, its own icon and the
words "Not sent yet", and `describeDraftStatus` is asserted in tests never to
use the words "sent", "submitted" or "reported". A user who believes they have
reported a hazard and has not is worse off than one who knows it is waiting.

### Retry policy

Decided by the pure `draftQueue` module; carried out by `useDraftQueue`.

| Rule               | Value                                                |
| ------------------ | ---------------------------------------------------- |
| Automatic attempts | 5, then it stops and says so                         |
| Backoff            | Exponential from 30 s, capped at 30 min              |
| Retention          | 14 days, then removed — and the removal is announced |
| Manual retry       | Ignores backoff and the attempt cap                  |

Manual retry is deliberately more permissive: the user pressing the button is
new information — they have probably just reconnected, or fixed whatever was
wrong. The one thing it will not do is submit a draft belonging to a different
account.

**Ownership is checked before anything else.** A draft written by one account is
never submitted under another, whatever its retry state. On a shared device that
would attribute someone's observation to whoever happens to be signed in.

**A non-retryable failure stops immediately.** A rejected photograph or a
validation failure will fail identically forever; retrying burns battery and
hides a problem the user could fix in seconds if asked.

### What triggers a retry

Returning to the app, and opening the reports screen. Deliberately **not** a
timer: a background interval that wakes to retry uploads would drain battery for
a case almost always resolved by the user picking the phone up, and this app
already asks for more background budget than most. The consequence is stated in
the UI — drafts are sent next time you open the app with a connection, not the
instant signal returns.

### Not filing the incident twice

A draft carries the **reserved Firestore document id** from the attempt that
failed. A queued retry therefore writes to the same document a partially
completed attempt may already have created. That extends the guarantee
`useSubmitReport` already made within a session across restarts. Uploaded photo
URLs are stored too, so a retry resumes rather than re-uploading.

### On sign-out

Drafts, preferences, zone state and the background snapshot are all cleared. An
unsent draft is somebody's private account of an incident; leaving it on a
shared device would let the next person read it, or submit it under their name.

---

## 3. Stale data is always labelled

Both cached surfaces say so on screen:

| Surface         | Cache              | Label                                                                           |
| --------------- | ------------------ | ------------------------------------------------------------------------------- |
| Map black spots | `blackSpotCache`   | "Showing saved data — you may be offline", and "from over a day ago" once stale |
| Nearby help     | `nearbyPlaceCache` | "Showing results saved on this device. They may be out of date."                |

The black spot **detail** screen has no cache: it reads fresh from Firestore and
shows an honest error offline rather than a stale record presented as current.

Serving stale data is fine. Serving it _unlabelled_ is not.

---

## 4. Accessibility

### Measured, not reviewed

Contrast is the accessibility failure that is easiest to ship and hardest to
notice: the colours look fine to whoever chose them, on their screen, indoors.
This app is read in a car, in daylight, by someone in a hurry. So
`src/utils/contrast.ts` implements the WCAG 2.1 relative-luminance formula and
`theme.test.ts` asserts every token pair against it.

**It found two real failures.** In dark mode, white text on the primary fill
measured **4.04:1** and on the danger fill — the SOS button — **3.61:1**, both
below the 4.5:1 AA requirement.

The first fix attempt made it worse in an instructive way: darkening the fills
so white text passed broke the same tokens in their _other_ role, because
`primary` and `danger` are also used as text colours on the dark background. One
token cannot be both a dark fill and a light text colour.

The resolution is the standard dark-theme one — keep the accent **light** and
flip what sits on it, so `textOnPrimary` is dark in dark mode. `blue300` and
`red300` now measure 7.44:1 and 6.80:1 as text on the background, and the same
against dark text as fills. One token, both roles, comfortably passing. Pressed
states are asserted too; WCAG does not exempt them.

### Dynamic type

`AppText` leaves `allowFontScaling` at its default of `true`, and every string in
the app renders through it. Honouring the system font size is a requirement, not
an option.

### Reduced motion

`useReducedMotion` subscribes to the OS setting — it can be changed from Control
Centre without restarting the app.

Honestly scoped: **this app has no sliding, scaling or parallax animation
anywhere.** The only animation it has is the modal fade, and that is switched
off when reduce-motion is on. Fades are the mildest case, but the user asked,
and a modal appearing instantly costs nothing.

### Touch targets

Every pressable meets 44pt, enforced by `theme.minTouchTarget` and asserted in
the theme tests.

### Never colour alone

A standing project rule, and it now applies to the new controls too:

- risk badges carry a written label as well as a colour;
- the selected alert distance is marked by a border, a fill **and**
  `accessibilityState.checked`;
- `AppButton` gained a `selected` prop, so the theme picker announces which
  option is chosen instead of presenting three identical buttons;
- a draft row is dashed-bordered and says "Not sent yet" in words.
