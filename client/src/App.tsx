import { Routes, Route, Outlet } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useEffect } from 'react';
import { socket } from './utils/socket';
import { Stories } from './components/Stories/stories';
import { GroupChat } from './pages/Chat/groupChatPage';
import { ChannelChat } from './pages/Chat/channelChat';
import { NearByChat } from './pages/Chat/NearByChat';
import { Docs } from './pages/Chat/Docs';
import { ChatWithAi } from './components/ChatWithAi/ChatWithAi';
import { ShowAllUser } from './hooks/usechat.hooks';
// NOTE: apne project ke hisaab se is import ka path sahi kar lena (jahan CallProvider file rakhi ha)
import { CallProvider } from './components/CallProvider/CallProvider';
import "./App.css";

const RegisterPage=lazy(()=>import("./pages/Auth/signup"));
const Login=lazy(()=>import("./pages/Auth/login"));
const HomePage=lazy(()=>import("./pages/HomePage/HomePage"));
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

// NAYA — login ke baad wale saare pages (chat, group, docs, story...) is layout ke andar aate hain.
// CallProvider yahan ek hi baar mount hota ha, isliye:
//  1) kisi bhi page pe incoming call dikhega
//  2) ek page se dusre page pe jaane par call kategi nahi
const CallLayout = () => {
  const { userData } = ShowAllUser();
  const userId = userData?.loginUserId;

  // user kisi bhi page pe ho, server ko batao ki wo online ha (pehle ye sirf ChatListPage karta tha)
  useEffect(() => {
    if (!userId) return;

    const announce = () => {
      socket.emit("join", userId);
      socket.emit("user_online", { userId });
    };

    announce();
    socket.on("connect", announce); // reconnect pe bhi

    return () => {
      socket.off("connect", announce);
    };
  }, [userId]);

  // userId abhi load nahi hua toh pages waise hi chalen jaise pehle chalte the
  if (!userId) return <Outlet />;

  return (
    <CallProvider userId={userId}>
      <Outlet />
    </CallProvider>
  );
};


function App() {

  useEffect(()=>{
    if(!socket.connected){
      socket.connect();
    }
    return()=>{
      socket.disconnect();
    }
  },[]);
  return (
    <>
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path='/signup' element={<RegisterPage/>}></Route>
        <Route path='/login' element={<Login/>}></Route>
        <Route path='/' element={<HomePage />}></Route>

        {/* login ke baad wale pages — sab CallProvider ke andar */}
        <Route element={<CallLayout />}>
          <Route path='/chat' element={<ChatLayout />}></Route>
          <Route path='/story' element={<Stories />}></Route>
          <Route path='/group' element={<GroupChat />}></Route>
          <Route path='/channel' element={<ChannelChat />}></Route>
          <Route path='/NearByChats' element={<NearByChat />}></Route>
          <Route path='/docs' element={<Docs />}></Route>
          <Route path='/AiChat' element={<ChatWithAi />}></Route>
        </Route>
      </Routes>
      </Suspense>
    </>
  )
}

export default App