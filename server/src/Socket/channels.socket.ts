import { Socket, Server } from 'socket.io';
import {
  create_channel,
  deleteChannel,
  showRandomChannels,
  allUserChannel,
  toggleFollow,
  hideFromUserScreen,
  categoryData,
  canSendMessage,
  profileInfo,
  updateChannelProfilePic,
  editChannelName,
  allMedia,
  channelDocs,
  channelLinks,
  muteNotification,
  MuteToggle,
} from '../controllers/channels.management.controller';
import {
  allPrevMessage,
  checkFollowing,
  createMsg,
  delete_msg_from_me,
  deleteMsg,
  msgEditted,
  updateFollowersCount,
} from '../controllers/channels.message.controller';
import {
  createChannelPole,
  getChannelPoll,
  toggleLike,
  toggleLikeMultiple,
} from '../controllers/channels.message.controller';

import { getAllChannelLastMessageStored } from '../controllers/channels.message.controller';
import { allPendingChannelMessage } from '../controllers/channels.message.controller';
import { userOpenChannelPage } from '../controllers/channels.message.controller';
import { reaction } from '../controllers/channels.message.controller';
import { channelDescription } from '../controllers/channels.management.controller';

export const channelsSocket = async (
  socket: Socket,
  io: Server,
  users: { [key: string]: string },
  activeChats: Record<string, string>,
  activeChannels: Record<string, string>
) => {
  try {
    socket.on('create_channel', async (data) => {
      try {
        await create_channel(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channels_error', error);
      }
    });
    socket.on(
      'delete_channel',
      async (data: { _id: string; senderId: string }) => {
        try {
          await deleteChannel(data, socket, io, users);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown Error';
          socket.emit('channels_error', error);
        }
      }
    );

    socket.on('random_channels', async (senderId: string) => {
      try {
        await showRandomChannels({ senderId }, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channels_error', error);
      }
    });

    socket.on('all_user_channel', async (senderId: string) => {
      try {
        await allUserChannel({ senderId }, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channels_error', error);
      }
    });

    socket.on('toggle_channel_follow', async (data) => {
      try {
        await toggleFollow(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channels_error', error);
      }
    });

    socket.on('hide_channel', async (data) => {
      try {
        await hideFromUserScreen(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channels_error', error);
      }
    });

    socket.on('category_data', async (data) => {
      try {
        await categoryData(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channels_error', error);
      }
    });

    socket.on('can_send_message', async (data) => {
      try {
        await canSendMessage(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    //messages

    socket.on('all_prev_msg', async (data) => {
      try {
        await allPrevMessage(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('channel_msg_creation', async (data) => {
      try {
        await createMsg(data, socket, io, users, activeChannels);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('delete_channel_msg_permanently', async (data) => {
      try {
        await deleteMsg(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('delete_channel_msg_from_me', async (data) => {
      try {
        await delete_msg_from_me(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('edit_channel_msg', async (data) => {
      try {
        await msgEditted(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('get_channel_last_message_stored', async (senderId: string) => {
      try {
        await getAllChannelLastMessageStored({ senderId }, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    // pehli baar mount hote hi sab followed channels ka pending count bhejna
    socket.on('all_pending_channel_messages', async (senderId: string) => {
      try {
        await allPendingChannelMessage({ senderId }, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    // user ne channel chat khola - uska count zero karna hai (seenBy mark + fresh counts bhejna)
    socket.on(
      'user_open_channel_chat',
      async (data: { channelId: string; senderId: string }) => {
        try {
          await userOpenChannelPage(data, socket);
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown Error';
          socket.emit('channel_error', error);
        }
      }
    );

    socket.on('channel_reaction', async (data) => {
      try {
        await reaction(data, socket, io, users, activeChannels);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('_isFollowing', async (data) => {
      try {
        await checkFollowing(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('update_channel_followers_list', async (data) => {
      try {
        await updateFollowersCount(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    //channel profile
    //now channel profile data to show to user in real time

    socket.on('channel_profile_info', async (data) => {
      try {
        await profileInfo(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('mute_notification_info', async (data) => {
      try {
        await muteNotification(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('mute_toggle', async (data) => {
      try {
        await MuteToggle(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('edit_channel_description', async (data) => {
      try {
        await channelDescription(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('edit_channel_profile_pic', async (data) => {
      try {
        await updateChannelProfilePic(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('edit_channel_name', async (data) => {
      try {
        await editChannelName(data, socket, io, users);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    //media links docs
    socket.on('all_channel_media', async (data) => {
      try {
        await allMedia(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('all_channel_docs', async (data) => {
      try {
        await channelDocs(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('all_channel_links', async (data) => {
      try {
        await channelLinks(data, socket);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown Error';
        socket.emit('channel_error', error);
      }
    });

    socket.on('create_channel_poll', async (data) => {
      try {
        await createChannelPole(data, socket, io, users, activeChannels);
      } catch (err) {
        socket.emit(
          'channel_error',
          err instanceof Error ? err.message : 'Unknown Error'
        );
      }
    });
    socket.on('get_channel_poll', async (data) => {
      try {
        await getChannelPoll(data, socket);
      } catch (err) {
        socket.emit(
          'channel_error',
          err instanceof Error ? err.message : 'Unknown Error'
        );
      }
    });
    socket.on('channel_poll_toggle', async (data) => {
      try {
        await toggleLike(data, socket, io, users, activeChannels);
      } catch (err) {
        socket.emit(
          'channel_error',
          err instanceof Error ? err.message : 'Unknown Error'
        );
      }
    });
    socket.on('channel_poll_toggle_multiple', async (data) => {
      try {
        await toggleLikeMultiple(data, socket, io, users, activeChannels);
      } catch (err) {
        socket.emit(
          'channel_error',
          err instanceof Error ? err.message : 'Unknown Error'
        );
      }
    });
  } catch (err) {
    throw err;
  }
};
