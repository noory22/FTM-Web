import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
// import Login from "./Login.jsx";
import MainMenu from "./MainMenu.jsx";
import CreateConfig from "./CreateConfig.jsx"; // Add this import
import HandleConfig from "./HandleConfig.jsx";
import Manual from "./Manual.jsx";
import ProcessLogs from "./ProcessLogs.jsx";
// ProcessMode.jsx removed — navigation goes directly to /process-mode/2-point or /process-mode/3-point
import ProcessModeTwoPoint from "./ProcessModeTwoPoint.jsx";
import ProcessModeThreePoint from "./ProcessModeThreePoint.jsx";
import UpdateChecker from "./UpdateChecker.jsx";
import TestSelection from "./TestSelection.jsx";
import CreateTwoPointConfig from "./CreateTwoPointConfig.jsx";
import CreateThreePointConfig from "./CreateThreePointConfig.jsx";
import LoadTwoPointConfig from "./LoadTwoPointConfig.jsx";
import LoadThreePointConfig from "./LoadThreePointConfig.jsx";
import AppShell from "./AppShell.jsx";
import DeletePointConfig from "./DeletePointConfig.jsx";
import Settings from "./Settings.jsx";

import SafetyAlert from "./SafetyAlert.jsx";

// Check if serialAPI is available
console.log('Renderer loaded, serialAPI available:', !!window.serialAPI);

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);

// Define routes where SafetyAlert should be displayed
const routesWithSafetyAlert = [
  "/", // MainMenu
  "/handle-config/load", // LoadConfig
  "/manual-mode", // ManualMode
  // "/process-mode" removed — no longer used
  "/process-mode/2-point", // ProcessModeTwoPoint
  "/process-mode/3-point", // ProcessModeThreePoint
];

const App = () => {
  return (
    <HashRouter>
      <Routes>
        {/* Login page - NO SafetyAlert */}
        {/* <Route path="/" element={<Login />} /> */}

        <Route element={<AppShell />}>
          {/* Route for MainMenu with SafetyAlert */}
          <Route
            path="/"
            element={
              <>
                {/* <SafetyAlert /> */}
                <MainMenu />
              </>
            }
          />

          {/* [LOGIN BYPASSED] Alias route — sidebar Dashboard button navigates to /main-menu */}
          <Route
            path="/main-menu"
            element={
              <>
                {/* <SafetyAlert /> */}
                <MainMenu />
              </>
            }
          />

          {/* Route for LoadConfig (HandleConfig with mode="load") with SafetyAlert */}
          <Route
            path="/handle-config/load"
            element={
              <>
                {/* <SafetyAlert /> */}
                <HandleConfig mode="load" />
              </>
            }
          />

          {/* Route for ManualMode with SafetyAlert */}
          <Route
            path="/manual-mode"
            element={
              <>
                {/* <SafetyAlert /> */}
                <Manual />
              </>
            }
          />

          {/* /process-mode route removed — all navigation uses /process-mode/2-point or /process-mode/3-point directly */}

          {/* Route for 2-Point Process Mode */}
          <Route
            path="/process-mode/2-point"
            element={
              <>
                {/* <SafetyAlert /> */}
                <ProcessModeTwoPoint />
              </>
            }
          />

          {/* Route for 3-Point Process Mode */}
          <Route
            path="/process-mode/3-point"
            element={
              <>
                {/* <SafetyAlert /> */}
                <ProcessModeThreePoint />
              </>
            }
          />

          {/* Routes without SafetyAlert */}
          <Route path="/create-config" element={<CreateConfig />} />
          <Route path="/handle-config/delete" element={<HandleConfig mode="delete" />} />
          <Route path="/process-logs" element={<ProcessLogs />} />
          <Route path="/test-selection" element={<TestSelection />} />
          <Route path="/create-config/2-point" element={<CreateTwoPointConfig />} />
          <Route path="/create-config/3-point" element={<CreateThreePointConfig />} />
          <Route path="/load-config/2-point" element={<LoadTwoPointConfig />} />
          <Route path="/load-config/3-point" element={<LoadThreePointConfig />} />
          <Route path="/delete-config/:testType" element={<DeletePointConfig />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      <UpdateChecker />
    </HashRouter>
  );
};

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
