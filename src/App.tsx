import { ApiProxyTestPage } from "@/components/dev/ApiProxyTestPage";
import { Desktop } from "@/widgets/Desktop";

export default function App() {
  if (window.location.pathname === "/proxy-test") {
    return <ApiProxyTestPage />;
  }

  return <Desktop />;
}
