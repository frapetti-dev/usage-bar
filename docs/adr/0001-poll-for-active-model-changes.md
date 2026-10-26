# Poll for active-model changes every second

omp gives extensions no event for model change, plan mode, role cycling or the advisor setting; `ctx.model` is a live getter. usage-bar therefore polls every 1 s and re-renders only when the set of active models and role labels changes.

Rejected: refreshing only on `turn_start`/`agent_end`. It is cheaper, but the widget stays stale after `/model`, `/plan` or role cycling until the next turn.
