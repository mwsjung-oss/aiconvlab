import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./App.css";
import { apiJson } from "./api";
import { getBackendModeLabel } from "./api/backendMode";
import { useAuth } from "./AuthContext.jsx";
import { isPrivilegedRole } from "./roles.js";
import AdminPanelModal from "./components/AdminPanelModal.jsx";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import JobsPage from "./pages/JobsPage";
import MonitorPage from "./pages/MonitorPage";
import PortalHomePage from "./pages/PortalHomePage";
import LoginPage from "./pages/LoginPage";
import PredictionPage from "./pages/PredictionPage";
import PreviewPage from "./pages/PreviewPage";
import RegisterPage from "./pages/RegisterPage";
import ResultsPage from "./pages/ResultsPage";
import TrainPage from "./pages/TrainPage";
import UploadPage from "./pages/UploadPage";
import ArtifactsPage from "./pages/ArtifactsPage";
import ProjectsPage from "./pages/ProjectsPage";
import KnowledgePage from "./pages/KnowledgePage";
import DatasetsPage from "./pages/DatasetsPage";
import ReportsPage from "./pages/ReportsPage";
import ExperimentsPlatformPage from "./pages/ExperimentsPlatformPage";
import AiChatPage from "./pages/AiChatPage";
import NotebookPage from "./pages/NotebookPage";
import SystemStatusPage from "./pages/SystemStatusPage";
import {
  readSelectedRuntime,
  writeSelectedRuntime,
} from "./services/runtime/selectedRuntime";
import {
  PLATFORM_APP_VERSION,
  PLATFORM_SLOGAN_EN,
} from "./platformMeta.js";
import {
  AI_CHAT_PRESETS,
  WORKFLOW_STEPS,
  WORKFLOW_SUB_PAGES,
  getWorkflowStepForPage,
  isExperimentWorkflowPage,
} from "./workflowConfig.js";

/** 모델 학습 탭: 과제별로 백엔드와 동일한 model_type 값만 노출 */
const TASK_MODEL_OPTIONS = {
  classification: [
    { value: "logistic_regression", label: "로지스틱 회귀" },
    { value: "random_forest", label: "랜덤 포레스트" },
    { value: "xgboost", label: "XGBoost" },
    { value: "gradient_boosting", label: "Gradient Boosting" },
    { value: "extra_trees", label: "Extra Trees" },
    { value: "hist_gradient_boosting", label: "HistGradientBoosting" },
    { value: "svc_rbf", label: "SVM (RBF 커널)" },
  ],
  regression: [
    { value: "linear_regression", label: "선형 회귀" },
    { value: "ridge", label: "Ridge" },
    { value: "lasso", label: "Lasso" },
    { value: "elastic_net", label: "Elastic Net" },
    { value: "random_forest", label: "랜덤 포레스트" },
    { value: "xgboost", label: "XGBoost" },
    { value: "gradient_boosting", label: "Gradient Boosting" },
    { value: "extra_trees", label: "Extra Trees" },
    { value: "hist_gradient_boosting", label: "HistGradientBoosting" },
    { value: "svr_rbf", label: "SVR (RBF 커널)" },
  ],
  time_series: [
    { value: "tft", label: "TFT (딥러닝 시계열)" },
    { value: "linear_regression", label: "지연 특성 · 선형 회귀" },
    { value: "ridge", label: "지연 특성 · Ridge" },
    { value: "lasso", label: "지연 특성 · Lasso" },
    { value: "elastic_net", label: "지연 특성 · Elastic Net" },
    { value: "random_forest", label: "지연 특성 · 랜덤 포레스트" },
    { value: "xgboost", label: "지연 특성 · XGBoost" },
    { value: "gradient_boosting", label: "지연 특성 · Gradient Boosting" },
    { value: "extra_trees", label: "지연 특성 · Extra Trees" },
    { value: "hist_gradient_boosting", label: "지연 특성 · HistGradientBoosting" },
    { value: "svr_rbf", label: "지연 특성 · SVR (RBF)" },
  ],
  anomaly_detection: [{ value: "isolation_forest", label: "Isolation Forest" }],
};

/** 백엔드 가용성 프로브: 콜드 스타트·일시 지연 허용, 단발 실패로 배너 비표시 */
const BACKEND_HEALTH_TIMEOUT_MS = 18_000;
const BACKEND_HEALTH_POLL_MS = 28_000;
const BACKEND_HEALTH_FAIL_STREAK = 2;

