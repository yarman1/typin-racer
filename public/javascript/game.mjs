import { addClass, removeClass } from "./helpers/domHelper.mjs";
import { showInputModal, showMessageModal, showResultsModal } from "./views/modal.mjs";
import { appendRoomElement, removeRoomElement, updateNumberOfUsersInRoom } from "./views/room.mjs";
import { appendUserElement, changeReadyStatus, removeUserElement, setProgress } from "./views/user.mjs";

const createRoomBtn = document.getElementById('add-room-btn');
const quitBtn = document.getElementById('quit-room-btn');
const readyBtn = document.getElementById('ready-btn');

const textContainer = document.getElementById('text-container');
const gameTimer = document.getElementById('game-timer');
const gameTimerSeconds = document.getElementById('game-timer-seconds');
const timer = document.getElementById('timer');

let gameInterval = null;
let gameTimeOut = null;

const username = sessionStorage.getItem('username');
let currentRoom = '';

if (!username) {
	window.location.replace('/login');
}

const socket = io('', { query: { username } });

socket.on('EXISTING_USER', showMessageModal.bind(null, {
	message: 'This user already exist!',
	onClose: () => {
		sessionStorage.removeItem('username');
		window.location.replace('/login');
	}
}));

socket.on('SHOW_MESSAGE', showMessageModal);

socket.on('RENDER_ROOMS', (roomsData) => {
	const roomContainer = document.getElementById('rooms-wrapper');
	roomContainer.innerHTML = '';

	for (const room of (new Map(roomsData))) {
		if (!room[1].hidden) {
			appendRoomElement({
				name: room[0],
				numberOfUsers: room[1].players.length,
				onJoin: () => {
					socket.emit('JOIN_ROOM', room[0]);
					currentRoom = room[0];
				}
			});
		}
	}
});

socket.on('UPDATE_USERS_NUMBER', (name, numberOfUsers) => {
	updateNumberOfUsersInRoom({ name, numberOfUsers });
})

const roomUpdater = ({ roomOccupationArr }) => {
	const usersWrapper = document.getElementById('users-wrapper');
	usersWrapper.innerHTML = '';

	const usernameCurrent = username;

	for (const player of roomOccupationArr) {
		const username = player.name;
		const ready = player.isReady;

		const isCurrentUser = username === usernameCurrent ? true : false;
		appendUserElement({ username, ready, isCurrentUser });
	}
}

const pageReplacer = (toGame = false, name = null) => {
	const roomsPage = document.getElementById('rooms-page');
	const gamePage = document.getElementById('game-page');

	if (toGame) {
		const roomName = document.getElementById('room-name');
		roomName.innerText = name;

		addClass(roomsPage, 'display-none');
		removeClass(gamePage, 'display-none');
	} else {
		addClass(gamePage, 'display-none');
		removeClass(roomsPage, 'display-none');
	}
	
};

quitBtn.addEventListener('click', () => {
	socket.emit('EXIT', currentRoom);
	currentRoom = '';
	pageReplacer();
});

socket.on('REMOVE_FROM_ROOM', removeUserElement);
socket.on('ADD_TO_ROOM', appendUserElement);
socket.on('CHANGE_READY_STATUS', changeReadyStatus);

socket.on('JOIN_ROOM_DONE', pageReplacer);
socket.on('UPDATE_ROOM', roomUpdater);

createRoomBtn.addEventListener('click', () => {
	showInputModal({
		title: 'Input the name of the room',
		onSubmit: (name) => {
			socket.emit('CREATE_ROOM', name);
			currentRoom = name;
		}
	});
});

readyBtn.addEventListener('click', () => {
	socket.emit('CHANGE_READINESS', currentRoom);
	const currentReadiness = readyBtn.innerText;
	readyBtn.innerText = currentReadiness === 'READY' ? 'NOT READY' : 'READY';
});

const getText = async (textIndex) => {
	const url = `http://localhost:3002/game/texts/${textIndex}`;

	const responce = await fetch(url);
  const result = await responce.json();
  return result.text;
};

socket.on('SET_PROGRESS', setProgress);

socket.on('START_TIMER', (timeBefore, gameTime, textIndex) => {

	let textCopy = '';
	let letterIndex = 0;

	const keydownFunc = (e) => {
		if (e.key === textCopy[letterIndex]) {
			letterIndex++;

			textContainer.innerHTML =  "<span class='user-progress-text'>" + textCopy.substring(0,letterIndex)  + "</span>" +
				"<span class='user-progress-next'>" + textCopy.substring(letterIndex, letterIndex + 1) + "</span>" +
				textCopy.substring(letterIndex + 1, textCopy.length);

			socket.emit('SET_ME_PROGRESS', Math.floor((letterIndex * 100) / textCopy.length), currentRoom);
		}
	};

	addClass(readyBtn, 'display-none');
	addClass(quitBtn, 'display-none');

	removeClass(timer, 'display-none');
	timer.innerText = timeBefore;
	gameTimerSeconds.innerText = gameTime;
	
	let timeIterator = timeBefore;
	let gameTimeIterator = gameTime;
	const intervalBefore = setInterval(() => {
		timer.innerText = timeIterator - 1;
		timeIterator--;
	}, 1000);

	getText(textIndex).then((data) => {
		textContainer.innerHTML = "<span class='user-progress-next'>" + data.substring(0, 1) + "</span>" +
			data.substring(1, data.length);

		textCopy = data;
	});

	

	setTimeout(() => {
		clearInterval(intervalBefore);
		addClass(timer, 'display-none');

		removeClass(textContainer, 'display-none');
		removeClass(gameTimer, 'display-none');
	
		document.addEventListener('keydown', keydownFunc);

		gameInterval = setInterval(() => {
			gameTimerSeconds.innerText = gameTimeIterator - 1;
			gameTimeIterator--;
		}, 1000);

		gameTimeOut = setTimeout(() => {
			clearInterval(gameInterval);
			document.removeEventListener('keydown', keydownFunc);
			console.log('jreafajrnf');
			if (!(letterIndex === textCopy.length)) {
				socket.emit('END_TIME', letterIndex, currentRoom);
			}
		}, gameTime * 1000)

	}, timeBefore * 1000);

});

socket.on('END_GAME', (winners) => {
	clearInterval(gameInterval);
	clearTimeout(gameTimeOut);
	showResultsModal({
		usersSortedArray: winners,
		onClose: () => {

		}
	});
	socket.emit('RESTART_ROOM', currentRoom);
})

socket.on('UPDATE_AFTER_RESTART', (playersArr) => {
	roomUpdater({
		roomOccupationArr: playersArr,
	});
	addClass(timer, 'display-none');
	addClass(textContainer, 'display-none');
	addClass(gameTimer, 'display-none');

	removeClass(readyBtn, 'display-none');
	readyBtn.innerText = 'READY';
	removeClass(quitBtn, 'display-none');

})
