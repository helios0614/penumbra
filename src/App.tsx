import { ApiProxyTestPage } from "@/components/dev/ApiProxyTestPage";
import { EditorialDesktop } from "@/components/desktop-v2/EditorialDesktop";
import { Desktop } from "@/widgets/Desktop";

export default function App() {
  if (window.location.pathname === "/proxy-test") {
    return <ApiProxyTestPage />;
  }

  if (
    window.location.pathname === "/editorial" ||
    window.location.pathname.startsWith("/editorial/")
  ) {
    return <EditorialDesktop />;
  }

  return <Desktop />;
}
