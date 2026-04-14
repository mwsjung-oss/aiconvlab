import { useMemo, useState } from "react";
import { apiJson } from "../api";

const STATE_LABELS = {
  ready: "Ready",
  disabled: "Disabled",
  not_configured: "Not configured",
  placeholder: "Placeholder",
  connected: "Connected",
};

function statusBadgeClass(state) {
  if (state === "ready" || state === "connected") return "sys-badge sys-badge--ok";
  if (state === "disabled" || state === "not_configured") return "sys-badge sys-badge--warn";
  return "sys-badge sys-badge--placeholder";
}

export default function SystemStatusPage({
  selectedRuntime,
  onChangeRuntime,
  systemInfo,
  onRefresh,
}) {
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [lastJob, setLastJob] = useState(null);

  const runtimeItems = systemInfo?.runtimes || [];
  const providerItems = systemInfo?.providers || [];
  const apiHealth = systemInfo?.health;

  const healthBadge = useMemo(() => {
    if (apiHealth?.ok || apiHealth?.status === "ok") {
      return { cls: "sys-badge sys-badge--ok", label: "Connected" };
    }
    return { cls: "sys-badge sys-badge--warn", label: "Disabled" };
  }, [apiHealth]);

  async function dispatchProbeJob() {
    setDispatching(true);
    setDispatchMessage("");
    try {
      const res = await apiJson("/api/jobs/dispatch", {
        method: "POST",
        body: JSON.stringify({
          runtime: selectedRuntime,
          job_type: "probe",
          payload: { source: "system-status-ui" },
        }),
      });
      setDispatchMessage(`${res.message} (job_id=${res.job_id})`);
      const st = await apiJson(`/api/jobs/${res.job_id}/status`);
      setLastJob(st);
      onRefresh?.();
    } catch (e) {
      setDispatchMessage(e?.message || String(e));
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="panel panel--dense">
      <h2 className="panel-heading-row">System Status</h2>

      <div className="sys-grid">
        <section className="sys-card">
          <h3>Runtime Selection</h3>
          <div className="sys-runtime-row">
            {["local", "lab", "cloud"].map((r) => (
              <button
                key={r}
                type="button"
                className={selectedRuntime === r ? "nav-tab nav-tab-active" : "nav-tab"}
                onClick={() => onChangeRuntime?.(r)}
              >
                {r === "local" ? "Local" : r === "lab" ? "Lab" : "Cloud"}
              </button>
            ))}
          </div>
          <p className="hint">선택값은 localStorage에 저장됩니다.</p>
        </section>

        <section className="sys-card">
          <h3>API Health</h3>
          <span className={healthBadge.cls}>{healthBadge.label}</span>
          <p className="hint">{apiHealth?.message || "health endpoint response unavailable"}</p>
        </section>
      </div>

      <section className="sys-card">
        <h3>Available Runtimes</h3>
        <div className="sys-list">
          {runtimeItems.map((it) => (
            <div key={it.name} className="sys-item">
              <strong>{it.name}</strong>
              <span className={it.available ? "sys-badge sys-badge--ok" : "sys-badge sys-badge--warn"}>
                {it.available ? "Ready" : "Disabled"}
              </span>
              {it.selected_by_default && <span className="sys-badge sys-badge--placeholder">Default</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="sys-card">
        <h3>Provider Status</h3>
        <div className="sys-list">
          {providerItems.map((p) => (
            <div key={p.name} className="sys-item">
              <strong>{p.name}</strong>
              <span className={statusBadgeClass(p.state)}>{STATE_LABELS[p.state] || p.state}</span>
              <span className="hint">{p.message}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sys-card">
        <h3>Dispatch Probe Job</h3>
        <button type="button" onClick={dispatchProbeJob} disabled={dispatching}>
          {dispatching ? "Dispatching..." : "Dispatch to selected runtime"}
        </button>
        {!!dispatchMessage && <p className="hint">{dispatchMessage}</p>}
        {lastJob && (
          <p className="hint">
            status={lastJob.state}, progress={lastJob.progress}%, placeholder={String(lastJob.placeholder)}
          </p>
        )}
      </section>
    </div>
  );
}

