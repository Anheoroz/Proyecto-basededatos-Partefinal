const express = require("express");
const { MongoClient } = require("mongodb");
const mysql = require("mysql2/promise");

const app = express();
app.use(express.json());

const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

let db;

async function conectarDB() {
    await client.connect();
    db = client.db("ProyectoInventario");
    console.log("Conectado a MongoDB");
}

let sql;

async function conectarSQL() {
    sql = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "5433SamusTalon+",
        database: "proyecto_bd"
    });
    console.log("SQL conectado");
}

async function iniciarServidor() {
    await conectarDB();
    await conectarSQL();

    app.listen(3000, () => {
        console.log("Servidor corriendo en puerto 3000");
    });
}

iniciarServidor();

// GET HISTORIAL EN POSTMAN

app.get("/transacciones", async (req, res) => {
   const datos = await db.collection("transacciones").find().toArray();
   res.json(datos);
});

app.get("/historial_transacciones", async (req, res) => {
   const datos = await db.collection("historial_transacciones").find().toArray();
   res.json(datos);
});

app.get("/historial_productos", async (req, res) => {
   const datos = await db.collection("historial_productos").find().toArray();
   res.json(datos);
});

app.get("/comentarios_productos", async (req, res) => {
   const datos = await db.collection("comentarios_productos").find().toArray();
   res.json(datos);
});

// POST Inventario transaccion
app.post("/transaccion", async (req, res) => {
    const { id_producto, cantidad, tipo } = req.body;
    try {
        const [rows] = await sql.execute(
            "SELECT cantidad_actual FROM inventario WHERE id_producto = ?",
            [id_producto]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado en inventario" });
        }
        let nuevaCantidad;
        if (tipo === "entrada") {
            nuevaCantidad = rows[0].cantidad_actual + cantidad;
        } else {
            nuevaCantidad = rows[0].cantidad_actual - cantidad;
            if (nuevaCantidad < 0) {
                return res.status(400).json({ error: "Stock insuficiente" });
            }
        }
        await sql.execute(
            "UPDATE inventario SET cantidad_actual = ? WHERE id_producto = ?",
            [nuevaCantidad, id_producto]
        );
        await db.collection("historial_transacciones").insertOne({
            id_producto,
            cantidad,
            tipo,
            stock_anterior: rows[0].cantidad_actual,
            stock_nuevo: nuevaCantidad,
            fecha: new Date()
        });
        res.json({
            mensaje: "Transacción completa (SQL + MongoDB)"
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST cambio de producto
app.post("/cambio-producto", async (req, res) => {
    const { id_producto, campo, valor_nuevo, usuario } = req.body;

    try {
        if (!id_producto || !campo || valor_nuevo === undefined) {
            return res.status(400).json({ error: "Faltan datos" });
        }
        const camposPermitidos = [
            "nombre_producto",
            "precio_unitario",
            "stock_minimo",
            "nombre_producto",
            "id_producto",
            "id_usuario",
            "descripcion_producto"
        ];
        if (!camposPermitidos.includes(campo)) {
            return res.status(400).json({ error: "Campo no permitido" });
        }
        const [rows] = await sql.execute(
            `SELECT ${campo} FROM producto WHERE id_producto = ?`,
            [id_producto]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        const valor_anterior = rows[0][campo];
        await sql.execute(
            `UPDATE producto SET ${campo} = ? WHERE id_producto = ?`,
            [valor_nuevo, id_producto]
        );
        await db.collection("historial_productos").insertOne({
            
            id_producto,
            campo,
            valor_anterior,
            valor_nuevo,
            usuario,
            fecha: new Date()
        });

        res.json({
            mensaje: "Cambio aplicado en SQL + MongoDB"
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST comentario de operador
app.post("/comentario", async (req, res) => {
    const { id_inventario, comentario, id_usuario } = req.body;

    try {
        // SQL
        await sql.execute(
            "INSERT INTO registro_anotaciones (id_inventario, comentario, id_usuario) VALUES (?, ?, ?)",
            [id_inventario, comentario, id_usuario]
        );

        // Mongo
        await db.collection("comentarios_productos").insertOne({
            id_inventario,
            comentario,
            id_usuario,
            fecha: new Date()
        });

        res.json({ mensaje: "Comentario guardado en SQL + Mongo" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

