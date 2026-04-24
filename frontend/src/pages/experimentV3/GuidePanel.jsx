/**
 * GuidePanel — Activity 개요·체크리스트·산출물·프롬프트 템플릿 표시.
 * 각 templateButton 클릭 시 onUseTemplate(template) 호출 → 부모가 새 셀
 * 생성하거나 현재 셀에 본문을 채워 준다.
 */
export default function GuidePanel({ activity, onUsePromptTemplate, onUseCodeTemplate }) {
  if (!activity) {
    return (
      <section className="expv3-guide">
        <div className="expv3-guide__title">활동을 선택해 주세요</div>
        <div className="expv3-guide__overview">
          왼쪽 목록에서 활동을 고르면 이 영역에 해야 할 일과 프롬프트
          템플릿, 코드 스니펫이 나타납니다.
        </div>
      </section>
    );
  }
  const { title, overview, steps = [], deliverables = [], promptTemplates = [], codeSnippets = [] } = activity;
  return (
    <section className="expv3-guide">
      <div className="expv3-guide__title">{title}</div>
      <div className="expv3-guide__overview">{overview}</div>

      <div className="expv3-guide__grid">
        <div>
          <div className="expv3-guide__block-title">해야 할 일</div>
          <ul className="expv3-guide__list">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="expv3-guide__block-title">산출물 / 완료 정의</div>
          <ul className="expv3-guide__list">
            {deliverables.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
            {deliverables.length === 0 ? <li>—</li> : null}
          </ul>
        </div>
      </div>

      {(promptTemplates.length > 0 || codeSnippets.length > 0) && (
        <div className="expv3-guide__templates">
          {promptTemplates.map((t, i) => (
            <button
              key={`p_${i}`}
              type="button"
              className="expv3-guide__template-btn"
              onClick={() => onUsePromptTemplate?.(t)}
              title="프롬프트 셀에 삽입"
            >
              프롬프트 · {t.label}
            </button>
          ))}
          {codeSnippets.map((t, i) => (
            <button
              key={`c_${i}`}
              type="button"
              className="expv3-guide__template-btn expv3-guide__template-btn--code"
              onClick={() => onUseCodeTemplate?.(t)}
              title="코드 셀에 삽입"
            >
              코드 · {t.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
