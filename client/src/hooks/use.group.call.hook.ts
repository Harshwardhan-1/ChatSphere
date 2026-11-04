import React, { useEffect, useRef, useState, useCallback, createContext, useContext } from "react";
import { socket } from "../utils/socket";
import { GroupCall } from "../components/GroupCall/GroupCall";
import type { GroupCallUser } from "../components/GroupCall/GroupCall";
import axiosInstance from "../services/axiosInstance";
import { env } from "../configs/env.config";

type CallType = "voice" | "video";

export type IncomingCall = {
    groupId: string;
    groupName?: string;
    groupImage?: string;
    senderId: string;
    receiverId: string;
    msgId: string;
    messageType: CallType;
};

export type ActiveCall = {
    groupId: string;
    groupName?: string;
    groupImage?: string;
    msgId: string;
    messageType: CallType;
    liveKitData: string;
};

function resolveImg(img?: string) {
    if (!img) return "";
    if (/^(https?:|data:|blob:)/i.test(img)) return img;
    return `${env.backendUrl}${img.startsWith("/") ? "" : "/"}${img}`;
}

function useGroupCallInternal(senderId: string) {
    const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [calling, setCalling] = useState<boolean>(false);
    const [callError, setCallError] = useState<string>("");
    // groupId -> active call msgId (null means call ended / free)
    const [busyGroups, setBusyGroups] = useState<Record<string, string | null>>({});

    const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasLeftRef = useRef(false);
    const expectedMsgIdRef = useRef<string | "any-new" | null>(null);
    const activeCallRef = useRef<ActiveCall | null>(null);

    useEffect(() => {
        activeCallRef.current = activeCall;
    }, [activeCall]);

    const clearIncomingTimer = () => {
        if (incomingTimerRef.current) {
            clearTimeout(incomingTimerRef.current);
            incomingTimerRef.current = null;
        }
    };

    const startGroupCall = (data: {
        groupId: string;
        receiverId: string[];
        messageType: CallType;
    }) => {
        setCallError("");
        setCalling(true);
        hasLeftRef.current = false;
        expectedMsgIdRef.current = "any-new";

        socket.emit("create_group_call", {
            groupId: data.groupId,
            senderId,
            receiverId: data.receiverId,
            messageType: data.messageType,
        });
    };

    const acceptGroupCall = () => {
        if (!incomingCall) {
            return;
        }

        clearIncomingTimer();
        hasLeftRef.current = false;
        expectedMsgIdRef.current = incomingCall.msgId;

        socket.emit("group_call_accepted", {
            groupId: incomingCall.groupId,
            senderId,
            msgId: incomingCall.msgId,
            messageType: incomingCall.messageType,
        });

        setCalling(true);
        setIncomingCall(null);
    };

    const rejectGroupCall = () => {
        if (!incomingCall) {
            return;
        }

        clearIncomingTimer();

        socket.emit("group_call_rejected_by_user", {
            groupId: incomingCall.groupId,
            senderId: incomingCall.senderId,
            receiverId: senderId,
            msgId: incomingCall.msgId,
        });

        setIncomingCall(null);
    };

    const joinOngoingCall = (groupId: string, msgId: string, messageType: CallType) => {
        setCallError("");
        setCalling(true);
        hasLeftRef.current = false;
        expectedMsgIdRef.current = msgId;

        socket.emit("group_call_accepted", {
            groupId,
            senderId,
            msgId,
            messageType,
        });
    };

    const leaveGroupCall = useCallback(() => {
        if (hasLeftRef.current) {
            return;
        }
        hasLeftRef.current = true;
        expectedMsgIdRef.current = null;

        if (!activeCall) {
            setIncomingCall(null);
            setCalling(false);
            return;
        }

        socket.emit("leave_group_call", {
            groupId: activeCall.groupId,
            senderId,
            msgId: activeCall.msgId,
        });

        setActiveCall(null);
        setIncomingCall(null);
        setCalling(false);
    }, [activeCall, senderId]);

    useEffect(() => {
        if (!senderId) return;

        const handleUserAvailable = (data: IncomingCall) => {
            setBusyGroups((prev) => ({ ...prev, [data.groupId]: data.msgId }));

            if (String(data.receiverId) === String(senderId)) {
                setIncomingCall(data);
                setCalling(false);

                clearIncomingTimer();

                incomingTimerRef.current = setTimeout(() => {
                    socket.emit("group_call_no_response", {
                        groupId: data.groupId,
                        senderId,
                        msgId: data.msgId,
                    });

                    setIncomingCall(null);
                }, 30000);
            }
        };

        const handleCallAccepted = (data: {
            groupId: string;
            groupName?: string;
            groupImage?: string;
            senderId: string;
            LiveKitData: string;
            msgId: string;
            messageType: CallType;
        }) => {
            setBusyGroups((prev) => ({ ...prev, [data.groupId]: data.msgId }));

            if (activeCallRef.current) return;
            if (
                expectedMsgIdRef.current !== "any-new" &&
                expectedMsgIdRef.current !== data.msgId
            ) {
                return;
            }

            setCalling(false);
            hasLeftRef.current = false;
            expectedMsgIdRef.current = null;

            setActiveCall({
                groupId: data.groupId,
                groupName: data.groupName,
                groupImage: data.groupImage,
                msgId: data.msgId,
                messageType: data.messageType,
                liveKitData: data.LiveKitData,
            });
        };

        const handleNewMember = (data: {
            groupId: string;
            groupName?: string;
            groupImage?: string;
            userId: string;
            newMemberId: string;
            liveKitData: string;
            msgId: string;
            messageType: CallType;
        }) => {
            setBusyGroups((prev) => ({ ...prev, [data.groupId]: data.msgId }));

            if (String(data.newMemberId) === String(senderId)) {
                if (activeCallRef.current) return;
                if (
                    expectedMsgIdRef.current !== "any-new" &&
                    expectedMsgIdRef.current !== data.msgId
                ) {
                    return;
                }

                setCalling(false);
                hasLeftRef.current = false;
                expectedMsgIdRef.current = null;

                setActiveCall({
                    groupId: data.groupId,
                    groupName: data.groupName,
                    groupImage: data.groupImage,
                    msgId: data.msgId,
                    messageType: data.messageType,
                    liveKitData: data.liveKitData,
                });
            }
        };

        const handleMemberLeft = (data: {
            groupId: string;
            userId: string;
            leftMemberId: string;
            liveKitData: string;
            msgId: string;
            messageType: CallType;
            remainingCount?: number;
        }) => {
            if (data.remainingCount === 0) {
                setBusyGroups((prev) => ({ ...prev, [data.groupId]: null }));
                setIncomingCall((prev) => (prev?.groupId === data.groupId ? null : prev));
            }
            if (String(data.leftMemberId) === String(senderId)) {
                return;
            }
        };

        const handleCallStatusChanged = (data: {
            groupId: string;
            callStatus: "busy" | "free";
            activeCallMsgId: string | null;
        }) => {
            setBusyGroups((prev) => ({
                ...prev,
                [data.groupId]: data.callStatus === "busy" ? data.activeCallMsgId : null,
            }));
            if (data.callStatus === "free") {
                setIncomingCall((prev) => (prev?.groupId === data.groupId ? null : prev));
            }
        };

        const handleRejected = (data: {
            groupId: string;
            senderId: string;
            receiverId: string;
            msgId: string;
        }) => {
            if (String(data.senderId) === String(senderId)) {
                setCalling(false);
            }
        };

        const handleNoResponse = (data: {
            groupId: string;
            senderId: string;
            callSendId: string;
        }) => {
            if (String(data.callSendId) === String(senderId)) {
                setCalling(false);
            }
        };

        const handleError = (message: string) => {
            setCalling(false);
            setCallError(message);
            setIncomingCall(null);
        };

        socket.on("user_available_for_call", handleUserAvailable);
        socket.on("user_accepted_group_call", handleCallAccepted);
        socket.on("new_member_added_in_groupCall", handleNewMember);
        socket.on("member_left_from_group_call", handleMemberLeft);
        socket.on("group_call_status_changed", handleCallStatusChanged);
        socket.on("group_call_rejected", handleRejected);
        socket.on("no_response_of_call", handleNoResponse);
        socket.on("group_call_error", handleError);

        return () => {
            clearIncomingTimer();

            socket.off("user_available_for_call", handleUserAvailable);
            socket.off("user_accepted_group_call", handleCallAccepted);
            socket.off("new_member_added_in_groupCall", handleNewMember);
            socket.off("member_left_from_group_call", handleMemberLeft);
            socket.off("group_call_status_changed", handleCallStatusChanged);
            socket.off("group_call_rejected", handleRejected);
            socket.off("no_response_of_call", handleNoResponse);
            socket.off("group_call_error", handleError);
        };
    }, [senderId]);

    return {
        incomingCall,
        activeCall,
        calling,
        callError,
        busyGroups,
        startGroupCall,
        acceptGroupCall,
        rejectGroupCall,
        joinOngoingCall,
        leaveGroupCall,
        setCallError,
    };
}

