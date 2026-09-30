import { createContext, useContext } from "react";
import type { useCallHook } from "../../hooks/use.call.hook";

export type CallType = "audio" | "video";

export interface CallPeer {
  id: string | null;
  name: string;
  image: string | null;
  callType: CallType;
}

export interface CallMe {
  name: string;
  image: string | null;
}

// "user offline", "busy", "no answer" jaise messages ke liye
export interface CallNotice {
  title: string;
  sub: string;
  name: string;
  image: string | null;
  callType: CallType;
}

export type CallContextValue = ReturnType<typeof useCallHook> & {
  peer: CallPeer;
  me: CallMe;
  notice: CallNotice | null;
  dismissNotice: () => void;
  peerCamOff: boolean; // samne wale ne camera band kiya?
  sendCamState: (camOff: boolean) => void; // apna camera on/off samne wale ko batao
};  

export const CallContext = createContext<CallContextValue | null>(null);

export const useCall = (): CallContextValue => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside <CallProvider>");
  return ctx;
};