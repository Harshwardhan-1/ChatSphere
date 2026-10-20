import { useCallback, useEffect, useState } from "react";
import * as Y from "yjs";
import { socket } from "../utils/socket";
import { showApiError } from "../utils/showApiError";
import axiosInstance from "../services/axiosInstance";

export const REMOTE_ORIGIN = "remote";
export const LOCAL_ORIGIN = "local";

export interface DocsItem {
    _id: string;
    creatorId: string;
    docsName: string;
    editPermission: string[];
    viewPermission: string[];
    requestToEdit: string[];
    download: string[];
    createdAt?: string;
    updatedAt?: string;
}

export interface DocsUser {
    _id: string;
    name: string;
    avatar?: string;
    status?: string;
}

export interface EditRequestUser {
    _id: string;
    name: string;
    avatar?: string;
}


export function DocsHook(senderId: string) {
    const [allDocs, setAllDocs] = useState<DocsItem[]>([]);
    const [docsLoaded, setDocsLoaded] = useState(false);
    const [users, setUsers] = useState<DocsUser[]>([]);
    const [creating, setCreating] = useState(false);
    const [createdDocsId, setCreatedDocsId] = useState<string | null>(null);

    const getAllDocs = useCallback(() => {
        if (!senderId) return;
        socket.emit("get_all_docs", { senderId });
    }, [senderId]);

    useEffect(() => {
        if (!senderId) return;

        const onAllDocs = (data: { senderId: string; allDocs: DocsItem[] }) => {
            if (data.senderId !== senderId) return;
            const sorted = [...data.allDocs].sort(
                (a, b) =>
                    new Date(b.updatedAt || b.createdAt || 0).getTime() -
                    new Date(a.updatedAt || a.createdAt || 0).getTime()
            );
            setAllDocs(sorted);
            setDocsLoaded(true);
        };

        const onCreated = (data: { docsId: string }) => {
            setCreating(false);
            setCreatedDocsId(data.docsId);
        };

        const onError = (msg: string) => {
            setCreating(false);
            showApiError(msg);
        };

        const onDocsMessage = (m: { senderId: string }) => {
            if (m.senderId !== senderId) getAllDocs();
        };

        const onDocDeleted = (d: { docsId: string; msg: string }) => {
            setAllDocs((prev) => prev.filter((x) => x._id !== d.docsId));
        };

        const onDocRenamed = (d: { docsId: string; name: string }) => {
            setAllDocs((prev) =>
                prev.map((x) => (x._id === d.docsId ? { ...x, docsName: d.name } : x))
            );
        };

        socket.on("all_docs", onAllDocs);
        socket.on("docs_deleted", onDocDeleted);
        socket.on("docs_name_updated", onDocRenamed);
        socket.on("docs_created", onCreated);
        socket.on("docs_error", onError);
        socket.on("receive_docs_message", onDocsMessage);
        socket.on("docs_permission_update", getAllDocs);
        getAllDocs();

        return () => {
            socket.off("all_docs", onAllDocs);
            socket.off("docs_created", onCreated);
            socket.off("docs_error", onError);
            socket.off("receive_docs_message", onDocsMessage);
            socket.off("docs_permission_update", getAllDocs);
            socket.off("docs_deleted", onDocDeleted);
            socket.off("docs_name_updated", onDocRenamed);
        };
    }, [senderId, getAllDocs]);

    useEffect(() => {
        if (!senderId) return;
        const fetchUsers = async () => {
            try {
                const res=await axiosInstance.get("/chat/alluser");
                if (res.data.success) {
                setUsers(res.data.data.allUser.filter((u: DocsUser) => String(u._id) !== String(senderId)));
                }
            } catch (err) {
                showApiError(err);
            }
        };
        fetchUsers();
    }, [senderId]);

    const createDocs = (docsName: string, editPermission: string[], viewPermission: string[]) => {
        setCreating(true);
        socket.emit("create_docs", { creatorId: senderId, docsName, editPermission, viewPermission });
    };

    // NAYA — creator hi ye 2 emit kar sakta hai, backend bhi yahi check karta hai
    const deleteDocument = (docsId: string) => {
        socket.emit("delete_docs", { docsId, senderId });
    };

    const renameDocument = (docsId: string, name: string) => {
        socket.emit("update_docs_name", { docsId, senderId, name });
    };

    const clearCreated = () => setCreatedDocsId(null);

    return {
        allDocs, docsLoaded, users, creating, createdDocsId,
        clearCreated, createDocs, getAllDocs, deleteDocument, renameDocument,
    };
}









