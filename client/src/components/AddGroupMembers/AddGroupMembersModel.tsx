import { useState, useMemo } from "react";
import type { ChatUser } from "../../hooks/use.groupChat.hook";
import { groupChatHook } from "../../hooks/use.groupChat.hook";
import "./AddGroupMemberModel.css";
import { useEffect } from "react";
import {socket} from '../../utils/socket';

interface Props {
    users: ChatUser[];
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
    senderId:string,
    onClose: () => void;
}

export function AddGroupMembersModal({ users, selectedIds,senderId, setSelectedIds, onClose }: Props) {

    useEffect(()=>{
        socket.on("msg_emitted",()=>{
            alert("group created successfully");
            onClose();

            return()=>{
                socket.off("msg_emitted");
            }
        });
    },[]);
    const [search, setSearch] = useState("");
    const [groupName, setGroupName] = useState<string>("");
    const {createGroup}=groupChatHook(senderId);

    const filtered = useMemo(() => {
        return users.filter(u => u.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
    }, [users, search]);

    const grouped = useMemo(() => {
        const map: Record<string, ChatUser[]> = {};
        filtered.forEach(u => {
            const letter = u.name[0]?.toUpperCase() || "#";
            if (!map[letter]) map[letter] = [];
            map[letter].push(u);
        });
        return map;
    }, [filtered]);

    const toggleUser = (id: string) => {
        if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(uid => uid !== id));
        else setSelectedIds([...selectedIds, id]);
    };

    const handleCreate=async()=>{
        if(!groupName || groupName.trim().length===0){
            alert("groupName is mandatory");
            return;
        }
        createGroup({groupName,senderId,peoplesId:selectedIds})
        onClose();
    };

    return (
        <div className="agm-overlay" onClick={onClose}>
            <div className="agm-panel" onClick={(e) => e.stopPropagation()}>
                <div className="agm-header">
                    <span className="agm-close" onClick={onClose}>✕</span>
                    <h2>Add group members</h2>
                </div>
                <div className="agm-group-name-wrap">
                    <input className="agm-group-name" type="text" placeholder="Enter group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                </div>
                <div className="agm-search-wrap">
                    <span className="agm-search-icon"></span>
                    <input className="agm-search" type="text" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {selectedIds.length > 0 && <div className="agm-selected-count">{selectedIds.length} selected</div>}
                <div className="agm-list">
                    {Object.keys(grouped).sort().map(letter => (
                        <div key={letter}>
                            <div className="agm-letter">{letter}</div>
                            {grouped[letter].map(user => {
                                const isSelected = selectedIds.includes(user._id);
                                return (
                                    <div key={user._id} className={`agm-user ${isSelected ? "selected" : ""}`} onClick={() => toggleUser(user._id)}>
                                        <div className="agm-avatar-wrap">
                                            {user.avatar ? <img className="agm-avatar" src={user.avatar} alt={user.name} /> : <div className="agm-avatar agm-avatar-fallback">{user.name[0]?.toUpperCase()}</div>}
                                            {isSelected && <span className="agm-check">✓</span>}
                                        </div>
                                        <div className="agm-info">
                                            <span className="agm-name">{user.name}</span>
                                            {user.status && <span className="agm-status">{user.status}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    {filtered.length === 0 && <div className="agm-empty">No contacts found</div>}
                </div>
                <div className="agm-footer">
                    <button className="agm-create-btn" onClick={handleCreate}>Create</button>
                </div>
            </div>
        </div>
    );
}