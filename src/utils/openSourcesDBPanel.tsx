import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import { PopupModal } from "../components/Modal.ts";
import SourcesDBPanel from "../components/ReactComponents/SourcesDatabase/index.tsx";

export function OpenSourcesDBPanel() {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);

  flushSync(() => {
    root.render(<SourcesDBPanel />);
  });

  PopupModal.display({
    title: "Sources Database",
    content: container,
    isLarge: true,
    onClose: () => root.unmount(),
  });
}
