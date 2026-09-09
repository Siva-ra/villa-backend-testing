/*require("dotenv").config();

const express = require("express");
const cors = require("cors");

const db = require("./db/database");

const signupRoutes =
    require("./routes/signup");

const loginRoutes =
    require("./routes/login");


const app = express();


// ============================================================
// PORT
// ============================================================

const PORT =
    process.env.PORT || 3000;


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(

    cors({

        origin: "*",

        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]

    })

);


app.use(express.json());


// ============================================================
// ROUTES
// ============================================================

app.use(
    "/api/signup",
    signupRoutes
);


app.use(
    "/api/login",
    loginRoutes
);


// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {

    res.json({

        success: true,

        message:
            "Unity Authentication API is running"

    });

});


// ============================================================
// 404
// ============================================================

app.use((req, res) => {

    res.status(404).json({

        success: false,

        message:
            "API route not found"

    });

});


// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({

        success: false,

        message:
            "Internal server error"

    });

});

// ============================================================
// DELETE EXPIRED UNVERIFIED USERS
// ============================================================

setInterval(async () => {

    try {

        const [result] = await db.execute(`
            DELETE FROM users
            WHERE is_verified = 0
            AND otp_expires_at IS NOT NULL
            AND otp_expires_at < NOW()
        `);

        if (result.affectedRows > 0) {

            console.log(
                `Deleted ${result.affectedRows} expired unverified user(s)`
            );

        }

    } catch (error) {

        console.error(
            "CLEANUP ERROR:",
            error
        );

    }

}, 60 * 1000);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            " Unity Authentication Backend"
        );

        console.log(
            "================================="
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `Admin Email: ${process.env.ADMIN_EMAIL}`
        );

    }
);*/

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const db = require("./db/database");

const signupRoutes = require("./routes/signup");
const loginRoutes = require("./routes/login");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(
    cors({
        origin: "*",
        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],
        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);

app.use(express.json());

app.use("/api/signup", signupRoutes);
app.use("/api/login", loginRoutes);

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Unity Authentication API is running"
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found"
    });
});

app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        success: false,
        message: "Internal server error"
    });
});


// ============================================================
// DELETE EXPIRED UNVERIFIED USERS
// ============================================================

setInterval(async () => {

    try {

        const [result] = await db.execute(`
            DELETE FROM users
            WHERE is_verified = 0
            AND otp_expires_at IS NOT NULL
            AND otp_expires_at < NOW()
        `);

        if (result.affectedRows > 0) {

            console.log(
                `Deleted ${result.affectedRows} expired unverified user(s)`
            );

        }

    } catch (error) {

        console.error("CLEANUP ERROR:", error);

    }

}, 60 * 1000);


app.listen(PORT, () => {

    console.log("=================================");
    console.log(" Unity Authentication Backend");
    console.log("=================================");
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin Email: ${process.env.ADMIN_EMAIL}`);

});