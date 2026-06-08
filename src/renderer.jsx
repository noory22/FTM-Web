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
import ProcessMode from "./ProcessMode.jsx"; // add this import
import UpdateChecker from "./UpdateChecker.jsx";

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
  "/process-mode", // ProcessMode
];

const App = () => {
  return (
    <HashRouter>
      <Routes>
        {/* Route for MainMenu with SafetyAlert */}
        <Route
          path="/"
          element={
            <>
              <SafetyAlert />
              <MainMenu />
            </>
          }
        />
        
        {/* Route for LoadConfig (HandleConfig with mode="load") with SafetyAlert */}
        <Route
          path="/handle-config/load"
          element={
            <>
              <SafetyAlert />
              <HandleConfig mode="load" />
            </>
          }
        />
        
        {/* Route for ManualMode with SafetyAlert */}
        <Route
          path="/manual-mode"
          element={
            <>
              <SafetyAlert />
              <Manual />
            </>
          }
        />
        
        {/* Route for ProcessMode with SafetyAlert */}
        <Route
          path="/process-mode"
          element={
            <>
              <SafetyAlert />
              <ProcessMode />
            </>
          }
        />
        
        {/* Routes without SafetyAlert */}
        <Route path="/create-config" element={<CreateConfig />} />
        <Route path="/handle-config/delete" element={<HandleConfig mode="delete" />} />
        <Route path="/process-logs" element={<ProcessLogs />} />
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