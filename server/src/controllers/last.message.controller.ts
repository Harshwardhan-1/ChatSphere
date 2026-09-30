import {Request,Response,NextFunction} from 'express';
import { lastMessage } from '../models/conversion.model';
import { personalChat } from '../models/chat.model';



export const getMessageLabel = (messageType?: string, message?: string): string => {
    if (!messageType) return message || "";
    switch (messageType) {
        case "text":
        case "system":
            return message || "";
        case "pdf":
            return "pdf";
            case "call":
            return message || "Call";
        default:
            return "file";
    }
};

const getDisplayText = (msg: any) => {
    if (!msg) return "";
    return getMessageLabel(msg.messageType, msg.message);
};

export const store_last_message=async(data:{senderId:string,receiverId:string,msg:string,messageType:string,originalname?:string})=>{
    try{
        const findLastMessage=await lastMessage.findOne({
            $or:[
                {
                    senderId:data.senderId,
                    receiverId:data.receiverId,
                },
                {
                    senderId:data.receiverId,
                    receiverId:data.senderId,
                },
            ],
        });
        // file ho toh naam nahi, "File" / "Image" jaisa label store hoga
        const lastmessage=getMessageLabel(data.messageType,data.msg);

        if(findLastMessage){
            findLastMessage.lastmessage=lastmessage;
            findLastMessage.messageType=data.messageType;
            findLastMessage.clearBy=[];
            await findLastMessage.save();
            return findLastMessage;
        }else{
            const createLastMessage=await lastMessage.create({
                senderId:data.senderId,
                receiverId:data.receiverId,
                lastmessage:lastmessage,
                messageType:data.messageType,
            });
            if(createLastMessage){
                return createLastMessage;
            }else{
                throw new Error("failed to create last message");
            }
        }
    }catch(err){
        console.log(err);
        throw new Error("failed to store last message");
    }
}



//for update file ka ha ya many message come  ek ssaath

export const storeLastMessageForwardMessage=async(data:{senderId:string,receiverId:string})=>{
    try{
        const findLastMessage=await personalChat.findOne({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
        }).sort({createdAt:-1});



        if(findLastMessage){
            const lastmsg = getDisplayText(findLastMessage);
            const lastMsg=await lastMessage.findOne({
                $or:[
                    {senderId:data.senderId,receiverId:data.receiverId},
                    {senderId:data.receiverId,receiverId:data.senderId},
                ],
            });
            if(lastMsg){
                lastMsg.lastmessage=lastmsg;
                lastMsg.messageType=findLastMessage.messageType;
                lastMsg.createdAt=findLastMessage.createdAt;
                lastMsg.updatedAt=findLastMessage.updatedAt;
                lastMsg.clearBy=[];
                await lastMsg.save();
                return lastMsg;
            }else{
                const createLastMessage=await lastMessage.create({
                senderId:data.senderId,
                receiverId:data.receiverId,
                lastmessage:lastmsg,
                messageType:findLastMessage.messageType,
            });
            if(createLastMessage){
                return createLastMessage;
            }else{
                throw new Error("failed to create last message");
            }
            }
        }
    }catch(err){
        throw err;
    }
}





//have to optimze  this query because it takes a long time if there are more users on chat list of user
export const get_last_message=async(data:{userId:string})=>{
try{
    const findLastMessage=await lastMessage.find({
        $or:[
        {
            senderId:data.userId,
        },
        {
            receiverId:data.userId,
        },
  ],
    });
    let response=[];
    for(let i=0;i<findLastMessage.length;i++){
        let senderId=findLastMessage[i].senderId;
        let receiverId=findLastMessage[i].receiverId;
        const findLastChat=await personalChat.findOne({
            $or:[
                {senderId:senderId,receiverId:receiverId},
                {senderId:receiverId,receiverId:senderId},
            ],
            messageType:{$nin:["system"]},
        }).sort({createdAt:-1});

        if(!findLastChat){
            continue;
        }
        const isClearByThisUser=findLastMessage[i].clearBy?.includes(data.userId);
        const displayMsg = getDisplayText(findLastChat);
        response.push({
        // IMPORTANT: asli last message bhejne wale ki id (pehle conversation banane wale ki id jaa rhi thi,
        // isse "isMine" / tick galat aata tha)
        senderId: findLastChat.senderId,
        receiverId: findLastChat.receiverId,
        lastmessage: isClearByThisUser?"":displayMsg,
        messageType:findLastChat.messageType,
        IsSend: findLastChat?.IsSend,
        isDelivered: findLastChat?.isDelivered,
        isSeen: findLastChat?.isSeen,
        createdAt: findLastChat?.createdAt,
        updatedAt:findLastChat?.updatedAt,
        });
    }
    return response;
}catch(err){
    throw new Error("something went wrong");
}
}







