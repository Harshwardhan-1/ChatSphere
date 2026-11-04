import mongoose from 'mongoose';
import {Socket,Server} from 'socket.io';
import { storeGroupLastMessage } from './group.lastMessage.controller';
import { groupMessage } from '../models/group.message.model';
import { groupChatModel } from '../models/group.create.model';
import { groupCallCreatedType } from '../types/group.call.types';
import { emitMessageInGroup } from './group.message.controller';
import { createLiveKitToken } from '../utils/liveKitToken';

const emitGroupCallStatus = (
    group: any,
    io: Server,
    users: { [key: string]: string },
    callStatus: "busy" | "free",
    activeCallMsgId: string | null
) => {
    const memberIds = Array.from(new Set([
        ...(group.peoplesId || []).map((p: any) => p.toString()),
        ...(group.admin || []).map((a: any) => a.toString()),
    ]));
    for (const id of memberIds) {
        const sid = users[id];
        if (sid) {
            io.to(sid).emit("group_call_status_changed", {
                groupId: group._id.toString(),
                callStatus,
                activeCallMsgId,
            });
        }
    }
};

const isUserEngagedElsewhere = async (userId: string, excludeGroupId: string): Promise<boolean> => {
    const busyGroups = await groupChatModel.find({
        $or: [{ peoplesId: userId }, { admin: userId }],
        callStatus: "busy",
        _id: { $ne: excludeGroupId },
    });

    for (const grp of busyGroups) {
        const latestCallMsg = await groupMessage
            .findOne({ groupId: grp._id.toString(), messageType: "call" })
            .sort({ createdAt: -1 });
        if (!latestCallMsg) continue;

        const isOngoingHere = (latestCallMsg.callStatus ?? []).some(
            (entry) => entry.userId.toString() === userId.toString() && entry.status === "ongoing"
        );
        if (isOngoingHere) return true;
    }
    return false;
};

export const groupCall=async(data:groupCallCreatedType,
    socket:Socket,io:Server,
    users:{[key:string]:string},
    activeGroupChats:Record<string,string>
)=>{
    try{
        const g=await groupChatModel.findById(data.groupId);
        if(!g){
            throw new Error("group not exist");
        }
        if(g.onlyAdminSendMessage){
            const isAdmin=g.admin.some(
                (id)=>id.toString()===data.senderId.toString()
            );
            if(!isAdmin){
                throw new Error("you can't make video call because admin has closed that option");
            }
        }
        const isMember=g.peoplesId.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        const isAdmin=g.admin.some(
            (id)=>id.toString()===data.senderId.toString()
        )
        if(!isMember && !isAdmin){
            throw new Error(`you can't make ${data.messageType} because you are no longer member`);
        }

        if(g.callStatus==="busy"){
            throw new Error("already call is going wait for some time");
        }
        const id=Math.floor(Math.random()*10).toString();
        const create=await groupMessage.create({
            groupId:data.groupId,
            callId:id,
            senderId:data.senderId,
            message:`${data.messageType}`,
            messageType:"call",
        });
        if(!create){
            throw new Error("failed to create Msg");
        }

        create.isSend = true;
        const senderObjId = new mongoose.Types.ObjectId(data.senderId);
        create.seenBy.push(senderObjId);
        create.deliveredTo.push(senderObjId);
        create.callStatus!.push({ userId: senderObjId, status: "ongoing" });
        await create.save();

        g.callStatus="busy";
        await g.save();

        await storeGroupLastMessage({
            groupId:data.groupId,
            senderId:data.senderId,
            msgId:create._id.toString(),
            message:create.message,
            messageType:create.messageType,
            orignalname:create?.orignalname,
            filename:create?.filename,
            mimetype:create?.mimetype,
        },g);

        await emitMessageInGroup({_id:data.groupId,senderId:data.senderId},create,users,activeGroupChats,socket,io);
        emitGroupCallStatus(g, io, users, "busy", create._id.toString());

        for(let i=0;i<data.receiverId.length;i++){
            const rid=data.receiverId[i].toString();
            if(rid===data.senderId.toString())continue;
            const receiverSocketId=users[rid];
            const isEngaged = await isUserEngagedElsewhere(rid, data.groupId);
            if(receiverSocketId && !isEngaged){
                create.callStatus!.push({userId:new mongoose.Types.ObjectId(rid),status:"ongoing"});
                io.to(receiverSocketId).emit("user_available_for_call",(
                    {
                        groupId:data.groupId,
                        groupName:g.groupName,
                        groupImage:g.groupImage,
                        senderId:data.senderId,
                        receiverId:rid,
                        msgId:create._id.toString(),
                        messageType:data.messageType,
                    }
                ));
            }
        }
        await create.save();

        const LiveKitData=await createLiveKitToken(data.senderId,data.groupId);
        socket.emit("user_accepted_group_call",(
            {
                groupId:data.groupId,
                groupName:g.groupName,
                groupImage:g.groupImage,
                senderId:data.senderId,
                LiveKitData,
                msgId:create._id.toString(),
                messageType:data.messageType,
            }
        ));
    }catch(err){
        throw err;
    }
};

