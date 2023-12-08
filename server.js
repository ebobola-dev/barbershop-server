const express = require('express')
const {
	Pool
} = require('pg')
const config = require('./config')
const { register_test_records, write_services } = require('./functions')

const port = 3000

const app = express()
app.use(express.json())

const pool = new Pool({
	host: 'localhost',
	user: 'postgres',
	password: config.database_password,
	database: 'barbershop',
})

//? Получить из объекта Date только дату (2020-10-10)
function getStringDate(date) {
	const year = date.getFullYear();
	let month = date.getMonth() + 1;
	let day = date.getDate();

	if (day < 10) day = '0' + day;
	if (month < 10) month = '0' + month;

	return `${year}-${month}-${day}`
}

//? Получить из объекта Date только время (12:30)
function getStringTime(date) {
	return date.toTimeString().split(' ')[0].slice(0, 5)
}

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

//* Получить возможное время на запись на услугу
//! Не доделано
app.get('/availability', async (req, res) => {
	try {
		const {
			service_id,
			iso_date
		} = req.query
		if (!service_id || !iso_date) {
			//? Если пользователь при запросе не указал услугу или дату, отклоняем запрос
			res.status(400).send('Id услуги или дата не указаны')
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

		date = new Date(iso_date)
		const string_date = getStringDate(date)
		const start_time_of_work = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9) //? Начало рабочего дня (9:00)
		const end_time_of_work = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18) //? Конец рабочего дня (18:00)
		let result = {
			'date': string_date,
			'times': []
		}

		//? Получаем все записи в указанный день
		const record_query_result = await pool.query(`select * from records join services on records.service_id = services.id where datetime::date = date '${string_date}' order by datetime asc`)
		const records = record_query_result.rows

		console.log(`\nПроверка доступности на ${string_date}, услуга: ${service.name} (${service.duration} мин), записей в этот день: ${records.length}`)
		if (records.length == 0) {
			//? Если записей в этот день нет, говорим что весь день свободный, учитывая что мастер должен успеть до 18:00
			console.log('Весь день свободный')


			let last_time_to_record = new Date(end_time_of_work.getTime() - service.duration * 60000)
			console.log(`Последнее доступное время записи: ${getStringTime(last_time_to_record)}`)

			//? Заполняем массивчик с временами, начиная с 9:00
			//? Кидаем в массив 9:00
			let temp_date = new Date(date)
			temp_date.setHours(9)
			result.times.push(getStringTime(temp_date))

			//? Прибавляем к temp_date 10 минут, до тех пор пока temp_date не будет равен last_time_to_record
			while (temp_date.getTime() !== last_time_to_record.getTime()) {
				temp_date = new Date(temp_date.getTime() + 10 * 60000)
				result.times.push(getStringTime(temp_date))
			}
			res.json(result)
			return
		}

		//? Проверяем промежуток между начало рабочего дня и первой записью
		console.log(`\nПервая запись в ${getStringTime(records[0].datetime)}`)
		const first_record_diff = (records[0].datetime.getTime() - start_time_of_work) / (1000 * 60)
		console.log(`Промежуток в начале дня: ${first_record_diff} мин`)

		//? Если промежуток больше, чем длительность услуги + 10 мин отдыха до и после, то можем записать в этот промежуток
		if (first_record_diff >= service.duration + 20) {
			console.log('Можем записать в промежуток в начале дня')
			const temp_first_record_time = new Date(records[0].datetime)
			let last_time_to_record = new Date(temp_first_record_time.getTime() - service.duration * 60000 - 10 * 60000) //? Последнее время для записи (перед первой записью)
			console.log(`Доступное время для записи в начале дня: 9:00 - ${getStringTime(last_time_to_record)}`)

			let temp_date = new Date(date)
			temp_date.setHours(9)
			result.times.push(getStringTime(temp_date))

			//? Прибавляем к temp_date 10 минут, до тех пор пока temp_date не будет равен last_time_to_record
			while (temp_date.getTime() !== last_time_to_record.getTime()) {
				temp_date = new Date(temp_date.getTime() + 10 * 60000)
				result.times.push(getStringTime(temp_date))
			}
			console.log(result.times)
		} else {
			console.log('В начале дня записать нельзя')
		}

		//? Если запись всего одна, то надо проверить только промежутки до и после
		if (records.length > 1) {
			//? Проверяем промежутки между записями
			for (let i = 1; i < records.length; i++) {
				const prev_record = records[i - 1]
				const curr_record = records[i]
				console.log(`\nПроверка записей: ${getStringTime(prev_record.datetime)}(${prev_record.duration} мин) <-> ${getStringTime(curr_record.datetime)}(${curr_record.duration} мин)`)
				const diff_time = (curr_record.datetime.getTime() - prev_record.datetime.getTime()) / (1000 * 60)
				console.log(`Промежуток: ${diff_time} мин`)
				console.log(`Учитывая первую запись и отдых после неё: ${diff_time - prev_record.duration - 10} мин`)
				if (diff_time >= service.duration + prev_record.duration + 20) {
					const start_time = new Date(prev_record.datetime.getTime() + prev_record.duration * 60000 + 10 * 60000)
					let last_time = new Date(curr_record.datetime.getTime() - service.duration * 60000 - 10 * 60000)
					if (start_time.getTime() == last_time.getTime()) {
						console.log(`Можем записать на ${getStringTime(start_time)}`)
						result.times.push(getStringTime(start_time))
					} else {
						console.log(`Можем записать в промежуток, c ${getStringTime(start_time)} до ${getStringTime(last_time)}`)

						let temp_date = new Date(start_time)
						result.times.push(getStringTime(temp_date))

						//? Прибавляем к temp_date 10 минут, до тех пор пока temp_date не будет равен last_time
						while (temp_date.getTime() !== last_time.getTime()) {
							temp_date = new Date(temp_date.getTime() + 10 * 60000)
							result.times.push(getStringTime(temp_date))
						}
					}
				} else {
					console.log('Не можем записать на этот промежуток')
				}
			}
			//TODO remove it
			res.json(result)
			return
		}

		res.status(501).send('Not implemented')
	} catch (err) {
		console.log(err)
		res.status(500).send('Ошибка')
	}
})

//* Записаться на услугу
//! Не доделано (нет полной проверки)
app.post('/register_record', async (req, res) => {
	try {
		const {
			service_id,
			datetime
		} = req.body

		if (!service_id || !datetime) {
			//? Если пользователь при запросе не указал услугу или время, отклоняем запрос
			res.status(400).send('Id услуги или время не указаны')
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

app.listen(port, async () => {
	console.log(`Сервер запущен на порту: ${port}`)
})