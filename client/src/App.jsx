import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Layout, Menu } from "antd";

const { Header, Content, Footer } = Layout;

export default function App() {
    const location = useLocation();
    const current =
        location.pathname === "/" ? ["chat"] : [location.pathname.slice(1)];

    return (
        <Layout className="app-shell">
            <Header
                style={{
                    background: "#fff",
                    borderBottom: "1px solid #f0f0f0",
                }}
            >
                <Menu
                    mode="horizontal"
                    selectedKeys={current}
                    items={[
                        { key: "chat", label: <Link to="/">Chat</Link> },
                        {
                            key: "sources",
                            label: <Link to="/sources">Sources</Link>,
                        },
                        {
                            key: "settings",
                            label: <Link to="/settings">Settings</Link>,
                        },
                    ]}
                />
            </Header>
            <Content className="content">
                <Outlet />
            </Content>
        </Layout>
    );
}