export const callRejected=async(data:
    {groupId:string,senderId:string,receiverId:string,msgId:string},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        const [group,msg]=await Promise.all([
            groupChatModel.findById(data.groupId),
            groupMessage.findById(data.msgId)
        ]);
        if(!group){
            throw new Error("group not found");
        }
        if(!msg){
            throw new Error("message not found");
        }
        msg.callStatus=msg.callStatus!.filter(
            (id)=>id.userId.toString()!==data.receiverId.toString()
        );
        if(msg.callStatus.length===0){
            group.callStatus="free";
            emitGroupCallStatus(group, io, users, "free", null);
        }
        await group.save();
        await msg.save();

        const senderSocketId=users[data.senderId];
        if(senderSocketId){
            io.to(senderSocketId).emit("group_call_rejected",(data));
        }
        socket.emit("group_call_rejected",(data));
    }catch(err){
        throw err;
    }
};

export const callAccepted=async(data:{groupId:string,senderId:string,msgId:string,messageType:string},
    socket:Socket,io:Server,
    users:{[key:string]:string},
)=>{
    try{
        const group=await groupChatModel.findById(data.groupId);
        if(!group){
            throw new Error("group not found");
        }
        const memberIds = Array.from(new Set([
            ...group.peoplesId.map((p) => p.toString()),
            ...group.admin.map((a) => a.toString()),
        ]));

        const msg=await groupMessage.findById(data.msgId);
        if(!msg){
            throw new Error("call message not found");
        }
        const userId=data.senderId.toString();
        if(!msg.seenBy.some((id)=>id.toString()===userId)){
            msg.seenBy.push(new mongoose.Types.ObjectId(data.senderId));
        }
        if(!msg.deliveredTo.some((id)=>id.toString()===userId)){
            msg.deliveredTo.push(new mongoose.Types.ObjectId(data.senderId));
        }
        if(!(msg.callStatus ?? []).some((entry)=>entry.userId.toString()===userId)){
            msg.callStatus!.push({ userId: new mongoose.Types.ObjectId(data.senderId), status: "ongoing" });
        }
        await msg.save();
        
        for(const id of memberIds){
            const receiverSocketId=users[id];
            if(receiverSocketId){
                const liveKitData=await createLiveKitToken(id,data.groupId);
                io.to(receiverSocketId).emit("new_member_added_in_groupCall",(
                    {
                        groupId:data.groupId,
                        groupName:group.groupName,
                        groupImage:group.groupImage,
                        userId:id,
                        newMemberId:data.senderId,
                        liveKitData,
                        msgId:data.msgId,
                        messageType:data.messageType,
                    }
                ));
            }
        }
    }catch(err){
        throw err;
    }
};

