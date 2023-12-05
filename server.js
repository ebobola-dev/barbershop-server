const express = require('express')
const {
	Pool
} = require('pg')
const config = require('./config')

const port = 3000

const app = express()
app.use(express.json())

const pool = new Pool({
	host: 'localhost',
	user: 'postgres',
	password: config.database_password,
	database: 'barbershop',
})

//* Получить все виды услуг
app.get('/services', async (req, res) => {
	try {
		const query_result = await pool.query('select * from services')
		res.json(query_result.rows)
	} catch (err) {
		console.log(err)
		res.status(500).send('Ошибка')
	}
})

//* Получить возможное время на запись на услугу (Не доделано)
app.get('/availability', async (req, res) => {
	try {
		const { service_id, date } = req.query
		console.log(service_id, date)
		res.status(501).send('Not implemented')
	} catch (err) {
		console.log(err)
		res.status(500).send('Ошибка')
	}
})

//* Записаться на услугу
app.post('/register_record', async (req, res) => {
	try {
		const {
			service_id,
			datetime
		} = req.body

		if (!service_id || !datetime) {
			//? Если пользователь при запросе не указал услугу или время, отклоняем запрос
			res.status(400).send('Id услуги или время не указано')
			return
		}

		//? Ищем услугу по id, который прислал пользователь
		const service_query_result = await pool.query('select * from services where id=$1', [service_id])
		if (service_query_result.rows.length == 0) {
			//? Если услуги с указанным id нет, отклоняем запрос
			res.status(400).send('Услуга с указанным id не найдена')
			return
		}
		const service = service_query_result.rows[0]

		//? Проверяем не стоит ли уже запись в это время (ищем запись с таким же временем)
		const record_query_result = await pool.query('select count(*) from records where datetime=$1', [datetime])
		if (record_query_result.rows[0].count > 0) {
			//? Если запись с таким же временем уже есть, отклоняем запрос
			res.status(400).send('В указанное время уже стоит запись')
			return
		}

		//? Добавляем запись в БД
		const query_result = await pool.query('insert into records(service_id, datetime) values($1, $2) returning datetime', [service_id, datetime])

		const dt = query_result.rows[0].datetime
		res.send(`Вы успешно записаны на '${service.name}' ${dt.getDate()}.${dt.getMonth() + 1} в ${dt.getHours()}:${dt.getMinutes()}`)
	} catch (err) {
		console.log(err)
		res.status(500).send('Ошибка')
	}
})

app.listen(port, () => {
	console.log(`Сервер запущен на порту: ${port}`)
})