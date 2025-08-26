import React, { useEffect, useRef, useState } from "react";
import {
    Button,
    Input,
    Typography,
    Segmented,
    Divider,
    message as toast,
    Modal,
    Dropdown,
} from "antd";
import { MoreOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import "../scss/chat.scss";
const { Text } = Typography;

function renderCitations(text, onClick) {
    const re = /\[(\d+)\]/g;
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const num = Number(m[1]);
        out.push(
            <span
                key={`${m.index}-${num}`}
                className="cite"
                onClick={() => onClick(num)}
            >
                [{num}]
            </span>
        );
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

function useSettings() {
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem("appSettings");
        return saved ? JSON.parse(saved) : { temperature: 0.2, retrievalK: 4 };
    });
    useEffect(() => {
        localStorage.setItem("appSettings", JSON.stringify(settings));
    }, [settings]);
    return [settings, setSettings];
}

const genId = () => `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function Chat() {
    const [settings] = useSettings();
    const [message, setMessage] = useState("");
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);

    // Chat history (multi-conversation)
    const [chatIndex, setChatIndex] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("chatIndex") || "[]");
        } catch {
            return [];
        }
    });
    const [chatId, setChatId] = useState(() => chatIndex[0]?.id || genId());

    // Rename state
    const [editingId, setEditingId] = useState(null);
    const [editingTitle, setEditingTitle] = useState("");

    // Hydration guard for history load/persist
    const [hydrated, setHydrated] = useState(false);

    // Ensure current chat is visible in the sidebar on first load
    useEffect(() => {
        if (!chatIndex.find((c) => c.id === chatId)) {
            const entry = {
                id: chatId,
                title: "New chat",
                createdAt: Date.now(),
            };
            const next = [entry, ...chatIndex];
            setChatIndex(next);
            localStorage.setItem("chatIndex", JSON.stringify(next));
            localStorage.setItem(`chat:${chatId}`, JSON.stringify([]));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // Load current chat history from storage
        setHydrated(false);
        try {
            const saved = JSON.parse(
                localStorage.getItem(`chat:${chatId}`) || "[]"
            );
            setHistory(saved);
        } catch {
            setHistory([]);
        }
        setHydrated(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId]);

    useEffect(() => {
        // Persist current chat history (only after hydrated)
        if (!hydrated) return;
        localStorage.setItem(`chat:${chatId}`, JSON.stringify(history));
    }, [chatId, history, hydrated]);

    const ensureIndexed = (firstUserText) => {
        const idx = chatIndex.findIndex((c) => c.id === chatId);
        if (idx === -1) {
            const entry = {
                id: chatId,
                title: (firstUserText || "New chat").slice(0, 60),
                createdAt: Date.now(),
            };
            const next = [entry, ...chatIndex];
            setChatIndex(next);
            localStorage.setItem("chatIndex", JSON.stringify(next));
        } else {
            // Update placeholder title on first message
            const cur = chatIndex[idx];
            if (cur.title === "New chat" && firstUserText) {
                const next = [...chatIndex];
                next[idx] = { ...cur, title: firstUserText.slice(0, 60) };
                setChatIndex(next);
                localStorage.setItem("chatIndex", JSON.stringify(next));
            }
        }
    };

    const newChat = () => {
        const id = genId();
        setChatId(id);
        setHistory([]);
        const entry = { id, title: "New chat", createdAt: Date.now() };
        const next = [entry, ...chatIndex];
        setChatIndex(next);
        localStorage.setItem("chatIndex", JSON.stringify(next));
        localStorage.setItem(`chat:${id}`, JSON.stringify([]));
    };

    const switchChat = (id) => {
        setChatId(id);
    };

    const startRename = (chat) => {
        setEditingId(chat.id);
        setEditingTitle(chat.title || "");
    };
    const saveChatIndex = (next) => {
        setChatIndex(next);
        localStorage.setItem("chatIndex", JSON.stringify(next));
    };
    const commitRename = () => {
        if (!editingId) return;
        const name = (editingTitle || "").trim() || "Untitled";
        const next = chatIndex.map((c) =>
            c.id === editingId ? { ...c, title: name } : c
        );
        saveChatIndex(next);
        setEditingId(null);
        setEditingTitle("");
    };
    const cancelRename = () => {
        setEditingId(null);
        setEditingTitle("");
    };

    // Delete chat (with confirmation)
    const deleteChat = (chat) => {
        Modal.confirm({
            title: "Delete this chat?",
            content: "This will remove its messages stored in your browser.",
            okText: "Delete",
            okType: "danger",
            cancelText: "Cancel",
            onOk: () => {
                const id = chat.id;
                const remaining = chatIndex.filter((c) => c.id !== id);
                localStorage.removeItem(`chat:${id}`);

                if (id === chatId) {
                    if (remaining.length > 0) {
                        // switch to the first remaining chat
                        saveChatIndex(remaining);
                        setChatId(remaining[0].id);
                    } else {
                        // no chats left -> create a fresh one
                        const newId = genId();
                        const entry = {
                            id: newId,
                            title: "New chat",
                            createdAt: Date.now(),
                        };
                        saveChatIndex([entry]);
                        localStorage.setItem(
                            `chat:${newId}`,
                            JSON.stringify([])
                        );
                        setChatId(newId);
                        setHistory([]);
                    }
                } else {
                    saveChatIndex(remaining);
                }
            },
        });
    };

    // Citation modal
    const [citation, setCitation] = useState(null);
    const openCitation = (msg, num) => {
        const item = msg.sources?.[num - 1];
        if (!item) return toast.warning("Source not found");
        setCitation({ item, num });
    };

    const send = async () => {
        const text = message.trim();
        if (!text) return;
        setMessage("");
        const isFirst = history.length === 0;
        setHistory((h) => [...h, { role: "user", content: text }]);
        if (isFirst) ensureIndexed(text);
        setLoading(true);
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    options: {
                        temperature: settings.temperature,
                        retrievalK: settings.retrievalK,
                    },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Request failed");
            setHistory((h) => [
                ...h,
                {
                    role: "assistant",
                    content: data.reply,
                    sources: data.sources,
                },
            ]);
        } catch (e) {
            toast.error(e.message);
            setHistory((h) => [
                ...h,
                { role: "assistant", content: `Error: ${e.message}` },
            ]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    return (
        <div className="chat-layout">
            <aside className="chat-sidebar">
                <div className="chat-sidebar-header">
                    <Button type="primary" block onClick={newChat}>
                        + New chat
                    </Button>
                </div>
                <div className="chat-sidebar-list">
                    {chatIndex.length === 0 ? (
                        <div className="chat-sidebar-empty">No chats yet</div>
                    ) : (
                        chatIndex.map((c) => (
                            <div
                                key={c.id}
                                className={
                                    "chat-item" +
                                    (c.id === chatId ? " active" : "")
                                }
                                onClick={() => switchChat(c.id)}
                            >
                                {editingId === c.id ? (
                                    <div
                                        className="title-row"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Input
                                            size="small"
                                            value={editingTitle}
                                            autoFocus
                                            onChange={(e) =>
                                                setEditingTitle(e.target.value)
                                            }
                                            onPressEnter={commitRename}
                                            onBlur={commitRename}
                                            onKeyDown={(e) => {
                                                if (e.key === "Escape") {
                                                    e.preventDefault();
                                                    cancelRename();
                                                }
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="title-row">
                                        <div className="title">
                                            {c.title || "Untitled"}
                                        </div>
                                        <Dropdown
                                            trigger={["click"]}
                                            placement="bottomRight"
                                            menu={{
                                                items: [
                                                    {
                                                        key: "edit",
                                                        icon: <EditOutlined />,
                                                        label: "Edit",
                                                    },
                                                    {
                                                        key: "delete",
                                                        icon: (
                                                            <DeleteOutlined />
                                                        ),
                                                        label: "Delete",
                                                        danger: true,
                                                    },
                                                ],
                                                onClick: ({ key }) => {
                                                    if (key === "edit")
                                                        startRename(c);
                                                    if (key === "delete")
                                                        deleteChat(c);
                                                },
                                            }}
                                        >
                                            <Button
                                                size="small"
                                                type="text"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                                icon={<MoreOutlined />}
                                            />
                                        </Dropdown>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </aside>

            <main className="chat-main">
                <div className="chat-box">
                    <div className="messages-list">
                        {history.map((m, i) => (
                            <div key={i} className={`message ${m.role}`}>
                                <div className="msg-meta">
                                    <Text strong>
                                        {m.role === "user"
                                            ? "You"
                                            : "Assistant"}
                                    </Text>
                                </div>
                                <div className="message-content">
                                    {m.role === "assistant"
                                        ? <ReactMarkdown>{m.content}</ReactMarkdown>
                                        : <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>}
                                </div>
                                {m.sources?.length ? (
                                    <div className="sources">
                                        Sources:{" "}
                                        {m.sources.map((s, idx) => (
                                            <span
                                                key={idx}
                                                className="cite"
                                                onClick={() =>
                                                    openCitation(m, idx + 1)
                                                }
                                            >
                                                [{idx + 1}] {s.title}
                                                {idx < m.sources.length - 1
                                                    ? ", "
                                                    : ""}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>

                    <div className="input-row">
                        <Input.TextArea
                            ref={inputRef}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onPressEnter={(e) => {
                                if (!e.shiftKey) {
                                    e.preventDefault();
                                    send();
                                }
                            }}
                            placeholder="Ask about your internal knowledge..."
                            autoSize={{ minRows: 1, maxRows: 6 }}
                            disabled={loading}
                        />
                        <Button
                            type="primary"
                            onClick={send}
                            disabled={loading}
                        >
                            Send
                        </Button>
                    </div>
                </div>

                <Modal
                    open={!!citation}
                    onCancel={() => setCitation(null)}
                    footer={null}
                    title={
                        citation
                            ? `${citation.item.title} [${citation.num}]`
                            : "Source"
                    }
                    width={720}
                >
                    <div style={{ whiteSpace: "pre-wrap" }}>
                        {citation?.item?.text || "Unavailable"}
                    </div>
                    <div className="sources" style={{ marginTop: 8 }}>
                        Source: {citation?.item?.source}
                        {citation?.item?.chunkIndex != null
                            ? ` (chunk ${Number(citation.item.chunkIndex) + 1}${
                                  citation?.item?.chunkCount
                                      ? `/${citation.item.chunkCount}`
                                      : ""
                              })`
                            : ""}
                    </div>
                </Modal>
            </main>
        </div>
    );
}
