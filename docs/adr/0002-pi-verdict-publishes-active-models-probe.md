# pi-verdict publishes an active-models probe

pi-verdict publishes `globalThis[Symbol.for("pi-verdict:active-models")]`, a function `(ctx) => { enabled, classifier, fallback }`. usage-bar reads it to learn which models pi-verdict would bill. The classifier and fallback precedence (flag, env, judge kind check, project trust, session mode file) lives only in pi-verdict, so the answer cannot drift.

Rejected: replicating that precedence logic inside usage-bar. It would silently diverge whenever pi-verdict changes.
