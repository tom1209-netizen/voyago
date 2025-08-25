import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App.jsx";
import Chat from "./pages/Chat.jsx";
import Sources from "./pages/Sources.jsx";
import Settings from "./pages/Settings.jsx";
import "antd/dist/reset.css";
import "./scss/main.scss";

const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        children: [
            { index: true, element: <Chat /> },
            { path: "sources", element: <Sources /> },
            { path: "settings", element: <Settings /> },
        ],
    },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>
);
