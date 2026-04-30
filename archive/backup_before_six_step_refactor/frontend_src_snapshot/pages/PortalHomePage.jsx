import { useState } from "react";

const LAB_INTRO_EN = `The AI Convergence Lab bridges manufacturing systems and machine learning / deep learning—executing graduate research on tabular and industrial datasets, reproducible experiments, and responsible deployment of models in real operational contexts. We emphasize data quality, feature engineering, transparent evaluation, and collaboration across courses and student-led projects.`;

/** 접기 시 미리 보이는 줄 수 — 박스 높이를 일정하게 유지 */
const PROJECTS_PREVIEW = 5;

export default function PortalHomePage({ home, onOpenAdminPanel }) {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const h = home || {};
  const allProjects = h.active_student_projects || [];
  const projectCount = allProjects.length;
  const hasOverflow = projectCount > PROJECTS_PREVIEW;
  const shownProjects = projectsOpen || !hasOverflow
    ? allProjects
    : allProjects.slice(0, PROJECTS_PREVIEW);

  return (
    <div className="home-page">
      <div className="home-three-grid">
        <section className="panel panel--dense home-three-box" aria-label="Lab introduction">
          <h3 className="home-three-title">AI Convergence Lab</h3>
          <p className="home-intro-en">{LAB_INTRO_EN}</p>
        </section>

        <section className="panel panel--dense home-three-box" aria-label="People">
          <h3 className="home-three-title">People</h3>
          <div className="home-people">
            <div className="home-people-block">
              <div className="home-people-role">Director</div>
              <div className="home-people-name-row">
                <span className="home-people-name">정웅식, Professor</span>
                <button
                  type="button"
                  className="lab-btn-admin"
                  onClick={() => onOpenAdminPanel?.()}
                >
                  관리자
                </button>
              </div>
            </div>
            <div className="home-people-block">
              <div className="home-people-role">Technical Lead</div>
              <div className="home-people-name">최원훈, Ph.D.</div>
            </div>
            <div className="home-people-block">
              <div className="home-people-role">Graduate Researchers</div>
              <p className="home-people-gr">
                백철민, 이대현, 이주영, 임평순, 임희준
              </p>
            </div>
          </div>
        </section>

        <section className="panel panel--dense home-three-box" aria-label="Student projects">
          <h3 className="home-three-title" title="등록된 활성 프로젝트 수">
            Projects ({projectCount})
          </h3>
          <p className="home-three-subtitle hint">Active student projects (Spring cohort)</p>
          <div
            className={
              projectsOpen || !hasOverflow
                ? "home-projects-scroll"
                : "home-projects-scroll home-projects-scroll--folded"
            }
          >
            <ul className="home-list home-list--dense home-projects-list-inner">
              {shownProjects.length ? (
                shownProjects.map((p, i) => (
                  <li key={`${p.student_name}-${i}-${p.title_kr ?? ""}`}>
                    <strong>{p.student_name}</strong>
                    <span className="home-list-meta"> — {p.title_kr}</span>
                  </li>
                ))
              ) : (
                <li className="hint">No active projects to display.</li>
              )}
            </ul>
          </div>
          {hasOverflow && (
            <button
              type="button"
              className="home-projects-toggle"
              onClick={() => setProjectsOpen((v) => !v)}
              aria-expanded={projectsOpen}
            >
              {projectsOpen
                ? "접기"
                : `펼쳐보기 (${projectCount - PROJECTS_PREVIEW}개 더)`}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
