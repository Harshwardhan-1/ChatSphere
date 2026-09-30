import { useEffect } from "react";
import { socket } from "../../../utils/socket";
import {useState} from 'react';
import { showMessage } from "../../../utils/messageToast";
import { env } from "../../../configs/env.config";
import "./media.css";

interface prop{
    onBack:()=>void,
    senderId:string,
    receiverId:string,
}


interface media{
senderId:string,
receiverId:string,
message:string,
messageType:string,
mimetype:string,
filename:string,
sizeInKb:number,
sizeInMb:number,
}



export function Media({onBack,senderId,receiverId}:prop){
    
    const [data,setData]=useState<media[]>([]);
    const [selected,setSelected]=useState<media|null>(null);

    const handleAllMedia=async(allMedia:media[])=>{
        try{
        setData(allMedia);
        }catch(err:any){
            showMessage(err);
        }    
    }

    // agar src galat nikle ya file load na ho, bada/ajeeb image dikhane ke bajaye
    // chhota neutral placeholder dikhao — data/socket logic ko ye bilkul nahi chhuta
    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.visibility = "hidden";
        e.currentTarget.parentElement?.classList.add("wpm-thumb--broken");
    };

    // Media tab sirf photos/videos dikhata hai (WhatsApp jaisa) — koi bhi
    // non-image/video mimetype item khaali box ki jagah yahan se hi hat jaata hai
    const visibleMedia = data.filter(
        (m) => m?.mimetype?.startsWith("image/") || m?.mimetype?.startsWith("video/")
    );


    useEffect(()=>{
        socket.emit("all_media",{senderId,receiverId});
        socket.on("found_allMedia",handleAllMedia);
        return()=>{
            socket.off("found_allMedia",handleAllMedia);
        }
    },[]);
    return(
        <div className="wpm-page">
            <div className="wpm-header">
                <span className="wpm-back" onClick={onBack}>←</span>
                <h2>Media</h2>
            </div>

            <div className="wpm-grid">
                {visibleMedia.length===0 && (
                    <div className="wpm-empty">No media found</div>
                )}
                {visibleMedia.map((all,index)=>(
                    <div key={index} className="wpm-thumb" onClick={()=>setSelected(all)}>
                        {all?.mimetype.startsWith("image/") && (
                            <img src={`${env.backendUrl}${all.message}`} alt={all.filename} onError={handleImgError} />
                        )}
                        {all?.mimetype.startsWith("video/") && (
                            <div className="wpm-video-wrap">
                                <video src={`${env.backendUrl}${all.message}`} preload="metadata" muted />
                                <span className="wpm-play">▶</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {selected && (
                <div className="wpm-preview-overlay" onClick={()=>setSelected(null)}>
                    <div className="wpm-preview-top">
                        <span className="wpm-back" onClick={()=>setSelected(null)}>←</span>
                        <span className="wpm-preview-name">{selected.filename}</span>
                    </div>
                    <div className="wpm-preview-content" onClick={(e)=>e.stopPropagation()}>
                        {selected.mimetype.startsWith("image/") && (
                            <img src={`${env.backendUrl}${selected.message}`} alt={selected.filename} onError={handleImgError} />
                        )}
                        {selected.mimetype.startsWith("video/") && (
                            <video src={`${env.backendUrl}${selected.message}`} controls autoPlay />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}