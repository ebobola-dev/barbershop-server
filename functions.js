const services = require('./services.json')

async function write_services(pool) {
	//? Сбрасываем счётчик id на всякий случай
	await pool.query('ALTER SEQUENCE services_id_seq RESTART WITH 1')

	for (let i = 0; i < services.length; i++) {
		await pool.query(
			'insert into services(name, price, duration) values($1, $2, $3)',
			[services[i].name, services[i].price, services[i].duration],
		)
	}
}

async function register_test_records(pool) {
	const test_records = [
		//
		//*################################# 9 DEC ##########################################//
		{
			service_id: 10,
			datetime: new Date(2023, 11, 9, 9, 0), // 9 Dec, в 9:00 [Мужская стрижка (20 мин, до 9:20)]
		},
		//? Только отдых 10 мин
		{
			service_id: 2,
			datetime: new Date(2023, 11, 9, 9, 30), // 9 Dec, в 9:30 [Наращивание волос (120 мин, до 11:30)]
		},
		//? Промежуток 11:30 - 12:10, можно впихнуть процедуры на 20 мин
		{
			service_id: 8,
			datetime: new Date(2023, 11, 9, 12, 10), // 9 Dec, в 12:10 [Окрашивание (60 мин, до 13:10)]
		},
		//? Промежуток 13:10 - 15:00, можно впихнуть процедуры до 90 минут
		{
			service_id: 12,
			datetime: new Date(2023, 11, 9, 15, 0), // 9 Dec, в 15:00 [Создание вечерних причёсок (90 мин, до 16:30)]
		},
		//? Промежуток 16:30 - 18:00 (конец раб.дня), можно впихнуть процедуры до 80 мин
		//
		//*################################# 10 DEC #########################################//
		{
			service_id: 4,
			datetime: new Date(2023, 11, 10, 10, 0), // 10 Dec, в 10:00 [Дреды (90 мин, до 11:30)]
		},
		//? Промежуток 11:30 - 12:50, можно впихнуть процедуры до 60 мин
		{
			service_id: 1,
			datetime: new Date(2023, 11, 10, 12, 50), // 10 Dec, в 12:50 [Женкая стрижка (30 мин, до 13:20)]
		},
		//? Промежуток 13:20 - 17:00, 3ч 40мин (220 мин), тут я думаю можно вообще домой пойти
		{
			service_id: 5,
			datetime: new Date(2023, 11, 10, 17, 0), // 10 Dec, в 17:00 [Процедура восстановления волос (30 мин, до 17:30)]
		},
		//? Промежуток 17:30 - 18:00 (конец раб.дня), можно впихнуть процедуры до 20 мин
	]
	for (let i = 0; i < test_records.length; i++) {
		await pool.query(
			'insert into records(service_id, datetime) values($1, $2)',
			[test_records[i].service_id, test_records[i].datetime],
		)
	}
}

module.exports = {
	write_services: write_services,
	register_test_records: register_test_records,
}