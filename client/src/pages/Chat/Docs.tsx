import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Plus, Sun, Moon, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { DocsHook } from "../../hooks/use.docs.hooks";
import type { DocsItem } from "../../hooks/use.docs.hooks";
import { CreateDocsPanel } from "./DocsPanel";
import { DocsEditor } from "./DocsEditor";
import { socket } from "../../utils/socket";
import "./Docs.css";

export function Docs() {
    const location = useLocation();
    const navigate = useNavigate();
    const senderId: string = location.state?.senderId;
    const [selectedId, setSelectedId] = useState<string | null>(location.state?.openDocsId ?? null);
    const [showCreate, setShowCreate] = useState(false);
    const [openDocMenuId, setOpenDocMenuId] = useState<string | null>(null);

    // Same theme state as GroupChat & ChannelChat
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        const saved = localStorage.getItem("wp-theme") || localStorage.getItem("theme");
        if (saved === "dark" || saved === "light") return saved;
        return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("wp-theme", theme);
        localStorage.setItem("theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === "light" ? "dark" : "light"));
    };

    const {
        allDocs, docsLoaded, users, creating, createdDocsId,
        clearCreated, createDocs, deleteDocument, renameDocument,
    } = DocsHook(senderId);

    useEffect(() => {
        if (!createdDocsId) return;
        setShowCreate(false);
        setSelectedId(createdDocsId);
        clearCreated();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createdDocsId]);

    useEffect(() => {
        const onDocDeleted = (d: { docsId: string; msg: string }) => {
            if (d.docsId === selectedId) {
                alert(d.msg);
                setSelectedId(null);
            }
        };
        socket.on("docs_deleted", onDocDeleted);
        return () => { socket.off("docs_deleted", onDocDeleted); };
    }, [selectedId]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".docs-item-menu")) {
                setOpenDocMenuId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!senderId) {
        return (
            <div className="docs-page" data-theme={theme}>
                <div className="docs-placeholder">User not found. Please go back and open Docs again.</div>
            </div>
        );
    }

    const selectedDoc = allDocs.find((d) => d._id === selectedId);

    const roleOf = (d: DocsItem) => {
        if (String(d.creatorId) === String(senderId)) return "Created by you";
        return d.editPermission.map(String).includes(String(senderId)) ? "Can edit" : "View only";
    };

    const handleRename = (d: DocsItem) => {
        setOpenDocMenuId(null);
        const name = window.prompt("Rename document", d.docsName);
        if (name && name.trim() && name.trim() !== d.docsName) {
            renameDocument(d._id, name.trim());
        }
    };

    const handleDelete = (d: DocsItem) => {
        setOpenDocMenuId(null);
        if (window.confirm(`Delete "${d.docsName}"? This can't be undone.`)) {
            deleteDocument(d._id);
        }
    };

    return (
        <div className="docs-page" data-theme={theme}>
            <aside className="docs-sidebar">
                <div className="docs-sidebar-header">
                    <button className="docs-icon-btn" onClick={() => navigate(-1)} aria-label="Back" title="Back">
                        <ArrowLeft size={20} />
                    </button>
                    <h2>Docs</h2>
                    <div className="docs-header-actions">
                        <button
                            type="button"
                            className="docs-icon-btn"
                            onClick={toggleTheme}
                            aria-label="Toggle theme"
                            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
                        </button>
                        <button
                            type="button"
                            className="docs-icon-btn"
                            onClick={() => setShowCreate(true)}
                            aria-label="New document"
                            title="New document"
                        >
                            <Plus size={22} />
                        </button>
                    </div>
                </div>

                <div className="docs-list">
                    {docsLoaded && allDocs.length === 0 && (
                        <div className="docs-empty">No documents yet. Tap + to create one.</div>
                    )}
                    {allDocs.map((d) => {
                        const isCreator = String(d.creatorId) === String(senderId);
                        return (
                            <div
                                key={d._id}
                                className={`docs-item ${d._id === selectedId ? "active" : ""}`}
                                onClick={() => setSelectedId(d._id)}
                            >
                                <div className="docs-item-icon"><FileText size={20} /></div>
                                <div className="docs-item-text">
                                    <div className="docs-item-name">{d.docsName}</div>
                                    <div className="docs-item-meta">{roleOf(d)}</div>
                                </div>

                                {isCreator && (
                                    <div className="docs-item-menu">
                                        <button
                                            type="button"
                                            className="docs-item-menu-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDocMenuId(openDocMenuId === d._id ? null : d._id);
                                            }}
                                            aria-label="Document options"
                                        >
                                            <MoreVertical size={18} />
                                        </button>
                                        {openDocMenuId === d._id && (
                                            <div className="docs-item-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                                                <div className="docs-item-menu-option" onClick={() => handleRename(d)}>
                                                    <Pencil size={15} />
                                                    <span>Rename</span>
                                                </div>
                                                <div className="docs-item-menu-option docs-item-menu-option--danger" onClick={() => handleDelete(d)}>
                                                    <Trash2 size={15} />
                                                    <span>Delete</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {showCreate && (
                    <CreateDocsPanel
                        users={users}
                        creating={creating}
                        onClose={() => setShowCreate(false)}
                        onCreate={createDocs}
                    />
                )}
            </aside>

            <main className="docs-main">
                {selectedDoc ? (
                    <DocsEditor
                        key={selectedDoc._id}
                        senderId={senderId}
                        doc={selectedDoc}
                        users={users}
                        theme={theme}
                        onToggleTheme={toggleTheme}
                    />
                ) : (
                    <div className="docs-placeholder">
                        <img src="/WhatsApp.svg" alt="WhatsApp" className="docs-placeholder-logo" />
                        <p>
                            {selectedId && !docsLoaded && "Opening document..."}
                            {selectedId && docsLoaded && "Document not found or you don't have access."}
                            {!selectedId && "Select a document or create a new one."}
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}