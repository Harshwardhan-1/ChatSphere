import { useEffect } from "react";
import { socket } from "../../../utils/socket";
import {useState} from 'react';
import { showMessage } from "../../../utils/messageToast";
import { env } from "../../../configs/env.config";
import "../../ChatMedia/docs/docs.css";
import "../groupmMedia.css";

interface prop{
    onBack:()=>void,
    _id:string,
    senderId:string,
}


interface media{
_id:string,
senderId:string,
message:string,
messageType:string,
mimetype:string,
filename:string,
sizeInKb:number,
sizeInMb:number,
}

function resolveFileUrl(fileUrl?: string) {
    if (!fileUrl) return "";
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
    return `${env.backendUrl}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}


export function GroupMedia({onBack,_id,senderId}:prop){
    
    const [data,setData]=useState<media[]>([]);
    const [selected,setSelected]=useState<media|null>(null);
    const [failed,setFailed]=useState<Record<string,boolean>>({});

    const handleAllMedia=async(allMedia:media[])=>{
        try{
        setData(allMedia);
        }catch(err:any){
            showMessage(err);
        }    
    }


    useEffect(()=>{
        socket.emit("all_group_media",{_id,senderId});
        socket.on("found_all_group_media",handleAllMedia);
        return()=>{
            socket.off("found_all_group_media",handleAllMedia);
        }
    },[]);

    const mediaItems = data.filter(
        (m)=>m?.mimetype?.startsWith("image/") || m?.mimetype?.startsWith("video/")
    );

    return(
        <div className="mediaPage">
            <div className="mediaHeader">
                <span className="backArrow" onClick={onBack}>←</span>
                <h2>Media</h2>
            </div>

            {mediaItems.length===0 ? (
                <div className="gm-empty">No media found</div>
            ) : (
                <div className="gm-grid">
                    {mediaItems.map((all,index)=>{
                        const key = all._id || String(index);
                        const src = resolveFileUrl(all.message);
                        const isImage = all.mimetype.startsWith("image/");
                        const isVideo = all.mimetype.startsWith("video/");

                        return (
                            <div key={key} className="gm-thumb" onClick={()=>setSelected(all)}>
                                {failed[key] ? (
                                    <div className="gm-broken">Not available</div>
                                ) : (
                                    <>
                                        {isImage && (
                                            <img
                                                src={src}
                                                alt={all.filename}
                                                loading="lazy"
                                                onError={()=>setFailed((prev)=>({...prev,[key]:true}))}
                                            />
                                        )}
                                        {isVideo && (
                                            <>
                                                <video
                                                    src={`${src}#t=0.1`}
                                                    preload="metadata"
                                                    muted
                                                    onError={()=>setFailed((prev)=>({...prev,[key]:true}))}
                                                />
                                                <span className="gm-play">▶</span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {selected && (
                <div className="mediaPreviewOverlay" onClick={()=>setSelected(null)}>
                    <div className="mediaPreviewTop">
                        <span className="backArrow" onClick={()=>setSelected(null)}>←</span>
                        <span className="mediaPreviewName">{selected.filename}</span>
                    </div>
                    <div className="mediaPreviewContent" onClick={(e)=>e.stopPropagation()}>
                        {selected.mimetype?.startsWith("image/") && (
                            <img src={resolveFileUrl(selected.message)} alt={selected.filename} />
                        )}
                        {selected.mimetype?.startsWith("video/") && (
                            <video src={resolveFileUrl(selected.message)} controls autoPlay />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}