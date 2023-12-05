const express = require('express')
const {
	Pool
} = require('pg')
const config = require('./config')

const port = 3000

const app = express()
const pool = new Pool({
	host: 'localhost',
	user: 'postgres',
	password: config.database_password,
	database: 'barbershop',
})

app.get('/', async (req, res) => {
	var result = await pool.query('select * from records')
	console.log(result)
	res.send('Hello World!')
})

app.listen(port, () => {
	console.log(`Сервер запущен на порту: ${port}`)
})