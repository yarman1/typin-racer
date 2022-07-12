import { Router } from 'express';
import path from 'path';
import { HTML_FILES_PATH } from '../config';
import { texts } from '../data';

const router = Router();

router.get('/', (req, res) => {
	const page = path.join(HTML_FILES_PATH, 'game.html');
	res.sendFile(page);
});

router.get('/texts/:id', (req, res) => {
	const id = req.params.id;
	const result = texts[id];
	res.send({
		text: result,
	});
});

export default router;
