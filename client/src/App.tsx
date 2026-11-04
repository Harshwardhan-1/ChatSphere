import { Routes, Route, Outlet } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { socket } from './utils/socket';
import { Stories } from './components/Stories/stories';
import { GroupChat } from './pages/Chat/groupChatPage';
import { ChannelChat } from './pages/Chat/channelChat';
import { NearByChat } from './pages/Chat/NearByChat';
import { Docs } from './pages/Chat/Docs';
import { ChatWithAi } from './components/ChatWithAi/ChatWithAi';
import { ShowAllUser } from './hooks/usechat.hooks';
import { CallProvider } from './components/CallProvider/CallProvider';
import { GroupCallProvider } from './hooks/use.group.call.hook';
import "./App.css";

const RegisterPage = lazy(() => import("./pages/Auth/signup"));
const Login = lazy(() => import("./pages/Auth/login"));
const HomePage = lazy(() => import("./pages/HomePage/HomePage"));
import ChatLayout from './pages/chatLayout/chatLayout';

const LoadingScreen = () => (
  <div className="ap-loading-container">
    <div className="ap-loading-logo">
      <svg width="72" height="72" viewBox="0 0 22 22" fill="none">
        <rect className="logo-square sq-1" x="2" y="2" width="8" height="8" rx="5" fill="currentColor" />
        <rect className="logo-square sq-2" x="12" y="2" width="8" height="8" rx="2" fill="currentColor" />
        <rect className="logo-square sq-3" x="2" y="12" width="8" height="8" rx="2" fill="currentColor" />
        <rect className="logo-square sq-4" x="12" y="12" width="8" height="8" rx="5" fill="currentColor" />
      </svg>
    </div>
    <p className="ap-loading-text">Loading...</p>
  </div>
);

const CallLayout = () => {
  const { userData } = ShowAllUser();
  const userId = userData?.loginUserId;

  useEffect(() => {
    if (!userId) return;
    const announce = () => {
      socket.emit("join", userId);
      socket.emit("user_online", { userId });
    };
    announce();
    socket.on("connect", announce);
    return () => {
      socket.off("connect", announce);
    };
  }, [userId]);

  if (!userId) return <Outlet />;

  return (
    <CallProvider userId={userId}>
      <GroupCallProvider userId={userId}>
        <Outlet />
      </GroupCallProvider>
    </CallProvider>
  );
};

function App() {
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path='/signup' element={<RegisterPage />} />
          <Route path='/login' element={<Login />} />
          <Route path='/' element={<HomePage />} />
          <Route element={<CallLayout />}>
            <Route path='/chat' element={<ChatLayout />} />
            <Route path='/story' element={<Stories />} />
            <Route path='/group' element={<GroupChat />} />
            <Route path='/channel' element={<ChannelChat />} />
            <Route path='/NearByChats' element={<NearByChat />} />
            <Route path='/docs' element={<Docs />} />
            <Route path='/AiChat' element={<ChatWithAi />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default App;