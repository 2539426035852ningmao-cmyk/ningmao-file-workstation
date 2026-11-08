import React from "react";
import {createRoot} from "react-dom/client";
import {App} from "./App";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("无法初始化网页");
createRoot(root).render(<React.StrictMode><App/></React.StrictMode>);