export function DocsRoomHook(senderId: string, doc: DocsItem) {
    const docsId = doc._id;
    const isCreator = String(doc.creatorId) === String(senderId);

    const [ydoc] = useState(() => new Y.Doc());
    const [ready, setReady] = useState(false);
    const [canEdit, setCanEdit] = useState(false);
    const [online, setOnline] = useState(1);
    const [downloads, setDownloads] = useState<number>(doc.download?.length ?? 0);
    const [requested, setRequested] = useState<boolean>(
        !!doc.requestToEdit?.some((id) => String(id) === String(senderId))
    );
    const [editRequests, setEditRequests] = useState<EditRequestUser[]>([]);

    useEffect(() => {
        if (!senderId || !docsId) return;

        const open = () => {
            // active_docs pehle: taaki permission update live mil sake
            socket.emit("active_docs", { docsId, senderId });
            socket.emit("user_open_docs", { senderId, docsId });
            if (isCreator) socket.emit("show_all_edit_request", { senderId, docsId });
        };

        // pehli baar poora content
        const onSync = (d: { docsId: string; edit: string; update: number[] }) => {
            if (d.docsId !== docsId) return;
            Y.applyUpdate(ydoc, new Uint8Array(d.update), REMOTE_ORIGIN);
            setCanEdit(d.edit === "have_permission_to_edit");
            setReady(true);
        };

        // dusre log ka type kiya hua
        const onUpdate = (d: { docsId: string; update: number[] }) => {
            if (d.docsId !== docsId) return;
            Y.applyUpdate(ydoc, new Uint8Array(d.update), REMOTE_ORIGIN);
        };

        // mera khud ka type kiya hua -> server ko bhejo
        const onLocalUpdate = (update: Uint8Array, origin: unknown) => {
            if (origin === REMOTE_ORIGIN) return;
            socket.emit("update_docs", { senderId, docsId, update: Array.from(update) });
        };

        const onOnline = (d: { docsId: string; size: number }) => {
            if (d.docsId === docsId) setOnline(d.size);
        };

        // creator ne edit permission de di
        const onPermission = (d: { docsId: string; msg: string }) => {
            if (d.docsId === docsId && d.msg === "can_edit") setCanEdit(true);
        };

        // viewer ki request register ho gayi
        const onRegistered = (d: { data: { docsId: string } }) => {
            if (d.data?.docsId === docsId) setRequested(true);
        };

        // creator: koi nayi edit request aayi
        const onNewRequest = (d: { info: { _id: string; requestToEdit: EditRequestUser[] } }) => {
            if (String(d.info?._id) === docsId) setEditRequests(d.info.requestToEdit);
        };

        // creator: doc kholte hi saari pending requests
        const onAllRequests = (d: { d: { _id: string; requestToEdit: EditRequestUser[] } }) => {
            if (String(d.d?._id) === docsId) setEditRequests(d.d.requestToEdit);
        };


        // creator: permission de di -> list se hata do
        const onCreatorUpdated = (d: { receiverId: string; docsId: string }) => {
            if (d.docsId !== docsId) return;
            setEditRequests((prev) => prev.filter((u) => String(u._id) !== String(d.receiverId)));
        };

        const onDownloads = (d: { docsId: string; downloadsCounts: number }) => {
            if (d.docsId === docsId) setDownloads(d.downloadsCounts);
        };

        ydoc.on("update", onLocalUpdate);
        socket.on("docs_sync", onSync);
        socket.on("docs_update", onUpdate);
        socket.on("docs_online", onOnline);
        socket.on("docs_permission_update", onPermission);
        socket.on("request_registered_for_docs_edit", onRegistered);
        socket.on("request_for_edit_permission", onNewRequest);
        socket.on("allDocsEditRequest", onAllRequests);
        socket.on("creator_update_docs_permission", onCreatorUpdated);
        socket.on("total_docs_downloads", onDownloads);
        socket.on("connect", open); // internet gaya aur wapas aaya -> room dobara join

        open();

        return () => {
            ydoc.off("update", onLocalUpdate);
            socket.off("docs_sync", onSync);
            socket.off("docs_update", onUpdate);
            socket.off("docs_online", onOnline);
            socket.off("docs_permission_update", onPermission);
            socket.off("request_registered_for_docs_edit", onRegistered);
            socket.off("request_for_edit_permission", onNewRequest);
            socket.off("allDocsEditRequest", onAllRequests);
            socket.off("creator_update_docs_permission", onCreatorUpdated);
            socket.off("total_docs_downloads", onDownloads);
            socket.off("connect", open);
            socket.emit("not_active_docs", { docsId, senderId });
        };
    }, [senderId, docsId, isCreator, ydoc]);

    const requestEdit = () => socket.emit("send_edit_request", { senderId, docsId });
    const approveEdit = (receiverId: string) =>
        socket.emit("update_docs_permission", { senderId, docsId, receiverId });
    const notifyDownload = () => socket.emit("download_docs_file", { senderId, docsId });

    return {
        ydoc, ready, canEdit, online, downloads, requested,
        editRequests, isCreator, requestEdit, approveEdit, notifyDownload,
    };
}