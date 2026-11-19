require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const db = require("./db/database");

const signupRoutes = require("./routes/signup");
const loginRoutes = require("./routes/login");
const auditLogRoutes = require("./routes/auditLogs");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
    : ["*"];

app.use(
    cors({
        origin: (origin, callback) => {

            if (
                !origin ||
                allowedOrigins.includes("*") ||
                allowedOrigins.includes(origin)
            ) {
                return callback(null, true);
            }

            return callback(new Error("Origin not allowed by CORS"));
        },

        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);

app.use(express.json({
    limit: "10kb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "10kb"
}));

app.use("/api/signup", signupRoutes);

app.use("/api/login", loginRoutes);

app.use("/api/audit-logs", auditLogRoutes);

app.get("/", (req, res) => {

    res.status(200).json({
        success: true,
        message: "Unity Authentication API is running"
    });

});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", async (req, res) => {

    try {

        await db.testConnection();

        return res.status(200).json({
            success: true,
            message: "Server and database are running"
        });

    } catch (error) {

        console.error("HEALTH CHECK ERROR:", error.message);

        return res.status(503).json({
            success: false,
            message: "Database connection unavailable"
        });

    }

});

// ============================================================
// INVALID ROUTE HANDLER
// ============================================================

app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "API route not found"
    });

});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {

    console.error("SERVER ERROR:", err.message);

    if (err.message === "Origin not allowed by CORS") {

        return res.status(403).json({
            success: false,
            message: "Access denied."
        });

    }

    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {

        return res.status(400).json({
            success: false,
            message: "Invalid JSON request body."
        });

    }

    return res.status(500).json({
        success: false,
        message: "Internal server error."
    });

});

// ============================================================
// DELETE EXPIRED UNVERIFIED USERS
// ============================================================

const cleanupInterval = setInterval(async () => {

    try {

        const [result] = await db.execute(
            `DELETE FROM users
             WHERE is_verified = 0
             AND otp_expires_at IS NOT NULL
             AND otp_expires_at < NOW()`
        );

        if (result.affectedRows > 0) {

            console.log(
                `Cleanup: ${result.affectedRows} expired unverified user(s) deleted.`
            );

        }

    } catch (error) {

        console.error("CLEANUP ERROR:", error.message);

    }

}, 60 * 1000);

// ============================================================
// DATABASE CONNECTION CHECK & SERVER START
// ============================================================

let server;

async function startServer() {

    try {

        // Verify database connection before starting server.

        await db.testConnection();

        console.log("Database connection successful.");

        server = app.listen(PORT, () => {

            console.log("=================================");
            console.log(" Unity Authentication Backend");
            console.log("=================================");
            console.log(`Server running on port ${PORT}`);
            console.log("Database: Connected");
            console.log("Status: Online");
            console.log("=================================");

        });

    } catch (error) {

        console.error("SERVER STARTUP FAILED:", error.message);

        process.exit(1);

    }

}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal) {

    console.log(`${signal} received. Shutting down server...`);

    clearInterval(cleanupInterval);

    if (server) {

        server.close(async () => {

            try {

                await db.end();

                console.log("Database connection closed.");

                process.exit(0);

            } catch (error) {

                console.error("SHUTDOWN ERROR:", error.message);

                process.exit(1);

            }

        });

    } else {

        await db.end();

        process.exit(0);

    }

}

process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("SIGINT", () => shutdown("SIGINT"));

// ============================================================
// START APPLICATION
// ============================================================

startServer();