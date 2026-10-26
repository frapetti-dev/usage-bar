# usage-bar

A below-editor widget for omp that shows how much subscription quota remains for the models a session is using right now, and when it resets.

## Language

**Active model**:
A model the session can bill right now: the current model, the advisor model while the advisor setting is on, and the pi-verdict classifier and fallback while pi-verdict is enabled.
_Avoid_: Selected model, used model

**Role label**:
The name of the job an active model performs (`main`, `plan`, `smol`, `advisor`, `verdict`, `verdict-fb`, …).
_Avoid_: Model name, slot

**Provider row**:
One line of the widget per usage provider, showing every role label served by that provider's active models.
_Avoid_: Provider line, provider section

**Usage window**:
One quota period a provider reports (for example 5h, 7d, or a monthly budget), together with its reset time.
_Avoid_: Limit, quota bucket

**Remaining**:
The unused fraction (or USD amount) of a usage window. Bars show remaining, not used.
_Avoid_: Left, available

**Reset countdown**:
The time left until a usage window resets.
_Avoid_: Timer, expiry

**Verdict probe**:
The function pi-verdict publishes that reports its enabled state and its classifier and fallback models.
_Avoid_: Verdict hook, verdict API
