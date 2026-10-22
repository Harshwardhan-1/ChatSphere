import { docs } from '../models/docs.model';
import {Socket,Server} from 'socket.io';
import type { createDocs } from "../types/docs.types";
import { validateDocs } from "../validators/docs.validator";
import mongoose from 'mongoose';
import * as Y from "yjs";
const liveDocs:Record<string,Y.Doc>={};
const timers:Record<string,NodeJS.Timeout>={};
const docEditors: Record<string, Set<string>> = {};


export const create=async(data:createDocs,socket:Socket,io:Server,
    users:{[key:string]:string},
    activeChats:Record<string,string>,
)=>{
    try{
        const parse=validateDocs.safeParse(data);
        if(!parse.success){
            const msg=parse.error.issues[0].message;
            throw new Error(msg);
        }
        const {creatorId,docsName,editPermission,viewPermission}=parse.data;
        const create=await docs.create({
            creatorId,
            docsName,
            editPermission,
            viewPermission,
        });
        if(!create){
            throw new Error("failed to create docs");
        }
        create.editPermission.push(new mongoose.Types.ObjectId(data.creatorId));
        await create.save();

        const members=Array.from(new Set([
            ...editPermission.map(e=>e.toString()),
            ...viewPermission.map(v=>v.toString())
        ])).filter((id)=>id.toString()!==create.creatorId.toString());

        // creator ko uski apni list turant mil jaye
        await AllDocs({senderId:data.creatorId},socket);
        socket.emit("docs_created",{docsId:create._id.toString()});

        // har member ko sirf docs list refresh — chat me koi message nahi jayega
        for(let i=0;i<members.length;i++){
            const id=members[i];
            const receiverSocketId=users[id];
            if(receiverSocketId){
                const allDocs=await docs.find({
                    $or:[
                        {editPermission:id},
                        {viewPermission:id},
                    ],
                }).select("-docsData").sort({createdAt:-1});
                io.to(receiverSocketId).emit("all_docs",({senderId:id,allDocs}));
            }
        }
    }catch(err){
        throw err;
    }
}




export const deleteDocs=async(data:{docsId:string,senderId:string},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        const d=await docs.findById(data.docsId);
        if(!d){
            throw new Error("docs not found");
        }
        if(d.creatorId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to delete this docs");
        }
        await d.deleteOne();
        const members=Array.from(new Set([
            ...d.editPermission.map((e)=>e.toString()),
            ...d.viewPermission.map((v)=>v.toString())
        ]));
        for(let i=0;i<members.length;i++){
            const id=members[i].toString();
            if(id===data.senderId.toString())continue;
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("docs_deleted",(
                    {docsId:data.docsId,senderId:data.senderId,msg:"This Doc has been deleted by the owner"}
                ));
            }
        }
        socket.emit("docs_deleted",(
            {docsId:data.docsId,senderId:data.senderId,msg:"This Doc has been deleted by the owner"}
        ));
    }catch(err){
        throw err;
    }
}











//basically we update the name
export const updateDoc=async(data:{docsId:string,senderId:string,name:string},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        const d=await docs.findById(data.docsId);
        if(!d){
            throw new Error("docs not found");
        }
        if(d.creatorId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to update this docs");
        }
        d.docsName=data.name;
        await d.save();
        const members=Array.from(new Set([
            ...d.editPermission.map((e)=>e.toString()),
            ...d.viewPermission.map((v)=>v.toString())
        ]));

        for(let i=0;i<members.length;i++){
            const id=members[i].toString();
            if(id===data.senderId.toString())continue;
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("docs_name_updated",(data));
            }
        }
        socket.emit("docs_name_updated",(data));
    }catch(err){
        throw err;
    }
}






export const AllDocs=async(data:{senderId:string},socket:Socket)=>{
    try{
        const allDocs=await docs.find({
            $or:[
            {editPermission:data.senderId},
            {viewPermission:data.senderId},
            ],
        }).select("-docsData").sort({createdAt:-1});
        socket.emit("all_docs",({senderId:data.senderId,allDocs}));
    }catch(err){
        throw err;
    }
}









export const userOpenDocs=async(data:{senderId:string,docsId:string},socket:Socket)=>{
    try{
        const d=await docs.findById(data.docsId);
        if(!d){
            throw new Error("docs not found");
        }
        const canEdit=d.editPermission.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        const canView=d.viewPermission.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(!canEdit && !canView){
            throw new Error("don't have access to view this document");
        }
        const edit=canEdit?"have_permission_to_edit":"don't_have_permission_to_edit";
        socket.emit("docs_open",({senderId:data.senderId,docsId:data.docsId,edit}));

        if(!liveDocs[data.docsId]){
            liveDocs[data.docsId]=new Y.Doc();
            docEditors[data.docsId]=new Set(d.editPermission.map(id=>id.toString()));
            if(d.docsData && d.docsData.length>0){
                //Y binary ki value y doc ko mill jaaengi
                Y.applyUpdate(liveDocs[data.docsId],new Uint8Array(d.docsData));
            }
        }
        const room=`doc:${data.docsId}`;
        socket.join(room);
        //target this 
        socket.nsp.to(room).emit("docs_online",{docsId:data.docsId,size:socket.nsp.adapter.rooms.get(room)?.size||0});
        //update ko binary format ma karka da raha ha 
        const update=Y.encodeStateAsUpdate(liveDocs[data.docsId]);
        socket.emit("docs_sync",({
            senderId:data.senderId,
            docsId:data.docsId,
            edit,
            update:Array.from(update)
        }));
    }catch(err){
        throw err;
    }
}






