import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryView } from "../../src/components/memory/MemoryView";
import { ToastProvider } from "../../src/components/ui/toast";
import "../../src/index.css";
function Fixture() {
  const [visible, setVisible] = useState(true);
  return <ToastProvider mobileClearance={16}><div className="h-dvh overflow-hidden bg-background sm:px-8">
    {visible ? <MemoryView onBack={() => setVisible(false)}/> : <button onClick={() => setVisible(true)}>重新进入记忆库</button>}
  </div></ToastProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture/></StrictMode>);
