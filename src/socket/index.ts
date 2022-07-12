import { Server } from 'socket.io';
import * as config from './config';
import rooms from './rooms'; 

export default (io: Server) => {
	io.on('connection', socket => {

		rooms(socket);
	});
};