//operations delete for me,delete for everyone,edit update last message and chatlist



//delete for everyone
//1 first find last message of both the user
//2 from conversational model update the last message and send to frontend/client
export const  update_chat_list=async(data:{senderId:string,receiverId:string})=>{
    try{
        const findLastMessage=await personalChat.findOne({
            $or:[{
                senderId:data.senderId,
                receiverId:data.receiverId
            },
        {
            senderId:data.receiverId,
            receiverId:data.senderId,
        },],
        messageType:{$nin:["system"]}
        }).sort({createdAt:-1});


            const findLastConversation=await lastMessage.findOne({
                $or:[{
                    senderId:data.senderId,
                    receiverId:data.receiverId,
                },
                {
                    senderId:data.receiverId,
                    receiverId:data.senderId,
                },
            ]
            });
            if(!findLastConversation){
                return null;
            }

        if (!findLastMessage) {
            const previousUpdatedAt=findLastConversation.updatedAt;
            findLastConversation.lastmessage = "";
            findLastConversation.messageType = "text";
            await findLastConversation.save();
            return {
                senderId: findLastConversation.senderId,
                receiverId: findLastConversation.receiverId,
                lastmessage: "",
                messageType: findLastConversation.messageType,
                createdAt:findLastConversation.createdAt,
                updatedAt: previousUpdatedAt,
            };
        }

                // file ka path nahi, label store karo
                findLastConversation.lastmessage=getDisplayText(findLastMessage);
                findLastConversation.messageType=findLastMessage?.messageType;
                await findLastConversation.save();
                return{
                    senderId: findLastMessage.senderId,
                    receiverId: findLastMessage.receiverId,
                    lastmessage: findLastConversation.lastmessage,
                    messageType: findLastConversation.messageType,
                    IsSend: findLastMessage.IsSend,
                    isDelivered: findLastMessage.isDelivered,
                    isSeen: findLastMessage.isSeen,
                    createdAt:findLastMessage.createdAt,
                    updatedAt: findLastMessage.updatedAt,
                }
    }catch(err){
        console.log(err);
        throw new Error("failed to delete and update last message");
    }
}






//for edit user edit it
export const update_chat_list_edit=async(data:{_id:string,senderId:string,receiverId:string,msg:string})=>{
try{
    const findLastMessage=await personalChat.findOne({
        $or:[{
            senderId:data.senderId,
            receiverId:data.receiverId,
        },
        {
            senderId:data.receiverId,
            receiverId:data.senderId,
        },
    ]
}).sort({createdAt:-1});
    const messageId=findLastMessage?._id.toString();
    if(messageId===data._id.toString()){
        //latest message only it is we need to update chat list now
        const findLastConversation=await lastMessage.findOne({
            $or:[{
                senderId:data.senderId,
                receiverId:data.receiverId,
            },
            {
                senderId:data.receiverId,
                receiverId:data.senderId,
            },
        ]});
        if(!findLastConversation){
            return null;
        }
        if (!findLastMessage) {
            const previousUpdatedAt=findLastConversation.updatedAt;
            findLastConversation.lastmessage = "";
            findLastConversation.messageType = "text";
            await findLastConversation.save();
            return {
                senderId: findLastConversation.senderId,
                receiverId: findLastConversation.receiverId,
                lastmessage: "",
                messageType: findLastConversation.messageType,
                createdAt:findLastConversation.createdAt,
                updatedAt: previousUpdatedAt,
            };
        }
        findLastConversation.lastmessage=data.msg;
        await findLastConversation.save();
        return{
            // edit hua message hi last message ha, isliye uska sender
            senderId:findLastMessage.senderId,
            receiverId:findLastMessage.receiverId,
            lastmessage:findLastConversation.lastmessage,
            messageType:findLastConversation.messageType,
            createdAt:findLastConversation.createdAt,
            updatedAt:findLastConversation.updatedAt,
        }
    }
    return null;
}catch(err){
    throw new Error("error occured in saving");
}
}












//this one is for after chat cleared after this is
export const updateLastMessage=async(data:{senderId:string,receiverId:string})=>{
    try{
        const lastmsg=await lastMessage.findOne({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ]
        });
        if(!lastmsg){
            return;
        }
        lastmsg.clearBy.push(data.senderId);
        await lastmsg.save();
    }catch(err){
        throw new Error("something went wrong");
    }
}