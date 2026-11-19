import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TemporaryRoom } from "./TemporaryRoom";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{location.pathname === "/rooms" ? <TemporaryRoom /> : <App />}</React.StrictMode>,
);
