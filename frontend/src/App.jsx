import { useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Footer from "./components/Footer";

import Home from "./pages/Home";
import Upload from "./pages/Upload";
import Investigation from "./pages/Investigation";

import "./App.css";

function Shell() {
  const { pathname } = useLocation();
  const isInvestigation = pathname.startsWith("/investigation/");

  // The nav rail collapses on the investigation workspace to give the map
  // room; the user can override that either way.
  const [navPref, setNavPref] = useState(null);
  const collapsed = navPref ?? isInvestigation;

  return (
    <div className="app">
      <Header />

      <div className="app-body">
        <Sidebar collapsed={collapsed} onToggle={() => setNavPref(!collapsed)} />

        <main className={`main-content ${isInvestigation ? "main-investigation" : ""}`}>
          <Routes>
            {/* The application opens on the product dashboard; investigations start from there. */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/dashboard" element={<Home />} />
            <Route path="/investigation/:id" element={<Investigation />} />
            <Route path="*" element={<Navigate to="/upload" replace />} />
          </Routes>

          {!isInvestigation && <Footer />}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

export default App;