export const leaveGroupCall=async(data:
    {groupId:string,senderId:string,msgId:string},
    socket:Socket,io:Server,
    users:{[key:string]:string}
)=>{
    try{
        const [group,msg]=await Promise.all([
            groupChatModel.findById(data.groupId),
            groupMessage.findById(data.msgId)
        ]);
        if(!group){
            throw new Error("group not found");
        }
        if(!msg){
            throw new Error("message not exist");
        }
        msg.callStatus=msg.callStatus!.filter(
            (id)=>id.userId.toString()!==data.senderId.toString()
        );
        if(msg.callStatus.length===0){
            group.callStatus="free";
            emitGroupCallStatus(group, io, users, "free", null);
        }
        await group.save();
        await msg.save();

        const memberIds = Array.from(new Set([
            ...group.peoplesId.map((p) => p.toString()),
            ...group.admin.map((a) => a.toString()),
        ]));

        for(const id of memberIds){
            const receiverSocketId=users[id];
            if(receiverSocketId){
                const liveKitData=await createLiveKitToken(id,data.groupId);
                io.to(receiverSocketId).emit("member_left_from_group_call",(
                    {
                        groupId:data.groupId,
                        userId:id,
                        leftMemberId:data.senderId,
                        liveKitData,
                        msgId:data.msgId,
                        messageType:msg.message,
                        remainingCount: msg.callStatus.length,
                    }
                ));
            }
        }
    }catch(err){
        throw err;
    }
};

export const noResponseOfCall=async(data:
    {groupId:string,senderId:string,msgId:string},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        const [group,msg]=await Promise.all([
            groupChatModel.findById(data.groupId),
            groupMessage.findById(data.msgId)
        ]);
        if(!group){
            throw new Error("group not found");
        }
        if(!msg){
            throw new Error("msg not found");
        }
        msg.callStatus=msg.callStatus!.filter(
            (id)=>id.userId.toString()!==data.senderId.toString()
        );
        if(msg.callStatus.length===0){
            group.callStatus="free";
            emitGroupCallStatus(group, io, users, "free", null);
        }
        await msg.save();
        await group.save();

        const receiverSocketId=users[msg.senderId];
        if(receiverSocketId){
            io.to(receiverSocketId).emit("no_response_of_call",(
                {groupId:data.groupId,senderId:data.senderId,callSendId:msg.senderId}
            ));
        }
    }catch(err){
        throw err;
    }
};

export const cleanupUserFromCalls = async (
    userId: string,
    io: Server,
    users: { [key: string]: string }
) => {
    try{
        const stuckMsgs = await groupMessage.find({
            messageType: "call",
            callStatus: { $elemMatch: { userId: new mongoose.Types.ObjectId(userId), status: "ongoing" } },
        });

        for (const msg of stuckMsgs) {
            msg.callStatus = (msg.callStatus ?? []).filter(
                (entry) => entry.userId.toString() !== userId.toString()
            );

            const group = await groupChatModel.findById(msg.groupId);
            if (!group) {
                await msg.save();
                continue;
            }

            if (msg.callStatus.length === 0) {
                group.callStatus = "free";
                emitGroupCallStatus(group, io, users, "free", null);
            }
            await group.save();
            await msg.save();

            const notifyIds = Array.from(new Set([
                ...group.peoplesId.map((p) => p.toString()),
                ...group.admin.map((a) => a.toString()),
            ]));

            for (const id of notifyIds) {
                const receiverSocketId = users[id];
                if (receiverSocketId) {
                    const liveKitData = await createLiveKitToken(id, group._id.toString());
                    io.to(receiverSocketId).emit("member_left_from_group_call", {
                        groupId: group._id.toString(),
                        userId: id,
                        leftMemberId: userId,
                        liveKitData,
                        msgId: msg._id.toString(),
                        messageType: msg.message,
                        remainingCount: msg.callStatus.length,
                    });
                }
            }
        }
    }catch(err){
        console.error("cleanupUserFromCalls failed:", err);
    }
};