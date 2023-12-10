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
app.get('/availability', async (req, res) => {
	try {
		const {
			service_id,
			date_str
		} = req.query
		if (!service_id || !date_str) {
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

		const date = new Date(date_str)
		const string_date = getStringDate(date)
		const start_time_of_work = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9) //? Начало рабочего дня (9:00)
		const end_time_of_work = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18) //? Конец рабочего дня (18:00)

		//? Результат, который отправим пользователю
		let result = {
			'date': string_date,
			'service_id': service.id,
			'available_time': []
		}

		//? Получаем все записи в указанный день
		const record_query_result = await pool.query(`select * from records join services on records.service_id = services.id where datetime::date = date '${string_date}' order by datetime asc`)
		const records = record_query_result.rows

		console.log(`\nПроверка доступности на ${string_date}, услуга: ${service.name} (${service.duration} мин), записей в этот день: ${records.length}`)


		//? Если записей в этот день нет, говорим что весь день свободный, учитывая что мастер должен успеть до 18:00
		if (records.length == 0) {
			console.log('Весь день свободный')


			const last_time_to_record = new Date(end_time_of_work.getTime() - service.duration * 60000)
			console.log(`Последнее доступное время записи: ${getStringTime(last_time_to_record)}`)

			//? Заполняем массивчик с временами, начиная с 9:00
			//? Кидаем в массив 9:00
			let temp_date = new Date(date)
			temp_date.setHours(9)
			result.available_time.push(getStringTime(temp_date))

			//? Прибавляем к temp_date 10 минут, до тех пор пока temp_date не будет равен last_time_to_record
			while (temp_date.getTime() !== last_time_to_record.getTime()) {
				temp_date = new Date(temp_date.getTime() + 10 * 60000)
				result.available_time.push(getStringTime(temp_date))
			}
			res.json(result)
			return
		}

		//? Проверяем промежуток между начало рабочего дня и первой записью
		console.log(`\nПервая запись в ${getStringTime(records[0].datetime)}`)
		const first_record_diff = (records[0].datetime.getTime() - start_time_of_work) / (1000 * 60)
		console.log(`Промежуток в начале дня: ${first_record_diff} мин`)

		//? Если промежуток больше, чем длительность услуги + 10 мин отдыхапосле, то можем записать в этот промежуток
		if (first_record_diff >= service.duration + 10) {
			console.log('Можем записать в промежуток в начале дня')
			const last_time_to_record = new Date(records[0].datetime.getTime() - service.duration * 60000 - 10 * 60000) //? Последнее время для записи (перед первой записью)

			if (start_time_of_work.getTime() === last_time_to_record.getTime()) {
				console.log(`Доступное время для записи в начале дня: 9:00`)
				result.available_time.push(getStringTime(start_time_of_work))
			} else {
				console.log(`Доступное время для записи в начале дня: 9:00 - ${getStringTime(last_time_to_record)}`)

				let temp_date = new Date(date)
				temp_date.setHours(9)
				result.available_time.push(getStringTime(temp_date))

				//? Прибавляем к temp_date 10 минут, до тех пор пока temp_date не будет равен last_time_to_record
				while (temp_date.getTime() !== last_time_to_record.getTime()) {
					temp_date = new Date(temp_date.getTime() + 10 * 60000)
					result.available_time.push(getStringTime(temp_date))
				}
			}

			console.log(result.available_time)
		} else {
			console.log('В начале дня записать нельзя')
		}

		//? Если запись всего одна, то надо проверить только промежутки до и после, иначе проверяем промежутки между записями
		if (records.length > 1) {
			//? Проверяем промежутки между записями
			for (let i = 1; i < records.length; i++) {
				const prev_record = records[i - 1]
				const curr_record = records[i]
				console.log(`\nПроверка записей: ${getStringTime(prev_record.datetime)}(${prev_record.duration} мин) <-> ${getStringTime(curr_record.datetime)}(${curr_record.duration} мин)`)
				const diff_time = (curr_record.datetime.getTime() - prev_record.datetime.getTime() - prev_record.duration * 60000) / (1000 * 60)
				console.log(`Промежуток: ${diff_time} мин`)
				if (diff_time >= service.duration + 20) {
					const start_time = new Date(prev_record.datetime.getTime() + prev_record.duration * 60000 + 10 * 60000)
					let last_time = new Date(curr_record.datetime.getTime() - 10 * 60000)
					if (start_time.getTime() == last_time.getTime()) {
						console.log(`Можем записать на ${getStringTime(start_time)}`)
						result.available_time.push(getStringTime(start_time))
					} else {
						console.log(`Можем записать в промежуток, c ${getStringTime(start_time)} до ${getStringTime(last_time)}`)

						let temp_date = new Date(start_time)
						result.available_time.push(getStringTime(temp_date))

						//? Прибавляем к temp_date 10 минут, до тех пор пока temp_date не будет равен last_time
						while (temp_date.getTime() !== last_time.getTime()) {
							temp_date = new Date(temp_date.getTime() + 10 * 60000)
							result.available_time.push(getStringTime(temp_date))
						}
					}
				} else {
					console.log('Не можем записать на этот промежуток')
				}
			}
		}

		//? Проверяем промежуток между последней записью и концом рабочего дня
		const last_record = records.slice(-1)[0]
		console.log(`\nПоследняя запись в ${getStringTime(last_record.datetime)} (${last_record.duration} мин)`)
		const last_record_diff = (end_time_of_work - last_record.datetime.getTime() - last_record.duration * 60000) / (1000 * 60)
		console.log(`Промежуток в конце дня: ${last_record_diff} мин`)

		//? Если промежуток больше, чем длительность услуги + 10 мин отдыха до, то можем записать в этот промежуток
		if (last_record_diff >= service.duration + 10) {
			console.log('Можем записать в промежуток в конце дня')
			const first_time_to_record = new Date(last_record.datetime.getTime() + last_record.duration * 60000 + 10 * 60000)
			const last_time_to_record = new Date(end_time_of_work.getTime() - service.duration * 60000)

			if (first_time_to_record.getTime() === last_time_to_record.getTime()) {
				console.log(`Доступное время для записи в конце дня: ${getStringTime(first_time_to_record)}`)
				result.available_time.push(getStringTime(first_time_to_record))
			} else {
				console.log(`Доступное время для записи в конце дня: ${getStringTime(first_time_to_record)} - ${getStringTime(last_time_to_record)}`)

				let temp_date = new Date(first_time_to_record)
				result.available_time.push(getStringTime(temp_date))

				//? Прибавляем к temp_date 10 минут, до тех пор пока temp_date не будет равен last_time_to_record
				while (temp_date.getTime() !== last_time_to_record.getTime()) {
					temp_date = new Date(temp_date.getTime() + 10 * 60000)
					result.available_time.push(getStringTime(temp_date))
				}
			}
		} else {
			console.log('В конце дня записать нельзя')
		}


		res.json(result)
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
			date_str
		} = req.body

		if (!service_id || !date_str) {
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
		const date = new Date(date_str)
		const start_time_of_work = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9) //? Начало рабочего дня (9:00)
		const end_time_of_work = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18) //? Конец рабочего дня (18:00)

		console.log(`\nЗапрос на запись ${getStringDate(date)} на ${getStringTime(date)}, услуга: ${service.name} (${service.duration} мин)`)

		//? Проверяем, что время указно корректно (9:00 - 18:00)
		if (date.getTime() < start_time_of_work.getTime() || date.getTime() > end_time_of_work.getTime()) {
			console.log('Не корректно указано время')
			res.status(400).send("Некорректно указано время, время работы салона: 9:00 - 18:00")
			return
		}

		//? Проверяем, что время указно корректно 10, 20, 30 минут и тд... (а не 14, 23, 46)
		if (date.getMinutes() % 10 !== 0) {
			console.log('Не корректно указано время')
			res.status(400).send("Некорректно указано время, записываться можно каждые 10 минут (12:10, 12:20, 12:30 и тд...)")
			return
		}

		//? Проверяем, что мастер успеет выполнить процедуру до 18:00
		if (date.getTime() + service.duration * 60000 > end_time_of_work.getTime()) {
			console.log('Мастер не успеет закончить процедуру до 18:00')
			res.status(400).send("Мастер не успеет закончить процедуру до 18:00")
			return
		}

		//? Время конца процедуры (не учитывая отдых после неё)
		const new_record_end_time = new Date(date.getTime() + service.duration * 60000)
		console.log(`Процедура будет идти с ${getStringTime(date)} до ${getStringTime(new_record_end_time)} (не включая отдых)`)


		//? Получаем все записи в указанный день
		const record_query_result = await pool.query(`select * from records join services on records.service_id = services.id where datetime::date = date '${getStringDate(date)}' order by datetime asc`)
		const records = record_query_result.rows

		//? Если записей в этот день нет, то ничего проверять не надо, просто записываем
		if (records.length === 0) {
			console.log('\nВесь день свободный, записываем')
			await pool.query('insert into records(service_id, datetime) values($1, $2)', [service_id, date])
			res.send(`Вы успешно записаны на '${service.name}' ${getStringDate(date)} в ${getStringTime(date)}`)
			return
		}

		console.log(`\nЗаписей в этот день: ${records.length}`)

		//? Массив записей, которые помешают нам сделать новую запись
		let interfering_records = []

		//? Время конца новой записи с учётом отдыха после неё
		const new_record_end_time_with_pause = new Date(new_record_end_time.getTime() + 10 * 60000)


		records.forEach(current_record => {
			//? Время конца записи (без учёта отдыха после неё)
			const curr_record_end_time = new Date(current_record.datetime.getTime() + current_record.duration * 60000)
			//? Время конца записи с учётом отдыха после неё
			const curr_record_end_time_with_pause = new Date(curr_record_end_time.getTime() + 10 * 60000)

			let found_intersection = false //? Флаг на то, что нашли пересечение

			//! Записи перескаются:

			//! Если время начала новой записи находится в промежутке какой-то сущ. записи:
			//! Условие:
			//! Время начала новой записи >= время начала сущ. записи
			//! При этом
			//! Время начала новой записи  < время конца сущ. записи(+отдых после)
			if (date.getTime() >= current_record.datetime.getTime() && date.getTime() < curr_record_end_time_with_pause.getTime()) {
				console.log(`[!] Начало новой записи в промежутке существующей записи`)
				found_intersection = true
			}

			//! Если время конца новой записи(+отдых) находится в промежутке какой-то сущ. записи:
			//! Условие:
			//! Время конца новой записи(+отдых) > время начала сущ. записи
			//! При этом
			//! Время конца новой записи(+отдых) <= время конца сущ. записи(+отдых после)
			if (new_record_end_time_with_pause.getTime() > current_record.datetime.getTime() && new_record_end_time_with_pause.getTime() <= curr_record_end_time_with_pause.getTime()) {
				console.log(`[!] Конец новой записи в промежутке существующей записи`)
				found_intersection = true
			}

			//! Если новая запись целиком проглатываем сущ. запись (сущ. запись будет находится полностью внутри новой)
			//! (если наоборот, новая полностью внутри сущ., то сработают оба предыдущих условия)
			//! Условие:
			//! Время начала сущ. записи >= время начала новой записи
			//! При этом
			//! Время конца сущ. записи(+отдых) <= время конца новой записи(+отдых после)
			if (current_record.datetime.getTime() >= date.getTime() && curr_record_end_time_with_pause.getTime() <= new_record_end_time_with_pause.getTime()) {
				console.log(`[!] Существующая запись находиться внутри новой`)
				found_intersection = true
			}

			if (found_intersection) {
				console.log(`[!] Пересечение с записью: ${getStringTime(current_record.datetime)}-${getStringTime(curr_record_end_time)}`)
				interfering_records.push(current_record)
				return
			}
		})

		if (interfering_records.length > 0) {
			res.status(400).send('Мастер занят в это время.')
			return
		}

		console.log('Записали')
		//await pool.query('insert into records(service_id, datetime) values($1, $2)', [service_id, date])
		res.send(`Вы успешно записаны на '${service.name}' ${getStringDate(date)} в ${getStringTime(date)}`)

	} catch (err) {
		console.log(err)
		res.status(500).send('Ошибка')
	}
})

app.listen(port, async () => {
	console.log(`Сервер запущен на порту: ${port}`)
})