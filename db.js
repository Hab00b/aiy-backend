const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'srv603.hstgr.io',
    user: process.env.DB_USER || 'u524293954_aiytool',
    password: process.env.DB_PASSWORD || 'Aiytool2026',
    database: process.env.DB_NAME || 'u524293954_aiytool',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;