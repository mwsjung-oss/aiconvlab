/**
 * Generic notebook step block.
 *
 * Responsibilities:
 *  - Header with index, title, helper, status chip, expand/collapse toggle.
 *  - Body is rendered only when `expanded` is true so collapsed blocks stay
 *    very cheap (no deep subtrees).
 *  - Blocks receive `active` so the canvas can highlight the currently
 *    focused step (driven by scroll position or manual selection).
 */
import { BlockStatusChip, NButton } from "./primitives.jsx";

export default function StepBlock({
  index,
  title,
  subtitle,
  status = "idle",
  expanded,
  active = false,
  onToggle,
  headerActions = null,
  children,
  id,
  onFocusBlock,
}) {
  return (
    <section
      id={id}
      className={`notebook-block ${active ? "notebook-block--active" : ""}`}
      aria-labelledby={`${id}-title`}
      onMouseEnter={onFocusBlock}
    >
      <header className="notebook-block__header">
        <span className="notebook-block__index" aria-hidden="true">
          {index}
        </span>
        <div className="notebook-block__titles">
          <h3 id={`${id}-title`} className="notebook-block__title">
            {title}
          </h3>
          {subtitle ? (
            <span className="notebook-block__subtitle">{subtitle}</span>
          ) : null}
        </div>
        <div className="notebook-block__header-actions">
          <BlockStatusChip status={status} />
          {headerActions}
          <NButton
            variant="icon"
            aria-expanded={expanded}
            aria-controls={`${id}-body`}
            aria-label={expanded ? "접기" : "펼치기"}
            title={expanded ? "접기" : "펼치기"}
            onClick={onToggle}
          >
            {expanded ? "▾" : "▸"}
          </NButton>
        </div>
      </header>
      {expanded ? (
        <div id={`${id}-body`} className="notebook-block__body" role="group">
          {children}
        </div>
      ) : null}
    </section>
  );
}
