import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import { useCallHook } from "../../hooks/use.call.hook";
import { env } from "../../configs/env.config";
import { socket } from "../../utils/socket";
import {
  CallContext,
  type CallContextValue,
  type CallMe,
  type CallNotice,
  type CallPeer,
  type CallType,
} from "../Call/CallContext";
import { CallScreen } from "../Call/CallScreen";

interface Props {
  userId: string;
  children: ReactNode;
}

const NO_ANSWER_MS = 45000; 
const NOTICE_MS = 3500; 

const toImageUrl = (raw: unknown): string | null => {
  const s = raw ? String(raw) : "";
  if (!s) return null;
  return s.startsWith("http") || s.startsWith("data:") ? s : `${env.backendUrl}${s}`;
};

const pickImage = (u: any) => toImageUrl(u?.image || u?.profilePic || u?.avatar || u?.profileImage || u?.photo);


export function CallProvider({ userId, children }: Props) {
  const call = useCallHook(userId);
  const { callStatus, incomingCall } = call;

  const [users, setUsers] = useState<any[]>([]);
  const [peerInfo, setPeerInfo] = useState<{ id: string; callType: CallType } | null>(null);
  const [notice, setNotice] = useState<CallNotice | null>(null);
  const [peerCamOff, setPeerCamOff] = useState(false);

  // receiver side: incoming call aate hi caller ki id + type yaad rakho
  useEffect(() => {
    const inc = incomingCall as any;
    if (inc?.senderId) {
      setPeerInfo({ id: String(inc.senderId), callType: inc.callType === "video" ? "video" : "audio" });
    }
  }, [incomingCall]);

  // call khatam -> peer clear
  useEffect(() => {
    if (callStatus === "idle") setPeerInfo(null);
  }, [callStatus]);

  // koi nayi call shuru / aayi -> purana notice hata do
  useEffect(() => {
    if (callStatus !== "idle") setNotice(null);
  }, [callStatus]);

  // users list (name / image ke liye). Naya unknown user call kare to dobara fetch hota hai
  const peerKnown = !peerInfo || users.some((u) => u._id === peerInfo.id);
  useEffect(() => {
    if (!userId || (users.length > 0 && peerKnown)) return;
    axios
      .get(`${env.backendUrl}/api/v1/chat/alluser`, { withCredentials: true })
      .then((res) => {
        if (res.data.success) setUsers(res.data.data.allUser);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, peerKnown]);

  const peer: CallPeer = useMemo(() => {
    const u = users.find((x) => x._id === peerInfo?.id);
    return {
      id: peerInfo?.id ?? null,
      name: u?.name || (peerInfo ? "Unknown" : ""),
      image: pickImage(u),
      callType: peerInfo?.callType ?? "audio",
    };
  }, [users, peerInfo]);

  const me: CallMe = useMemo(() => {
    const u = users.find((x) => x._id === userId);
    return { name: u?.name || "You", image: pickImage(u) };
  }, [users, userId]);

  // socket callbacks / timers ko hamesha latest values chahiye
  const statusRef = useRef(callStatus);
  statusRef.current = callStatus;
  const endCallRef = useRef(call.endCall);
  endCallRef.current = call.endCall;
  const peerRef = useRef(peer);
  peerRef.current = peer;

  // call khatam -> samne wale ka camera state reset
  useEffect(() => {
    if (callStatus === "idle") setPeerCamOff(false);
  }, [callStatus]);

  // samne wale ne camera on/off kiya -> server se yahan aata hai
  useEffect(() => {
    const onCam = (d: { senderId: string; camOff: boolean }) => {
      if (String(d?.senderId) === String(peerRef.current.id)) setPeerCamOff(!!d.camOff);
    };
    socket.on("call_cam_state_received", onCam);
    return () => {
      socket.off("call_cam_state_received", onCam);
    };
  }, []);

  // apna camera on/off -> samne wale ko batao
  const sendCamState = useCallback(
    (camOff: boolean) => {
      const to = peerRef.current.id;
      if (to) socket.emit("call_cam_state", { senderId: userId, receiverId: to, camOff });
    },
    [userId]
  );

  const showNotice = useCallback((title: string, sub: string) => {
    const p = peerRef.current;
    setNotice({ title, sub, name: p.name, image: p.image, callType: p.callType });
  }, []);

  const resetHook = useCallback(() => {
    setTimeout(() => {
      if (statusRef.current !== "idle") endCallRef.current();
    }, 250);
  }, []);

  useEffect(() => {
    const onFailed = (msg: unknown) => {
      const text = String(msg ?? "");
      const low = text.toLowerCase();
      const name = peerRef.current.name || "This user";

      if (low.includes("already on another call")) return; // chalti call ko mat chhedo

      if (low.includes("offline")) showNotice("Not online", `${name} is offline right now. Try again later.`);
      else if (low.includes("busy")) showNotice("Busy", `${name} is on another call.`);
      else if (low.includes("no longer")) showNotice("Call ended", "This call is no longer available.");
      else showNotice("Call failed", text || "Something went wrong.");

      resetHook();
    };

    const onError = (msg: unknown) => {
      showNotice("Call failed", String(msg ?? "") || "Something went wrong.");
      resetHook();
    };

    socket.on("call_failed", onFailed);
    socket.on("call_error", onError);
    return () => {
      socket.off("call_failed", onFailed);
      socket.off("call_error", onError);
    };
  }, [showNotice, resetHook]);

  // samne wala uthaye nahi -> 45 sec baad call khud kat jaaye
  useEffect(() => {
    if (callStatus !== "calling") return;
    const t = setTimeout(() => {
      const name = peerRef.current.name || "This user";
      showNotice("No answer", `${name} didn't pick up.`);
      resetHook();
    }, NO_ANSWER_MS);
    return () => clearTimeout(t);
  }, [callStatus, showNotice, resetHook]);

  // notice apne aap band
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  // caller side: call shuru karte waqt hi samne wale ki id + type save
  const startCall: CallContextValue["startCall"] = (...args) => {
    setNotice(null);
    setPeerInfo({ id: String(args[0]), callType: args[1] === "video" ? "video" : "audio" });
    return call.startCall(...args);
  };

  const value: CallContextValue = {
    ...call,
    startCall,
    peer,
    me,
    notice,
    dismissNotice,
    peerCamOff,
    sendCamState,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallScreen />
    </CallContext.Provider>
  );
}