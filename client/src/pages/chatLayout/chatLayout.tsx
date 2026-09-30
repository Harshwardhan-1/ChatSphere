import { useState } from "react";
import ChatListPage from "../ChatList/ChatListPage";
import ChatPage from "../Chat/chatPage";
import { ShowAllUser } from "../../hooks/usechat.hooks";
import { CallProvider } from "../../components/CallProvider/CallProvider";
import "./ChatLayout.css";

interface User {
  _id: string;
  name: string;
  email: string;
}

const ChatLayout = () => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { userData } = ShowAllUser();

  return (
    <CallProvider userId={userData?.loginUserId ?? ""}>
      <div className="chatLayout">

        <div className="leftPanel">
          <ChatListPage
            selectedUser={selectedUser}
            setSelectedUser={setSelectedUser}
          />
        </div>

        <div className="rightPanel">
          {selectedUser ? (
            <ChatPage
              data={selectedUser}
              data2={userData!}
            />
          ) : (
            <div className="right_side">
              <img src="/WhatsApp.svg" alt="" />
              <p>Select a chat to start messaging</p>
            </div>
          )}
        </div>

      </div>
    </CallProvider>
  );
};

export default ChatLayout;