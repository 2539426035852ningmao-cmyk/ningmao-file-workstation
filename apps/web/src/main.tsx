import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { StationAccount } from "./StationAccount";
import { StationSocial } from "./StationSocial";
import { TemporaryRoom } from "./TemporaryRoom";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{location.pathname === "/rooms" ? <TemporaryRoom />
    : location.pathname === "/account" ? <StationAccount />
    : location.pathname === "/social" ? <StationSocial /> : <App />}</React.StrictMode>,
);
