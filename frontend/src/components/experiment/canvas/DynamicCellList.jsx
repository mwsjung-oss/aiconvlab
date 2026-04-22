/**
 * DynamicCellList — a Colab-style "add cell" toolbar plus the rendered list
 * of ad-hoc cells. Appears under the 6 fixed step blocks so the notebook can
 * grow beyond the canonical workflow.
 */
import DynamicCell from "./DynamicCell.jsx";
import { NButton } from "./primitives.jsx";

const CELL_BUTTONS = [
  { type: "prompt", label: "Prompt 셀", icon: "💬" },
  { type: "markdown", label: "Markdown", icon: "📝" },
  { type: "code", label: "Code", icon: "🐍" },
  { type: "sql", label: "SQL", icon: "🗄" },
];

export default function DynamicCellList({
  cells = [],
  provider = "openai",
  activeAgent = "smart",
  useRag = true,
  onAddCell,
  onPatchCell,
  onRemoveCell,
  onMoveCell,
  onTimeline,
}) {
  return (
    <section className="notebook-dynlist" aria-label="추가 셀 목록">
      <header className="notebook-dynlist__head">
        <span className="notebook-dynlist__title">추가 셀</span>
        <span className="notebook-dynlist__sub">
          실험 표준 6단계 뒤에 자유 셀을 붙여 Colab처럼 이어갈 수 있습니다.
        </span>
        <div className="notebook-dynlist__adders">
          {CELL_BUTTONS.map((b) => (
            <NButton
              key={b.type}
              icon={b.icon}
              variant="ghost"
              onClick={() => onAddCell(b.type)}
            >
              + {b.label}
            </NButton>
          ))}
        </div>
      </header>

      {cells.length === 0 ? (
        <div className="notebook-dynlist__empty">
          위 버튼으로 Prompt · Markdown · Code · SQL 셀을 추가해 보세요.
        </div>
      ) : (
        <div className="notebook-dynlist__body">
          {cells.map((c, i) => (
            <DynamicCell
              key={c.id}
              cell={c}
              index={i}
              total={cells.length}
              provider={provider}
              activeAgent={activeAgent}
              useRag={useRag}
              onPatch={(changes) => onPatchCell(c.id, changes)}
              onRemove={onRemoveCell}
              onMove={onMoveCell}
              onTimeline={onTimeline}
            />
          ))}
        </div>
      )}
    </section>
  );
}
