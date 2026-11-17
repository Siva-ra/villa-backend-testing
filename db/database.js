const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "local"
});

// Test database connection
pool.testConnection = async function () {
    const connection = await pool.getConnection();

    try {
        await connection.query("SELECT 1");
    } finally {
        connection.release();
    }
};

module.exports = pool;