export default function App() {
  const { token, user, loading, logout } = useAuth();
  const isAuthenticated = !!token && !!user;
  const [apiEnvLabel, setApiEnvLabel] = useState(() => getBackendModeLabel());
  const [backendReachable, setBackendReachable] = useState(true);
  const [authView, setAuthView] = useState("login");
  const [selectedRuntime, setSelectedRuntime] = useState(() =>
    readSelectedRuntime()
  );
  const [runtimeSystemInfo, setRuntimeSystemInfo] = useState(null);

  useEffect(() => {
    const sync = () => setApiEnvLabel(getBackendModeLabel());
    window.addEventListener("ailab-backend-mode-change", sync);
    return () => window.removeEventListener("ailab-backend-mode-change", sync);
  }, []);

  useEffect(() => {
    setApiEnvLabel(getBackendModeLabel());
  }, [token, user]);

  useEffect(() => {
    let cancelled = false;
    let failStreak = 0;
    let timeoutId = null;

    function schedule(delay) {
      if (cancelled) return;
      timeoutId = window.setTimeout(run, delay);
    }

    async function run() {
      if (cancelled) return;
      try {
        await apiJson("/api/health", {
          timeoutMs: BACKEND_HEALTH_TIMEOUT_MS,
          omitAuth: true,
        });
        failStreak = 0;
        if (!cancelled) setBackendReachable(true);
      } catch {
        failStreak += 1;
        if (!cancelled && failStreak >= BACKEND_HEALTH_FAIL_STREAK) {
          setBackendReachable(false);
        }
      }
      if (cancelled) return;
      schedule(BACKEND_HEALTH_POLL_MS);
    }

    run();
    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    writeSelectedRuntime(selectedRuntime);
  }, [selectedRuntime]);

  useEffect(() => {
    if (!isAuthenticated) setExperimentWorkflowOpen(false);
  }, [isAuthenticated]);

  const [currentPage, setCurrentPage] = useState("home");
  /** Experiment 퀵메뉴로 들어왔을 때만 6단계 워크플로·서브내비 표시 */
  const [experimentWorkflowOpen, setExperimentWorkflowOpen] = useState(false);
  const [experimentEntryOpen, setExperimentEntryOpen] = useState(false);
  const [experimentEntryResolved, setExperimentEntryResolved] = useState(false);
  const [projectsAutoStartToken, setProjectsAutoStartToken] = useState(0);
  /** Experiment 워크플로를 열 때 스크롤이 맨 위로 붙는 것을 막기 위한 복원 값 */
  const experimentScrollRestoreY = useRef(null);
  /** AI 채팅 프리셋 (overview | project | data | model | insights) */
  const [aiChatPreset, setAiChatPreset] = useState("overview");
  const [workflowChatResetSeq, setWorkflowChatResetSeq] = useState(0);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);

  useLayoutEffect(() => {
    if (!experimentWorkflowOpen) return;
    if (experimentScrollRestoreY.current == null) return;
    const y = experimentScrollRestoreY.current;
    experimentScrollRestoreY.current = null;
    window.scrollTo({ top: y, left: 0, behavior: "auto" });
  }, [experimentWorkflowOpen]);

  const [datasets, setDatasets] = useState([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [preview, setPreview] = useState(null);

  const [targetColumn, setTargetColumn] = useState("");
  const [task, setTask] = useState("classification");
  const [modelType, setModelType] = useState("random_forest");
  const [featureSelection, setFeatureSelection] = useState({});

  const [trainMsg, setTrainMsg] = useState(null);
  const [trainErr, setTrainErr] = useState(null);
  const [trainResult, setTrainResult] = useState(null);
  const [trainLoading, setTrainLoading] = useState(false);
  const [trainElapsedSec, setTrainElapsedSec] = useState(0);
  const trainAbortRef = useRef(null);

  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadErr, setUploadErr] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [models, setModels] = useState([]);
  const [history, setHistory] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataErr, setDataErr] = useState(null);

  const [predictModelId, setPredictModelId] = useState("");
  const [predictFile, setPredictFile] = useState("");
  const [predictMsg, setPredictMsg] = useState(null);
  const [predictErr, setPredictErr] = useState(null);
  const [predictPreview, setPredictPreview] = useState(null);
  const [predictOutputFilename, setPredictOutputFilename] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);
  const [gpuStatus, setGpuStatus] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [artifacts, setArtifacts] = useState(null);
  const [focusJobId, setFocusJobId] = useState("");
  const [portalHome, setPortalHome] = useState(null);
  const [portalProjects, setPortalProjects] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState("");
  const [portalKnowledge, setPortalKnowledge] = useState([]);
  const [portalDatasets, setPortalDatasets] = useState([]);
  const [studentProjects, setStudentProjects] = useState([]);
  const [experimentTemplates, setExperimentTemplates] = useState([]);
  const [modelPresets, setModelPresets] = useState([]);
  const [reportTemplates, setReportTemplates] = useState([]);
  const [reportSummary, setReportSummary] = useState(null);
  const [reportFiles, setReportFiles] = useState([]);

  const loadDatasets = useCallback(async () => {
    setDataErr(null);
    setDataLoading(true);
    try {
      const d = await apiJson("/api/datasets");
      setDatasets(d.files || []);
      setSelectedFile((prev) => prev || (d.files?.[0] ?? ""));
    } catch (err) {
      setDataErr(err.message);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const m = await apiJson("/api/models");
      setModels(m.models || []);
    } catch {
      // 조용히 실패 (최초에는 모델이 없을 수 있음)
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const h = await apiJson("/history");
      setHistory(h.history || []);
    } catch {
      setHistory(null);
    }
  }, []);

  const loadMonitoring = useCallback(async () => {
    try {
      const [sys, gpu] = await Promise.all([
        apiJson("/api/monitor/system"),
        apiJson("/api/monitor/gpu"),
      ]);
      setSystemStatus(sys);
      setGpuStatus(gpu);
    } catch {
      setSystemStatus(null);
      setGpuStatus(null);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const d = await apiJson("/api/jobs");
      setJobs(d.jobs || []);
    } catch {
      setJobs([]);
    }
  }, []);

  const loadArtifacts = useCallback(async () => {
    try {
      const d = await apiJson("/api/artifacts");
      setArtifacts(d);
    } catch {
      setArtifacts(null);
    }
  }, []);

  const loadPortalHome = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/home");
      setPortalHome(d);
    } catch {
      setPortalHome(null);
    }
  }, []);

  const loadPortalProjects = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/projects");
      setPortalProjects(d.projects || []);
    } catch {
      setPortalProjects([]);
    }
  }, []);

  const loadUserProfile = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/profile");
      setUserProfile(d);
      const pid = d?.profile?.current_project_id ?? null;
      setCurrentProjectId(pid);
      const all = [...(d?.owned_projects || []), ...(d?.joined_projects || [])];
      const hit = all.find((p) => p.id === pid);
      setCurrentProjectName(hit?.name || "");
    } catch {
      setUserProfile(null);
      setCurrentProjectId(null);
      setCurrentProjectName("");
    }
  }, []);

  const setActiveProject = useCallback(async (project) => {
    const pid = project?.id ?? null;
    const pname = project?.name || "";
    setCurrentProjectId(pid);
    setCurrentProjectName(pname);
    setExperimentEntryResolved(true);
    try {
      await apiJson("/api/portal/profile/current-project", {
        method: "POST",
        body: JSON.stringify({ project_id: pid }),
      });
    } catch {
      // 서버 저장에 실패해도 UI 맥락은 유지 (새로고침 시 재동기화)
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setExperimentEntryOpen(false);
      setExperimentEntryResolved(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      // 로그인 이후 첫 Experiment 진입 시 기존 프로젝트 이어하기 여부를 선택하도록 합니다.
      setExperimentEntryOpen(false);
      setExperimentEntryResolved(false);
    }
  }, [isAuthenticated, user?.id]);

  const openExperimentWorkspace = useCallback(async ({ startNew } = { startNew: false }) => {
    if (startNew) {
      await setActiveProject(null);
      setProjectsAutoStartToken((v) => v + 1);
    }
    if (!experimentWorkflowOpen && typeof window !== "undefined") {
      experimentScrollRestoreY.current = window.scrollY;
    }
    setExperimentEntryResolved(true);
    setExperimentEntryOpen(false);
    setExperimentWorkflowOpen(true);
    setCurrentPage("projects");
  }, [experimentWorkflowOpen, setActiveProject]);

  const loadPortalKnowledge = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/knowledge");
      setPortalKnowledge(d.entries || []);
    } catch {
      setPortalKnowledge([]);
    }
  }, []);

  const loadPortalDatasets = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/datasets");
      setPortalDatasets(d.datasets || []);
    } catch {
      setPortalDatasets([]);
    }
  }, []);

  const loadStudentProjects = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/student-projects");
      setStudentProjects(d.student_projects || []);
    } catch {
      setStudentProjects([]);
    }
  }, []);

  const loadExperimentTemplates = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/experiment-templates");
      setExperimentTemplates(d.templates || []);
    } catch {
      setExperimentTemplates([]);
    }
  }, []);

  const loadModelPresets = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/model-presets");
      setModelPresets(d.presets || []);
    } catch {
      setModelPresets([]);
    }
  }, []);

  const loadReportTemplates = useCallback(async () => {
    try {
      const d = await apiJson("/api/portal/report-templates");
      setReportTemplates(d.report_templates || []);
    } catch {
      setReportTemplates([]);
    }
  }, []);

  const loadReportSummary = useCallback(async () => {
    try {
      const d = await apiJson("/api/reports/summary");
      setReportSummary(d);
    } catch {
      setReportSummary(null);
    }
  }, []);

  const loadReportFiles = useCallback(async () => {
    try {
      const d = await apiJson("/api/reports/files");
      setReportFiles(d.files || []);
    } catch {
      setReportFiles([]);
    }
  }, []);

  const loadRuntimeSystemInfo = useCallback(async () => {
    try {
      const [health, config, runtimes, providers] = await Promise.all([
        apiJson("/api/health"),
        apiJson("/api/config"),
        apiJson("/api/runtimes"),
        apiJson("/api/providers/status"),
      ]);
      setRuntimeSystemInfo({
        health,
        config,
        runtimes: runtimes?.runtimes || [],
        providers: providers?.providers || [],
      });
    } catch {
      setRuntimeSystemInfo(null);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadDatasets().catch(() => {});
    loadModels().catch(() => {});
    loadHistory().catch(() => {});
    loadMonitoring().catch(() => {});
    loadJobs().catch(() => {});
    loadArtifacts().catch(() => {});
    loadPortalHome().catch(() => {});
    loadPortalProjects().catch(() => {});
    loadUserProfile().catch(() => {});
    loadPortalKnowledge().catch(() => {});
    loadPortalDatasets().catch(() => {});
    loadStudentProjects().catch(() => {});
    loadExperimentTemplates().catch(() => {});
    loadModelPresets().catch(() => {});
    loadReportTemplates().catch(() => {});
    loadReportSummary().catch(() => {});
    loadReportFiles().catch(() => {});
    loadRuntimeSystemInfo().catch(() => {});
  }, [isAuthenticated, loadDatasets, loadModels, loadHistory, loadMonitoring, loadJobs, loadArtifacts, loadPortalHome, loadPortalProjects, loadPortalKnowledge, loadPortalDatasets, loadStudentProjects, loadExperimentTemplates, loadModelPresets, loadReportTemplates, loadReportSummary, loadReportFiles, loadUserProfile]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setInterval(() => {
      loadMonitoring().catch(() => {});
      loadJobs().catch(() => {});
      loadArtifacts().catch(() => {});
      loadRuntimeSystemInfo().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [isAuthenticated, loadMonitoring, loadJobs, loadArtifacts, loadRuntimeSystemInfo]);

  /** 대시보드 탭: 2초마다 지표·차트용 데이터 갱신 */
  useEffect(() => {
    if (!isAuthenticated || currentPage !== "dashboard") return;
    const refreshDashboard = () => {
      loadDatasets().catch(() => {});
      loadModels().catch(() => {});
      loadHistory().catch(() => {});
      loadMonitoring().catch(() => {});
      loadJobs().catch(() => {});
    };
    refreshDashboard();
    const id = setInterval(refreshDashboard, 2000);
    return () => clearInterval(id);
  }, [
    isAuthenticated,
    currentPage,
    loadDatasets,
    loadModels,
    loadHistory,
    loadMonitoring,
    loadJobs,
  ]);

  /** 홈 탭을 볼 때 공지 등 포털 홈 데이터를 주기적으로 갱신 (탭이 보일 때만 폴링, 복귀 시 즉시 갱신) */
  useEffect(() => {
    if (!isAuthenticated || currentPage !== "home") return;
    loadPortalHome().catch(() => {});
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadPortalHome().catch(() => {});
    }, 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        loadPortalHome().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isAuthenticated, currentPage, loadPortalHome]);

  useEffect(() => {
    const options = TASK_MODEL_OPTIONS[task];
    if (!options?.length) return;
    const allowed = new Set(options.map((o) => o.value));
    setModelType((prev) => (allowed.has(prev) ? prev : options[0].value));
  }, [task]);

  async function handleUpload(file) {
    if (!file) return;
    setUploadErr(null);
    setUploadMsg(null);
    setUploadLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const data = await apiJson("/api/upload", { method: "POST", body: fd });
      setUploadMsg(`업로드 완료: ${data.filename} (${data.rows}행)`);
      setSelectedFile(data.filename);
      setTargetColumn("");
      setFeatureSelection({});
      await loadDatasets();
      await refreshPreview(data.filename);
      setCurrentPage("preview");
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setUploadLoading(false);
    }
  }

  async function refreshPreview(filenameOverride) {
    const file = filenameOverride ?? selectedFile;
    if (!file) return;
    setDataErr(null);
    setDataLoading(true);
    try {
      const prevData = await apiJson(
        `/api/preview?filename=${encodeURIComponent(file)}&rows=20`
      );
      setPreview(prevData);
    } catch (err) {
      setDataErr(err.message);
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    if (selectedFile) {
      refreshPreview().catch(() => {});
    }
  }, [selectedFile]);

  useEffect(() => {
    if (!preview?.columns) return;
    const cols = preview.numeric_columns?.length
      ? preview.numeric_columns
      : preview.columns.filter((c) =>
          preview.data?.[0] && typeof preview.data[0][c] === "number"
            ? true
            : false
        );
    const next = {};
    cols.forEach((c) => {
      if (c !== targetColumn) next[c] = true;
    });
    setFeatureSelection(next);
  }, [preview, targetColumn]);

  function cancelTrain() {
    trainAbortRef.current?.abort();
  }

  async function runTrain() {
    setTrainErr(null);
    setTrainMsg(null);
    setTrainResult(null);
    trainAbortRef.current?.abort();
    const ac = new AbortController();
    trainAbortRef.current = ac;
    setTrainElapsedSec(0);
    setTrainLoading(true);
    if (!selectedFile || !targetColumn) {
      setTrainErr("데이터 파일과 타깃 열을 선택하세요.");
      setTrainLoading(false);
      trainAbortRef.current = null;
      return;
    }
    const feats = Object.entries(featureSelection)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const body = {
      filename: selectedFile,
      target_column: targetColumn,
      task,
      model_type: modelType,
      feature_columns: feats.length ? feats : null,
      test_size: 0.2,
      random_state: 42,
      project_id: currentProjectId,
    };
    const t0 = Date.now();
    const tick = setInterval(() => {
      setTrainElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 500);
    try {
      const data = await apiJson("/api/train", {
        method: "POST",
        body: JSON.stringify(body),
        timeoutMs: 0,
        signal: ac.signal,
      });
      setTrainResult(data);
      setTrainMsg(`학습 완료. 모델 ID: ${data.model_id}`);
      await loadModels();
      await loadHistory();
      setPredictModelId(data.model_id);
      setPredictFile(selectedFile);
      setCurrentPage("results");
    } catch (err) {
      const aborted =
        ac.signal.aborted ||
        err?.name === "AbortError" ||
        (typeof err?.message === "string" &&
          err.message.toLowerCase().includes("abort"));
      if (aborted) {
        setTrainErr(
          "학습 요청 대기를 중지했습니다. (브라우저 연결만 끊깁니다. 서버에서 학습이 이어질 수 있습니다.)"
        );
      } else {
        setTrainErr(err.message);
      }
    } finally {
      clearInterval(tick);
      trainAbortRef.current = null;
      setTrainElapsedSec(0);
      setTrainLoading(false);
    }
  }

  async function runPredict() {
    setPredictErr(null);
    setPredictMsg(null);
    setPredictPreview(null);
    setPredictOutputFilename(null);
    setPredictLoading(true);
    if (!predictModelId || !predictFile) {
      setPredictErr("모델 ID와 예측용 CSV 파일을 선택하세요.");
      setPredictLoading(false);
      return;
    }
    try {
      const data = await apiJson("/api/predict", {
        method: "POST",
        body: JSON.stringify({
          model_id: predictModelId,
          filename: predictFile,
          project_id: currentProjectId,
        }),
      });
      setPredictPreview(data);
      setPredictOutputFilename(data.output_file || null);
      setPredictMsg(
        `예측 완료. ${data.rows}행 — 결과 파일: ${data.output_file}`
      );
      await loadHistory();
      setCurrentPage("results");
    } catch (err) {
      setPredictErr(err.message);
    } finally {
      setPredictLoading(false);
    }
  }

  const modelOptions =
    TASK_MODEL_OPTIONS[task] ?? TASK_MODEL_OPTIONS.classification;

  const plotUrl =
    trainResult?.plot_file &&
    `/api/outputs/${encodeURIComponent(trainResult.plot_file)}`;

  /** 헤더 플랫폼 제목 아래 (비로그인 동일 노출). Experiment=프로젝트·워크플로, Administration=관리 */
  const navHeaderQuick = [
    { id: "home", label: "Home" },
    { id: "dashboard", label: "Dashboard" },
    { id: "projects", label: "Experiment" },
    { id: "system", label: "System" },
    { id: "knowledge", label: "Knowledge" },
    { id: "admin", label: "Administration" },
  ];

  const activeWorkflowStep =
    isAuthenticated && experimentWorkflowOpen
      ? getWorkflowStepForPage(currentPage)
      : null;

  const handleAiAfterTool = useCallback(() => {
    loadDatasets().catch(() => {});
    loadModels().catch(() => {});
    loadHistory().catch(() => {});
    loadJobs().catch(() => {});
  }, [loadDatasets, loadModels, loadHistory, loadJobs]);

  const experimentShell =
    isAuthenticated &&
    experimentWorkflowOpen &&
    isExperimentWorkflowPage(currentPage);

  return (
    <div className="app">
      <header className="lab-hero">
        <div className="lab-topbar">
          <div className="lab-brand">
            <div className="lab-brand-text">
              <div className="lab-brand-univ">INHA UNIVERSITY</div>
              <div className="lab-brand-univ">
                MANUFACTURING INNOVATION SCHOOL
              </div>
              <div className="lab-brand-lab">AI Convergence Lab</div>
            </div>
          </div>
          <div className="lab-platform-badge">
            <button
              type="button"
              className="lab-platform-main lab-platform-main-btn"
              onClick={() => setArchitectureOpen(true)}
              title="Show platform architecture"
            >
              <span className="lab-platform-main-text">AI Practice Studio</span>
              <span className="lab-platform-sub">Interactive AI Decision Workflow</span>
            </button>
            <nav className="lab-header-quicknav" aria-label="Platform">
              <div className="lab-header-quicknav-btns">
                {navHeaderQuick.map((item) => {
                  const isExperimentTab = item.id === "projects";
                  const tabActive = isExperimentTab
                    ? experimentWorkflowOpen
                    : currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={
                        tabActive
                          ? "nav-tab nav-tab-active lab-header-quicknav-tab"
                          : "nav-tab lab-header-quicknav-tab"
                      }
                      onClick={() => {
                        if (isExperimentTab) {
                          if (!isAuthenticated) {
                            setCurrentPage("dashboard");
                            return;
                          }
                          if (!experimentEntryResolved && currentProjectId) {
                            setExperimentEntryOpen(true);
                            return;
                          }
                          void openExperimentWorkspace({ startNew: false });
                          return;
                        }
                        setExperimentWorkflowOpen(false);
                        setCurrentPage(item.id);
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
          {isAuthenticated ? (
            <div className="lab-header-session">
              <span className="lab-api-badge" title="선택한 백엔드">
                {apiEnvLabel}
              </span>
              <span className="lab-session-email" title={user.email}>
                {user.email}
              </span>
              <button type="button" className="lab-logout" onClick={logout}>
                로그아웃
              </button>
            </div>
          ) : (
            <div className="lab-header-guest-meta">
              <p className="lab-header-slogan">{PLATFORM_SLOGAN_EN}</p>
              <div className="lab-header-meta-badges">
                <span
                  className="lab-meta-badge lab-meta-badge--version"
                  title="Application version"
                >
                  v{PLATFORM_APP_VERSION}
                </span>
                <span
                  className="lab-meta-badge lab-meta-badge--env"
                  title="API target (login screen에서도 변경 가능)"
                >
                  {apiEnvLabel}
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {!backendReachable && (
        <div className="service-unavailable-banner" role="status">
          백엔드 연결이 일시적으로 불안정합니다. 화면은 유지되며, 잠시 후 자동 재시도합니다.
        </div>
      )}

      {isAuthenticated && experimentWorkflowOpen ? (
        <div className="top-nav-wrap">
          <nav className="workflow-nav" aria-label="6단계 AI 워크플로">
            {currentProjectName && (
              <div className="workflow-current-project" aria-live="polite">
                현재 프로젝트: <strong>{currentProjectName}</strong>
              </div>
            )}
            <ol className="workflow-progress">
              {WORKFLOW_STEPS.map((step, idx) => {
                const isCurrent = activeWorkflowStep === step.id;
                return (
                  <li
                    key={step.id}
                    className={
                      isCurrent
                        ? "workflow-progress-item workflow-progress-item--current"
                        : "workflow-progress-item"
                    }
                  >
                    <button
                      type="button"
                      className={
                        isCurrent
                          ? "workflow-step-btn workflow-step-btn--active"
                          : "workflow-step-btn"
                      }
                      title={`${step.labelEn}: ${step.hint}`}
                      onClick={() => {
                        setWorkflowChatResetSeq((s) => s + 1);
                        setCurrentPage(step.defaultPage);
                        if (step.id === "step1") {
                          setAiChatPreset("overview");
                        }
                      }}
                    >
                      <span className="workflow-step-num">{idx + 1}</span>
                      <span className="workflow-step-text">
                        <span className="workflow-step-label">{step.label}</span>
                        <span className="workflow-step-en">{step.labelEn}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {activeWorkflowStep && (
              <p className="workflow-step-hint">
                {
                  WORKFLOW_STEPS.find((s) => s.id === activeWorkflowStep)
                    ?.hint
                }
              </p>
            )}
          </nav>

          {activeWorkflowStep &&
            WORKFLOW_SUB_PAGES[activeWorkflowStep] &&
            !(experimentWorkflowOpen && activeWorkflowStep === "step1") && (
            <div className="top-nav-row top-nav-row--workflow-sub">
              <span className="top-nav-row-label">
                {
                  WORKFLOW_STEPS.find((s) => s.id === activeWorkflowStep)
                    ?.label
                }
              </span>
              <div className="top-nav-row-btns">
                {WORKFLOW_SUB_PAGES[activeWorkflowStep].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      currentPage === item.id
                        ? "nav-tab nav-tab-active"
                        : "nav-tab"
                    }
                    onClick={() => setCurrentPage(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
                {activeWorkflowStep === "step1" &&
                  AI_CHAT_PRESETS.map((item) => (
                    <button
                      key={item.preset}
                      type="button"
                      className={
                        aiChatPreset === item.preset
                          ? "nav-tab nav-tab-active nav-tab--ai"
                          : "nav-tab nav-tab--ai"
                      }
                      onClick={() => setAiChatPreset(item.preset)}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {!isAuthenticated && (currentPage === "dashboard" || currentPage === "home") && !loading && (
        authView === "register" ? (
          <RegisterPage onSwitchLogin={() => setAuthView("login")} />
        ) : (
          <LoginPage onSwitchRegister={() => setAuthView("register")} />
        )
      )}

      {!isAuthenticated && currentPage !== "dashboard" && (
        <div className="card">
          <h3>로그인이 필요합니다.</h3>
          <p className="hint">
            초기 접속 시에는 대시보드 영역에서 로그인 후 메뉴 기능을 사용할 수 있습니다.
          </p>
          <button type="button" onClick={() => setCurrentPage("dashboard")}>
            대시보드로 이동
          </button>
        </div>
      )}

      {isAuthenticated && currentPage === "dashboard" && (
        <DashboardPage
          datasets={datasets}
          models={models}
          history={history}
          systemStatus={systemStatus}
          gpuStatus={gpuStatus}
          jobs={jobs}
          isOperator={isPrivilegedRole(user?.role)}
        />
      )}

      {isAuthenticated && currentPage === "system" && (
        <SystemStatusPage
          selectedRuntime={selectedRuntime}
          onChangeRuntime={setSelectedRuntime}
          systemInfo={runtimeSystemInfo}
          onRefresh={loadRuntimeSystemInfo}
        />
      )}

      {isAuthenticated && currentPage === "home" && (
        <PortalHomePage
          home={portalHome}
          onOpenAdminPanel={() => setAdminPanelOpen(true)}
        />
      )}

      {experimentShell && (
        <div className="experiment-workspace-outer">
        <div className="experiment-workspace">
          <aside className="experiment-workspace-chat" aria-label="Experiment AI Agent">
            <AiChatPage
              variant="sidebar"
              labPreset={aiChatPreset}
              workflowStep={activeWorkflowStep}
              workflowChatResetSeq={workflowChatResetSeq}
              onAfterTool={handleAiAfterTool}
            />
          </aside>
          <div
            className="experiment-workspace-main"
            role="main"
            aria-label="실행 및 결과"
          >
            {(currentPage === "projects" || currentPage === "aichat") && (
              <ProjectsPage
                onRefresh={async () => {
                  await loadPortalProjects();
                  await loadUserProfile();
                }}
                currentProjectId={currentProjectId}
                autoStartToken={projectsAutoStartToken}
                onProjectActivated={setActiveProject}
              />
            )}
            {currentPage === "datasets_catalog" && (
              <DatasetsPage
                datasets={portalDatasets}
                onRefresh={loadPortalDatasets}
                studentProjects={studentProjects}
                currentProjectId={currentProjectId}
              />
            )}
            {currentPage === "upload" && (
              <UploadPage
                onUpload={handleUpload}
                loading={uploadLoading}
                message={uploadMsg}
                error={uploadErr}
              />
            )}
            {currentPage === "preview" && (
              <PreviewPage
                datasets={datasets}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
                preview={preview}
                loading={dataLoading}
                error={dataErr}
                onRefresh={refreshPreview}
              />
            )}
            {currentPage === "train" && (
              <TrainPage
                datasets={datasets}
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                preview={preview}
                targetColumn={targetColumn}
                setTargetColumn={setTargetColumn}
                task={task}
                setTask={setTask}
                modelType={modelType}
                setModelType={setModelType}
                modelOptions={modelOptions}
                featureSelection={featureSelection}
                setFeatureSelection={setFeatureSelection}
                onTrain={runTrain}
                onCancelTrain={cancelTrain}
                trainElapsedSec={trainElapsedSec}
                loading={trainLoading}
                message={trainMsg}
                error={trainErr}
                trainResult={trainResult}
                plotUrl={plotUrl}
              />
            )}
            {currentPage === "predict" && (
              <PredictionPage
                datasets={datasets}
                models={models}
                predictModelId={predictModelId}
                setPredictModelId={setPredictModelId}
                predictFile={predictFile}
                setPredictFile={setPredictFile}
                onPredict={runPredict}
                loading={predictLoading}
                message={predictMsg}
                error={predictErr}
                preview={predictPreview}
                predictOutputFilename={predictOutputFilename}
              />
            )}
            {currentPage === "results" && (
              <ResultsPage
                trainResult={trainResult}
                plotUrl={plotUrl}
                predictPreview={predictPreview}
                predictOutputFilename={predictOutputFilename}
                history={history}
              />
            )}
            {currentPage === "history" && (
              <HistoryPage
                history={history}
                onRefresh={loadHistory}
                onOpenJobs={(jobId) => {
                  setCurrentPage("jobs");
                  if (jobId) {
                    setFocusJobId(jobId);
                    loadJobs();
                  }
                }}
                onOpenArtifacts={() => setCurrentPage("artifacts")}
              />
            )}
            {currentPage === "experiments" && <ExperimentsPlatformPage />}
            {currentPage === "notebook" && <NotebookPage />}
            {currentPage === "reports" && (
              <ReportsPage
                history={history}
                reportTemplates={reportTemplates}
                reportSummary={reportSummary}
                reportFiles={reportFiles}
              />
            )}
            {currentPage === "jobs" && (
              <JobsPage
                jobs={jobs}
                onRefresh={loadJobs}
                focusJobId={focusJobId}
              />
            )}
          </div>
        </div>
        </div>
      )}

      {isAuthenticated && currentPage === "projects" && !experimentShell && (
        <ProjectsPage
          onRefresh={async () => {
            await loadPortalProjects();
            await loadUserProfile();
          }}
          currentProjectId={currentProjectId}
          autoStartToken={projectsAutoStartToken}
          onProjectActivated={setActiveProject}
        />
      )}

      {isAuthenticated && currentPage === "datasets_catalog" && !experimentShell && (
        <DatasetsPage
          datasets={portalDatasets}
          onRefresh={loadPortalDatasets}
          studentProjects={studentProjects}
          currentProjectId={currentProjectId}
        />
      )}

      {isAuthenticated && currentPage === "upload" && !experimentShell && (
        <UploadPage
          onUpload={handleUpload}
          loading={uploadLoading}
          message={uploadMsg}
          error={uploadErr}
        />
      )}

      {isAuthenticated && currentPage === "preview" && !experimentShell && (
        <PreviewPage
          datasets={datasets}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          preview={preview}
          loading={dataLoading}
          error={dataErr}
          onRefresh={refreshPreview}
        />
      )}

      {isAuthenticated && currentPage === "aichat" && !experimentShell && (
        <AiChatPage
          key={aiChatPreset}
          labPreset={aiChatPreset}
          onAfterTool={handleAiAfterTool}
        />
      )}

      {isAuthenticated && currentPage === "train" && !experimentShell && (
        <TrainPage
          datasets={datasets}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          preview={preview}
          targetColumn={targetColumn}
          setTargetColumn={setTargetColumn}
          task={task}
          setTask={setTask}
          modelType={modelType}
          setModelType={setModelType}
          modelOptions={modelOptions}
          featureSelection={featureSelection}
          setFeatureSelection={setFeatureSelection}
          onTrain={runTrain}
          onCancelTrain={cancelTrain}
          trainElapsedSec={trainElapsedSec}
          loading={trainLoading}
          message={trainMsg}
          error={trainErr}
          trainResult={trainResult}
          plotUrl={plotUrl}
        />
      )}

      {isAuthenticated && currentPage === "predict" && !experimentShell && (
        <PredictionPage
          datasets={datasets}
          models={models}
          predictModelId={predictModelId}
          setPredictModelId={setPredictModelId}
          predictFile={predictFile}
          setPredictFile={setPredictFile}
          onPredict={runPredict}
          loading={predictLoading}
          message={predictMsg}
          error={predictErr}
          preview={predictPreview}
          predictOutputFilename={predictOutputFilename}
        />
      )}

      {isAuthenticated && currentPage === "results" && !experimentShell && (
        <ResultsPage
          trainResult={trainResult}
          plotUrl={plotUrl}
          predictPreview={predictPreview}
          predictOutputFilename={predictOutputFilename}
          history={history}
        />
      )}

      {isAuthenticated && currentPage === "history" && !experimentShell && (
        <HistoryPage
          history={history}
          onRefresh={loadHistory}
          onOpenJobs={(jobId) => {
            setCurrentPage("jobs");
            if (jobId) {
              setFocusJobId(jobId);
              loadJobs();
            }
          }}
          onOpenArtifacts={() => setCurrentPage("artifacts")}
        />
      )}

      {isAuthenticated && currentPage === "experiments" && !experimentShell && (
        <ExperimentsPlatformPage />
      )}

      {isAuthenticated && currentPage === "notebook" && !experimentShell && <NotebookPage />}

      {isAuthenticated && currentPage === "reports" && !experimentShell && (
        <ReportsPage history={history} reportTemplates={reportTemplates} reportSummary={reportSummary} reportFiles={reportFiles} />
      )}

      {isAuthenticated && currentPage === "knowledge" && (
        <KnowledgePage
          entries={portalKnowledge}
          onRefresh={loadPortalKnowledge}
          templates={experimentTemplates}
          presets={modelPresets}
        />
      )}

      {isAuthenticated && currentPage === "jobs" && !experimentShell && (
        <JobsPage
          jobs={jobs}
          onRefresh={loadJobs}
          focusJobId={focusJobId}
        />
      )}

      {isAuthenticated && currentPage === "artifacts" && isPrivilegedRole(user?.role) && (
        <ArtifactsPage
          artifacts={artifacts}
          onRefresh={loadArtifacts}
        />
      )}

      {isAuthenticated && currentPage === "monitor" && isPrivilegedRole(user?.role) && (
        <MonitorPage
          systemStatus={systemStatus}
          gpuStatus={gpuStatus}
          jobs={jobs}
          onRefresh={() => {
            loadMonitoring();
            loadJobs();
          }}
        />
      )}

      {isAuthenticated && currentPage === "admin" && isPrivilegedRole(user?.role) && (
        <AdminPage />
      )}

      <footer className="lab-footer-tagline">
        <p>
          Experimenting, Modeling, and Applying AI for Industrial Innovation
        </p>
      </footer>

      <AdminPanelModal
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
      />

      {isAuthenticated && experimentEntryOpen && (
        <div
          className="experiment-entry-backdrop"
          role="presentation"
          onClick={() => setExperimentEntryOpen(false)}
        >
          <div
            className="experiment-entry-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="experiment-entry-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="experiment-entry-title">Experiment 진행 방식 선택</h3>
            <p className="hint">
              현재 활성 프로젝트 <strong>{currentProjectName || "기존 프로젝트"}</strong>가 있습니다.
              이어서 진행하시겠습니까, 아니면 신규 프로젝트를 등록하면서 시작하시겠습니까?
            </p>
            <div className="experiment-entry-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void openExperimentWorkspace({ startNew: false })}
              >
                기존 프로젝트 이어서 진행
              </button>
              <button
                type="button"
                className="auth-submit"
                onClick={() => void openExperimentWorkspace({ startNew: true })}
              >
                신규 프로젝트로 시작
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setExperimentEntryOpen(false)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {architectureOpen && (
        <div className="arch-overlay" onClick={() => setArchitectureOpen(false)}>
          <div className="arch-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Platform Architecture (Frontend + Backend + WSL)</h2>
            <p className="hint">
              End-to-end flow between local UI, API server, and GPU execution environment. The
              API layer can call out to AWS and to hosted LLM APIs (OpenAI, Gemini) when
              configured.
            </p>
            <div className="arch-diagram">
              <div className="arch-node">
                <strong>Laptop (Windows)</strong>
                <div>Cursor IDE</div>
                <div>React + Vite Frontend</div>
                <div>Browser at localhost:5174</div>
              </div>
              <div className="arch-arrow">HTTP(S) API Calls</div>
              <div className="arch-node">
                <strong>Lab AI Server (FastAPI)</strong>
                <div>Auth / Portal / Jobs / Artifacts</div>
                <div>SQLite Metadata</div>
                <div>Dataset & Model Management</div>
              </div>
              <div className="arch-arrow">Job Dispatch</div>
              <div className="arch-node">
                <strong>WSL Ubuntu Runtime</strong>
                <div>Training / Prediction Workers</div>
                <div>Data + Logs + Artifacts Storage</div>
                <div>nvidia-smi Monitoring</div>
              </div>
              <div className="arch-arrow">GPU Compute</div>
              <div className="arch-node">
                <strong>NVIDIA RTX 4080</strong>
                <div>Model Training Acceleration</div>
                <div>Batch Inference</div>
              </div>
            </div>
            <div className="arch-external" aria-label="Cloud and AI API integrations">
              <div className="arch-arrow">From Lab AI Server — outbound (HTTPS)</div>
              <div className="arch-row">
                <div className="arch-node arch-node--compact">
                  <strong>Amazon Web Services (AWS)</strong>
                  <div>Deploy / storage / secrets — environment-specific integration</div>
                </div>
                <div className="arch-node arch-node--compact">
                  <strong>OpenAI API</strong>
                  <div>Chat &amp; tool orchestration when API key is configured</div>
                </div>
                <div className="arch-node arch-node--compact">
                  <strong>Google Gemini API</strong>
                  <div>Alternate LLM provider when API key is configured</div>
                </div>
              </div>
            </div>
            <div className="arch-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setArchitectureOpen(false)}>
                Back to Platform
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
