import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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


function CallProviderInner({ userId, children }: Props) {
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

  // NAYA — purana notice tabhi hatao jab incoming call aaye ya call connect ho jaye.
  // ("calling" pe mat hatao: server ka "offline" jawab kabhi kabhi is effect se pehle aa jata ha aur notice mit jata tha.
  //  Nayi call shuru karne pe notice startCall me hi hat jata ha.)
  useEffect(() => {
    if (callStatus === "ringing" || callStatus === "ongoing") setNotice(null);
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

  // NAYA — aakhri valid peer yaad rakho. call fail hote hi hook cleanup karke peerInfo null kar deta ha,
  // tab notice me naam khaali aata tha ("Unknown" / "This user"). Isliye yahan se naam lete hain.
  const lastPeerRef = useRef<CallPeer | null>(null);
  if (peer.id) lastPeerRef.current = peer;

  const getPeer = useCallback(
    (): CallPeer => (peerRef.current.id ? peerRef.current : lastPeerRef.current ?? peerRef.current),
    []
  );

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

  const showNotice = useCallback(
    (title: string, sub: string) => {
      const p = getPeer();
      setNotice({ title, sub, name: p.name, image: p.image, callType: p.callType });
    },
    [getPeer]
  );

  const resetHook = useCallback(() => {
    setTimeout(() => {
      if (statusRef.current !== "idle") endCallRef.current();
    }, 250);
  }, []);

  useEffect(() => {
    const onFailed = (msg: unknown) => {
      const text = String(msg ?? "");
      const low = text.toLowerCase();
      const name = getPeer().name || "This user";

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
  }, [showNotice, resetHook, getPeer]);

  // samne wala uthaye nahi -> 45 sec baad call khud kat jaaye
  useEffect(() => {
    if (callStatus !== "calling") return;
    const t = setTimeout(() => {
      const name = getPeer().name || "This user";
      showNotice("No answer", `${name} didn't pick up.`);
      resetHook();
    }, NO_ANSWER_MS);
    return () => clearTimeout(t);
  }, [callStatus, showNotice, resetHook, getPeer]);

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

// NAYA — agar upar pehle se koi CallProvider ha (jaise App.tsx wala), toh andar wala kuch nahi banata,
// bas children dikhata ha. Isse do providers ek saath kabhi nahi chalenge (double call screen / "Unknown" bug).
export function CallProvider(props: Props) {
  const parent = useContext(CallContext);
  if (parent) return <>{props.children}</>;
  return <CallProviderInner {...props} />;
}