type GroupCallContextType = ReturnType<typeof useGroupCallInternal>;

const GroupCallContext = createContext<GroupCallContextType | null>(null);

export function GroupCallProvider({
    userId,
    children,
}: {
    userId: string;
    children: React.ReactNode;
}) {
    const state = useGroupCallInternal(userId);
    const [allUsers, setAllUsers] = useState<GroupCallUser[]>([]);

    useEffect(() => {
        if (!userId) return;
        axiosInstance
            .get("/chat/alluser")
            .then((res) => {
                if (res.data?.success) {
                    setAllUsers(res.data.data?.allUser || []);
                }
            })
            .catch(() => {});
    }, [userId]);

    const getMemberName = useCallback(
        (id: string) => {
            const u = allUsers.find((usr) => String(usr._id) === String(id));
            return u?.name || "Participant";
        },
        [allUsers]
    );

    const caller = allUsers.find(
        (u) => String(u._id) === String(state.incomingCall?.senderId)
    );
    const cardTitle =
        state.incomingCall?.groupName || caller?.name || "Group Call";
    const cardAvatar = resolveImg(
        state.incomingCall?.groupImage || caller?.avatar
    );
    const cardInitial = (cardTitle.trim()[0] || "G").toUpperCase();

    return React.createElement(
        GroupCallContext.Provider,
        { value: state },
        children,
        // 1) Incoming Call Popup on ANY Page
        state.incomingCall &&
            !state.activeCall &&
            React.createElement(
                "div",
                { className: "wa-gc-modal-backdrop" },
                React.createElement(
                    "div",
                    { className: "wa-gc-call-card" },
                    React.createElement(
                        "div",
                        {
                            className: "wa-gc-call-card-avatar",
                            style: { backgroundColor: "#00a884" },
                        },
                        cardAvatar
                            ? React.createElement("img", {
                                  src: cardAvatar,
                                  alt: cardTitle,
                              })
                            : React.createElement("span", null, cardInitial)
                    ),
                    React.createElement(
                        "h3",
                        { className: "wa-gc-call-card-title" },
                        cardTitle
                    ),
                    React.createElement(
                        "p",
                        { className: "wa-gc-call-card-sub" },
                        `Incoming group ${state.incomingCall.messageType} call...`
                    ),
                    React.createElement(
                        "div",
                        { className: "wa-gc-call-card-actions" },
                        React.createElement(
                            "button",
                            {
                                type: "button",
                                className: "wa-gc-action-pill reject",
                                onClick: state.rejectGroupCall,
                            },
                            "Reject"
                        ),
                        React.createElement(
                            "button",
                            {
                                type: "button",
                                className: "wa-gc-action-pill accept",
                                onClick: state.acceptGroupCall,
                            },
                            "Accept"
                        )
                    )
                )
            ),
        // 2) Calling Loader on ANY Page
        state.calling &&
            !state.activeCall &&
            React.createElement(
                "div",
                { className: "wa-gc-modal-backdrop" },
                React.createElement(
                    "div",
                    { className: "wa-gc-call-card" },
                    React.createElement(
                        "h3",
                        { className: "wa-gc-call-card-title" },
                        "Connecting Group Call..."
                    ),
                    React.createElement(
                        "p",
                        { className: "wa-gc-call-card-sub" },
                        "Ringing participants"
                    ),
                    React.createElement(
                        "button",
                        {
                            type: "button",
                            className: "wa-gc-action-pill reject",
                            onClick: state.leaveGroupCall,
                        },
                        "Cancel"
                    )
                )
            ),
        // 3) Active Call Screen on ANY Page
        state.activeCall &&
            React.createElement(GroupCall, {
                token: state.activeCall.liveKitData,
                callType: state.activeCall.messageType,
                onClose: state.leaveGroupCall,
                callId: state.activeCall.msgId,
                groupId: state.activeCall.groupId,
                groupName: state.activeCall.groupName,
                senderId: userId,
                getMemberName,
                users: allUsers,
            })
    );
}

export function groupCall(senderId: string): GroupCallContextType {
    const ctx = useContext(GroupCallContext);
    const localState = useGroupCallInternal(ctx ? "" : senderId);
    return ctx ?? localState;
}