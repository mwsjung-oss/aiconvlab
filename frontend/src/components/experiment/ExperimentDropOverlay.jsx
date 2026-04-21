import { useEffect, useRef, useState } from "react";

/**
 * Phase 2a · 전역 드래그-드롭 업로드 오버레이
 *
 * Experiment 쉘 어디에서나 CSV 파일을 드래그해서 놓으면 업로드가 실행되고,
 * 데이터(step2) 단계로 이동한다. `UploadPage`의 기존 드롭존은 그대로 유지.
 *
 * 동작:
 * - 창에 dragenter가 발생하고 dataTransfer.types에 "Files"가 포함되면 오버레이를 표시.
 * - dragleave가 최외곽으로 빠질 때(depth 0) 오버레이를 닫음.
 * - drop 시 첫 CSV 파일을 찾아 `onUpload(file)` 호출 + `onNavigateToData()` 호출.
 *
 * @param {{
 *   enabled?: boolean,
 *   onUpload: (file: File) => void | Promise<void>,
 *   onNavigateToData?: () => void,
 *   loading?: boolean,
 * }} props
 */
export default function ExperimentDropOverlay({
  enabled = true,
  onUpload,
  onNavigateToData,
  loading = false,
}) {
  const [visible, setVisible] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    function hasFiles(e) {
      const types = e?.dataTransfer?.types;
      if (!types) return false;
      if (typeof types.includes === "function") return types.includes("Files");
      try {
        for (let i = 0; i < types.length; i += 1) {
          if (types[i] === "Files") return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    }

    function onDragEnter(e) {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setVisible(true);
    }
    function onDragOver(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
    function onDragLeave(e) {
      if (!hasFiles(e)) return;
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setVisible(false);
      }
    }
    function onDrop(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setVisible(false);
      if (loading) return;
      const files = e.dataTransfer?.files;
      if (!files || !files.length) return;
      const csv =
        Array.from(files).find((f) => /\.csv$/i.test(f.name)) || files[0];
      if (csv) {
        try {
          if (onNavigateToData) onNavigateToData();
        } finally {
          onUpload(csv);
        }
      }
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled, loading, onUpload, onNavigateToData]);

  if (!enabled || !visible) return null;
  return (
    <div className="experiment-drop-overlay" role="alert" aria-live="polite">
      <div className="experiment-drop-overlay-card">
        <div className="experiment-drop-overlay-icon" aria-hidden="true">
          ⤓
        </div>
        <h3 className="experiment-drop-overlay-title">
          CSV 파일을 놓으면 업로드됩니다
        </h3>
        <p className="experiment-drop-overlay-sub">
          데이터 단계로 이동하고 파일을 등록합니다. (다른 확장자는 무시됩니다.)
        </p>
      </div>
    </div>
  );
}
