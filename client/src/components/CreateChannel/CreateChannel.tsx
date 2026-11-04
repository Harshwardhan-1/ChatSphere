import { useState } from "react";
import { showApiError } from "../../utils/showApiError";
import axiosInstance from "../../services/axiosInstance";
import { env } from "../../configs/env.config";
import { socket } from "../../utils/socket";
import "./CreateChannel.css";

interface Props {
    onBack: () => void;
    senderId: string;
}

export function CreateChannel({ onBack, senderId }: Props) {
    const [name, setName] = useState<string>("");
    const [description, setDescription] = useState<string>("");
    const [profilePic, setProfilePic] = useState<string>("");
    const [category, setCategory] = useState<string>("other");
    const [uploading, setUploading] = useState<boolean>(false);

    const avatarSrc = profilePic ? `${env.backendUrl}${profilePic}` : "/default.webp";

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append("file", selected);
            // this is basically channel image, just path is different
            const res = await axiosInstance.post("/groupImage", formData);
            if (res.data.success) {
                console.log(res.data.data);
                setProfilePic(res.data.data.path);
            }
        } catch (err) {
            showApiError(err);
        } finally {
            setUploading(false);
        }
    };

    const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (name.trim().length<3) {
            alert("channel name must be at least 3 characters");
            return;
        }
        if (description.trim().length<10) {
            alert("description must be at least 10 characters");
            return;
        }
        try {
            socket.emit("create_channel", { name, description, profilePic, category, senderId });
        } catch (err) {
            showApiError(err);
        }
    };

    return (
        <div className="create-channel-panel">
            <div className="create-channel-header">
                <button className="create-channel-back" onClick={onBack} aria-label="Back" type="button">←</button>
                <h2>New channel</h2>
            </div>

            <form className="create-channel-body" onSubmit={handleCreate}>
                <label className="create-channel-avatar">
                    <img src={avatarSrc} alt="channel avatar" />
                    <span className="create-channel-avatar-edit">📷</span>
                    <input type="file" accept="image/*" onChange={handleFileSelect} hidden />
                </label>
                {uploading && <p className="create-channel-uploading">uploading photo…</p>}

                <div className="create-channel-field">
                    <input type="text" placeholder="Channel name" value={name}
                        onChange={(e)=>setName(e.target.value)}
                        maxLength={100}
                    />
                </div>

                <div className="create-channel-field">
                    <textarea placeholder="Description" value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={100}
                        rows={3}
                    />
                </div>

                <div className="create-channel-field">
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                        <option value="sports">Sports</option>
                        <option value="entertainment">Entertainment</option>
                        <option value="technology">Technology</option>
                        <option value="news">News</option>
                        <option value="education">Education</option>
                        <option value="business">Business</option>
                        <option value="other">Other</option>
                    </select>
                </div>

                <button type="submit" className="create-channel-fab" aria-label="Create channel">✓</button>
            </form>
        </div>
    );
}