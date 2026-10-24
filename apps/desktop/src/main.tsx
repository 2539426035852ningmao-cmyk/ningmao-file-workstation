import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import App from "./App";
import { nativeBackend } from "./backend";
import "./style.css";
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App backend={nativeBackend} native={isTauri()}/></React.StrictMode>);