export const updateDocs=async(data:{senderId:string,docsId:string,update:number[]},socket:Socket)=>{
    try{
        if(!docEditors[data.docsId]?.has(data.senderId)) return;
        const ydoc=liveDocs[data.docsId];
        if(!ydoc) return;

        Y.applyUpdate(ydoc,new Uint8Array(data.update));
        socket.to(`doc:${data.docsId}`).emit("docs_update",{docsId:data.docsId,update:data.update,});
        if(!timers[data.docsId]){
            timers[data.docsId]=setTimeout(async()=>{
                delete timers[data.docsId];
                try{
                    await docs.updateOne({_id:data.docsId},{docsData:Buffer.from(Y.encodeStateAsUpdate(ydoc))});
                }catch(err){
                    console.error(err);
                }
            },2000);
        }
    }catch(err){
        console.error(err);
    }
}






export const docsLeave =async(data:{senderId:string,docsId:string},socket:Socket)=>{
    try{
        const room=`doc:${data.docsId}`;
        //it automatic handles it who leaves the room
        socket.leave(room);
        const size=socket.nsp.adapter.rooms.get(room)?.size || 0;
        socket.nsp.to(room).emit("docs_online",({docsId:data.docsId,size}));
    }catch(err){
        throw err;
    }
}














export const sendEditRequest=async(data:{senderId:string,docsId:string},
    socket:Socket,io:Server,users:{[key:string]:string} 
)=>{
    try{
        const d=await docs.findById(data.docsId).select("-docsData");
        if(!d){
            throw new Error("docs not found");
        }
        const alreadyInEdit=d.requestToEdit.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(alreadyInEdit){
            throw new Error("request already registered for edit Permission");
        }
        d.requestToEdit.push(new mongoose.Types.ObjectId(data.senderId));
        await d.save();
        //we send edit request to receiver also

        //we send to sender because to hide the button request send

        socket.emit("request_registered_for_docs_edit",({data,msg:"registered"}));

        const receiverSocketId=users[d.creatorId.toString()];
        if(receiverSocketId){
           const info=await d.populate("requestToEdit","name avatar");
            io.to(receiverSocketId).emit("request_for_edit_permission",({data,info}));
        }
    }catch(err){
        throw err;
    }
}








//the persons who can view it only now they want to edit the docs
export const showAllEditRequest=async(data:{senderId:string,docsId:string},socket:Socket)=>{
    try{
        const d=await docs.findById(data.docsId).select("-docsData");
        if(!d){
            throw new Error("docs not found");
        }
        if(d.creatorId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to view the list");
        }
        await d.populate("requestToEdit","name avatar");
        socket.emit("allDocsEditRequest",({data,d}));

    }catch(err){
        throw err;
    }
}










export const updatePermission=async(data:
    {senderId:string,docsId:string,receiverId:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeDocs:Record<string,string>
)=>{
    try{
        const d=await docs.findById(data.docsId).select("-docsData");
        if(!d){
            throw new Error("docs not found");
        }
        if(d.creatorId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to update permission");
        }
        //first remove it from view and check also if it is not in edit then push it into edit
        d.viewPermission=d.viewPermission.filter(
            (id)=>id.toString()!==data.receiverId.toString()
        );
        //check if it is already in edit don't push it again
        const canGivePermission=d.editPermission.some(
            (id)=>id.toString()===data.receiverId.toString()
        );
        if(!canGivePermission){
            d.editPermission.push(new mongoose.Types.ObjectId(data.receiverId));
        }
        d.requestToEdit=d.requestToEdit.filter(
            (id)=>id.toString()!==data.receiverId.toString()
        );
        await d.save();
        docEditors[data.docsId]?.add(data.receiverId);
        const receiverSocketId=users[data.receiverId];
        if(receiverSocketId && activeDocs[data.receiverId]===data.docsId){
            io.to(receiverSocketId).emit("docs_permission_update",({docsId:data.docsId,msg:"can_edit"}))
        }
        //to hide it from creator screen the name of that person from edit request
        socket.emit("creator_update_docs_permission",(
            {senderId:data.senderId,receiverId:data.receiverId,docsId:data.docsId})
        );
    }catch(err){
        throw err;
    }
}















export const downloadDocsFile=async(data:{senderId:string,docsId:string},socket:Socket)=>{
    try{
        const d=await docs.findById(data.docsId);
        if(!d){
            throw new Error("docs not found");
        }
        const check=d.download.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        //only those person who are in edit and view can download this file
        const isMember=d.editPermission.some((id)=>id.toString()===data.senderId.toString()  ||
                       d.viewPermission.some((id)=>id.toString()===data.senderId.toString())
        )
        if(!isMember){
            throw new Error("don't have access to download this file");
        }
        if(!check){
            d.download.push(new mongoose.Types.ObjectId(data.senderId));
            await d.save();
        }
        const length=d.download.length;

        const room=`doc:${data.docsId}`;
        socket.nsp.to(room).emit("total_docs_downloads",({docsId:data.docsId,downloadsCounts:length}));
    }catch(err){
        throw err;
    }
}