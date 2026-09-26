import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Bundled (not Google Fonts) so the packaged app renders the same fonts offline.
import "@fontsource-variable/sora";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
