import { exit } from 'process';
import { Socket } from 'socket.io';
import { MAXIMUM_USERS_FOR_ONE_ROOM, SECONDS_FOR_GAME, SECONDS_TIMER_BEFORE_START_GAME } from "./config";

interface playerState {
  name: string;
  isReady: boolean;
}

interface roomState {
  hidden: boolean;
  game: boolean;
  players: playerState[];
  winners: string[];
  endTimers: [string, number][];
}

interface playerToRoom {
  name: string;
  room: string;
}

const onlineUsers: Set<string> = new Set(); 

const rooms: string[] = [];
const roomsOccupation: Map<string, roomState> = new Map(rooms.map(roomId => [roomId, {
  hidden: false,
  players: [],
  game: false,
  winners: [],
  endTimers: [],
}]));
const playerToRoom: playerToRoom[] = [];

const getCurrentRoomId = socket => Object.keys(socket.rooms).find(roomId => roomsOccupation.has(roomId));

export default (socket: Socket) => {
  let currentRoom = '';

  const usernameCurrent = socket.handshake.query.username as string;
  if (onlineUsers.has(usernameCurrent)) {
    socket.emit('EXISTING_USER');
  }
  onlineUsers.add(usernameCurrent);

  socket.on('disconnect', () => {
    if (playerToRoom?.find((player) => usernameCurrent === player.name)) {
      exitFromRoom('', true);
    }
    onlineUsers.delete(usernameCurrent);
  });

  socket.emit('RENDER_ROOMS', Array.from(roomsOccupation));

  socket.on('JOIN_ROOM', roomName => {
    playerToRoom.push({
      name: usernameCurrent,
      room: roomName,
    });

    const currentRoomState = roomsOccupation.get(roomName) as roomState;
    const currentPlayers = currentRoomState.players as playerState[];
    const newPlayerNumber  = currentPlayers.length + 1;

    currentRoomState.players.push({
      name: usernameCurrent,
      isReady: false,
    });

    if (newPlayerNumber === MAXIMUM_USERS_FOR_ONE_ROOM) {
      currentRoomState.hidden = true;
      roomsOccupation.set(roomName, currentRoomState);
      socket.broadcast.emit('RENDER_ROOMS', Array.from(roomsOccupation));
    } else {
      roomsOccupation.set(roomName, currentRoomState);
      socket.broadcast.emit('UPDATE_USERS_NUMBER', roomName, newPlayerNumber);
    }

    socket.join(roomName);

    const roomOccupationArr = roomsOccupation.get(roomName)?.players;
    socket.emit('JOIN_ROOM_DONE', true, roomName);
    socket.emit('UPDATE_ROOM', { roomOccupationArr });
    socket.to(roomName).emit('ADD_TO_ROOM', {
      username: usernameCurrent,
      ready: false,
    });
  });

  const exitFromRoom = (roomName: string, disconnect = false) => {
    if (!roomName) {
      const player = playerToRoom.find((player) => player.name === usernameCurrent) as playerToRoom;
      roomName = player.room;
    }
    const currentRoomState = roomsOccupation.get(roomName) as roomState;
    const roomOccupationArr = currentRoomState.players.filter((player) => player.name !== usernameCurrent) as playerState[];

    currentRoomState.players = roomOccupationArr;
    if (currentRoomState.winners.includes(usernameCurrent)) {
      const index = currentRoomState.winners.indexOf(usernameCurrent);
      currentRoomState.winners.splice(index, 1); 
    }

    if (roomOccupationArr.length === 0) {
      roomsOccupation.delete(roomName);
      socket.leave(roomName);
      socket.broadcast.emit('RENDER_ROOMS', Array.from(roomsOccupation));
    } else {
      if (roomOccupationArr.length === MAXIMUM_USERS_FOR_ONE_ROOM - 1) {
        currentRoomState.hidden = false;
        roomsOccupation.set(roomName, currentRoomState);
        socket.broadcast.emit('RENDER_ROOMS', Array.from(roomsOccupation));
      } else {
        roomsOccupation.set(roomName, currentRoomState);
        socket.broadcast.emit('UPDATE_USERS_NUMBER', roomName, roomOccupationArr.length);
      }
      socket.leave(roomName);
      const playerIndex = playerToRoom.findIndex((player) => player.name === usernameCurrent);
      playerToRoom.splice(playerIndex, 1);
      socket.to(roomName).emit('REMOVE_FROM_ROOM', usernameCurrent);
    }
    if (!disconnect) {
      socket.emit('RENDER_ROOMS', Array.from(roomsOccupation));
    }

    if (!currentRoomState.game) {
      checkReadiness(roomName);
    }
  };

  const checkReadiness = (roomName: string) => {
    const roomState = roomsOccupation.get(roomName) as roomState;
    const isNotReady = roomState.players.filter((player) => !player.isReady);

    if (isNotReady.length == 0 && roomState.players.length > 1) {
      roomState.game = true;
      roomState.hidden = true;
      roomsOccupation.delete(roomName);
      roomsOccupation.set(roomName, roomState);

      socket.broadcast.emit('RENDER_ROOMS', Array.from(roomsOccupation));
      socket.emit('RENDER_ROOMS', Array.from(roomsOccupation));

      const randomTextIndex = Math.floor(Math.random() * 7);

      socket.emit('START_TIMER', SECONDS_TIMER_BEFORE_START_GAME, SECONDS_FOR_GAME, randomTextIndex);
      socket.to(roomName).emit('START_TIMER', SECONDS_TIMER_BEFORE_START_GAME, SECONDS_FOR_GAME, randomTextIndex);
    }
  };

  socket.on('EXIT', exitFromRoom); 

  socket.on('CREATE_ROOM', (roomName: string) => {

    if (roomsOccupation.has(roomName)) {
      const message: string = 'There is room with this name!';
      socket.emit('SHOW_MESSAGE', { message });
      return;
    }

    playerToRoom.push({
      name: usernameCurrent,
      room: roomName,
    })

    const currentRoomState: roomState = {
      hidden: false,
      game: false,
      winners: [],
      endTimers: [],
      players: [{
        name: usernameCurrent,
        isReady: false,
      }]
    }

    roomsOccupation.set(roomName, currentRoomState);
    socket.join(roomName);

    const roomOccupationArr = roomsOccupation.get(roomName)?.players;
    socket.emit('JOIN_ROOM_DONE', true, roomName);
    socket.emit('UPDATE_ROOM', { roomOccupationArr });
    socket.emit('RENDER_ROOMS', Array.from(roomsOccupation));
    socket.broadcast.emit('RENDER_ROOMS', Array.from(roomsOccupation));
  });

  socket.on('CHANGE_READINESS', (roomName: string) => {
    const roomState = roomsOccupation.get(roomName) as roomState;
    const playerIndex = roomState.players.findIndex((player) => player.name === usernameCurrent) as number;
    const player = roomState.players[playerIndex] as playerState;

    if (player.isReady) {
      player.isReady = false;
    } else {
      player.isReady = true;
    }

    roomState.players.splice(playerIndex, 1, player);
    roomsOccupation.delete(roomName);
    roomsOccupation.set(roomName, roomState);

    socket.to(roomName).emit('CHANGE_READY_STATUS', {
      username: usernameCurrent,
      ready: player.isReady,
    });
    socket.emit('CHANGE_READY_STATUS', {
      username: usernameCurrent,
      ready: player.isReady,
    });

    checkReadiness(roomName);
  });

  socket.on('SET_ME_PROGRESS', (progress: number, roomName: string) => {
    if (progress === 100) {
      const roomState = roomsOccupation.get(roomName) as roomState;
      roomState.winners.push(usernameCurrent);
      roomsOccupation.set(roomName, roomState);
      if (roomState.winners.length === roomState.players.length) {
        socket.emit('END_GAME', roomState.winners);
        socket.to(roomName).emit('END_GAME', roomState.winners);
      }
    }
    socket.emit('SET_PROGRESS', {
      username: usernameCurrent,
      progress,
    });

    socket.to(roomName).emit('SET_PROGRESS', {
      username: usernameCurrent,
      progress,
    });
  });

  socket.on('END_TIME', (progress: number, roomName: string) => {
    const roomState = roomsOccupation.get(roomName) as roomState;
    roomState.endTimers.push([usernameCurrent, progress]);
    roomsOccupation.set(roomName, roomState);
    if (roomState.endTimers.length === roomState.players.length - roomState.winners.length) {
      const rest = roomState.endTimers.sort((a, b) => b[1] - a[1]).map((tuple) => tuple[0]);

      roomState.winners = roomState.winners.concat(rest);

      socket.emit('END_GAME', roomState.winners);
      socket.to(roomName).emit('END_GAME', roomState.winners);
    }

  });

  socket.on('RESTART_ROOM', (roomName: string) => {
    const roomState = roomsOccupation.get(roomName) as roomState;

    const indexWin = roomState.winners.indexOf(usernameCurrent);
    roomState.winners.splice(indexWin, 1);

    const playerIndex = roomState.players.findIndex((player) => player.name === usernameCurrent) as number;
    const player = roomState.players[playerIndex] as playerState;
    player.isReady = false;
    roomState.players.splice(playerIndex, 1, player);
    roomsOccupation.delete(roomName);

    if (roomState.players.length !== MAXIMUM_USERS_FOR_ONE_ROOM) {
      roomState.hidden = false;
    }

    roomState.game = false;

    roomsOccupation.set(roomName, roomState);

    if (roomState.winners.length === 0) {
      socket.emit('UPDATE_AFTER_RESTART', roomState.players);
      socket.to(roomName).emit('UPDATE_AFTER_RESTART', roomState.players);
    }
  })

};
