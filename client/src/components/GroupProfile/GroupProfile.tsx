import {useState,useEffect} from 'react';
import {socket} from '../../utils/socket';
import './GroupProfile.css';
import axiosInstance from '../../services/axiosInstance';
import { GroupSettings } from '../GroupSettings/GroupSettings';
import { env } from '../../configs/env.config';

function resolveFileUrl(fileUrl?: string) {
    if (!fileUrl) return "";
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
    return `${env.backendUrl}${fileUrl.startsWith("/") ? "":"/"}${fileUrl}`;
}

interface prop{
    onBack:()=>void,
    _id:string,
    senderId:string,
    GroupName:string,
    GroupImage?:string
    leavesTheGroup:boolean,
    groupStatus:boolean,
    onNameUpdated?:(name:string)=>void,
    users:any[],
}

//add / remove members modal (shared)
function AddMembersModal({
    users,
    existingMemberIds,
    onCancel,
    onSave,
    mode="add",
    disabledIds=[],
}:{
    users:any[],
    existingMemberIds:string[],
    onCancel:()=>void,
    onSave:(selectedIds:string[])=>void,
    mode?:"add"|"remove",
    disabledIds?:string[],
}){
    const [search,setSearch]=useState("");
    const [selectedIds,setSelectedIds]=useState<string[]>([]);


    const toggleSelect=(userId:string)=>{
        if(mode==="add" && existingMemberIds.includes(userId))return;
        if(disabledIds.includes(userId))return;
        setSelectedIds((prev)=>
            prev.includes(userId) ? prev.filter((id)=>id!==userId) : [...prev,userId]
        );
    };

    const filteredUsers = users?.filter((u:any)=>
        u.name?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="addMembersOverlay">
            <div className="addMembersModal">
                <div className="addMembersHeader">
                    <button className="closeBtn" onClick={onCancel}>✕</button>
                    <h3>{mode==="add" ? "Add member" : "Remove member"}</h3>
                </div>

                <input
                    className="addMembersSearch"
                    type="text"
                    placeholder="Search name, number or @username"
                    value={search}
                    onChange={(e)=>setSearch(e.target.value)}
                />

                <div className="addMembersList">
                    {filteredUsers?.map((u:any)=>{
                        const uid = u._id?.toString();
                        const isExisting = mode==="add" && existingMemberIds.includes(uid);
                        const isSelf = disabledIds.includes(uid);
                        const isLocked = isExisting || isSelf;
                        const isChecked = isExisting || selectedIds.includes(uid);
                        return (
                        <div key={uid} className={`addMembersRow ${isLocked ? "alreadyMember" : ""}`}
                                onClick={()=>toggleSelect(uid)}>
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isLocked}
                                    onChange={()=>toggleSelect(uid)}
                                    onClick={(e)=>e.stopPropagation()}
                                />
                                <div className="addMembersAvatar">
                                    {u.avatar || u.profileImage ? (
                                        <img src={resolveFileUrl(u.avatar || u.profileImage)} alt={u.name} />
                                    ) : (
                                        <span>{u.name?.charAt(0)?.toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="addMembersInfo">
                                    <span className="addMembersName">{u.name}</span>
                                    {isExisting && <span className="alreadyMemberTag">Already in group</span>}
                                    {isSelf && !isExisting && <span className="alreadyMemberTag">You</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="addMembersFooter">
                    <button className="cancelBtn" onClick={onCancel}>Cancel</button>
                    <button
                        className="saveBtn"
                        disabled={selectedIds.length===0}
                        onClick={()=>onSave(selectedIds)}
                    >
                        {mode==="add" ? "Save" : "Remove"}
                    </button>
                </div>
            </div>
        </div>
    );
}
//add/remove members modal end


function ManageAdminModal({
    members,
    currentAdminIds,
    creatorId,
    onCancel,
    onSave,
}:{
    members:any[],
    currentAdminIds:string[],
    creatorId:string,
    onCancel:()=>void,
    onSave:(makeAdmins:string[], removeAdmins:string[])=>void,
}){
    const [search,setSearch]=useState("");
    const [toggledIds,setToggledIds]=useState<string[]>([]);

    const isCurrentlyAdmin = (id:string)=>currentAdminIds.includes(id);
    const isChecked = (id:string)=> toggledIds.includes(id) ? !isCurrentlyAdmin(id) : isCurrentlyAdmin(id);

    const toggle=(id:string)=>{
        if(id===creatorId?.toString())return;
        setToggledIds(prev=> prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id]);
    };

    const filteredMembers = members?.filter((m:any)=>
        m.name?.toLowerCase().includes(search.toLowerCase())
    );

    const handleSave=()=>{
        const makeAdmins:string[]=[];
        const removeAdmins:string[]=[];
        toggledIds.forEach(id=>{
            if(isCurrentlyAdmin(id)) removeAdmins.push(id);
            else makeAdmins.push(id);
        });
        onSave(makeAdmins, removeAdmins);
    };

    return (
        <div className="addMembersOverlay">
            <div className="addMembersModal">
                <div className="addMembersHeader">
                    <button className="closeBtn" onClick={onCancel}>✕</button>
                    <h3>Manage admins</h3>
                </div>

                <input
                    className="addMembersSearch"
                    type="text"
                    placeholder="Search name"
                    value={search}
                    onChange={(e)=>setSearch(e.target.value)}
                />

                <div className="addMembersList">
                    {filteredMembers?.map((m:any)=>{
                        const mid = m._id?.toString();
                        const isCreator = mid === creatorId?.toString();
                        const checked = isCreator || isChecked(mid);
                        return (
                            <div key={mid} className={`addMembersRow ${isCreator ? "alreadyMember" : ""}`}
                                onClick={()=>toggle(mid)}>
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={isCreator}
                                    onChange={()=>toggle(mid)}
                                    onClick={(e)=>e.stopPropagation()}
                                />
                                <div className="addMembersAvatar">
                                    {m.avatar || m.profileImage ? (
                                        <img src={resolveFileUrl(m.avatar || m.profileImage)} alt={m.name} />
                                    ) : (
                                        <span>{m.name?.charAt(0)?.toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="addMembersInfo">
                                    <span className="addMembersName">{m.name}</span>
                                    {isCreator && <span className="alreadyMemberTag">Group creator</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="addMembersFooter">
                    <button className="cancelBtn" onClick={onCancel}>Cancel</button>
                    <button className="saveBtn" disabled={toggledIds.length===0} onClick={handleSave}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}


export function GroupProfile({onBack,_id,senderId,GroupName,GroupImage,leavesTheGroup,groupStatus,onNameUpdated,users}:prop){
    // 👆 isCreator yahan se bhi HATA DI GAYI

    const [permission, setPermission] = useState<any>(null);
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(GroupName);
    const [members, setMembers] = useState<any[]>([]);
    const [canAddMembers,setCanAddMembers]=useState<boolean>(false);
    const [showAddMembersModal,setShowAddMembersModal]=useState(false);
    const [showRemoveMembersModal,setShowRemoveMembersModal]=useState(false);
    const [showManageAdminModal,setShowManageAdminModal]=useState(false);
    const [showGroupSettings,setShowGroupSettings]=useState(false);
    const [removePermission,setRemovePermission]=useState<boolean>(false);
    const [groupCreatorId,setGroupCreatorId]=useState<string>("");
    const [updatedAdmins,setUpdatedAdmins]=useState<any[]>([]);
    const [showQr,setShowQr]=useState<string | null>(null);


    const handleResult=(data:any)=>{
        setPermission(data);
    }

    const handleMembers=(data:any)=>{
        const list = Array.isArray(data) ? data : (data?.members ?? []);
        setMembers(list);
    }

    const handleGroupAdmins=(data:any)=>{
    const admins = data?.admin ?? [];
    setUpdatedAdmins(admins);
    setPermission((prev:any)=>({
        ...(prev ?? {}),
        allAdmin: admins,
    }));
}

    const [image,setImage]=useState(resolveFileUrl(GroupImage));

    useEffect(()=>{
        socket.emit("profile_permission",{_id,senderId});
        socket.emit("all_members",({_id,senderId}));
        socket.on("result",handleResult);
        socket.on("all_group_members",handleMembers);
        socket.emit("add_group_members",({_id,senderId}));
        socket.emit("group_members_remove_permission",{_id,senderId});

        socket.on("all_group_admins",handleGroupAdmins);

        socket.on("group_image_changed",(data:{groupId:string,message:string})=>{
            if(data.groupId===_id){
                setImage(resolveFileUrl(data.message));
            }
        });

        socket.on("group_name_changed",(data:{groupId:string,name:string})=>{
          if(data.groupId === _id){
           setNewName(data.name);
           onNameUpdated?.(data.name);
          }
        });
        socket.on("group_add_permission",(permission:string)=>{
            if(permission==="permission granted"){
            setCanAddMembers(true);
            }else{
                setCanAddMembers(false);
            }
        });
        socket.on("remove_members_permission",(data:{message:string,groupCreatorId:string})=>{
            if(data.message==="permission granted"){
                setRemovePermission(true);
            }
            setGroupCreatorId(data.groupCreatorId);
        });

        socket.on("group_settings_changed",(data:{
    groupId:string,
    canChangeGroupName:boolean,
    canChangeGroupImage:boolean,
    canAddGroupMembers:boolean,
    canRemoveGroupMembers:boolean,
    changeDisappearingMessageSetting:boolean,
    onlyAdminSendMessage:boolean
})=>{
    if(data.groupId===_id){
        // fetchng the latest function when setting changed
        socket.emit("profile_permission",{_id,senderId});
        socket.emit("add_group_members",({_id,senderId}));
        socket.emit("group_members_remove_permission",{_id,senderId});
        socket.emit("is_chat_locked",({_id,senderId}));

    }
});



        return()=>{
            socket.off("result",handleResult);
            socket.off("group_name_changed");
            socket.off("group_image_changed");
            socket.off("all_group_members",handleMembers);
            socket.off("group_add_permission");
            socket.off("group_members_added");
            socket.off("remove_members_permission");
            socket.off("group_admins_updated");
            socket.off("all_group_admins",handleGroupAdmins);
            socket.off("group_settings_changed");
            socket.off("check_can_change");
        }
    },[]);

    const isAdmin = permission?.allAdmin?.some((admin:any)=>admin._id?.toString()===senderId.toString());
    const isCreatorOfGroup = senderId?.toString() === groupCreatorId?.toString();

    const canEditName = !leavesTheGroup && !groupStatus && (permission?.groupNameChangePermission === "can change name" || isAdmin);
    const canEditImage =!leavesTheGroup && !groupStatus && (permission?.GroupImageChangePermission === "can change image" || isAdmin);

    const isMemberAdmin = (memberId: string) =>
        permission?.allAdmin?.some((admin:any)=>admin._id?.toString()===memberId?.toString());

    const handleSaveName = () => {
        if(newName.trim().length < 3 || newName.trim().length > 100){
            alert("Name should be 3-100 characters");
            return;
        }
        socket.emit("can_change_group_name",{_id,senderId,name:newName});
        setEditingName(false);
    }

    const handleCancelName = () => {
        setNewName(GroupName);
        setEditingName(false);
    }


const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;

    try{
        const formData = new FormData();
        formData.append("id", _id);
        formData.append("senderId", senderId);
        formData.append("file", file);

        const res = await axiosInstance.post(`${env.backendUrl}/api/v1/groupImage`, formData);
        if(res.data.success){
            const data = res.data.file ?? res.data.data;
            if(!data?.path){
                console.log("Unexpected response:", res.data);
                return;
            }
            setImage(resolveFileUrl(data.path));
            socket.emit("can_change_group_image", {_id, senderId,message: data.path,mimetype: data.mimetype
            });
        }
    }catch(err){
        console.log(err);
    }
}


const handleAddMembers=()=>{
    setShowAddMembersModal(true);
}

const handleSaveNewMembers=(selectedIds:string[])=>{
    socket.emit("add_new_group_members",({_id,senderId,newMembers:selectedIds}));
     setShowAddMembersModal(false);
}

const handleRemoveMembers=()=>{
    setShowRemoveMembersModal(true);
}

const handleSaveRemovedMembers=(selectedIds:string[])=>{
    socket.emit("removing_group_members",({_id,senderId,removeMembers:selectedIds}));
    setShowRemoveMembersModal(false);
}

const handleManageAdmins=()=>{
    setShowManageAdminModal(true);
}

const handleSaveAdmins=(makeAdmins:string[], removeAdmins:string[])=>{
    socket.emit("manage_group_admins",({_id,senderId,makeAdmins,removeAdmins}));
    setShowManageAdminModal(false);
}

if (showGroupSettings) {
    return (
        <GroupSettings
            onBack={() => setShowGroupSettings(false)}
            _id={_id}
            senderId={senderId}
        />
    );
}




const handleQr=async()=>{
    const response=await axiosInstance.get(`${env.backendUrl}/api/v1/${_id}`);
    if(response.data.success){
        setShowQr(response.data?.qrCode);
    }
}

    return(
        <div className="groupProfilePage">
            <div className="groupProfileTopBar">
                <button className="backArrow" onClick={onBack}>←</button>
            </div>

            <div className="groupProfileHero">
                <div className="groupProfileAvatar">
                <img   src={image || "/default.webp"}  alt="group"
                onError={(e)=>{ (e.target as HTMLImageElement).src = "/default.webp"; }}/>
                <label className={canEditImage ? "editImageOverlay" : "editImageOverlay disabled"}>📷
              <input onChange={handleImageChange} type="file" hidden disabled={!canEditImage} />
              </label>
            </div>

                {editingName ?   (
                    <div className="editNameBox">
                        <input value={newName} onChange={(e)=>setNewName(e.target.value)} autoFocus/>
                        <div className="editNameBtns">
                            <button onClick={handleCancelName}>Cancel</button>
                            <button onClick={handleSaveName}>Save</button>
                        </div>
                    </div>
                ) : (
                    <div className="groupProfileNameRow" onClick={()=>canEditName && setEditingName(true)}>
                        <h2>{newName}</h2>
                        {canEditName  && (
                            <button className="editIcon">✎</button>
                        )}
                    </div>
                )}
            </div>


<div className="groupProfileActions">

<button disabled={groupStatus || leavesTheGroup || !canAddMembers} onClick={handleAddMembers}>Add Members</button>

<button disabled={groupStatus || leavesTheGroup || !removePermission} onClick={handleRemoveMembers}>Remove Members</button>

<button disabled={groupStatus || leavesTheGroup || !isAdmin} onClick={handleManageAdmins}>Manage Admins</button>

   <button disabled={groupStatus || leavesTheGroup || !isCreatorOfGroup} onClick={()=>setShowGroupSettings(true)}>
    ⚙️ Group Settings
</button>

<button disabled={groupStatus || leavesTheGroup || !canAddMembers} onClick={handleQr}>Add Member Via Qr</button>

{showQr && (
    <div className="qrModalOverlay" onClick={() => setShowQr(null)}>
        <div className="qrModalBox" onClick={(e) => e.stopPropagation()}>
            <img src={showQr} alt="Group QR Code" />
            <button onClick={() => setShowQr(null)}>Close</button>

            <button onClick={() => {
            const link = document.createElement("a");
            link.href = showQr;link.download = "group-qr.png";link.click();
}}>
    Download QR
</button>
        </div>
    </div>
)}  
</div>

{showAddMembersModal && (
    <AddMembersModal
        mode="add"
        users={users}
        existingMemberIds={members.map((m:any)=>m._id?.toString())}
        onCancel={()=>setShowAddMembersModal(false)}
        onSave={handleSaveNewMembers}
    />
)}

{showRemoveMembersModal && (
    <AddMembersModal
        mode="remove"
        users={members}
        existingMemberIds={[]}
        disabledIds={
            senderId?.toString()===groupCreatorId?.toString()
                ? [senderId?.toString()]
                : [
                    senderId?.toString(),
                    groupCreatorId?.toString(),
                    ...(permission?.allAdmin ?? []).map((a:any)=>a._id?.toString()),
                  ]
        }
        onCancel={()=>setShowRemoveMembersModal(false)}
        onSave={handleSaveRemovedMembers}
    />
)}


{showManageAdminModal && (
    <ManageAdminModal
        members={members}
        currentAdminIds={(permission?.allAdmin ?? []).map((a:any)=>a._id?.toString())}
        creatorId={groupCreatorId}
        onCancel={()=>setShowManageAdminModal(false)}
        onSave={handleSaveAdmins}
    />
)}


            <div className="groupMembersSection">
                <div className="groupMembersHeader">
                    {members.length} Participant{members.length !== 1 ? "s" : ""}
                </div>

                <div className="groupMembersList">
                    {members.map((member:any) => {
                        const memberId = member._id?.toString();
                        const isYou = memberId === senderId?.toString();
                        const admin = isMemberAdmin(memberId);
                        return (
                            <div key={memberId} className="groupMemberRow">
                                <div className="groupMemberAvatar">
                                    {member.profileImage ? (
                                        <img src={resolveFileUrl(member.profileImage)} alt={member.name} />
                                    ) : (
                                        <span>{member.name?.charAt(0)?.toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="groupMemberInfo">
                                    <span className="groupMemberName">
                                        {isYou ? "You" : member.name}
                                    </span>
                                    {member.about && (
                                        <span className="groupMemberAbout">{member.about}</span>
                                    )}
                                </div>
                                {admin && <span className="adminBadge">Admin</span>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}